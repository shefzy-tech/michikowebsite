// ============================================================================
// utils/mediaPrep.js — decide whether downloaded media is REALLY playable on WhatsApp, and make it so.
//
// A file is not trusted because of its file name, its reported MIME type or its first bytes. It is:
//   1. probed       -> container + codecs are read by ffmpeg (what is really inside)
//   2. decoded      -> a full decode pass must finish with no errors (catches HTML pages, empty / truncated files)
//   3. made compatible -> WhatsApp plays MP4 with H.264 (yuv420p, even size) + AAC, "moov" at the start.
//        already compatible        -> stream copy + faststart (NO re-encoding)
//        otherwise (VP9/AV1/...)   -> real transcode, bounded by timeout / size / thread limits
//      audio: AAC stays AAC (m4a); MP3 stays MP3; anything else, or audio inside a video file, is
//      extracted/encoded to a real m4a. A video is never "renamed" to audio and a MIME type is never just changed.
//   4. re-checked   -> the produced file is probed and decoded again before it may be sent.
// Uses ffmpeg only (the project's own ffmpeg-static, else FFMPEG_PATH, else `ffmpeg` on PATH). No shell is used.
// ============================================================================
const fs = require('fs');
const { execFile } = require('child_process');

const envInt = (k, d) => { const v = parseInt(process.env[k] || '', 10); return v > 0 ? v : d; };
const LIMITS = {
  get decodeTimeoutMs() { return envInt('MICHIKO_DECODE_TIMEOUT_MS', 120 * 1000); },
  get remuxTimeoutMs() { return envInt('MICHIKO_REMUX_TIMEOUT_MS', 90 * 1000); },
  get transcodeTimeoutMs() { return envInt('MICHIKO_TRANSCODE_TIMEOUT_MS', 240 * 1000); },
  get audioTimeoutMs() { return envInt('MICHIKO_AUDIO_TIMEOUT_MS', 120 * 1000); },
  get maxVideoBytes() { return envInt('MICHIKO_MAX_VIDEO_BYTES', 60 * 1024 * 1024); },
  get maxAudioBytes() { return envInt('MICHIKO_MAX_AUDIO_BYTES', 30 * 1024 * 1024); },
  get concurrency() { return envInt('MICHIKO_FFMPEG_CONCURRENCY', 1); },        // transcoding is CPU heavy: one at a time by default
};

let _bin = null;
function ffmpegBin() {
  if (_bin) return _bin;
  try { const p = require('ffmpeg-static'); if (p && typeof p === 'string') return (_bin = p); } catch { /* not installed here */ }
  return (_bin = process.env.FFMPEG_PATH && process.env.FFMPEG_PATH !== 'stub' ? process.env.FFMPEG_PATH : 'ffmpeg');
}

// ---- bounded execution (no shell, hard timeout, capped output, global concurrency limit) -------------------------
let active = 0; const waiters = [];
const acquire = () => (active < LIMITS.concurrency ? (active++, Promise.resolve()) : new Promise(r => waiters.push(r)));
const release = () => { const n = waiters.shift(); if (n) n(); else active--; };
function run(args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(ffmpegBin(), args, { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, _out, stderr) => {
      const text = String(stderr || '');
      if (!err) return resolve({ code: 0, stderr: text });
      if (err.code === 'ENOENT') return resolve({ code: -1, stderr: text, missing: true });
      if (err.killed || err.signal === 'SIGKILL') return resolve({ code: -2, stderr: text, timedOut: true });
      resolve({ code: typeof err.code === 'number' ? err.code : -3, stderr: text });
    });
  });
}
async function runLimited(args, timeoutMs) { await acquire(); try { return await run(args, timeoutMs); } finally { release(); } }

