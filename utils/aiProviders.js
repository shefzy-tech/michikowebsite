// ============================================================================
// utils/aiProviders.js — provider chain for the plain `ai / ask / gpt` command.
// (Michiko's own AI in michiko.js is a separate, untouched system.)
//
// WHY THIS EXISTS: the old inline code sent hard-coded model IDs that the vendors have since
// retired (Gemini 2.0/1.5 Flash, Groq llama-3.1-8b-instant, DeepSeek deepseek-chat), so every
// provider answered 404 even with a perfectly valid key, while the "Keys configured" line only
// checked that a key string was non-empty. Now:
//   * model chains live here and can be overridden from .env without a code change
//   * each failure is classified (auth / retired model / rate limit / timeout / ...) and reported
//   * a retired model or rejected key is remembered for a while so it is not retried on every message
//   * the key is never placed in a URL, a log line or a message
// ============================================================================
const axios = require('axios');
const config = require('../config');

const DEFAULT_MODELS = {
  gemini:   ['gemini-3.5-flash', 'gemini-2.5-flash'],
  groq:     ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
  deepseek: ['deepseek-v4-flash'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
};
const LABEL = { gemini: '🤖 *Gemini*', groq: '🤖 *Groq AI*', deepseek: '🤖 *DeepSeek*', together: '🤖 *Together AI*' };
const NAME = { gemini: 'Gemini', groq: 'Groq', deepseek: 'DeepSeek', together: 'Together' };
const KEY_FIELD = { gemini: 'geminiApiKey', groq: 'groqApiKey', deepseek: 'deepseekApiKey', together: 'togetherApiKey' };
const URLS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
};
const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const envInt = (k, d) => { const v = parseInt(process.env[k] || '', 10); return v > 0 ? v : d; };
const ATTEMPT_TIMEOUT_MS = envInt('AI_ATTEMPT_TIMEOUT_MS', 20000);
const TOTAL_TIMEOUT_MS = envInt('AI_TOTAL_TIMEOUT_MS', 45000);
const RETIRED_MODEL_SKIP_MS = envInt('AI_RETIRED_MODEL_SKIP_MS', 6 * 60 * 60 * 1000);
const AUTH_SKIP_MS = envInt('AI_AUTH_SKIP_MS', 10 * 60 * 1000);
const RATE_SKIP_MS = envInt('AI_RATE_SKIP_MS', 60 * 1000);

const list = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

function modelsFor(p) {
  const fromEnv = list(process.env[`AI_${p.toUpperCase()}_MODELS`]);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS[p].slice();
}
function providerOrder() {
  const o = list(process.env.AI_PROVIDER_ORDER).filter(p => DEFAULT_MODELS[p]);
  return o.length ? o : ['gemini', 'groq', 'deepseek', 'together'];
}
const keyFor = (p) => String(config[KEY_FIELD[p]] || '').trim();
const model = (p) => modelsFor(p)[0];

// ---- redaction: no key may ever reach a log line or a chat message --------------------------
function redact(text) {
  let s = String(text == null ? '' : text);
  for (const p of Object.keys(KEY_FIELD)) { const k = keyFor(p); if (k.length >= 8) s = s.split(k).join('***'); }
  return s.replace(/gsk_[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{15,}|(?:Bearer\s+)[A-Za-z0-9._-]{12,}/g, '***');
}

// ---- failure classification -------------------------------------------------------------------
function classify(err) {
  const status = err && err.response && err.response.status;
  const code = err && err.code;
  let kind = 'error';
  if (status === 401 || status === 403) kind = 'auth';
  else if (status === 404 || status === 410) kind = 'model';
  else if (status === 429) kind = 'rate';
  else if (status === 400 || status === 422) kind = 'bad-request';
  else if (status >= 500) kind = 'down';
  else if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') kind = 'network';
  else if (err && err.kind) kind = err.kind;
  const detail = redact((err && err.response && err.response.data && (err.response.data.error && (err.response.data.error.message || err.response.data.error)) ) || (err && err.message) || '').toString().slice(0, 160);
  return { kind, status: status || null, detail };
}

// ---- remembered failures (bounded: at most providers x models entries) -----------------------
const skipUntil = new Map();   // "provider|model" or "provider|*" -> ms timestamp
const isSkipped = (p, m) => { const now = Date.now(); const a = skipUntil.get(`${p}|*`), b = skipUntil.get(`${p}|${m}`); return (a && a > now) || (b && b > now); };
function remember(p, m, kind) {
  const now = Date.now();
  if (kind === 'model') skipUntil.set(`${p}|${m}`, now + RETIRED_MODEL_SKIP_MS);
  else if (kind === 'auth') skipUntil.set(`${p}|*`, now + AUTH_SKIP_MS);
  else if (kind === 'rate') skipUntil.set(`${p}|*`, now + RATE_SKIP_MS);
}
function resetFailureMemory() { skipUntil.clear(); }

// ---- one request, per provider format ----------------------------------------------------------
async function callProvider(p, m, prompt, system, timeout) {
  const key = keyFor(p);
  if (p === 'gemini') {
    const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1500 } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    // key goes in a header, NOT the URL, so it can never show up in an error message or access log
    const res = await axios.post(GEMINI_URL(m), body, { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout });
    const data = res && res.data;
    if (data && data.promptFeedback && data.promptFeedback.blockReason) throw Object.assign(new Error('prompt blocked: ' + data.promptFeedback.blockReason), { kind: 'blocked' });
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.filter(x => x && typeof x.text === 'string' && !x.thought).map(x => x.text).join('');
  }
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }];
  const body = { model: m, messages, max_tokens: 1500, temperature: 0.7 };
  if (p === 'groq' && /^openai\/gpt-oss/.test(m)) body.reasoning_effort = 'low';   // reasoning models otherwise spend the token budget thinking
  const res = await axios.post(URLS[p], body, { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, timeout });
  const msg = res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message;
  return msg && typeof msg.content === 'string' ? msg.content : '';
}

