// ============================================================================
// utils/botIdentity.js — who is "the bot" for THIS session, and was it mentioned / replied to?
//
// The identity always comes from the ACTIVE SOCKET of the session handling the message (its paired phone
// JID and its LID), never from a display name or a hard-coded "@michiko". WhatsApp now addresses members in
// groups by LID ("123…@lid"), so a mention or a reply can reference the bot by LID instead of the phone
// number; both are checked. If the socket does not carry the bot's LID, it is learned once per group from
// the group's participant list (the participant whose phone matches this bot).
// ============================================================================
const MAX = 2000;
const userPart = (jid) => String(jid == null ? '' : jid).split('@')[0].split(':')[0];
const bound = (map, k, v) => { map.delete(k); map.set(k, v); if (map.size > MAX) map.delete(map.keys().next().value); };

const learnedLids = new Map();     // bot phone -> Set of LID user-parts learned from group metadata
const learnTried = new Map();      // `${phone}|${group}` -> ts (do not re-query metadata on every message)
const chatbotSent = new Map();     // `${phone}|${messageId}` -> ts  (messages the CHATBOT sent, for reply detection)

const phoneOf = (sock) => userPart(sock && sock.user && sock.user.id);

function botIds(sock) {
  const set = new Set();
  const add = (j) => { const u = userPart(j); if (u) set.add(u); };
  if (sock) {
    add(sock.user && sock.user.id); add(sock.user && sock.user.lid);
    const me = sock.authState && sock.authState.creds && sock.authState.creds.me;
    if (me) { add(me.id); add(me.lid); }
  }
  const learned = learnedLids.get(phoneOf(sock));
  if (learned) for (const l of learned) set.add(l);
  return set;
}
function isBotJid(jid, sock) { const u = userPart(jid); return !!u && botIds(sock).has(u); }

function mentionedList(m) {
  const ci = m && m.msg && m.msg.contextInfo;
  return ci && Array.isArray(ci.mentionedJid) ? ci.mentionedJid : [];
}

async function learnLidFromGroup(sock, groupJid) {
  const phone = phoneOf(sock); const key = `${phone}|${groupJid}`;
  const t = learnTried.get(key); if (t && Date.now() - t < 10 * 60 * 1000) return;
  bound(learnTried, key, Date.now());
  const meta = await sock.groupMetadata(groupJid);
  for (const p of (meta && meta.participants) || []) {
    const idents = [p.id, p.lid, p.jid, p.phoneNumber, p.pn].filter(Boolean);
    if (!idents.some(x => userPart(x) === phone)) continue;
    const lids = idents.filter(x => String(x).endsWith('@lid')).map(userPart);
    if (lids.length) { const s = learnedLids.get(phone) || new Set(); lids.forEach(l => s.add(l)); bound(learnedLids, phone, s); }
  }
}

// True when THIS session's bot is mentioned in message m (uses WhatsApp's mention metadata, not text).
async function mentionsBot(m, sock, groupJid) {
  const list = mentionedList(m);
  if (!list.length) return false;
  if (list.some(j => isBotJid(j, sock))) return true;
  if (list.some(j => String(j).endsWith('@lid')) && String(groupJid || '').endsWith('@g.us') && typeof sock.groupMetadata === 'function') {
    try { await learnLidFromGroup(sock, groupJid); } catch { /* metadata unavailable: treat as not mentioned */ }
    return list.some(j => isBotJid(j, sock));
  }
  return false;
}

// Reply tracking: only messages the CHATBOT itself sent count as "the bot's chatbot message".
function recordChatbotMessage(sock, messageId) { if (messageId) bound(chatbotSent, `${phoneOf(sock)}|${messageId}`, Date.now()); }
function isReplyToChatbotMessage(m, sock) {
  const q = m && m.quoted;
  return !!(q && q.id && chatbotSent.has(`${phoneOf(sock)}|${q.id}`));
}

module.exports = { userPart, botIds, isBotJid, mentionsBot, recordChatbotMessage, isReplyToChatbotMessage, learnLidFromGroup };
