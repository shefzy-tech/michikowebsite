// ============================================================================
// utils/adCommands.js — `.ad` / `.campaigns` (OWNER ONLY).
// Authorization: ctx.isGlobalOwner is computed in main.js from the sender's number compared with
// config.devNumber. It is NOT the per-bot isCreator (every user is "creator" of their own bot) and it
// is never taken from the message. Re-checked here as the first thing every call does.
// ============================================================================
const AD = require('./adScheduler');

let _scheduler = null;
function getScheduler() {
  if (!_scheduler) {
    const { getCollection } = require('../mongoAuth');
    _scheduler = AD.createScheduler({
      store: AD.makeMongoStore(getCollection),
      getSessions: () => { try { return require('../whatsapp').getAllSessions(); } catch { return []; } },
    });
  }
  return _scheduler;
}
function setScheduler(s) { _scheduler = s; }       // tests / alternative wiring

const HELP = (p) => `📣 *Advertisement scheduler* (owner only)\n\n`
  + `*Create* (a draft, nothing is sent yet):\n`
  + `${p}ad create <every> <for> [start:<when>] <text>\n`
  + `  e.g. ${p}ad create 6h 3d Buy now!  → every 6 hours for 3 days\n`
  + `  Send it as the caption of an image/video, or reply to a sticker/image/video/text, to use that content.\n`
  + `  start: +30m  or  2026-10-08T09:00:00Z  (default: when started)\n\n`
  + `${p}ad preview <id> — shows the ad + how many groups/sessions it would reach (DRY RUN, sends nothing to groups)\n`
  + `${p}ad start <id>   ${p}ad stop <id>   ${p}ad now <id>   ${p}ad delete <id>\n`
  + `${p}ad list  (or ${p}campaigns)   ${p}ad info <id>\n\n`
  + `Durations: m, h, d, w (min interval 1h). Only GROUPS are targeted, never private chats.`;

const when = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-');
const inDur = (ms, now) => (ms ? (ms > now ? 'in ' + AD.fmtDur(ms - now) : 'due') : '-');

function line(c, now) {
  return `• *${c._id}* [${c.status}] ${c.type} · every ${AD.fmtDur(c.intervalMs)} · ${c.status === 'active' ? 'next ' + inDur(c.nextRunAt, now) + ' · ends ' + inDur(c.expiresAt, now) : 'for ' + AD.fmtDur(c.durationMs)} · sent ${c.stats ? c.stats.sent : 0} / failed ${c.stats ? c.stats.failed : 0}`;
}
function detail(c, now) {
  const lc = c.lastCycle;
  return `📣 *${c._id}* — ${c.status}\nType: ${c.type}${c.mimetype ? ' (' + c.mimetype + ')' : ''}\nCreator: …${String(c.creator).slice(-4)}\nContent: ${c.text ? String(c.text).slice(0, 200) : '(media only)'}\n`
    + `Every ${AD.fmtDur(c.intervalMs)} for ${AD.fmtDur(c.durationMs)}\nCreated: ${when(c.createdAt)}\nStart: ${when(c.activatedAt || c.startAt)}  Expires: ${when(c.expiresAt)}\n`
    + `Last run: ${when(c.lastRunAt)}  Next run: ${when(c.nextRunAt)}${c.nextRunAt ? ' (' + inDur(c.nextRunAt, now) + ')' : ''}\nCycles: ${c.runs || 0}\n`
    + `Sent: ${c.stats ? c.stats.sent : 0}  Failed: ${c.stats ? c.stats.failed : 0}${c.failures && Object.keys(c.failures).length ? '\nFailures: ' + Object.entries(c.failures).map(([k, v]) => `${k}=${v}`).join(', ') : ''}`
    + (lc ? `\nLast cycle #${lc.no}: ${lc.sent} sent, ${lc.failed} failed, ${lc.groups} groups, ${lc.sessions} sessions online${lc.sessionsOffline ? ', ' + lc.sessionsOffline + ' offline' : ''}` : '');
}

