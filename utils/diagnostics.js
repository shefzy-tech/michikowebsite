// ============================================================================
// utils/diagnostics.js — lightweight runtime diagnostics for large session counts
//
// What it does (and deliberately does NOT do):
//   * Logs ONE compact line every 5 minutes: RSS / heap / external / arrayBuffers,
//     container memory limit (cgroup, if readable), and session counters.
//   * Writes a tiny JSON snapshot every 60s. On the next start, if that snapshot
//     says the previous run did not exit cleanly, it logs the last known RSS and
//     session count. A SIGKILL / container OOM-kill cannot be caught by Node, so
//     this "previous run ended abruptly" line is the only way to tell an OOM-kill
//     (RSS near the limit) from a code crash (a logged exception) afterwards.
//   * Logs full details for uncaughtException / unhandledRejection / process
//     warnings. It does NOT swallow-and-restart; behaviour (log and keep serving)
//     is unchanged from before, it is just diagnosable now.
//   * All timers are unref()'d so they can never keep the process alive.
// ============================================================================

const fs = require('fs');
const path = require('path');
const config = require('../config');

const STATE_FILE = path.join(__dirname, '..', 'database', 'runtime-state.json');
const SNAPSHOT_EVERY_MS = 60 * 1000;
const LOG_EVERY_MS = 5 * 60 * 1000;
const PRESSURE_RATIO = 0.85;

let _getStats = () => ({});
let _installed = false;
let _lastPressureLog = 0;
const _exceptionTimes = [];

const mb = (n) => Math.round((n / 1024 / 1024) * 10) / 10;

//===================
// Memory limit discovery (cgroup v2, then v1, then env override)
//===================
function readLimitBytes() {
    const envMb = parseInt(process.env.MAX_RSS_MB || '', 10);
    if (envMb > 0) return envMb * 1024 * 1024;
    const candidates = [
        '/sys/fs/cgroup/memory.max',
        '/sys/fs/cgroup/memory/memory.limit_in_bytes'
    ];
    for (const f of candidates) {
        try {
            const raw = fs.readFileSync(f, 'utf8').trim();
            if (!raw || raw === 'max') continue;
            const n = Number(raw);
            if (Number.isFinite(n) && n > 0 && n < 1e14) return n; // ignore "unlimited" sentinels
        } catch { /* not readable on this host */ }
    }
    return null;
}
const LIMIT_BYTES = readLimitBytes();

function memSnapshot() {
    const m = process.memoryUsage();
    return {
        rssMb: mb(m.rss),
        heapUsedMb: mb(m.heapUsed),
        heapTotalMb: mb(m.heapTotal),
        externalMb: mb(m.external),
        arrayBuffersMb: mb(m.arrayBuffers || 0),
        limitMb: LIMIT_BYTES ? mb(LIMIT_BYTES) : null
    };
}

// true when RSS is above ratio of the known container limit (false when no limit is known)
function underMemoryPressure(ratio = PRESSURE_RATIO) {
    if (!LIMIT_BYTES) return false;
    return process.memoryUsage().rss > LIMIT_BYTES * ratio;
}

function safeStats() {
    try { return _getStats() || {}; } catch { return {}; }
}

function statsLine() {
    const m = memSnapshot();
    const s = safeStats();
    const pct = m.limitMb ? ` (${Math.round((m.rssMb / m.limitMb) * 100)}% of ${m.limitMb}MB limit)` : '';
    return `RSS ${m.rssMb}MB${pct} | heap ${m.heapUsedMb}/${m.heapTotalMb}MB | ext ${m.externalMb}MB | ab ${m.arrayBuffersMb}MB`
        + ` | sessions total=${s.total ?? '?'} connected=${s.connected ?? '?'} connecting=${s.connecting ?? '?'} backoff=${s.backoff ?? '?'}`
        + ` | created=${s.created ?? '?'} destroyed=${s.destroyed ?? '?'} reconnects=${s.reconnects ?? '?'} stores=${s.stores ?? '?'}`
        + ` | wa=${s.waVersion ?? '?'} 405s=${s.versionRejections ?? '?'} hold=${Math.round((s.versionHoldMs || 0) / 1000)}s`
        + ` | uptime ${Math.round(process.uptime())}s`;
}

