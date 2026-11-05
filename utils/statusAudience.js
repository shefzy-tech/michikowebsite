// ============================================================================
// utils/statusAudience.js — gives every GROUP STATUS the "custom audience" look: purple ring + a chip with
// an emoji and a list name (tap it: "You're in <group>'s custom audience").
//
// How it works: WhatsApp reads two things from the contextInfo of the status content:
//     isGroupStatus: true
//     statusAudienceMetadata: { audienceType: 2 (CUSTOM_LIST), listName, listEmoji }
// apply(inner) writes them onto the status content (image / video / audio / text) right before it is relayed.
//
// The library has to be able to ENCODE listName/listEmoji. ensureProto() checks that once with a round trip
// and, only if the library cannot, adds the two string fields (2 = listName, 3 = listEmoji) to its protocol
// class at runtime. If the library already supports everything this does nothing.
//
// Everything is hard-coded below (list name 'Michiko MD', one fixed emoji, custom-list ring, always on).
// ============================================================================
// Fixed on purpose: no command, no setting, no env var. Change these two lines only if you ever rebrand.
const LIST_NAME = 'Michiko MD';
const LIST_EMOJI = '⚡';
const CUSTOM_LIST = 2;

// ---- protocol support -------------------------------------------------------------------------------------
let protoState = null;

// round trip through a real Message (how a status is actually encoded / decoded), not ContextInfo on its own
function viaMessage(proto, ctx) {
  const msg = proto.Message.fromObject({ extendedTextMessage: { text: 't', contextInfo: ctx } });
  return proto.Message.decode(proto.Message.encode(msg).finish()).extendedTextMessage.contextInfo;
}
function roundTrip(proto) {
  try {
    const back = viaMessage(proto, { isGroupStatus: true, statusAudienceMetadata: { audienceType: CUSTOM_LIST, listName: 'ZQ', listEmoji: 'QZ' } });
    const a = back.statusAudienceMetadata;
    return !!(back.isGroupStatus === true && a && a.audienceType === CUSTOM_LIST && a.listName === 'ZQ' && a.listEmoji === 'QZ');
  } catch { return false; }
}
function hasFlag(proto) {
  try { return viaMessage(proto, { isGroupStatus: true }).isGroupStatus === true; }
  catch { return false; }
}

function patchAudienceClass(SAM) {
  const hasOwn = (o, k) => o[k] != null && Object.prototype.hasOwnProperty.call(o, k);
  const origEnc = SAM.encode, origFrom = SAM.fromObject, origTo = SAM.toObject;
  SAM.prototype.listName = null; SAM.prototype.listEmoji = null;
  SAM.encode = function encode(m, w) {
    w = origEnc.call(SAM, m, w);
    if (hasOwn(m, 'listName')) w.uint32(18).string(m.listName);
    if (hasOwn(m, 'listEmoji')) w.uint32(26).string(m.listEmoji);
    return w;
  };
  SAM.decode = function decode(r, l, e) {
    const m = new SAM();
    const end = l === undefined ? r.len : r.pos + l;
    while (r.pos < end) {
      const t = r.uint32();
      if (t === e) break;
      switch (t >>> 3) {
        case 1: m.audienceType = r.int32(); break;
        case 2: m.listName = r.string(); break;
        case 3: m.listEmoji = r.string(); break;
        default: r.skipType(t & 7);
      }
    }
    return m;
  };
  SAM.fromObject = function fromObject(d) {
    if (d instanceof SAM) return d;
    const m = origFrom.call(SAM, d);
    if (d.audienceType === 'CUSTOM_LIST' || d.audienceType === CUSTOM_LIST) m.audienceType = CUSTOM_LIST;
    if (d.listName != null) m.listName = String(d.listName);
    if (d.listEmoji != null) m.listEmoji = String(d.listEmoji);
    return m;
  };
  SAM.toObject = function toObject(m, o) {
    const d = origTo.call(SAM, m, o);
    if (hasOwn(m, 'listName')) d.listName = m.listName;
    if (hasOwn(m, 'listEmoji')) d.listEmoji = m.listEmoji;
    return d;
  };
  try { if (SAM.AudienceType && SAM.AudienceType.CUSTOM_LIST === undefined) { SAM.AudienceType.CUSTOM_LIST = CUSTOM_LIST; SAM.AudienceType[CUSTOM_LIST] = 'CUSTOM_LIST'; } } catch { /* frozen enum: not needed */ }
}