async function handle(ctx) {
  const { reply, prefix } = ctx;
  if (ctx.isGlobalOwner !== true) return reply('❌ This command is restricted to the MICHIKO MD owner.');    // strict boolean, never truthy-coerced
  const sched = ctx.scheduler || getScheduler();
  const now = Date.now();
  const args = ctx.args.slice();
  const sub = (ctx.command === 'campaigns' || ctx.command === 'campaign') ? 'list' : (args.shift() || 'help').toLowerCase();
  try {
    if (sub === 'help') return reply(HELP(prefix));
    if (sub === 'list') {
      const all = (await sched.list({})).sort((a, b) => a.createdAt - b.createdAt);
      return reply(all.length ? `📣 *Campaigns (${all.length})*\n\n` + all.map(c => line(c, now)).join('\n') : `No campaigns yet. Use ${prefix}ad create`);
    }
    if (sub === 'create') {
      const interval = AD.parseDuration(args[0]), duration = AD.parseDuration(args[1]);
      if (!interval || !duration) return reply(`❌ Usage: ${prefix}ad create <every> <for> [start:<when>] <text>\nExample: ${prefix}ad create 6h 3d Buy now!`);
      let i = 2, startAt = null;
      if (args[i] && /^start:/i.test(args[i])) { startAt = AD.parseStart(args[i].slice(6), now); if (!startAt) return reply('❌ Bad start time. Use +30m or an ISO date like 2026-10-08T09:00:00Z.'); i++; }
      let text = args.slice(i).join(' ').trim();
      const m = ctx.m;
      const kind = (x) => /sticker/i.test(x && x.mtype || '') ? 'sticker' : /image/i.test(x && x.mtype || '') ? 'image' : /video/i.test(x && x.mtype || '') ? 'video' : null;
      const src = kind(m) ? m : (kind(m.quoted) ? m.quoted : null);
      let type = 'text', media = null;
      if (src) {
        type = kind(src);
        try { const buffer = await src.download(); media = { buffer, mimetype: (src.msg && src.msg.mimetype) || src.mimetype || null }; }
        catch (e) { return reply('❌ Could not download that media.'); }
        if (type === 'sticker') text = '';
      } else if (!text && m.quoted && m.quoted.text) text = String(m.quoted.text);
      const doc = await sched.create({ creator: ctx.senderNumberRaw, type, text, media, intervalMs: interval, durationMs: duration, startAt });
      return reply(`✅ Draft created: *${doc._id}* (${type})\nEvery ${AD.fmtDur(interval)} for ${AD.fmtDur(duration)}${startAt ? ', start ' + when(startAt) : ''}\n\nNothing has been sent. Next:\n• ${prefix}ad preview ${doc._id} — see it + target counts (dry run)\n• ${prefix}ad start ${doc._id} — activate`);
    }
    const id = args[0];
    if (!id) return reply(`❌ Usage: ${prefix}ad ${sub} <campaign id>   (see ${prefix}ad list)`);
    if (sub === 'info') { const c = await sched.get(id); return reply(c ? detail(c, now) : '❌ No such campaign.'); }
    if (sub === 'preview') {
      const p = await sched.preview(id);
      const c = p.campaign;
      try { const { content, cleanup } = sched.buildContent(c); try { await ctx.sock.sendMessage(ctx.from, content); } finally { cleanup(); } } catch { /* showing the content is best-effort */ }   // to THIS chat only
      return reply(`🔎 *Dry run for ${c._id}* (nothing was sent to any group)\nSessions online: ${p.sessionsOnline}${p.sessionsOffline ? ' (+' + p.sessionsOffline + ' offline, skipped)' : ''}\nGroups that would receive it: *${p.groupsTotal}* (each group once per cycle)\nEstimated time per cycle: ~${p.estSeconds}s\n`
        + (p.perSession.length ? 'Per session: ' + p.perSession.slice(0, 15).map(s => `${s.phone}:${s.groups}`).join(', ') + (p.perSession.length > 15 ? ' …' : '') : ''));
    }
    if (sub === 'start') { const c = await sched.activate(id); return reply(`▶️ *${c._id}* is now active.\nFirst run: ${when(c.nextRunAt)}\nExpires: ${when(c.expiresAt)}`); }
    if (sub === 'stop') { const c = await sched.stop(id); return reply(`⏹️ *${c._id}* stopped. (Sent so far: ${c.stats.sent})`); }
    if (sub === 'now') { await sched.runNow(id); return reply(`⏩ *${id}* will run on the next scheduler tick.`); }
    if (sub === 'delete' || sub === 'del' || sub === 'remove') { await sched.remove(id); return reply(`🗑️ *${id}* deleted.`); }
    return reply(HELP(prefix));
  } catch (e) {
    return reply('❌ ' + String((e && e.message) || e).slice(0, 300));     // validation messages are written for the owner; no stack traces
  }
}

module.exports = { handle, getScheduler, setScheduler, HELP };
