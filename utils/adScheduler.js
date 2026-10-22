// ============================================================================
// utils/adScheduler.js — owner-controlled advertisement scheduler (GROUPS ONLY).
//
// Architecture (deliberately small):
//   * ONE setInterval tick loop for everything. No timer per campaign, per group or per send.
//   * Campaign state lives in Mongo (collection "ad_campaigns", same client as auth). A process
//     restart loses nothing: an unfinished cycle is resumed, a finished one is never repeated.
//   * At-most-once delivery: a group is CLAIMED (persisted into cycle.sent) BEFORE the send, so a
//     crash/restart can only skip a group, never double-post to it.
//   * A cycle is processed per connected session: sessions run with a global concurrency limit,
//     and inside one session the groups are sent strictly one after another with a jittered delay.
//     Nothing is ever Promise.all()'d over all groups.
//   * Each group is targeted at most once per cycle even if several bot accounts are in it.
//   * Cycles that were missed while the process was down are SKIPPED (no catch-up burst).
// ============================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envInt = (k, d) => { const v = parseInt(process.env[k] || '', 10); return v > 0 ? v : d; };
const MEDIA_DIR = process.env.AD_MEDIA_DIR || path.join(__dirname, '..', 'database', 'ad_media');
const CFG = {
  get tickMs() { return envInt('AD_TICK_MS', 30 * 1000); },
  get concurrency() { return envInt('AD_CONCURRENCY', 3); },                 // sessions sending at the same time
  get sendDelayMs() { return envInt('AD_SEND_DELAY_MS', 2500); },            // pause between two sends of ONE session (+ up to 50% jitter)
  get minIntervalMs() { return envInt('AD_MIN_INTERVAL_MS', 60 * 60 * 1000); },
  get maxDurationMs() { return envInt('AD_MAX_DURATION_MS', 90 * 24 * 60 * 60 * 1000); },
  get maxCampaigns() { return envInt('AD_MAX_CAMPAIGNS', 20); },
  get maxMediaBytes() { return envInt('AD_MAX_MEDIA_BYTES', 16 * 1024 * 1024); },
  get breaker() { return envInt('AD_SESSION_BREAKER', 5); },                 // consecutive failures before a session is skipped for the cycle
  get sendTimeoutMs() { return envInt('AD_SEND_TIMEOUT_MS', 60 * 1000); },
  get fetchTimeoutMs() { return envInt('AD_FETCH_TIMEOUT_MS', 30 * 1000); },
  get startGraceMs() { return envInt('AD_START_GRACE_MS', 10 * 60 * 1000); },
};

const TYPES = ['text', 'image', 'video', 'sticker'];
const EXT = { image: 'jpg', video: 'mp4', sticker: 'webp' };

// ---------------------------------------------------------------- parsing helpers (pure)
function parseDuration(tok) {
  const m = /^(\d+(?:\.\d+)?)\s*(m|min|h|hr|d|w)$/i.exec(String(tok || '').trim());
  if (!m) return null;
  const n = parseFloat(m[1]); const u = m[2].toLowerCase();
  const mult = u.startsWith('m') ? 60e3 : (u === 'h' || u === 'hr') ? 3600e3 : u === 'd' ? 86400e3 : 604800e3;
  const ms = Math.round(n * mult);
  return ms > 0 ? ms : null;
}
// "+30m" relative, or an ISO date/time ("2026-10-08T09:00:00Z"). Returns epoch ms or null.
function parseStart(tok, now = Date.now()) {
  const t = String(tok || '').trim();
  if (!t) return null;
  if (t[0] === '+') { const d = parseDuration(t.slice(1)); return d ? now + d : null; }
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}
const fmtDur = (ms) => { if (ms == null) return '-'; const s = Math.round(ms / 1000); if (s < 3600) return `${Math.round(s / 60)}m`; if (s < 172800) return `${+(s / 3600).toFixed(1)}h`; return `${+(s / 86400).toFixed(1)}d`; };
const maskPhone = (p) => (String(p).length > 4 ? '…' + String(p).slice(-4) : '…');
const newId = () => 'cmp_' + crypto.randomBytes(3).toString('hex');
const sleepers = new Set();   // cancellable sleeps (so stop() leaves no timers behind)
function sleep(ms) { return new Promise((resolve) => { const t = setTimeout(() => { sleepers.delete(rec); resolve(); }, ms); const rec = { t, resolve }; sleepers.add(rec); }); }
function cancelSleeps() { for (const r of sleepers) { clearTimeout(r.t); r.resolve(); } sleepers.clear(); }
function withTimeout(p, ms, label) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' timed out')), ms); })]).finally(() => clearTimeout(t)); }

