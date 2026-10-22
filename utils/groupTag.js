// ============================================================================
// utils/groupTag.js — `.grouptag` : set THIS bot's own WhatsApp "member tag" in the current group by calling
// the library's real operation  sock.updateMemberLabel(...).
//
// Signature handling: forks of Baileys document two different shapes for this method —
//   positional : updateMemberLabel(groupJid, label)                     (Plogme's README)
//   object     : updateMemberLabel({ groupJid, lid, label })            (another fork)
// so the declared parameter list of the INSTALLED function is inspected at call time and the matching call is made.
// If the installed function has a shape that cannot be mapped safely, nothing is called and the user gets a clean error.
// Permissions use the existing group permission variables (group admin, owner/creator or sudo).
// ============================================================================
const MAX_TAG = 30;                       // WhatsApp's member-tag length limit

function paramsOf(fn) {
  let src = '';
  try { src = Function.prototype.toString.call(fn); } catch { return null; }
  const open = src.indexOf('(');
  const arrowNoParens = /^\s*(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(src);
  if (arrowNoParens) return { object: false, names: [src.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)/)[1]] };
  if (open < 0) return null;
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) { const c = src[i]; if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) { end = i; break; } } }
  if (end < 0) return null;
  const inner = src.slice(open + 1, end).trim();
  const object = inner.startsWith('{');
  const names = (inner.replace(/=\s*[^,}]+/g, '').match(/[A-Za-z_$][\w$]*/g) || []);
  return { object, names };
}

// Returns a function (sock, groupJid, label) => Promise, or null when the installed shape cannot be mapped.
function buildCaller(sock) {
  const fn = sock && sock.updateMemberLabel;
  if (typeof fn !== 'function') return null;
  const p = paramsOf(fn);
  if (!p || !p.object) return async (s, groupJid, label) => s.updateMemberLabel(groupJid, label);          // documented positional form
  const keys = {}; 
  for (const n of p.names) {
    if (/^(groupJid|jid|groupId|gid|chat|group)$/i.test(n)) keys[n] = 'group';
    else if (/^lid$/i.test(n)) keys[n] = 'lid';
    else if (/^(label|tag|name|text)$/i.test(n)) keys[n] = 'label';
    else return null;                                                                                           // unknown field: do not guess
  }
  if (!Object.values(keys).includes('group') || !Object.values(keys).includes('label')) return null;
  return async (s, groupJid, label) => {
    const arg = {};
    for (const [k, role] of Object.entries(keys)) {
      if (role === 'group') arg[k] = groupJid;
      else if (role === 'label') arg[k] = label;
      else { const lid = s.user && s.user.lid; if (!lid) throw new Error('bot LID unavailable'); arg[k] = lid; }
    }
    return s.updateMemberLabel(arg);
  };
}

function validateTag(tag) {
  const t = String(tag || '').trim();
  if (!t) return { ok: false, error: 'The tag cannot be empty.' };
  if ([...t].length > MAX_TAG) return { ok: false, error: `The tag is too long (max ${MAX_TAG} characters).` };
  return { ok: true, tag: t };
}

async function handleCommand(ctx) {
  const { args, reply, prefix, sock, isGroup, from } = ctx;
  if (!args.length) return reply(`🏷️ *Member tag*\n${prefix}grouptag <tag> — set my tag in this group\n${prefix}grouptag off — remove it`);
  if (!isGroup) return reply('❌ Use this command inside a group.');
  if (!(ctx.isAdmin || ctx.isCreator || ctx.isSudo)) return reply('❌ Only group admins can change my member tag.');
  const off = /^(off|remove|clear)$/i.test(args[0]);
  let label = '';
  if (!off) { const v = validateTag(args.join(' ')); if (!v.ok) return reply('❌ ' + v.error); label = v.tag; }
  const caller = buildCaller(sock);
  if (!caller) { console.log('[grouptag] installed library has no usable updateMemberLabel (type=' + typeof (sock && sock.updateMemberLabel) + ')'); return reply("❌ I couldn't update that member tag."); }
  try {
    await caller(sock, from, label);
    return reply(off ? '✅ Member tag removed.' : '✅ Member tag updated.');
  } catch (e) {
    console.log('[grouptag] updateMemberLabel failed:', String((e && e.message) || e).slice(0, 160));   // detail stays server-side
    return reply("❌ I couldn't update that member tag.");
  }
}

module.exports = { handleCommand, buildCaller, paramsOf, validateTag, MAX_TAG };
