// ============================================================================
// utils/extraCommands.js — bodies of the newly added commands. They are dispatched from the EXISTING
// command switch in main.js (same prefix parser, same permission variables, same reply helper); this
// file only holds the handlers so main.js stays small. No second command framework.
// ============================================================================
const fs = require('fs');
const path = require('path');
const config = require('../config');
const AIP = require('./aiProviders');
const MENTION = require('./mentionResponse');
const GROUPTAG = require('./groupTag');
const ADCMD = require('./adCommands');

const MAINT_FILE = process.env.MAINTENANCE_FILE || path.join(__dirname, '..', 'database', 'maintenance.json');
function readMaint() { try { return JSON.parse(fs.readFileSync(MAINT_FILE, 'utf8')); } catch { return { on: false, message: '' }; } }
function writeMaint(o) { fs.mkdirSync(path.dirname(MAINT_FILE), { recursive: true }); fs.writeFileSync(MAINT_FILE, JSON.stringify(o)); }
const noticeSent = new Map();     // `${bot}|${sender}` -> ts (bounded) so users get one notice per minute, not one per command
function maintenanceBlocks(isGlobalOwner) { return !isGlobalOwner && readMaint().on === true; }
function maintenanceNotice(key) {
  const now = Date.now(); const last = noticeSent.get(key);
  if (last && now - last < 60000) return null;
  noticeSent.delete(key); noticeSent.set(key, now); if (noticeSent.size > 1000) noticeSent.delete(noticeSent.keys().next().value);
  return readMaint().message || '🛠️ The bot is under maintenance. Please try again later.';
}

// ---- AI helper commands (reuse the Phase-1 provider chain; no second AI system)
const aiCooldown = new Map();
const TOOLS = {
  summarize: { sys: 'You summarize text for WhatsApp. Be faithful, concise and structured; use short bullet points for long input. Reply in the language of the input.', ask: 'Summarize the following:\n\n' },
  rewrite: { sys: 'You rewrite text so it is clearer and better written while keeping the meaning, tone and language. Return only the rewritten text.', ask: 'Rewrite this:\n\n' },
  explain: { sys: 'You explain things simply and accurately for a WhatsApp reader. Use plain language, a short example when useful, and no padding.', ask: 'Explain this:\n\n' },
};
async function aiTool(kind, ctx) {
  const { reply, prefix, m } = ctx;
  const src = (ctx.text || '').trim() || (m.quoted && (m.quoted.text || m.quoted.caption) ? String(m.quoted.text || m.quoted.caption) : '');
  if (!src) return reply(`❌ Usage: ${prefix}${kind} <text>  — or reply to a message with ${prefix}${kind}`);
  if (src.length > 6000) return reply('❌ That text is too long (max 6000 characters).');
  const key = `${ctx.botNumberRaw}|${ctx.senderNumberRaw}`, now = Date.now();
  if (aiCooldown.has(key) && now - aiCooldown.get(key) < 4000) return reply('⏳ Slow down a little, try again in a few seconds.');
  aiCooldown.delete(key); aiCooldown.set(key, now); if (aiCooldown.size > 2000) aiCooldown.delete(aiCooldown.keys().next().value);
  try { await ctx.sock.sendPresenceUpdate('composing', ctx.from); } catch { /* ignore */ }
  const r = await AIP.askAI(TOOLS[kind].ask + src, { system: TOOLS[kind].sys });
  if (!r.ok) console.log('[ai-tool] every provider failed: ' + AIP.describeFailure(r).replace(/\n+/g, ' | '));   // diagnostics stay in the server log
  return reply(r.ok ? r.text.slice(0, 3500) : AIP.USER_UNAVAILABLE);
}