// library without the audience class at all (or without field 66/69 on ContextInfo): add what is missing
function patchContextInfo(proto, needFlag, needAudience) {
  const CI = proto.ContextInfo;
  let SAM = CI.StatusAudienceMetadata;
  if (!SAM) {
    SAM = function StatusAudienceMetadata(p) { if (p) for (const k of Object.keys(p)) if (p[k] != null) this[k] = p[k]; };
    SAM.create = (p) => new SAM(p);
    SAM.encode = (m, w) => { if (!w) w = proto.ContextInfo.encode({}); if (m.audienceType != null) w.uint32(8).int32(m.audienceType); return w; };
    SAM.fromObject = (d) => (d instanceof SAM ? d : new SAM(d));
    SAM.toObject = (m) => ({ ...m });
    SAM.AudienceType = { UNKNOWN: 0, CLOSE_FRIENDS: 1, CUSTOM_LIST: CUSTOM_LIST };
    CI.StatusAudienceMetadata = SAM;
  }
  patchAudienceClass(SAM);
  const oEnc = CI.encode, oFrom = CI.fromObject, oDec = CI.decode;
  CI.encode = function encode(m, w) {
    w = oEnc.call(CI, m, w);
    if (needFlag && m.isGroupStatus != null) w.uint32(528).bool(!!m.isGroupStatus);
    if (needAudience && m.statusAudienceMetadata != null) SAM.encode(SAM.fromObject(m.statusAudienceMetadata), w.uint32(554).fork()).ldelim();
    return w;
  };
  CI.fromObject = function fromObject(d) {
    if (d instanceof CI) return d;
    const m = oFrom.call(CI, d);
    if (needFlag && d.isGroupStatus != null) m.isGroupStatus = !!d.isGroupStatus;
    if (needAudience && d.statusAudienceMetadata != null) m.statusAudienceMetadata = SAM.fromObject(d.statusAudienceMetadata);
    return m;
  };
  CI.decode = function decode(r, l, e) {
    // read the two fields from a copy of the bytes, the original decoder skips them
    const start = r && typeof r.uint32 === 'function' ? r.pos : null;
    const m = oDec.call(CI, r, l, e);
    if (start !== null && (needFlag || needAudience)) {
      const end = r.pos; const save = r.pos; r.pos = start;
      try {
        while (r.pos < end) {
          const t = r.uint32(); const f = t >>> 3, wt = t & 7;
          if (needFlag && f === 66 && wt === 0) m.isGroupStatus = r.bool();
          else if (needAudience && f === 69 && wt === 2) m.statusAudienceMetadata = SAM.decode(r, r.uint32());
          else r.skipType(wt);
        }
      } catch { /* leave what was decoded */ } finally { r.pos = save; }
    }
    return m;
  };
}

function ensureProto(protoArg) {
  if (protoState && !protoArg) return protoState;
  let proto = protoArg;
  if (!proto) { try { proto = require('@whiskeysockets/baileys').proto; } catch { /* handled below */ } }
  if (!proto || !proto.ContextInfo) return (protoState = { ok: false, patched: false, note: 'protocol definitions not found' });
  let state;
  try {
    if (roundTrip(proto)) state = { ok: true, patched: false, note: 'library supports custom audience natively' };
    else {
      const SAM = proto.ContextInfo.StatusAudienceMetadata;
      const flag = hasFlag(proto);
      if (SAM && flag) patchAudienceClass(SAM); else patchContextInfo(proto, !flag, true);
      state = roundTrip(proto) ? { ok: true, patched: true, note: 'added listName/listEmoji support' } : { ok: false, patched: true, note: 'patch did not verify' };
    }
  } catch (e) { state = { ok: false, patched: false, note: 'check failed: ' + String((e && e.message) || e).slice(0, 80) }; }
  if (!protoArg) { protoState = state; console.log(`[statusAudience] ${state.ok ? 'ready' : 'NOT ACTIVE'}: ${state.note}`); }
  return state;
}

// ---- the public helper -------------------------------------------------------------------------------------
const NODES = ['imageMessage', 'videoMessage', 'audioMessage', 'extendedTextMessage', 'documentMessage'];

// Writes the audience onto the status content. `inner` is the object that goes inside groupStatusMessageV2
// ({ extendedTextMessage } or the result of prepareWAMessageMedia). Returns the same object.
function apply(inner) {
  try {
    if (!inner) return inner;
    ensureProto();
    for (const key of NODES) {
      const node = inner[key];
      if (!node) continue;
      node.contextInfo = { ...(node.contextInfo || {}), isGroupStatus: true,
        statusAudienceMetadata: { audienceType: CUSTOM_LIST, listName: LIST_NAME, listEmoji: LIST_EMOJI } };
    }
  } catch (e) { console.log('[statusAudience] apply failed:', String((e && e.message) || e).slice(0, 120)); }
  return inner;
}

module.exports = { apply, ensureProto, roundTrip, CUSTOM_LIST, LIST_NAME, LIST_EMOJI };