function classifySendError(e) {
  const msg = String((e && (e.message || e.data)) || e || '').toLowerCase();
  const code = e && e.output && e.output.statusCode;
  if (/rate|overlimit|429|too many/.test(msg) || code === 429) return 'rate-limit';
  if (/forbidden|not-authorized|403|admin|not allowed/.test(msg) || code === 403) return 'forbidden';
  if (/not-in-group|item-not-found|not a participant|404|removed|left/.test(msg) || code === 404) return 'not-in-group';
  if (/timed out|timeout/.test(msg)) return 'timeout';
  if (/closed|disconnect|connection/.test(msg)) return 'disconnected';
  if (/media-missing/.test(msg)) return 'media-missing';
  return 'error';
}

// ---------------------------------------------------------------- Mongo store adapter
function makeMongoStore(getCollection, name = 'ad_campaigns') {
  const col = () => getCollection(name);
  return {
    async insert(doc) { const c = await col(); await c.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true }); },
    async get(id) { const c = await col(); return c.findOne({ _id: id }); },
    async list(filter = {}) { const c = await col(); return c.find(filter).toArray(); },
    async patch(id, update) { const c = await col(); await c.updateOne({ _id: id }, update); },
    async remove(id) { const c = await col(); await c.deleteOne({ _id: id }); },
  };
}

