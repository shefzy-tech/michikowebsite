const fs = require("fs");
const path = require("path");
const pino = require("pino");
const chalk = require("chalk");
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidDecode,
  DisconnectReason
} = require("@whiskeysockets/baileys");
// Whole-module handle: newer/forked Baileys builds may or may not export fetchLatestWaWebVersion,
// so it is looked up at call time (feature-detected), never assumed.
const baileys = require("@whiskeysockets/baileys");
const axios = require("axios");
const {
  useMongoDBAuthState, wipeSession, setPairedAt, getPairedAt,
  hasWelcomeSent, markWelcomeSent, listSavedSessions, purgeUnregistered
} = require('./mongoAuth');

const config = require('./config');
const handleMessage = require('./main');
const { smsg } = require('./utils/smsg');
const { getStore, destroyStore, getStoreCount } = require('./store');
const diagnostics = require('./utils/diagnostics');

const SESSIONS_DIR = path.join(__dirname, 'database', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// phoneNumber -> WhatsAppBot. Invariant: at most ONE live bot per phone number.
const sessions = new Map();

//===================
// Tunables (all overridable via env; defaults chosen for ~100+ sessions)
//===================
const MAX_CONCURRENT_CONNECTS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_CONNECTS || '3', 10) || 3);
const MAX_PENDING_PAIRINGS    = Math.max(1, parseInt(process.env.MAX_PENDING_PAIRINGS || '20', 10) || 20);
const envMs = (k, d) => { const v = parseInt(process.env[k] || '', 10); return v > 0 ? v : d; };
const CONNECT_TIMEOUT_MS      = envMs('CONNECT_TIMEOUT_MS', 90 * 1000);      // a non-pairing connect that never opens/closes is declared dead
const PAIRING_WINDOW_MS       = envMs('PAIRING_WINDOW_MS', 5 * 60 * 1000);   // an unpaired session is discarded after this
const MAINTENANCE_MS          = envMs('MAINTENANCE_MS', 60 * 1000);          // single per-session liveness timer (replaces heartbeat + watchdog)
const PROBE_EVERY_TICKS       = 5;                                           // active presence probe every 5 ticks (= 5 min)
const BACKOFF_BASE_MS         = envMs('BACKOFF_BASE_MS', 5000);
const BACKOFF_MAX_MS          = envMs('BACKOFF_MAX_MS', 120 * 1000);
const WELCOME_DELAY_MS        = envMs('WELCOME_DELAY_MS', 3000);
const FORCE_RECONNECT_MS      = envMs('FORCE_RECONNECT_MS', 3000);
const PROBE_TIMEOUT_MS        = envMs('PROBE_TIMEOUT_MS', 10000);
const PAIRING_REQUEST_TIMEOUT_MS = envMs('PAIRING_REQUEST_TIMEOUT_MS', 60 * 1000); // hard ceiling for one pairing request (queue wait + handshake + requestPairingCode)
const PAIRING_PRE_DELAY_MS    = envMs('PAIRING_PRE_DELAY_MS', 2000);                // pause before asking for the code (unchanged value)

// One silent logger shared by every socket (previously two new pino instances per connect).
const SILENT_LOGGER = pino({ level: 'silent' });

const stats = { versionRejections: 0, pairingFailures: 0, pairingTimeouts: 0, created: 0, destroyed: 0, reconnects: 0, replaced: 0, duplicatesPrevented: 0, abandonedPairings: 0, connectTimeouts: 0, socketReplacedByOtherClient: 0 };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

//===================
// Global limit on simultaneous WhatsApp handshakes.
// A network blip used to make every session reconnect inside the same few seconds
// (linear backoff, no jitter), each doing an HTTP version fetch + Mongo reads + a new
// socket at once. That spike is what pushes RSS over the container limit.
//===================
class Semaphore {
  constructor(n) { this.free = n; this.queue = []; }
  // Resolves true when a slot is granted, false if the wait was cancelled via cancel().
  acquire() {
    if (this.free > 0) { this.free--; return Promise.resolve(true); }
    let waiter;
    const p = new Promise(resolve => { waiter = resolve; this.queue.push(waiter); });
    p._waiter = waiter;
    return p;
  }
  release() {
    const next = this.queue.shift();
    if (next) next(true); else this.free++;
  }
  // Remove a still-queued waiter so it can never be granted a slot later.
  cancel(p) {
    const i = p && p._waiter ? this.queue.indexOf(p._waiter) : -1;
    if (i < 0) return false;
    this.queue.splice(i, 1);
    p._waiter(false);
    return true;
  }
}
const connectLimiter = new Semaphore(MAX_CONCURRENT_CONNECTS);

//===================
// WhatsApp Web version  (the "405 / client_too_old" problem)
//
// WhatsApp periodically raises the minimum client version it accepts. A socket (or a pairing
// attempt) announcing an older version is refused with close code 405 ("Connection Failure"),
// which shows up as "Couldn't link device" when pairing.
//
// fetchLatestBaileysVersion() is NOT a live source: it reads a file from GitHub and, on any failure,
// quietly returns the bundled constant with isLatest:false. The version is therefore resolved from
// the live source, in this order:
//   1. baileys.fetchLatestWaWebVersion()  (reads web.whatsapp.com/sw.js) - only if the installed
//      build exports it AND it reports a real result (no error, isLatest !== false)
//   2. our own read of the same sw.js (same client_revision parse) - if (1) is missing/unusable
//   3. last live version seen (stale, loudly logged)
//   4. fetchLatestBaileysVersion() - only when it reports no error (stale, loudly logged)
//   5. the library default (stale, loudly logged)
// Only results of (1)/(2) are ever cached as "fresh".
//===================
const WA_VERSION_TTL_MS           = envMs('WA_VERSION_TTL_MS', 60 * 1000);           // max age of the live version for restore/reconnect
const WA_VERSION_FRESH_MS         = envMs('WA_VERSION_FRESH_MS', 5 * 1000);          // max age for a fresh pairing
const WA_VERSION_RETRY_MS         = envMs('WA_VERSION_RETRY_MS', 15 * 1000);         // min gap after a failed live lookup
const WA_VERSION_FETCH_TIMEOUT_MS = envMs('WA_VERSION_FETCH_TIMEOUT_MS', 10 * 1000);
const WA_405_HOLD_BASE_MS         = envMs('WA_405_HOLD_BASE_MS', 5 * 60 * 1000);     // first hold when 405 persists on the newest known version
const WA_405_HOLD_MAX_MS          = envMs('WA_405_HOLD_MAX_MS', 30 * 60 * 1000);
const VERSION_REJECTED            = 405;