// ---- the chain -----------------------------------------------------------------------------------
// Returns { ok:true, text, provider, model, label } or { ok:false, attempts:[...], configured:{...} }.
async function askAI(prompt, opts = {}) {
  const started = Date.now();
  const attempts = [];
  const configured = {};
  for (const p of providerOrder()) configured[p] = !!keyFor(p);
  for (const p of providerOrder()) {
    if (!configured[p]) { attempts.push({ provider: p, model: null, kind: 'no-key' }); continue; }
    for (const m of modelsFor(p)) {
      const remaining = TOTAL_TIMEOUT_MS - (Date.now() - started);
      if (remaining < 1500) { attempts.push({ provider: p, model: m, kind: 'deadline' }); continue; }
      if (isSkipped(p, m)) { attempts.push({ provider: p, model: m, kind: 'skipped' }); continue; }
      try {
        const text = await callProvider(p, m, prompt, opts.system, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
        if (text && text.trim()) return { ok: true, text: text.trim(), provider: p, model: m, label: LABEL[p], attempts };
        attempts.push({ provider: p, model: m, kind: 'empty' });
      } catch (e) {
        const c = classify(e);
        attempts.push({ provider: p, model: m, kind: c.kind, status: c.status });
        remember(p, m, c.kind);
        console.log(`[AI] ${p}/${m} failed: ${c.kind}${c.status ? ' (' + c.status + ')' : ''} ${c.detail}`);   // already redacted
        if (c.kind === 'auth' || c.kind === 'rate') break;           // same key: the provider's other models would fail the same way
      }
    }
  }
  return { ok: false, attempts, configured };
}

const REASON = {
  'no-key': 'no API key set', auth: 'key rejected (invalid, revoked or out of quota)', model: 'model no longer available',
  rate: 'rate limited', 'bad-request': 'request refused', down: 'service down', network: 'network/timeout',
  empty: 'empty reply', blocked: 'prompt blocked', error: 'unexpected error', skipped: 'recently failed', deadline: 'out of time',
};
// Honest, key-free summary shown only after EVERY provider genuinely failed.
function describeFailure(res) {
  const byProvider = {};
  for (const a of res.attempts) {
    const r = byProvider[a.provider] || (byProvider[a.provider] = new Set());
    r.add(REASON[a.kind] || a.kind);
  }
  const lines = Object.keys(byProvider).map(p => `• ${NAME[p]}: ${[...byProvider[p]].join(', ')}`);
  const anyKey = Object.values(res.configured || {}).some(Boolean);
  return '❌ AI is unavailable right now.\n\n' + lines.join('\n')
    + (anyKey ? '\n\n_Owner: a key/model problem is listed above. Model names can be changed in .env (AI_GEMINI_MODELS, AI_GROQ_MODELS, AI_DEEPSEEK_MODELS, AI_TOGETHER_MODELS)._'
              : '\n\n_Owner: no AI key is configured in .env._');
}

// Safe for diagnostics/panel: never contains key material.
function status() {
  const out = {};
  for (const p of providerOrder()) out[p] = { configured: !!keyFor(p), models: modelsFor(p) };
  return out;
}

// The ONLY text a normal user ever sees when every provider fails. Details stay in the server log.
const USER_UNAVAILABLE = '❌ AI is unavailable right now. Please try again later.';

module.exports = { USER_UNAVAILABLE, askAI, describeFailure, model, modelsFor, providerOrder, status, redact, classify, resetFailureMemory, DEFAULT_MODELS };
