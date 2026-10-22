// ============================================================================
// utils/mentionResponse.js — per-bot "when I am @mentioned in a group" response.
//
// Isolation: the setting lives in the bot's OWN userSettings entry (keyed by its number) and the
// sticker is a file named after that number. Nothing here is global; every in-memory map is keyed by
// the bot number. Only the bot's own owner can change it (not group admins, not sudo users).
//
// PRIORITY vs the chatbot (userSetting.chatbotEnabled):
//   * message is only an @mention (no other text)  -> the custom response is sent
//   * message has text and the chatbot is ON        -> the CHATBOT answers (unchanged behaviour), no custom response
//   * message has text and the chatbot is OFF       -> the custom response is sent
// The custom response is sent once per message however many times the bot is mentioned in it,
// and at most once per group per cooldown window.
// ============================================================================
const fs = require('fs');
const path = require('path');

const DIR = process.env.MENTION_STICKER_DIR || path.join(__dirname, '..', 'database', 'mention_stickers');
const MAX_TEXT = 500, MAX_STICKER_BYTES = 1024 * 1024, MAX_KEYS = 2000;
const cooldownMs = () => { const v = parseInt(process.env.MENTION_COOLDOWN_MS || '', 10); return v >= 0 ? v : 3000; };
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|\s)+$/u;

const seen = new Map();       // `${bot}|${msgId}` -> ts   (dedupe of re-delivered messages)
const lastSent = new Map();   // `${bot}|${group}` -> ts   (cooldown)
function bounded(map, key, val) { map.delete(key); map.set(key, val); if (map.size > MAX_KEYS) map.delete(map.keys().next().value); }

const safeBot = (n) => String(n).replace(/[^0-9]/g, '');
const stickerPath = (bot) => path.join(DIR, `${safeBot(bot)}.webp`);

function getConfig(userSetting) {
  const c = userSetting && userSetting.mentionResponse;
  if (!c || !['text', 'emoji', 'sticker'].includes(c.type)) return null;
  return c;
}
function describe(c) {
  if (!c) return 'OFF (the bot does nothing special when mentioned)';
  if (c.type === 'sticker') return 'STICKER (your saved sticker)';
  return `${c.type.toUpperCase()}: ${c.value}`;
}
function help(prefix) {
  return `*${prefix}mention* — what your bot sends when it is @mentioned in a group\n\n`
    + `• ${prefix}mention — show the current setting\n• ${prefix}mention set <text or emoji>\n• ${prefix}mention set sticker — reply to a sticker (or image/short video) with this\n• ${prefix}mention off\n\n`
    + `_Only the owner of this bot can change it. If the chatbot is ON and someone mentions the bot with a question, the chatbot answers; a bare @mention gets this response._`;
}

async function handleCommand(ctx) {
  const { args, reply, prefix, botNumberRaw, userSetting, updateUserSettings, m } = ctx;
  if (!args.length) return reply(`📌 *Mention response*\nCurrent: ${describe(getConfig(userSetting))}\n\n${help(prefix)}`);
  if (!ctx.isBotOwner) return reply('❌ Only the owner of this bot can configure the mention response.');
  const sub = args[0].toLowerCase();
  if (sub === 'off' || sub === 'disable' || sub === 'clear') {
    try { fs.rmSync(stickerPath(botNumberRaw), { force: true }); } catch { /* ignore */ }
    updateUserSettings(botNumberRaw, { mentionResponse: null });
    return reply('✅ Mention response turned off.');
  }
  if (sub !== 'set') return reply(help(prefix));
  const value = args.slice(1).join(' ').trim();
  if (!value) return reply(`❌ Usage: ${prefix}mention set <text or emoji>  |  ${prefix}mention set sticker`);
  if (value.toLowerCase() === 'sticker') {
    const src = (m.quoted && /sticker|image|video/i.test(m.quoted.mtype || '')) ? m.quoted : (/sticker|image|video/i.test(m.mtype || '') ? m : null);
    if (!src || typeof src.download !== 'function') return reply(`❌ Reply to a sticker (or an image / short video) with *${prefix}mention set sticker*.`);
    let buf;
    try {
      buf = await src.download();
      if (/image/i.test(src.mtype)) buf = await ctx.imageToSticker(buf, ctx.stickerPack || 'Michiko MD', ctx.stickerAuthor || 'Bot');   // existing helper (utils/functions.js)
      else if (/video/i.test(src.mtype)) buf = await ctx.videoToSticker(buf, ctx.stickerPack || 'Michiko MD', ctx.stickerAuthor || 'Bot');
    } catch (e) { return reply('❌ Could not read that media: ' + String(e && e.message || e).slice(0, 80)); }
    if (!buf || !buf.length) return reply('❌ Could not read that sticker.');
    if (buf.length > MAX_STICKER_BYTES) return reply('❌ That sticker is too large (max 1MB).');
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = stickerPath(botNumberRaw) + '.tmp';
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, stickerPath(botNumberRaw));            // atomic replace
    let stored = null; try { stored = fs.readFileSync(stickerPath(botNumberRaw)); } catch { /* handled below */ }
    if (!stored || !stored.length || stored.length !== buf.length) return reply("❌ I couldn't save that sticker.");   // verified: the file exists and can be read back
    updateUserSettings(botNumberRaw, { mentionResponse: { type: 'sticker', value: null, updatedAt: Date.now() } });
    return reply('✅ Mention response updated.');
  }
  if (value.length > MAX_TEXT) return reply(`❌ Too long (max ${MAX_TEXT} characters).`);
  const type = EMOJI_ONLY.test(value) ? 'emoji' : 'text';
  updateUserSettings(botNumberRaw, { mentionResponse: { type, value, updatedAt: Date.now() } });
  return reply('✅ Mention response updated.');
}

// Called for every non-command message. Returns true when the custom response OWNS this message
// (so the chatbot must not also answer), false otherwise.
async function maybeRespond(ctx) {
  const { sock, m, from, isGroup, isCmd, body, botNumberRaw, userSetting } = ctx;
  const cfg = getConfig(userSetting);
  if (!cfg || !isGroup || isCmd) return false;
  const me = safeBot(botNumberRaw);
  // ctx.botMentioned is decided by utils/botIdentity.js from WhatsApp's mention metadata against THIS session's
  // real identity (phone JID + LID). Bot-generated messages never reach here (dropped upstream by their BAE id).
  if (ctx.botMentioned !== true) return false;
  const hasText = String(body || '').replace(/@\d+/g, '').trim().length > 0;
  if (ctx.chatbotEnabled && hasText) return false;                        // chatbot keeps its existing behaviour
  const id = m.key && m.key.id;
  if (id) { if (seen.has(`${me}|${id}`)) return true; bounded(seen, `${me}|${id}`, Date.now()); }
  const ck = `${me}|${from}`, now = Date.now();
  if (lastSent.has(ck) && now - lastSent.get(ck) < cooldownMs()) return true;
  bounded(lastSent, ck, now);
  try {
    if (cfg.type === 'sticker') {
      const f = stickerPath(me);
      if (!fs.existsSync(f)) return true;                                 // configured but file gone: stay silent rather than crash
      await sock.sendMessage(from, { sticker: fs.readFileSync(f) }, { quoted: m });
    } else {
      await sock.sendMessage(from, { text: cfg.value }, { quoted: m });
    }
  } catch (e) { console.log('[mention response]', String(e && e.message || e).slice(0, 100)); }
  return true;
}

module.exports = { handleCommand, maybeRespond, getConfig, stickerPath, describe, DIR };