// ---- information commands
const mb = (n) => (n / 1048576).toFixed(0) + 'MB';
const fmtUp = (s) => { s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), mi = Math.floor(s % 3600 / 60); return `${d ? d + 'd ' : ''}${h}h ${mi}m`; };
function wa() { try { return require('../whatsapp'); } catch { return null; } }
function botinfo(ctx) {
  const st = (wa() && wa().getStats && wa().getStats()) || {};
  const u = ctx.userSetting || {};
  return ctx.reply(`🤖 *${u.botName || config.botName}*\nVersion: ${config.botVersion || '-'}\nPrefix: ${u.prefix || ctx.prefix}   Mode: ${u.mode || '-'}\nUptime: ${fmtUp(process.uptime())}\nMemory: ${mb(process.memoryUsage().rss)}\nSessions online: ${st.connected ?? '?'} / ${st.total ?? '?'}\n\n${config.productBrand || ''}`.trim());
}
function sessioninfo(ctx) {
  if (!ctx.isBotOwner && !ctx.isSudo) return ctx.reply('❌ Only this bot\'s owner can view its session info.');
  const u = ctx.userSetting || {}; const mr = MENTION.getConfig(u);
  return ctx.reply(`🔧 *This bot's session*\nNumber: ${ctx.botNumberRaw}\nPrefix: ${u.prefix}   Mode: ${u.mode}\nChatbot: ${u.chatbotEnabled ? 'ON' : 'off'}${u.chatbotPrivate ? ' (+private)' : ''}\nMention response: ${MENTION.describe(mr)}\nMember tag support: ${typeof ctx.sock.updateMemberLabel === 'function' ? 'yes' : 'not available'}\nSettings are stored per number: other bots are not affected.`);
}
function status(ctx) {
  const st = (wa() && wa().getStats && wa().getStats()) || {};
  return ctx.reply(`📊 *Status*\nUptime: ${fmtUp(process.uptime())}\nMemory: ${mb(process.memoryUsage().rss)}\nWhatsApp Web version: ${st.waVersion || '?'}\nConnected sessions: ${st.connected ?? '?'} / ${st.total ?? '?'}  (reconnecting: ${(st.connecting || 0) + (st.backoff || 0)})\nMaintenance: ${readMaint().on ? 'ON' : 'off'}`);
}
const ZONES = { lagos: 'Africa/Lagos', nigeria: 'Africa/Lagos', accra: 'Africa/Accra', nairobi: 'Africa/Nairobi', cairo: 'Africa/Cairo', johannesburg: 'Africa/Johannesburg', london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', moscow: 'Europe/Moscow', dubai: 'Asia/Dubai', karachi: 'Asia/Karachi', delhi: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', india: 'Asia/Kolkata', dhaka: 'Asia/Dhaka', jakarta: 'Asia/Jakarta', singapore: 'Asia/Singapore', manila: 'Asia/Manila', tokyo: 'Asia/Tokyo', seoul: 'Asia/Seoul', sydney: 'Australia/Sydney', 'new york': 'America/New_York', nyc: 'America/New_York', chicago: 'America/Chicago', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles', toronto: 'America/Toronto', 'sao paulo': 'America/Sao_Paulo', utc: 'UTC' };
function timezone(ctx) {
  const q = (ctx.text || '').trim();
  if (!q) return ctx.reply(`🕒 Usage: ${ctx.prefix}timezone <city or zone>\nExamples: ${ctx.prefix}timezone lagos   ${ctx.prefix}timezone Asia/Tokyo\nServer time: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`);
  const zone = ZONES[q.toLowerCase()] || q;
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'full', timeStyle: 'short' });
    return ctx.reply(`🕒 *${zone}*\n${f.format(new Date())}`);
  } catch { return ctx.reply('❌ Unknown time zone. Try a city (lagos, london, tokyo…) or an IANA name like Europe/Paris.'); }
}
async function stats(ctx) {
  if (!ctx.isGlobalOwner) return ctx.reply('❌ Owner only.');
  const st = (wa() && wa().getStats && wa().getStats()) || {};
  let camp = '';
  try { const all = await ADCMD.getScheduler().list({}); const by = {}; for (const c of all) by[c.status] = (by[c.status] || 0) + 1; camp = Object.entries(by).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'; } catch { camp = 'unavailable'; }
  return ctx.reply(`📈 *Global stats*\nSessions: ${st.connected ?? '?'} online / ${st.total ?? '?'} total, connecting ${st.connecting ?? 0}, backoff ${st.backoff ?? 0}\nReconnects: ${st.reconnects ?? '?'}   405s: ${st.versionRejections ?? 0}   hold: ${Math.round((st.versionHoldMs || 0) / 1000)}s\nStores: ${st.stores ?? '?'}   Pairings pending: ${st.pairingPending ?? 0}\nWA version: ${st.waVersion || '?'}\nCampaigns: ${camp}\nMemory: ${mb(process.memoryUsage().rss)}   Uptime: ${fmtUp(process.uptime())}`);
}
function maintenance(ctx) {
  if (!ctx.isGlobalOwner) return ctx.reply('❌ Owner only.');
  const a = (ctx.args[0] || '').toLowerCase(); const cur = readMaint();
  if (a === 'on') { writeMaint({ on: true, message: ctx.args.slice(1).join(' ').slice(0, 300) }); return ctx.reply('🛠️ Maintenance mode ON. Only the owner can use commands.'); }
  if (a === 'off') { writeMaint({ on: false, message: '' }); return ctx.reply('✅ Maintenance mode OFF.'); }
  return ctx.reply(`🛠️ Maintenance is ${cur.on ? 'ON' : 'off'}.\nUsage: ${ctx.prefix}maintenance on [message]  |  ${ctx.prefix}maintenance off`);
}

// ---- router
async function run(command, ctx) {
  try {
    switch (command) {
      case 'mention': return await MENTION.handleCommand(ctx);
      case 'grouptag': return await GROUPTAG.handleCommand(ctx);
      case 'ad': case 'campaigns': return await ADCMD.handle({ ...ctx, command });
      case 'summarize': case 'summary': case 'tldr': return await aiTool('summarize', ctx);
      case 'rewrite': return await aiTool('rewrite', ctx);
      case 'explain': return await aiTool('explain', ctx);
      case 'botinfo': return botinfo(ctx);
      case 'sessioninfo': return sessioninfo(ctx);
      case 'status': return status(ctx);
      case 'timezone': return timezone(ctx);
      case 'stats': return await stats(ctx);
      case 'maintenance': return maintenance(ctx);
      default: return null;
    }
  } catch (e) {
    console.log(`[cmd ${command}]`, String((e && e.message) || e).slice(0, 160));
    try { return await ctx.reply('❌ Something went wrong with that command.'); } catch { return null; }
  }
}

module.exports = { run, maintenanceBlocks, maintenanceNotice, readMaint, COMMANDS: ['mention', 'grouptag', 'ad', 'campaigns', 'summarize', 'summary', 'tldr', 'rewrite', 'explain', 'botinfo', 'sessioninfo', 'status', 'timezone', 'stats', 'maintenance'] };
