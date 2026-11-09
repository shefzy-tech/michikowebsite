// ============================================================================
// utils/channelReact.js — every connected session reacts to NEW posts in your channels, by itself.
//
// Channels = the same list the sessions already auto-join: config.channelJid (comma separated or array).
// Each entry can be a channel JID (123...@newsletter) OR a channel link (https://whatsapp.com/channel/XXXX).
// To add a channel later: put its link or JID in config.channelJid. That one entry makes sessions follow it AND react to it.
//
// How it works: WhatsApp pushes a new channel post to every session that follows the channel (messages.upsert, with
// key.server_id = the post id). Each session then reacts to that post with newsletterReactMessage, after a small random
// delay so 50+ sessions do not all react in the same second. Old posts (history replay after a reconnect) are skipped.
// Turn off with CHANNEL_REACT=off (or config.channelReact = false).
// ============================================================================
const config = require('../config');

const EMOJIS = ['❤️', '🔥', '👍', '😍', '🙏', '🎉', '💯', '😂', '🤩', '👏'];
const MAX_AGE_S = 10 * 60;                                          // only posts newer than this
const DELAY_MIN_MS = Number(process.env.CHANNEL_REACT_DELAY_MIN_MS) || 2000;
const DELAY_MAX_MS = Number(process.env.CHANNEL_REACT_DELAY_MAX_MS) || 30000;
const TIMEOUT_MS = 15000;

const resolved = new Map();                                          // entry -> jid (shared by every session)
const inflight = new Map();                                          // entry -> Promise

function entries() {
  const raw = Array.isArray(config.channelJid) ? config.channelJid : String(config.channelJid || '').split(',');
  return raw.map((s) => String(s).trim()).filter(Boolean);
}
function isOff() { return String(process.env.CHANNEL_REACT || '').toLowerCase() === 'off' || config.channelReact === false; }

// a JID is used as is; a link is looked up once and remembered
async function resolve(sock, entry) {
  entry = String(entry || '').trim();
  if (/@newsletter$/.test(entry)) return entry;
  if (resolved.has(entry)) return resolved.get(entry);
  const m = entry.match(/channel\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  if (!inflight.has(entry)) {
    inflight.set(entry, (async () => {
      try { const meta = await sock.newsletterMetadata('invite', m[1]); if (meta && meta.id) resolved.set(entry, meta.id); }
      catch { /* retried on the next connect */ }
      finally { inflight.delete(entry); }
      return resolved.get(entry) || null;
    })());
  }
  return inflight.get(entry);
}

async function react(sock, jid, serverId, emoji) {
  const call = typeof sock.newsletterMsg === 'function' ? sock.newsletterMsg(jid, { react: emoji, id: String(serverId) })
    : typeof sock.newsletterReactMessage === 'function' ? sock.newsletterReactMessage(jid, String(serverId), emoji)
    : Promise.reject(new Error('no channel reaction method'));
  let t;
  try { await Promise.race([call, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS); })]); }
  finally { clearTimeout(t); }
}

// attach to one session's socket (call once per socket, right after it is created)
function attach(sock, opts = {}) {
  try {
    if (isOff() || !sock || !sock.ev || typeof sock.ev.on !== 'function') return false;
    const log = typeof opts.log === 'function' ? opts.log : () => {};
    const known = new Set();                                         // JIDs of the configured channels
    for (const e of entries()) {
      if (/@newsletter$/.test(e)) known.add(e);
      else resolve(sock, e).then((j) => { if (j) known.add(j); }).catch(() => {});
    }
    const done = new Set();                                          // posts already handled by this session
    let first = true;
    sock.ev.on('messages.upsert', (upsert) => {
      try {
        if (!upsert || upsert.type !== 'notify' || !Array.isArray(upsert.messages)) return;
        for (const m of upsert.messages) {
          const key = m && m.key;
          const jid = key && key.remoteJid;
          if (!jid || !/@newsletter$/.test(jid) || !known.has(jid)) continue;
          const serverId = key.server_id || m.newsletterServerId;
          if (!serverId) continue;
          const ts = Number(m.messageTimestamp && m.messageTimestamp.low !== undefined ? m.messageTimestamp.low : m.messageTimestamp) || 0;
          if (ts && Date.now() / 1000 - ts > MAX_AGE_S) continue;      // history, not a new post
          const id = `${jid}:${serverId}`;
          if (done.has(id)) continue;
          done.add(id); if (done.size > 300) done.delete(done.values().next().value);
          const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
          const wait = DELAY_MIN_MS + Math.floor(Math.random() * Math.max(1, DELAY_MAX_MS - DELAY_MIN_MS));
          setTimeout(() => {
            react(sock, jid, serverId, emoji).then(() => {
              if (first) { first = false; log(`Reacted ${emoji} to a new channel post`, 'info'); }
            }).catch((e) => { done.delete(id); if (first) { first = false; log(`Channel reaction failed: ${String((e && e.message) || e).slice(0, 80)}`, 'warning'); } });
          }, wait);
        }
      } catch { /* a reaction problem must never touch the connection */ }
    });
    return true;
  } catch { return false; }
}

module.exports = { attach, resolve, entries, EMOJIS, _resolved: resolved };