// ---------------------------------------------------------------- the scheduler
function createScheduler({ store, getSessions, now = () => Date.now(), logger = console.log }) {
  let timer = null, running = false, stopped = false, ready = false, readyTimer = null, lastErrLog = 0;
  const cancelled = new Set();         // campaign ids stopped/deleted while a cycle was in flight
  const inProgress = new Set();        // campaign ids currently being processed (no overlap)
  const log = (m) => logger(`[AD] ${m}`);
  const errLog = (m) => { if (now() - lastErrLog > 60000) { lastErrLog = now(); log(m); } };

  const fingerprintOf = ({ creator, type, text, mediaHash, intervalMs, durationMs }) =>
    crypto.createHash('sha1').update([creator, type, text || '', mediaHash || '', intervalMs, durationMs].join('|')).digest('hex');

  // ---- creation (always a DRAFT: nothing is sent until the owner starts it)
  async function create({ creator, type, text, media, intervalMs, durationMs, startAt }) {
    if (!TYPES.includes(type)) throw new Error('Unsupported ad type.');
    if (type === 'text' && !String(text || '').trim()) throw new Error('A text ad needs text.');
    if (type !== 'text' && !(media && media.buffer && media.buffer.length)) throw new Error(`A ${type} ad needs media.`);
    if (media && media.buffer.length > CFG.maxMediaBytes) throw new Error(`Media too large (max ${Math.round(CFG.maxMediaBytes / 1048576)}MB).`);
    if (!intervalMs || intervalMs < CFG.minIntervalMs) throw new Error(`Interval too short (minimum ${fmtDur(CFG.minIntervalMs)} to protect the accounts from spam bans).`);
    if (!durationMs || durationMs < intervalMs) throw new Error('Duration must be at least one interval.');
    if (durationMs > CFG.maxDurationMs) throw new Error(`Duration too long (max ${fmtDur(CFG.maxDurationMs)}).`);
    const all = await store.list({});
    const live = all.filter(c => ['draft', 'active'].includes(c.status));
    if (live.length >= CFG.maxCampaigns) throw new Error(`Too many open campaigns (max ${CFG.maxCampaigns}). Delete or stop some first.`);
    const mediaHash = media ? crypto.createHash('sha1').update(media.buffer).digest('hex') : null;
    const fingerprint = fingerprintOf({ creator, type, text, mediaHash, intervalMs, durationMs });
    const dup = all.find(c => c.fingerprint === fingerprint && ['draft', 'active', 'paused'].includes(c.status));
    if (dup) { const e = new Error(`Duplicate: identical campaign ${dup._id} already exists (${dup.status}).`); e.duplicateOf = dup._id; throw e; }
    const id = newId();
    let mediaFile = null;
    if (media) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      mediaFile = `${id}.${EXT[type]}`;                                  // generated name: never derived from user input
      fs.writeFileSync(path.join(MEDIA_DIR, mediaFile), media.buffer);
    }
    const doc = {
      _id: id, creator: String(creator), type, text: text ? String(text) : null, mediaFile, mimetype: media ? media.mimetype || null : null, mediaHash,
      intervalMs, durationMs, startAt: startAt || null, expiresAt: null, status: 'draft', createdAt: now(),
      lastRunAt: null, nextRunAt: null, runs: 0, cycle: null, fingerprint,
      stats: { sent: 0, failed: 0 }, failures: {}, lastCycle: null,
    };
    await store.insert(doc);
    return doc;
  }

  async function activate(id) {
    const c = await store.get(id);
    if (!c) throw new Error('No such campaign.');
    if (c.status === 'active') throw new Error('Already active.');
    if (!['draft', 'stopped'].includes(c.status)) throw new Error(`Cannot start a ${c.status} campaign.`);
    if (c.mediaFile && !fs.existsSync(path.join(MEDIA_DIR, c.mediaFile))) throw new Error('The stored media file is missing; delete and recreate the campaign.');
    const t = now();
    const first = c.startAt && c.startAt > t ? c.startAt : t;           // a future start time is honoured, a past one means 'now'
    cancelled.delete(id);
    await store.patch(id, { $set: { status: 'active', expiresAt: first + c.durationMs, nextRunAt: first, cycle: null, activatedAt: t } });
    return store.get(id);
  }
  async function stop(id) {
    const c = await store.get(id); if (!c) throw new Error('No such campaign.');
    cancelled.add(id);
    await store.patch(id, { $set: { status: 'stopped', nextRunAt: null } });
    return store.get(id);
  }
  async function remove(id) {
    const c = await store.get(id); if (!c) throw new Error('No such campaign.');
    cancelled.add(id);
    await store.remove(id);
    if (c.mediaFile) { try { fs.rmSync(path.join(MEDIA_DIR, c.mediaFile), { force: true }); } catch { /* ignore */ } }
    return true;
  }
  async function runNow(id) {
    const c = await store.get(id); if (!c) throw new Error('No such campaign.');
    if (c.status !== 'active') throw new Error('Only an active campaign can be triggered.');
    await store.patch(id, { $set: { nextRunAt: now() } });
  }

  // ---- targeting (read-only; used by both the real cycle and the dry-run preview)
  async function collectTargets() {
    const sessions = (getSessions() || []).filter(s => s && s.isOnline && s.sock).sort((a, b) => String(a.phoneNumber).localeCompare(String(b.phoneNumber)));
    const perSession = new Map();                                       // phone -> [jid]  (already de-duplicated across sessions)
    const claimed = new Set();
    const results = [];
    await runPool(sessions, CFG.concurrency, async (s) => {
      try {
        const groups = await withTimeout(Promise.resolve(s.sock.groupFetchAllParticipating()), CFG.fetchTimeoutMs, 'group list');
        const me = new Set([String(s.sock.user && s.sock.user.id || '').split(':')[0].split('@')[0], String(s.sock.user && s.sock.user.lid || '').split(':')[0].split('@')[0]].filter(Boolean));
        const jids = [];
        for (const [jid, g] of Object.entries(groups || {})) {
          if (!jid.endsWith('@g.us')) continue;                         // groups only, never private chats
          if (g && g.announce) {                                        // admins-only group: the bot must be an admin to post
            const mine = (g.participants || []).find(p => me.has(String(p.id || '').split(':')[0].split('@')[0]) || me.has(String(p.lid || '').split(':')[0].split('@')[0]));
            if (!mine || !mine.admin) continue;
          }
          jids.push(jid);
        }
        results.push({ phone: String(s.phoneNumber), jids });           // only the jid list is kept; the big metadata object is dropped here
      } catch (e) { results.push({ phone: String(s.phoneNumber), jids: [], error: classifySendError(e) }); }
    });
    results.sort((a, b) => a.phone.localeCompare(b.phone));
    for (const r of results) {
      const mine = [];
      for (const jid of r.jids) if (!claimed.has(jid)) { claimed.add(jid); mine.push(jid); }
      perSession.set(r.phone, mine);
    }
    const online = sessions.length;
    const offline = Math.max(0, (getSessions() || []).length - online);
    return { perSession, sessionsOnline: online, sessionsOffline: offline, groupsTotal: claimed.size };
  }

  async function preview(id) {
    const c = await store.get(id); if (!c) throw new Error('No such campaign.');
    const t = await collectTargets();
    return { campaign: c, sessionsOnline: t.sessionsOnline, sessionsOffline: t.sessionsOffline, groupsTotal: t.groupsTotal,
      perSession: [...t.perSession.entries()].map(([phone, j]) => ({ phone: maskPhone(phone), groups: j.length })),
      estSeconds: Math.ceil(Math.max(0, ...[...t.perSession.values()].map(j => j.length)) * (CFG.sendDelayMs * 1.25) / 1000) };
  }

  // ---- sending one message to one group
  function buildContent(c) {
    if (c.type === 'text') return { content: { text: c.text }, cleanup: () => {} };
    const file = path.join(MEDIA_DIR, c.mediaFile || '');
    if (!c.mediaFile || !fs.existsSync(file)) throw new Error('media-missing');
    if (c.type === 'sticker') return { content: { sticker: fs.readFileSync(file) }, cleanup: () => {} };
    const rs = fs.createReadStream(file); rs.on('error', () => {});
    const body = { stream: rs };
    return { content: c.type === 'image' ? { image: body, caption: c.text || undefined } : { video: body, caption: c.text || undefined, mimetype: c.mimetype || 'video/mp4' }, cleanup: () => rs.destroy() };
  }
  async function sendOne(sock, jid, c) {
    if (!String(jid).endsWith('@g.us')) throw new Error('not-group');
    const { content, cleanup } = buildContent(c);
    try { await withTimeout(sock.sendMessage(jid, content), CFG.sendTimeoutMs, 'send'); } finally { cleanup(); }
  }

  // ---- one scheduled cycle of one campaign
  async function runCycle(c) {
    const t0 = now();
    const resumable = c.cycle && !c.cycle.done && (t0 - c.cycle.startedAt) < c.intervalMs;
    const cycle = resumable ? c.cycle : { no: (c.runs || 0) + 1, startedAt: t0, sent: [], done: false };
    if (!resumable) await store.patch(c._id, { $set: { cycle, lastRunAt: t0 } });
    const done = new Set(cycle.sent || []);                              // groups already claimed in THIS cycle (restart-safe)
    if (c.mediaFile && !fs.existsSync(path.join(MEDIA_DIR, c.mediaFile))) {
      await store.patch(c._id, { $set: { status: 'error', error: 'media-missing', nextRunAt: null } });
      log(`${c._id}: media file missing -> status=error`); return;
    }
    const targets = await collectTargets();
    let sent = 0, failed = 0, skippedDone = 0, breakerTrips = 0; const reasons = {};
    await runPool([...targets.perSession.entries()], CFG.concurrency, async ([phone, jids]) => {
      const s = (getSessions() || []).find(x => String(x.phoneNumber) === phone);
      if (!s || !s.isOnline || !s.sock) return;
      let consecutive = 0;
      for (const jid of jids) {
        if (stopped || cancelled.has(c._id)) return;
        if (done.has(jid)) { skippedDone++; continue; }
        if (!s.isOnline || !s.sock) { reasons['disconnected'] = (reasons['disconnected'] || 0) + 1; return; }   // session dropped mid-cycle
        done.add(jid);
        await store.patch(c._id, { $addToSet: { 'cycle.sent': jid } });      // CLAIM before sending (at-most-once)
        try {
          await sendOne(s.sock, jid, c);
          sent++; consecutive = 0;
          await store.patch(c._id, { $inc: { 'stats.sent': 1 } });
        } catch (e) {
          const r = classifySendError(e);
          failed++; consecutive++; reasons[r] = (reasons[r] || 0) + 1;
          await store.patch(c._id, { $inc: { 'stats.failed': 1, [`failures.${r}`]: 1 } });
          if (r === 'rate-limit' || r === 'disconnected' || consecutive >= CFG.breaker) { breakerTrips++; return; }   // stop hammering this session for this cycle
        }
        await sleep(Math.round(CFG.sendDelayMs * (1 + Math.random() * 0.5)));
      }
    });
    if (stopped || cancelled.has(c._id)) return;                          // leave the claimed state as is; a stop/delete wins
    // schedule the next cycle: anchored to the plan, never a catch-up burst
    const t1 = now(); let next = (c.nextRunAt || t0) + c.intervalMs; while (next <= t1) next += c.intervalMs;
    const finished = next >= c.expiresAt;
    await store.patch(c._id, { $set: {
      'cycle.done': true, runs: (c.runs || 0) + 1, nextRunAt: finished ? null : next, status: finished ? 'completed' : 'active',
      lastCycle: { no: cycle.no, startedAt: cycle.startedAt, finishedAt: t1, groups: targets.groupsTotal, sent, failed, alreadyDone: skippedDone, sessions: targets.sessionsOnline, sessionsOffline: targets.sessionsOffline, breakerTrips, reasons },
    } });
    log(`${c._id}: cycle ${cycle.no} done — sent ${sent}, failed ${failed}, groups ${targets.groupsTotal}, sessions ${targets.sessionsOnline}${finished ? ' — campaign completed' : ''}`);
  }

  async function runPool(items, limit, worker) {
    let i = 0; const n = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const item = items[i++]; await worker(item); } }));   // `limit` workers, each pulling the next item
  }

  // ---- the single tick
  async function tick() {
    if (running || stopped || !ready) return;                            // never two ticks at once; wait for startup restore
    running = true;
    try {
      const t = now();
      const expired = await store.list({ status: 'active', expiresAt: { $lte: t } });
      for (const c of expired) { await store.patch(c._id, { $set: { status: 'expired', nextRunAt: null } }); log(`${c._id}: expired`); }
      const due = await store.list({ status: 'active', nextRunAt: { $lte: t } });
      for (const c of due) {
        if (stopped) break;
        if (inProgress.has(c._id) || cancelled.has(c._id)) continue;
        inProgress.add(c._id);
        try { await runCycle(c); } catch (e) { errLog(`${c._id}: cycle error: ${e && e.message}`); } finally { inProgress.delete(c._id); }
      }
    } catch (e) { errLog(`tick error: ${e && e.message}`); } finally { running = false; }
  }

  function start() {
    if (timer) return;
    stopped = false;
    timer = setInterval(() => { tick(); }, CFG.tickMs);
    if (timer.unref) timer.unref();
    readyTimer = setTimeout(() => { ready = true; }, CFG.startGraceMs);       // safety net if setReady() is never called
    if (readyTimer.unref) readyTimer.unref();
  }
  // Called once the startup session restore has finished (so a resumed cycle sees the sessions that are online).
  function setReady(extraDelayMs = 60 * 1000) {
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
    readyTimer = setTimeout(() => { ready = true; readyTimer = null; }, extraDelayMs);
    if (readyTimer.unref) readyTimer.unref();
  }
  function stopScheduler() {
    stopped = true; ready = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
    cancelSleeps();
  }

  return {
    create, activate, stop, remove, runNow, preview, buildContent, tick, start, setReady, stopScheduler,
    get: (id) => store.get(id), list: (f) => store.list(f || {}),
    _forceReady() { ready = true; },
    isRunning: () => running,
  };
}

module.exports = { createScheduler, makeMongoStore, parseDuration, parseStart, fmtDur, maskPhone, classifySendError, CFG, MEDIA_DIR, TYPES };