const wv = {
  cur: null,        // last LIVE lookup { version, key, source, at }
  lastGood: null,   // same, kept even after cur is invalidated
  inflight: null,   // single-flight live lookup
  refresh: null,    // single-flight post-405 refresh
  lastFailAt: 0, lastWarnAt: 0,
  rejectedKey: null, holdLevel: 0, holdUntil: 0,
};
const vKey = (v) => (Array.isArray(v) ? v.join('.') : 'bundled-default');
const validVersion = (v) => Array.isArray(v) && v.length === 3 && v.every(n => Number.isInteger(n) && n >= 0) && v[2] > 0;

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out`)), ms); })
  ]).finally(() => clearTimeout(t));
}

// Same parse the upstream fetchLatestWaWebVersion() uses: client_revision from the web client's service worker.
async function fetchWaWebVersionFromSw() {
  const res = await axios.get('https://web.whatsapp.com/sw.js', {
    timeout: WA_VERSION_FETCH_TIMEOUT_MS, responseType: 'text', transformResponse: [(d) => d]
  });
  const m = String(res.data || '').match(/\\?"client_revision\\?":\s*(\d+)/);
  const v = m ? [2, 3000, parseInt(m[1], 10)] : null;
  return validVersion(v) ? v : null;
}

async function fetchLiveWaVersion() {
  const fn = baileys.fetchLatestWaWebVersion;
  if (typeof fn === 'function') {
    try {
      const r = await withTimeout(Promise.resolve(fn({ timeout: WA_VERSION_FETCH_TIMEOUT_MS })), WA_VERSION_FETCH_TIMEOUT_MS + 2000, 'fetchLatestWaWebVersion');
      // upstream answers a failed lookup with the stale bundled version AND isLatest:false/error: never trust that.
      if (r && !r.error && r.isLatest !== false && validVersion(r.version)) return { version: r.version, source: 'baileys.fetchLatestWaWebVersion' };
    } catch { /* fall through to our own lookup */ }
  }
  try {
    const v = await withTimeout(fetchWaWebVersionFromSw(), WA_VERSION_FETCH_TIMEOUT_MS + 2000, 'sw.js lookup');
    if (v) return { version: v, source: 'sw.js' };
  } catch { /* nothing live available */ }
  return null;
}

function warnVersion(msg) {
  if (Date.now() - wv.lastWarnAt < 60 * 1000) return;   // one line per minute, not one per session
  wv.lastWarnAt = Date.now();
  console.log(chalk.yellow(`[WA VERSION] ${msg}`));
}

function adoptLive(r) {
  const prev = wv.cur || wv.lastGood;
  const cur = { version: r.version, key: vKey(r.version), source: r.source, at: Date.now() };
  wv.cur = wv.lastGood = cur;
  wv.lastFailAt = 0;
  if (!prev || prev.key !== cur.key) console.log(chalk.green(`[WA VERSION] WhatsApp Web version ${cur.key} (via ${cur.source})${prev ? ` — was ${prev.key}` : ''}`));
  return cur;
}

async function fallbackWaVersion() {
  if (wv.lastGood) {
    warnVersion(`live lookup failed — using last known live version ${wv.lastGood.key}. If connections fail with 405, the version is outdated.`);
    return { ...wv.lastGood, source: 'last-known-live', stale: true };
  }
  try {
    const r = await withTimeout(Promise.resolve(baileys.fetchLatestBaileysVersion && baileys.fetchLatestBaileysVersion()), WA_VERSION_FETCH_TIMEOUT_MS, 'fetchLatestBaileysVersion');
    if (r && !r.error && r.isLatest !== false && validVersion(r.version)) {
      warnVersion(`live lookup failed — using Baileys-reported version ${vKey(r.version)} (NOT live; may be outdated)`);
      return { version: r.version, key: vKey(r.version), source: 'baileys-github', stale: true, at: Date.now() };
    }
  } catch { /* use the library default */ }
  warnVersion('live lookup failed and no other version source is available — using the library\'s bundled default. EXPECT 405 if it is outdated.');
  return { version: undefined, key: 'bundled-default', source: 'bundled-default', stale: true, at: Date.now() };
}

// Version for the next socket. fresh=true (pairing) accepts only a very recent lookup.
// Concurrent callers share ONE lookup; a failed lookup is not retried more often than WA_VERSION_RETRY_MS.
async function getWaVersion({ fresh = false } = {}) {
  const maxAge = fresh ? WA_VERSION_FRESH_MS : WA_VERSION_TTL_MS;
  if (wv.cur && Date.now() - wv.cur.at <= maxAge) return wv.cur;
  if (!wv.inflight && Date.now() - wv.lastFailAt >= WA_VERSION_RETRY_MS) {
    wv.inflight = (async () => {
      const r = await fetchLiveWaVersion();
      if (r) adoptLive(r); else wv.lastFailAt = Date.now();
    })().finally(() => { wv.inflight = null; });
  }
  if (wv.inflight) await wv.inflight;
  if (wv.cur && Date.now() - wv.cur.at <= maxAge) return wv.cur;
  return fallbackWaVersion();
}

// A socket that reached 'open' proves WhatsApp accepts the version we now announce: forget the hold,
// otherwise a later, unrelated 405 would start from a stale escalation level.
function noteVersionAccepted() {
  if (!wv.holdUntil && !wv.holdLevel) return;
  console.log(chalk.green('[WA VERSION] A connection succeeded — 405 hold released.'));
  wv.holdUntil = 0; wv.holdLevel = 0; wv.rejectedKey = null;
}
function versionHoldRemaining(key) {
  return (Date.now() < wv.holdUntil && key === wv.rejectedKey) ? wv.holdUntil - Date.now() : 0;
}
const holdJitter = (ms) => Math.floor(Math.random() * Math.min(60 * 1000, ms / 2));   // spread sessions after a hold

// Called when ANY socket is closed with 405. This is a GLOBAL condition (the version is refused, not the
// session), so it is handled once, not once per session:
//   * one shared (single-flight) live lookup
//   * a different/newer version found  -> no hold; sessions retry with it on their normal backoff
//   * same version (or nothing found)  -> escalating hold (5 min .. 30 min); during it no session reconnects
// Resolves to the remaining hold in ms (0 = none). It can only ever make reconnects LATER, never sooner.
async function noteVersionRejected(usedKey) {
  stats.versionRejections++;
  const now = Date.now();
  if (now < wv.holdUntil) return wv.holdUntil - now;                         // already holding: no extra lookups, no extra escalation
  if (wv.cur && usedKey && wv.cur.key !== usedKey) return 0;                  // a newer live version was already adopted
  if (!wv.refresh) {
    wv.refresh = (async () => {
      wv.cur = null;                                                         // never serve the rejected version from cache again
      const r = await fetchLiveWaVersion();
      const adopted = r ? adoptLive(r) : null;
      if (adopted && adopted.key !== usedKey) {
        wv.holdLevel = 0; wv.holdUntil = 0; wv.rejectedKey = null;
        console.log(chalk.green(`[WA VERSION] WhatsApp rejected ${usedKey} (405); newer version ${adopted.key} found — reconnecting with it (normal backoff).`));
      } else {
        wv.holdLevel = Math.min(wv.holdLevel + 1, 10);
        const holdMs = Math.min(WA_405_HOLD_BASE_MS * Math.pow(2, wv.holdLevel - 1), WA_405_HOLD_MAX_MS);
        wv.holdUntil = Date.now() + holdMs; wv.rejectedKey = usedKey;
        console.log(chalk.red(`[WA VERSION] WhatsApp rejected ${usedKey} (405) and ${adopted ? 'no newer version exists' : 'the live lookup failed'}. `
          + `Holding ALL reconnects for ${Math.round(holdMs / 1000)}s (level ${wv.holdLevel}) instead of retrying a known-rejected version. `
          + `Persistent 405 means the installed Baileys build itself is outdated: update it.`));
      }
    })().finally(() => { wv.refresh = null; });
  }
  await wv.refresh;
  return Math.max(0, wv.holdUntil - Date.now());
}

// Pairing gate: while a 405 hold is active, only let a pairing through if a genuinely newer live version exists.
function versionError() {
  return Object.assign(new Error('WhatsApp rejected the connection because this bot\'s client version is outdated (405). The version refresh is automatic; please try again in a few minutes.'), { code: 'WA_VERSION_REJECTED' });
}
async function assertVersionUsable() {
  if (Date.now() >= wv.holdUntil) return;
  const info = await getWaVersion({ fresh: true });
  if (!info.stale && info.key !== wv.rejectedKey) { wv.holdUntil = 0; wv.holdLevel = 0; wv.rejectedKey = null; return; }
  throw versionError();
}

//===================
// Group protection
//===================
let getGroupProtection, saveProtection;
setImmediate(() => {
  const main = require('./main');
  getGroupProtection = main.getGroupProtection;
  saveProtection = main.saveProtection;
});

//===================
// WhatsAppBot
//
// Lifecycle rules enforced here:
//   * _destroyed: once set the instance can never connect/reconnect again.
//   * _gen: bumped on every connect() and on destroy(). Every socket listener and timer
//     captures the generation it belongs to and ignores events if it is stale, so an
//     old socket (or a timer that outlived it) can never act on the current instance.
//   * Exactly ONE reconnect path: _scheduleReconnect(). Close events, the maintenance
//     timer, connect timeouts and failed restores all go through it, and it refuses to
//     schedule when a reconnect is already pending/queued or a connect is in progress.
//===================
class WhatsAppBot {
  constructor(phoneNumber) {
    this.phoneNumber = phoneNumber;
    this.sock = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.hasAutoJoined = false;
    this.reconnectAttempts = 0;

    this._destroyed = false;
    this._gen = 0;
    this._reconnectTimer = null;
    this._reconnectQueued = false;
    this._connectTimeoutTimer = null;
    this._pairingTimer = null;
    this._maintTimer = null;
    this._maintTick = 0;
    this._slotHeld = false;
    this._pendingWelcome = false;   // set only by a real pairing flow
    this._unpaired = false;         // true from pairing request until the account is paired
    this._replacedStreak = 0;
    this._slotWait = null;          // pending limiter wait (so destroy() can cancel it)
    this._versionKey = null;        // WA Web version this instance's current socket announced
    this._lastCloseCode = null;
    this._versionRejects = 0;
    this._sleepers = new Map();     // tracked sleeps (timer -> resolve) so destroy() can release them

    this.heartbeatInterval = null;  // legacy fields kept so nothing external breaks; unused
    this.watchdogInterval = null;

    this._badMacCount = 0;
    this._badMacTimer = null;
    this._sessionResetCooldown = false;

    this.log = (msg, type = 'info') => {
      const colors = { success: chalk.green, error: chalk.red, warning: chalk.yellow, info: chalk.blue };
      console.log(chalk.magenta(`[WA:${phoneNumber}]`), (colors[type] || chalk.white)(msg));
    };
    stats.created++;
  }

  get state() {
    if (this._destroyed) return 'stopped';
    if (this.isConnected) return 'open';
    if (this.isConnecting) return 'connecting';
    if (this._reconnectTimer || this._reconnectQueued) return 'backoff';
    return 'idle';
  }

  _handleSessionError() {
    this._badMacCount++;
    if (this._badMacTimer) clearTimeout(this._badMacTimer);
    if (this._badMacCount >= 2 && !this._sessionResetCooldown) {
      this._sessionResetCooldown = true;
      this.log('Signal session reset detected — pausing 5s', 'warning');
      setTimeout(() => {
        this._sessionResetCooldown = false;
        this._badMacCount = 0;
        this.log('Session reset cooldown lifted', 'info');
      }, 5000);
    }
    this._badMacTimer = setTimeout(() => { this._badMacCount = 0; }, 10000);
  }

  decodeJid(jid) {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decoded = jidDecode(jid) || {};
      return decoded.user && decoded.server ? `${decoded.user}@${decoded.server}` : jid;
    }
    return jid;
  }

  async sendOnlineMessage() {
    try {
      if (!this.sock?.user || !this.phoneNumber) return;
      const botNumber = this.decodeJid(this.sock.user.id);
      const userJid = `${this.phoneNumber}@s.whatsapp.net`;
      await this.sock.sendMessage(userJid, {
        text: `╭─❏ *${config.botName} ONLINE* ❏─⬣\n│\n│ ✅ Connected & Online\n│ 📱 Bot: ${botNumber}\n│ 👤 You: +${this.phoneNumber}\n│ 💾 Memory: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB\n│ 🕐 ${new Date().toLocaleString()}\n│\n╰─❏\n› Type *${config.prefix || '.'}menu* to start\n\n${config.productBrand}`
      });
      this.log(`Online message sent to ${this.phoneNumber}`, 'success');
    } catch (e) {
      this.log(`Failed to send online message: ${e.message}`, 'error');
    }
  }

  // Send the one-time "online" notification. Only runs for a genuinely NEW pairing
  // (_pendingWelcome is set by the pairing flow, never by session restoration or
  // reconnects) and is de-duplicated durably in MongoDB so a crash-restart loop or a
  // repeated connection.update can never re-send it.
  async _maybeSendWelcome(gen) {
    if (this._destroyed || gen !== this._gen) return;
    try {
      if (await hasWelcomeSent(this.phoneNumber)) return;
      if (this._destroyed || gen !== this._gen) return;
      await this.sendOnlineMessage();
      await markWelcomeSent(this.phoneNumber);
    } catch (e) {
      this.log(`Welcome message check failed: ${e.message}`, 'warning');
    }
  }

   async autoJoinGroup() {
    if (!config.autoJoinGroup) return;
    let groups = Array.isArray(config.groupInviteLink)
      ? config.groupInviteLink
      : (config.groupInviteLink || '').split(',').map(l => l.trim()).filter(Boolean);
    if (!groups.length) return;

    for (let i = 0; i < groups.length; i++) {
      const link = groups[i];
      const match = link.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
      if (!match) continue;
      const inviteCode = match[1];
      try {
        const info = await this.sock.groupGetInviteInfo(inviteCode);
        this.log(`Attempting to join: ${info.subject}`, 'info');

        const jid = await this.sock.groupAcceptInvite(inviteCode);
        this.log(`Auto-joined group: ${jid}`, 'success');
        if (i < groups.length - 1) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        this.log(`Group join failed ${link}: ${e.message}`, 'warning');
      }
    }
  }

  async autoJoinChannel() {
    if (!config.autoJoinChannel) return;
    let channels = Array.isArray(config.channelJid)
      ? config.channelJid
      : (config.channelJid || '').split(',').map(j => j.trim()).filter(Boolean);

    if (channels.length === 0) return;
    this.log(`Attempting to auto-join ${channels.length} channel(s)...`, 'info');
    for (let i = 0; i < channels.length; i++) {
      const channelJid = channels[i];
      try {
        if (!channelJid || !channelJid.includes('@newsletter')) {
          this.log(`Skipping invalid channel JID: ${channelJid}`, 'warning');
          continue;
        }
        await this.sock.newsletterFollow(channelJid);
        this.log(`Auto-joined channel: ${channelJid}`, 'success');
        if (i < channels.length - 1) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        this.log(`Auto-join channel ${channelJid} failed: ${e.message}`, 'warning');
      }
    }
  }

  //===================
  // Timers / slots
  //===================
  _clearReconnectTimer() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
  }
  _clearConnectTimeout() {
    if (this._connectTimeoutTimer) { clearTimeout(this._connectTimeoutTimer); this._connectTimeoutTimer = null; }
  }
  _clearPairingTimer() {
    if (this._pairingTimer) { clearTimeout(this._pairingTimer); this._pairingTimer = null; }
  }
  _stopMaintenance() {
    if (this._maintTimer) { clearInterval(this._maintTimer); this._maintTimer = null; }
  }
  async _acquireSlot() {
    const wait = connectLimiter.acquire();
    this._slotWait = wait;
    let granted;
    try { granted = await wait; } finally { if (this._slotWait === wait) this._slotWait = null; }
    if (!granted) return false;                                   // cancelled while queued
    if (this._destroyed) { connectLimiter.release(); return false; }
    this._slotHeld = true;
    return true;
  }

  // sleep that destroy() can cut short (no timer outlives a destroyed session)
  _sleep(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this._sleepers.delete(t); resolve(); }, ms);
      this._sleepers.set(t, resolve);
    });
  }

  // Pairing entry point: runs through the SAME global handshake limiter as restore/reconnect
  // and under one hard deadline. The slot is held until the pairing code has been obtained
  // (that is the heavy handshake); it is NOT held while the user types the code on their phone.
  // After the user confirms, WhatsApp closes with 515 and the reconnect goes through the limiter.
  async _runManagedPairing(timeoutMs) {
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        stats.pairingTimeouts++;
        reject(Object.assign(new Error('Pairing request timed out — WhatsApp did not answer in time. Please try again.'), { code: 'PAIRING_TIMEOUT' }));
      }, timeoutMs);
    });
    const work = (async () => {
      const ok = await this._acquireSlot();
      if (!ok || this._destroyed) throw new Error('Pairing request was cancelled.');
      const code = await this.connect(true);
      // fresh pairing: code obtained -> handshake done -> free the slot.
      // registered account: connect(true) opened like a restore -> slot is released by open/close/timeout.
      if (code || !this.isConnecting) this._releaseSlot();
      return code;
    })();
    work.catch(() => {});                       // a rejection arriving after the deadline must never be unhandled
    try { return await Promise.race([work, deadline]); }
    finally { clearTimeout(timer); }
  }
  _releaseSlot() {
    if (this._slotHeld) { this._slotHeld = false; connectLimiter.release(); }
  }

  _backoffDelay() {
    const exp = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.min(this.reconnectAttempts, 6)), BACKOFF_MAX_MS);
    return Math.round(exp * (0.75 + Math.random() * 0.5)); // ±25% jitter de-synchronises sessions
  }

  // THE one reconnect entry point. Safe to call from anywhere, any number of times.
  _scheduleReconnect(reason, forcedDelayMs) {
    if (this._destroyed) return;
    if (this._reconnectTimer || this._reconnectQueued) return; // already pending: collapses races
    if (this.isConnecting) return;
    const delay = forcedDelayMs != null ? forcedDelayMs : this._backoffDelay();
    this.reconnectAttempts++;
    this.log(`Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts}, ${reason})`, 'info');
    const gen = this._gen;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._destroyed || gen !== this._gen) return; // replaced/destroyed/superseded meanwhile
      this._runManagedConnect(reason).catch((e) => {
        this.log(`Reconnect failed: ${e.message}`, 'error');
        this._scheduleReconnect('connect-error');
      });
    }, delay);
  }

  // connect() gated by the global handshake limiter. Resolves once the socket has been
  // created; the limiter slot is held until the handshake settles (open / close / timeout).
  async _runManagedConnect(reason) {
    if (this._destroyed || this.isConnecting || this.isConnected) return null;
    this._reconnectQueued = true;
    let ok;
    try { ok = await this._acquireSlot(); } finally { this._reconnectQueued = false; }
    if (!ok || this._destroyed) return null;
    if (reason !== 'restore') stats.reconnects++;
    try {
      const sock = await this.connect(false);
      if (!this.isConnecting) this._releaseSlot(); // already settled, or connect() was a no-op
      return sock;
    } catch (e) {
      this._releaseSlot();
      throw e;
    }
  }

  _armConnectTimeout(gen) {
    this._clearConnectTimeout();
    this._connectTimeoutTimer = setTimeout(() => {
      this._connectTimeoutTimer = null;
      if (this._destroyed || gen !== this._gen || !this.isConnecting) return;
      stats.connectTimeouts++;
      this.log(`Connect attempt produced no open/close within ${CONNECT_TIMEOUT_MS / 1000}s — discarding socket`, 'warning');
      this._gen++;                 // invalidate the half-built attempt so a late await can't resurrect it
      this.isConnecting = false;
      this._releaseSlot();
      this.cleanupSocketOnly();
      this._scheduleReconnect('connect-timeout');
    }, CONNECT_TIMEOUT_MS);
  }

  // One lightweight liveness timer per session (replaces the old 45s heartbeat AND the
  // 10-min watchdog, which each probed and each reconnected independently).
  _startMaintenance() {
    this._stopMaintenance();
    const gen = this._gen;
    this._maintTick = 0;
    const interval = MAINTENANCE_MS + Math.floor(Math.random() * Math.min(15000, MAINTENANCE_MS / 4)); // jitter
    this._maintTimer = setInterval(async () => {
      if (this._destroyed || gen !== this._gen) return this._stopMaintenance();
      this._maintTick++;

      if (!this.isConnected) {
        if (!this.isConnecting) this._scheduleReconnect('maintenance-dead');
        return;
      }
      const ws = this.sock?.ws;
      if (ws && (ws.isClosed === true || ws.isClosing === true)) {
        return this._forceReconnect(gen, 'socket-closed-without-event');
      }
      if (this._maintTick % PROBE_EVERY_TICKS === 0) {
        let probeTimer;
        try {
          await Promise.race([
            this.sock.sendPresenceUpdate('available'),
            new Promise((_, rej) => { probeTimer = setTimeout(() => rej(new Error('timeout')), PROBE_TIMEOUT_MS); })
          ]);
        } catch (e) {
          if (this._destroyed || gen !== this._gen) return;
          this._forceReconnect(gen, `probe-failed:${e.message}`);
        } finally {
          clearTimeout(probeTimer);   // never leave the losing timeout armed
        }
      }
    }, interval);
    if (this._maintTimer.unref) this._maintTimer.unref();
  }

  _forceReconnect(gen, reason) {
    if (this._destroyed || gen !== this._gen) return;
    this.log(`Liveness check failed (${reason}) — forcing reconnect`, 'warning');
    this._gen++;
    this.isConnected = false;
    this._stopMaintenance();
    this.cleanupSocketOnly();
    this._scheduleReconnect(reason, FORCE_RECONNECT_MS + Math.floor(Math.random() * FORCE_RECONNECT_MS * 0.6));
  }

  //===================
  // connect()
  //===================
  async connect(requestPairing = false) {
    if (this._destroyed) {
      this.log('connect() ignored — session instance was destroyed', 'warning');
      return null;
    }
    if (this.isConnecting) {
      this.log('Connection already in progress', 'warning');
      return null;
    }
    if (this.isConnected && this.sock && !requestPairing) {
      this.log('Already connected', 'warning');
      return this.sock;
    }

    this._clearReconnectTimer();   // a direct connect supersedes anything pending
    this.cleanupSocketOnly();
    this.isConnected = false;
    this.isConnecting = true;
    const gen = ++this._gen;       // everything below belongs to this generation
    const stale = () => gen !== this._gen || this._destroyed;
    if (!requestPairing) this._armConnectTimeout(gen);

    try {
      // Live WhatsApp Web version, for restored/reconnecting sessions AND fresh pairings (fresh = very recent lookup).
      // Resolved BEFORE touching MongoDB so a session that must wait costs nothing.
      const vInfo = await getWaVersion({ fresh: requestPairing });
      if (stale()) return null;
      const version = vInfo.version;
      // WhatsApp already refused this exact version (405) and nothing newer exists: opening a socket is
      // certain to be refused again, so wait out the global hold instead of attempting.
      const heldMs = requestPairing ? 0 : versionHoldRemaining(vInfo.key);
      if (heldMs > 0) {
        this.isConnecting = false;
        this._clearConnectTimeout();
        this._scheduleReconnect('version-hold', heldMs + holdJitter(heldMs));
        return null;
      }
      this._versionKey = vInfo.key;

      const { state, saveCreds } = await useMongoDBAuthState(this.phoneNumber);
      if (stale()) return null;

      const sockOpts = {
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, SILENT_LOGGER)
        },
        logger: SILENT_LOGGER,
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        browser: ['Ubuntu', 'Edge', '20.0.04'],
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 30000,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 2000,
        maxMsgRetryCount: 3,
      };
      if (version) sockOpts.version = version; // never pass version:undefined (it would override the library default)
      this.sock = makeWASocket(sockOpts);

      handleMessage.registerGroupEvents(this.sock);
      this.sock.decodeJid = this.decodeJid.bind(this);
      this.sock.ev.on('creds.update', saveCreds);
      this.store = getStore(this.phoneNumber);
      this.store.bind(this.sock.ev);
      if (typeof handleMessage.registerAntiDelete === 'function') handleMessage.registerAntiDelete(this.sock, this.store);

      const alreadyRegistered = !!(state.creds?.registered);
      // A pairing request on an already-registered account opens like a normal restore, so it
      // gets the same hung-connect protection (a fresh pairing is guarded by the pairing window).
      if (requestPairing && alreadyRegistered) this._armConnectTimeout(gen);
      const isPaired = () => !!(state.creds?.registered || state.creds?.me?.id);

      //===================
      // Connection lifecycle
      //===================
      this.sock.ev.on('connection.update', async (update) => {
        if (stale()) return; // event from a replaced/destroyed socket
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          if (this.isConnected) return; // duplicate 'open' for the same socket — nothing to redo
          this.isConnected = true;
          this.isConnecting = false;
          this._clearConnectTimeout();
          this._clearPairingTimer();
          this._unpaired = false;
          this._releaseSlot();
          this.reconnectAttempts = 0;
          this._replacedStreak = 0;
          this._versionRejects = 0;
          this._lastCloseCode = null;
          noteVersionAccepted();
          this._sessionResetCooldown = false;
          this._badMacCount = 0;
          this.log('WhatsApp connected! ✅', 'success');
          setPairedAt(this.phoneNumber).catch(() => {});

          this._startMaintenance();

          // Notification policy: ONLY a brand-new pairing is announced. Process restarts
          // (restore), reconnects and duplicate connection.update events never are.
          if (this._pendingWelcome) {
            this._pendingWelcome = false;
            setTimeout(() => this._maybeSendWelcome(gen), WELCOME_DELAY_MS);
          }

          setTimeout(async () => {
            if (stale()) return;
            if (!this.hasAutoJoined) {
              this.hasAutoJoined = true;
              await this.autoJoinGroup().catch(() => {});
              await this.autoJoinChannel().catch(() => {});
            }
          }, 5000);

          await this.sock?.sendPresenceUpdate('available').catch(() => {});

        } else if (connection === 'close') {
          this.isConnected = false;
          this.isConnecting = false;
          this._clearConnectTimeout();
          this._releaseSlot();
          this._stopMaintenance();

          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const reason = lastDisconnect?.error?.message || 'Unknown';
          this.log(`Connection closed | Code: ${statusCode} | ${reason}`, 'warning');

          if (statusCode === DisconnectReason.loggedOut) {
            this.log('Session logged out — wiping session from MongoDB', 'error');
            await this._handleLoggedOut();
            return;
          }

          if (statusCode === DisconnectReason.restartRequired) {
            this.log('Restart required (515) — reconnecting immediately', 'info');
            this._scheduleReconnect('restartRequired', 100);
            return;
          }

          if (statusCode === VERSION_REJECTED) {
            // 405 = WhatsApp refused the client VERSION. Global condition: one shared refresh, then either
            // retry with the newer version on the normal backoff, or wait out an escalating hold.
            this._lastCloseCode = VERSION_REJECTED;
            this._reconnectQueued = true;            // collapse every other reconnect trigger while the shared refresh runs
            let holdMs = 0;
            try { holdMs = await noteVersionRejected(this._versionKey); } finally { this._reconnectQueued = false; }
            if (stale()) return;
            if (!isPaired()) {
              this.log('WhatsApp rejected the client version during pairing (405) — discarding the unpaired session', 'warning');
              await this._abandonUnpaired('version-rejected-405');
              return;
            }
            this._versionRejects++;
            const delay = Math.max(this._backoffDelay(), holdMs > 0 ? holdMs + holdJitter(holdMs) : 0);   // never sooner than the normal backoff
            this.log(`WhatsApp rejected client version ${this._versionKey} (405) — ${holdMs > 0 ? 'holding' : 'refreshed, retrying'} (x${this._versionRejects})`, 'warning');
            this._scheduleReconnect('close:405', delay);
            return;
          }

          // A close before the account was ever paired means the pairing code is dead.
          // Reconnecting such a session forever (the old behaviour) is a pure resource leak.
          if (!isPaired()) {
            this.log('Closed before pairing completed — discarding unpaired session', 'warning');
            await this._abandonUnpaired('closed-before-pairing');
            return;
          }

          if (statusCode === DisconnectReason.connectionReplaced) {
            // Another client/process is logged in with these exact credentials. Reconnecting
            // quickly just makes the two fight forever (each open kicks the other), which
            // shows up as endless connect/disconnect cycles. Back off hard; never wipe.
            this._replacedStreak++;
            stats.socketReplacedByOtherClient++;
            const delay = Math.min(60000 * this._replacedStreak, 600000);
            this.log(`Replaced by another connection using the same credentials (x${this._replacedStreak}). Is a second process/host running this bot? Backing off ${delay / 1000}s`, 'error');
            this._scheduleReconnect('connectionReplaced', delay);
            return;
          }

          this._scheduleReconnect(`close:${statusCode}`);
        }
      });

      //===================
      // Message handler
      //===================
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (stale() || !this.isConnected) return;
        if (type !== 'notify') return;

        for (const m of messages) {
          if (stale()) break;
          try {
            if (!m || !m.message) continue;
            if (m.key.fromMe && m.key.id?.startsWith('BAE')) continue;

            if (this._sessionResetCooldown) {
              this.log(`Message queued during session reset (${m.key.id})`, 'warning');
              await new Promise(resolve => setTimeout(resolve, 6000));
              if (this._sessionResetCooldown) {
                this.log(`Message dropped after cooldown wait (${m.key.id})`, 'warning');
                continue;
              }
            }

            const enhanced = await smsg(this.sock, m);
            await handleMessage(this.sock, enhanced, null, this.store);

          } catch (e) {
            const errMsg = e.message || '';
            if (
              errMsg.includes('Bad MAC') ||
              errMsg.includes('bad mac') ||
              errMsg.includes('decryptWithSessions') ||
              errMsg.includes('SessionEntry') ||
              errMsg.includes('prekey bundle')
            ) {
              this._handleSessionError();
              continue;
            }
            this.log(`Message error: ${errMsg}`, 'error');
          }
        }
      });

      //===================
      // Pairing code request
      //===================
      if (requestPairing && !alreadyRegistered) {
        this.log(`Requesting pairing code for ${this.phoneNumber}...`, 'info');
        this._unpaired = true;
        this._pendingWelcome = true; // this is a real new pairing: it earns the one online message
        this._clearPairingTimer();
        this._pairingTimer = setTimeout(() => {
          this._pairingTimer = null;
          if (this._destroyed || !this._unpaired) return;
          this._abandonUnpaired('pairing-window-expired').catch(() => {});
        }, PAIRING_WINDOW_MS);
        await this._sleep(PAIRING_PRE_DELAY_MS);
        if (stale()) return null;
        try {
          const code = await this.sock.requestPairingCode(this.phoneNumber, 'MRSHEFZY');
          if (stale()) return null;               // answered after the request was abandoned/timed out
          this.log(`Pairing code: ${code}`, 'success');
          return code;
        } catch (e) {
          if (!stale()) this.log(`Pairing code error: ${e.message}`, 'error');
          throw e;
        }
      }

      return null;

    } catch (e) {
      if (gen === this._gen) {
        this.isConnecting = false;
        this._clearConnectTimeout();
      }
      this.log(`Connect error: ${e.message}`, 'error');
      throw e;
    }
  }

  async _handleLoggedOut() {
    this.destroy('logged-out');
    destroyStore(this.phoneNumber);
    try {
      const deleted = await wipeSession(this.phoneNumber);
      this.log(`MongoDB wiped after forced logout — ${deleted} document(s) removed.`, 'info');
    } catch (e) {
      this.log(`MongoDB wipe failed after logout: ${e.message}`, 'error');
    }
  }

  // A pairing that never completed: stop everything and remove its leftover creds so it
  // is not restored (and reconnect-looped) at every future startup.
  async _abandonUnpaired(reason) {
    if (this._destroyed) return;
    stats.abandonedPairings++;
    this.log(`Abandoning unpaired session (${reason})`, 'warning');
    this.destroy(`abandoned:${reason}`);
    destroyStore(this.phoneNumber);
    try {
      const removed = await purgeUnregistered(this.phoneNumber);
      if (removed) this.log(`Removed ${removed} leftover document(s) of the incomplete pairing`, 'info');
    } catch (e) {
      this.log(`Could not purge incomplete pairing: ${e.message}`, 'warning');
    }
  }

  cleanupSocketOnly() {
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.ws?.close();
        this.sock.end();
      } catch {}
      this.sock = null;
    }
  }

  // End of life for this instance. Idempotent. After this nothing can reconnect it:
  // all timers are cleared, the socket is closed, and _gen is bumped so any listener or
  // timer that still holds a reference to this instance ignores its own events.
  destroy(reason = 'cleanup') {
    if (this._destroyed) return;
    this._destroyed = true;
    this._gen++;
    stats.destroyed++;
    this._clearReconnectTimer();
    this._clearConnectTimeout();
    this._clearPairingTimer();
    this._stopMaintenance();
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    if (this._badMacTimer) clearTimeout(this._badMacTimer);
    this._releaseSlot();
    if (this._slotWait) { connectLimiter.cancel(this._slotWait); this._slotWait = null; }
    for (const [t, resolve] of this._sleepers) { clearTimeout(t); resolve(); }
    this._sleepers.clear();
    this.cleanupSocketOnly();
    this.isConnected = false;
    this.isConnecting = false;
    this._reconnectQueued = false;
    this._sessionResetCooldown = false;
    this._badMacCount = 0;
    // only remove the registry entry if it still points at THIS instance
    if (sessions.get(this.phoneNumber) === this) sessions.delete(this.phoneNumber);
    this.log(`Session instance destroyed (${reason})`, 'info');
  }

  // kept for backward compatibility with callers of the old API
  cleanup() { this.destroy('cleanup'); }

  async logout() {
    try { if (this.sock) await this.sock.logout().catch(() => {}); } catch {}
    this.destroy('logout');
    try {
      const deleted = await wipeSession(this.phoneNumber);
      this.log(`MongoDB session wiped — ${deleted} document(s) removed`, 'info');
    } catch(e) {
      this.log(`MongoDB wipe failed: ${e.message}`, 'error');
    }
    destroyStore(this.phoneNumber);
    this.log('Session deleted', 'info');
  }

  getClient() { return this.sock; }
  isOnline() { return this.isConnected; }
}

//===================
// Session manager functions
//===================

function getStats() {
  let connected = 0, connecting = 0, backoff = 0;
  for (const bot of sessions.values()) {
    const s = bot.state;
    if (s === 'open') connected++;
    else if (s === 'connecting') connecting++;
    else if (s === 'backoff') backoff++;
  }
  return {
    total: sessions.size, connected, connecting, backoff, stores: getStoreCount(),
    pairingInFlight: pairingInFlight.size, pairingPending: pendingPairingTotal(),
    limiterFree: connectLimiter.free, limiterQueued: connectLimiter.queue.length,
    waVersion: (wv.cur || wv.lastGood) ? (wv.cur || wv.lastGood).key : null, waVersionSource: wv.cur ? wv.cur.source : null,
    versionHoldMs: Math.max(0, wv.holdUntil - Date.now()), versionHoldLevel: wv.holdLevel,
    ...stats
  };
}

// Distinct phones that are either still obtaining a pairing code (incl. queued) or waiting
// for the user to enter it. This is the bound on simultaneous pairing work.
function pendingPairingTotal() {
  const phones = new Set(pairingInFlight.keys());
  for (const bot of sessions.values()) if (bot._unpaired && !bot._destroyed) phones.add(bot.phoneNumber);
  return phones.size;
}

let _restoreRunning = false;

async function waitForMemoryHeadroom(phoneNumber) {
  if (!diagnostics.underMemoryPressure()) return;
  for (let i = 0; i < 12; i++) {
    console.log(chalk.yellow(`[SESSION MANAGER] Memory pressure before restoring ${phoneNumber} — pausing 5s (${diagnostics.statsLine()})`));
    if (typeof global.gc === 'function') { try { global.gc(); } catch {} }
    await sleep(5000);
    if (!diagnostics.underMemoryPressure()) return;
  }
  console.log(chalk.red(`[SESSION MANAGER] Memory still high after 60s — continuing restore anyway for ${phoneNumber}`));
}

async function connectAllSessions() {
  if (_restoreRunning) {
    console.log(chalk.yellow('[SESSION MANAGER] Restore already running — ignoring duplicate call'));
    return;
  }
  _restoreRunning = true;

  try {
    let phoneNumbers = [];
    let unregistered = [];

    try {
      const saved = await listSavedSessions();
      phoneNumbers = [...new Set(saved.registered)];
      unregistered = saved.unregistered;
    } catch(e) {
      console.log(chalk.red(`[SESSION MANAGER] MongoDB read error: ${e.message}`));
    }

    // Abandoned pairing attempts leave a creds doc behind. They are not real sessions:
    // restoring them created reconnect-looping zombies that inflated the session count.
    let purged = 0;
    for (const u of unregistered) {
      if (Date.now() - u.updatedAt < 10 * 60 * 1000) continue; // may be a pairing in progress right now
      if (sessions.has(u.phone)) continue;
      try { purged += (await purgeUnregistered(u.phone)) > 0 ? 1 : 0; } catch {}
    }
    if (unregistered.length) {
      console.log(chalk.cyan(`[SESSION MANAGER] Skipped ${unregistered.length} unpaired/abandoned pairing record(s) (${purged} purged)`));
    }

    console.log(chalk.cyan(`[SESSION MANAGER] Found ${phoneNumbers.length} saved session(s), reconnecting in batches...`));

    // Gradual restore, unchanged in shape: batches of 5, 3s between sessions, 10s between
    // batches (100 sessions ≈ 8 min). Pacing was not the cause of the instability, so it is
    // not changed; instead each connect now also passes through the global handshake limiter
    // and waits while the container is near its memory limit.
    const BATCH_SIZE = parseInt(process.env.RESTORE_BATCH_SIZE || '5', 10) || 5;
    const DELAY_BETWEEN_SESSIONS = parseInt(process.env.RESTORE_SESSION_DELAY_MS || '3000', 10) || 3000;
    const DELAY_BETWEEN_BATCHES  = parseInt(process.env.RESTORE_BATCH_DELAY_MS || '10000', 10) || 10000;

    const failures = [];
    let restored = 0;

    for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
      const batch = phoneNumbers.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(phoneNumbers.length / BATCH_SIZE);

      console.log(chalk.cyan(`[SESSION MANAGER] Batch ${batchNum}/${totalBatches} — connecting ${batch.length} session(s)...`));

      for (const phoneNumber of batch) {
        if (sessions.has(phoneNumber)) {
          stats.duplicatesPrevented++;
          continue; // counted in stats.duplicatesPrevented; summarised once below
        }
        await waitForMemoryHeadroom(phoneNumber);

        const bot = new WhatsAppBot(phoneNumber);
        sessions.set(phoneNumber, bot);
        try {
          await bot._runManagedConnect('restore');
          restored++;
          console.log(chalk.green(`[SESSION MANAGER] Reconnected: ${phoneNumber}`));
        } catch (e) {
          failures.push({ phoneNumber, error: e.message });
          console.log(chalk.red(`[SESSION MANAGER] Failed to reconnect ${phoneNumber}: ${e.message} — will retry with backoff`));
          bot._scheduleReconnect('restore-failed'); // keep going; this session retries on its own
        }
        await sleep(DELAY_BETWEEN_SESSIONS);
      }

      if (i + BATCH_SIZE < phoneNumbers.length) {
        console.log(chalk.yellow(`[SESSION MANAGER] Batch ${batchNum} done — ${diagnostics.statsLine()} — waiting before next batch...`));
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    if (stats.duplicatesPrevented) console.log(chalk.yellow(`[SESSION MANAGER] ${stats.duplicatesPrevented} session(s) already had a live instance — no duplicates created`));
    console.log(chalk.green(`[SESSION MANAGER] Restore finished: ${restored}/${phoneNumbers.length} started, ${failures.length} failed (retrying with backoff).`));
    if (failures.length) {
      console.log(chalk.red('[SESSION MANAGER] Failed restores: ' + failures.map(f => `${f.phoneNumber} (${f.error})`).join('; ')));
    }
  } finally {
    _restoreRunning = false;
  }
}

const pairingInFlight = new Map(); // phoneNumber -> Promise<code>

async function getPairingCode(phoneNumber) {
  // Two simultaneous requests for the same number share one attempt instead of creating
  // (and then destroying) two sockets.
  if (pairingInFlight.has(phoneNumber)) return pairingInFlight.get(phoneNumber);

  const attempt = (async () => {
    // rare path: only while a 405 hold is active
    if (Date.now() < wv.holdUntil) await assertVersionUsable();
    const rejectionsBefore = stats.versionRejections;
    const existing = sessions.get(phoneNumber);
    if (existing && !existing._destroyed && existing.isOnline()) {
      throw new Error(`Number ${phoneNumber} is already connected!`);
    }
    // Check the bound BEFORE touching the existing instance: a rejected request must not
    // have destroyed anything.
    if (pendingPairingTotal() >= MAX_PENDING_PAIRINGS) {
      throw new Error('Too many pairing attempts in progress. Please try again in a few minutes.');
    }
    if (existing && !existing._destroyed) {
      // Not healthy: clean it up COMPLETELY (timers, socket, listeners) before replacing it,
      // so the old instance can never reconnect itself behind the new one's back.
      stats.replaced++;
      existing.destroy('replaced-by-new-pairing');
    }

    const bot = new WhatsAppBot(phoneNumber);
    sessions.set(phoneNumber, bot);
    try {
      return await bot._runManagedPairing(PAIRING_REQUEST_TIMEOUT_MS);
    } catch (e) {
      // Failed or timed out: leave NOTHING behind (timers, socket, listeners, limiter slot,
      // registry entry, MessageStore, half-created credentials). destroy() also prevents any reconnect.
      stats.pairingFailures++;
      const versionRefused = !(e && e.code === 'PAIRING_TIMEOUT') && (stats.versionRejections !== rejectionsBefore || bot._lastCloseCode === VERSION_REJECTED || /\b405\b|client_too_old|Connection Failure/i.test(String(e && e.message)));
      bot.destroy(e && e.code === 'PAIRING_TIMEOUT' ? 'pairing-timeout' : 'pairing-failed');
      destroyStore(phoneNumber);
      try { await purgeUnregistered(phoneNumber); } catch {}   // refuses to touch registered credentials
      throw versionRefused ? versionError() : e;
    }
  })();

  pairingInFlight.set(phoneNumber, attempt);
  try { return await attempt; } finally { pairingInFlight.delete(phoneNumber); }
}

async function deleteSession(phoneNumber) {
  if (!sessions.has(phoneNumber)) {
    try {
      const deleted = await wipeSession(phoneNumber);
      destroyStore(phoneNumber);
      console.log(chalk.yellow(`[SESSION MANAGER] Wiped ${deleted} MongoDB doc(s) for ${phoneNumber} (was not in memory)`));
      return deleted > 0;
    } catch(e) {
      console.log(chalk.red(`[SESSION MANAGER] MongoDB wipe failed for ${phoneNumber}: ${e.message}`));
      return false;
    }
  }
  const bot = sessions.get(phoneNumber);
  await bot.logout();
  sessions.delete(phoneNumber);
  return true;
}

function getAllSessions() {
  const result = [];
  for (const [num, bot] of sessions) {
    result.push({ phoneNumber: num, isOnline: bot.isOnline(), sock: bot.getClient() });
  }
  return result;
}

async function getSessionInfo(phoneNumber) {
  const bot = sessions.get(phoneNumber);
  const pairedAt = await getPairedAt(phoneNumber);
  if (!bot && !pairedAt) return null;
  return {
    phoneNumber,
    isOnline: bot ? bot.isOnline() : false,
    pairedAt: pairedAt || null
  };
}

async function broadcastToAllSessions(message) {
  let sent = 0;
  for (const [num, bot] of sessions) {
    if (bot.isOnline() && bot.getClient()) {
      try {
        await bot.getClient().sendMessage(`${num}@s.whatsapp.net`, { text: message });
        sent++;
      } catch {}
    }
  }
  return sent;
}

function getWhatsAppClient(phoneNumber) {
  if (phoneNumber) {
    return sessions.get(phoneNumber)?.getClient() || null;
  }
  for (const [, bot] of sessions) {
    if (bot.isOnline()) return bot.getClient();
  }
  return null;
}

function getSessionCount() { return sessions.size; }

function getOnlineCount() {
  let count = 0;
  for (const [, bot] of sessions) if (bot.isOnline()) count++;
  return count;
}

module.exports = {
  getStats,
  connectAllSessions,
  getPairingCode,
  deleteSession,
  getAllSessions,
  getSessionInfo,
  broadcastToAllSessions,
  getWhatsAppClient,
  getSessionCount,
  getOnlineCount
};