// ---- probe: what is REALLY inside the file ----------------------------------------------------------------------
async function probe(file) {
  const r = await runLimited(['-hide_banner', '-nostdin', '-i', file], 30 * 1000);       // ffmpeg exits 1 when no output is given: stderr is what we want
  if (r.missing) return { ok: false, reason: 'ffmpeg-unavailable' };
  if (r.timedOut) return { ok: false, reason: 'probe-timeout' };
  const t = r.stderr;
  const inp = /Input #0, ([^\n]*?), from /.exec(t);
  if (!inp) return { ok: false, reason: 'unreadable' };                                   // HTML/JSON/empty/garbage/truncated-without-moov
  const lines = t.split('\n');
  const vLine = lines.find(l => /Stream #0:\d+.*: Video:/.test(l) && !/attached pic/i.test(l));
  const aLine = lines.find(l => /Stream #0:\d+.*: Audio:/.test(l));
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t);
  const info = { ok: true, container: inp[1].trim(), durationSec: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : null, video: null, audio: null };
  if (vLine) {
    const codec = /Video: ([A-Za-z0-9_]+)/.exec(vLine)[1];
    const pix = /Video:[^,]*(?:\([^)]*\))*[^,]*, ([a-z0-9_]+)/.exec(vLine);
    const dim = /[ ,\[](\d{2,5})x(\d{2,5})[ ,\[]/.exec(vLine);
    info.video = { codec, pixFmt: pix ? pix[1] : '', width: dim ? +dim[1] : 0, height: dim ? +dim[2] : 0 };
  }
  if (aLine) info.audio = { codec: /Audio: ([A-Za-z0-9_]+)/.exec(aLine)[1] };
  return info;
}

// ---- full decode: any error at all = not trustworthy --------------------------------------------------------------
async function decodeCheck(file, timeoutMs = LIMITS.decodeTimeoutMs) {
  const r = await runLimited(['-v', 'error', '-xerror', '-nostdin', '-i', file, '-f', 'null', '-'], timeoutMs);
  if (r.missing) return { ok: false, reason: 'ffmpeg-unavailable' };
  if (r.timedOut) return { ok: false, reason: 'decode-timeout' };
  if (r.code !== 0 || r.stderr.trim()) return { ok: false, reason: 'decode-failed', detail: r.stderr.trim().split('\n')[0].slice(0, 160) };
  return { ok: true };
}

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const sizeOf = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
const rm = (f) => { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } };

// ---- video -> WhatsApp-compatible MP4 --------------------------------------------------------------------------------
async function prepareVideo(inFile, outFile, opts = {}) {
  const maxBytes = opts.maxBytes || LIMITS.maxVideoBytes;
  if (!sizeOf(inFile)) return fail('empty-file');
  const info = await probe(inFile);
  if (!info.ok) return fail(info.reason);
  if (!info.video) return fail('no-video-stream', { input: info });
  const dec = await decodeCheck(inFile, opts.decodeTimeoutMs);
  if (!dec.ok) return fail(dec.reason, { input: info, detail: dec.detail });

  const v = info.video;
  const compatible = v.codec === 'h264' && /^yuv420p/.test(v.pixFmt) && v.width > 0 && v.width % 2 === 0 && v.height % 2 === 0 && (!info.audio || info.audio.codec === 'aac');
  const base = ['-y', '-nostdin', '-v', 'error', '-i', inFile, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn'];
  let args, action, timeout;
  if (compatible) {
    action = 'remux'; timeout = opts.remuxTimeoutMs || LIMITS.remuxTimeoutMs;                 // no re-encoding: only the container is rewritten (moov first)
    args = [...base, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', outFile];
  } else {
    action = 'transcode'; timeout = opts.transcodeTimeoutMs || LIMITS.transcodeTimeoutMs;
    args = [...base, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-vf', 'scale=trunc(min(1280\\,iw)/2)*2:-2', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-threads', '2',
      '-movflags', '+faststart', '-max_muxing_queue_size', '1024', '-f', 'mp4', outFile];
  }
  const r = await runLimited(args, timeout);
  if (r.timedOut) { rm(outFile); return fail('convert-timeout', { action, input: info }); }
  if (r.code !== 0) { rm(outFile); return fail('convert-failed', { action, input: info, detail: r.stderr.trim().split('\n')[0].slice(0, 160) }); }
  const size = sizeOf(outFile);
  if (!size) { rm(outFile); return fail('empty-output', { action, input: info }); }
  if (size > maxBytes) { rm(outFile); return fail('too-large', { action, input: info, size }); }
  const out = await probe(outFile);                                                         // the produced file must itself be valid
  if (!out.ok || !out.video || out.video.codec !== 'h264') { rm(outFile); return fail('output-invalid', { action, input: info }); }
  const dec2 = await decodeCheck(outFile, opts.decodeTimeoutMs);
  if (!dec2.ok) { rm(outFile); return fail('output-decode-failed', { action, input: info, detail: dec2.detail }); }
  return { ok: true, action, size, input: info, output: out, mimetype: 'video/mp4', ext: 'mp4' };
}

// ---- audio -> REAL audio (m4a/aac or mp3) -------------------------------------------------------------------------------
async function prepareAudio(inFile, outBase, opts = {}) {                                   // outBase: path WITHOUT extension
  const maxBytes = opts.maxBytes || LIMITS.maxAudioBytes;
  if (!sizeOf(inFile)) return fail('empty-file');
  const info = await probe(inFile);
  if (!info.ok) return fail(info.reason);
  if (!info.audio) return fail('no-audio-stream', { input: info });
  const dec = await decodeCheck(inFile, opts.decodeTimeoutMs);
  if (!dec.ok) return fail(dec.reason, { input: info, detail: dec.detail });

  let action, ext, mimetype, args;
  const timeout = opts.audioTimeoutMs || LIMITS.audioTimeoutMs;
  if (!info.video && info.audio.codec === 'mp3' && /mp3/.test(info.container)) {
    action = 'asis'; ext = 'mp3'; mimetype = 'audio/mpeg';
    try { fs.copyFileSync(inFile, `${outBase}.mp3`); } catch { return fail('copy-failed', { input: info }); }
  } else {
    ext = 'm4a'; mimetype = 'audio/mp4';
    const copyAac = info.audio.codec === 'aac';                                             // AAC is only re-wrapped (video dropped if present); everything else is encoded
    action = info.video ? (copyAac ? 'extract-copy' : 'extract-encode') : (copyAac ? 'remux' : 'convert');
    args = ['-y', '-nostdin', '-v', 'error', '-i', inFile, '-vn', '-sn', '-dn', '-map', '0:a:0',
      ...(copyAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']), '-movflags', '+faststart', '-f', 'ipod', `${outBase}.m4a`];
    const r = await runLimited(args, timeout);
    if (r.timedOut) { rm(`${outBase}.m4a`); return fail('convert-timeout', { action, input: info }); }
    if (r.code !== 0) { rm(`${outBase}.m4a`); return fail('convert-failed', { action, input: info, detail: r.stderr.trim().split('\n')[0].slice(0, 160) }); }
  }
  const outFile = `${outBase}.${ext}`;
  const size = sizeOf(outFile);
  if (!size) return fail('empty-output', { action, input: info });
  if (size > maxBytes) { rm(outFile); return fail('too-large', { action, input: info, size }); }
  const out = await probe(outFile);
  if (!out.ok || !out.audio || out.video) { rm(outFile); return fail('output-invalid', { action, input: info }); }          // output must be audio ONLY
  const dec2 = await decodeCheck(outFile, opts.decodeTimeoutMs);
  if (!dec2.ok) { rm(outFile); return fail('output-decode-failed', { action, input: info, detail: dec2.detail }); }
  return { ok: true, action, size, input: info, output: out, mimetype, ext, file: outFile };
}

async function available() { const r = await runLimited(['-version'], 10 * 1000); return !r.missing && r.code === 0; }

module.exports = { probe, decodeCheck, prepareVideo, prepareAudio, available, ffmpegBin, LIMITS };