//===================
// Abrupt-exit detection
//===================
function writeState(cleanExit) {
    try {
        const m = memSnapshot();
        const s = safeStats();
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            ts: Date.now(), pid: process.pid, cleanExit: !!cleanExit,
            rssMb: m.rssMb, heapUsedMb: m.heapUsedMb, limitMb: m.limitMb,
            sessions: s.total ?? null, connected: s.connected ?? null, uptime: Math.round(process.uptime())
        }));
    } catch { /* disk issues must never take the bot down */ }
}

function reportPreviousRun() {
    try {
        if (!fs.existsSync(STATE_FILE)) return;
        const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (prev.cleanExit) return;
        const ago = Math.round((Date.now() - prev.ts) / 1000);
        const nearLimit = prev.limitMb && prev.rssMb > prev.limitMb * 0.85;
        config.logger('error',
            `Previous run ended ABRUPTLY (no clean shutdown, last snapshot ${ago}s ago): `
            + `RSS ${prev.rssMb}MB${prev.limitMb ? ` of ${prev.limitMb}MB limit` : ''}, `
            + `sessions=${prev.sessions} connected=${prev.connected}, uptime was ${prev.uptime}s. `
            + (nearLimit
                ? 'RSS was near the container limit -> most likely an out-of-memory kill by the host.'
                : 'RSS was not near a known limit -> check the host panel/console for a manual restart, crash, or an unlogged kill.'));
    } catch { /* ignore a corrupt state file */ }
}

//===================
// Crash / failure logging
//===================
function describeError(err) {
    if (err instanceof Error) return { type: err.name || 'Error', message: err.message, stack: err.stack };
    let msg;
    try { msg = typeof err === 'string' ? err : JSON.stringify(err); } catch { msg = String(err); }
    return { type: typeof err, message: msg, stack: '(no stack — non-Error value thrown)' };
}

function logFailure(kind, err) {
    const e = describeError(err);
    const now = Date.now();
    _exceptionTimes.push(now);
    while (_exceptionTimes.length && now - _exceptionTimes[0] > 60000) _exceptionTimes.shift();
    config.logger('error', `${kind}: [${e.type}] ${e.message}`);
    console.error(e.stack);
    console.error(`  context: ${statsLine()} | failures in last 60s: ${_exceptionTimes.length}`);
}

function install({ getStats } = {}) {
    if (_installed) return;
    _installed = true;
    if (typeof getStats === 'function') _getStats = getStats;

    reportPreviousRun();
    writeState(false);

    process.on('uncaughtException', (err) => logFailure('Uncaught exception', err));
    process.on('unhandledRejection', (reason) => logFailure('Unhandled rejection', reason));
    process.on('warning', (w) => {
        // Only surface warnings that matter for stability (listener leaks, memory).
        if (/MaxListeners|memory|heap/i.test(`${w.name} ${w.message}`)) {
            config.logger('warning', `Node warning: [${w.name}] ${w.message}`);
        }
    });

    const shutdown = (signal) => {
        config.logger('warning', `Received ${signal} — shutting down. ${statsLine()}`);
        writeState(true);
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('exit', (code) => {
        // runs for process.exit() too (e.g. the dev-only .restart command)
        writeState(true);
        console.log(`[DIAG] process exit, code=${code}`);
    });

    const snap = setInterval(() => {
        writeState(false);
        if (underMemoryPressure() && Date.now() - _lastPressureLog > LOG_EVERY_MS) {
            _lastPressureLog = Date.now();
            config.logger('warning', `MEMORY PRESSURE (>${Math.round(PRESSURE_RATIO * 100)}% of limit): ${statsLine()}`);
        }
    }, SNAPSHOT_EVERY_MS);
    const log = setInterval(() => config.logger('debug', `[DIAG] ${statsLine()}`), LOG_EVERY_MS);
    if (snap.unref) snap.unref();
    if (log.unref) log.unref();
}

module.exports = { install, memSnapshot, statsLine, underMemoryPressure, LIMIT_BYTES };
