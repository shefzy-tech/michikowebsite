const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { MongoClient } = require('mongodb');

require('dotenv').config(); // this module is loaded before config.js, so load .env here (does not override real env vars)
function getMongoUri() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI is not set. Add it to .env (or the host environment).');
    return uri;
}
const DB_NAME   = 'michiko_sessions';

// Only these key types get persisted. device-list, lid-mapping, and other
// ephemeral sync data are never written — this alone stops most bloat.
const SAVE_KEY_TYPES = new Set([
    'app-state-sync-key',
    'pre-key',
    'sender-key',
    'session',
]);

// How long a pre-key/session/sender-key document can sit unused before
// it's considered stale and safe to delete. Creds are NEVER touched.
const TTL_DAYS = {
    'pre-key':             2,   // pre-keys are single-use / short-lived by design
    'sender-key':          7,
    'session':             14,
    'app-state-sync-key':  14,
};

let _client = null;
let _ttlIndexReady = false;

async function getDB() {
    if (!_client) {
        _client = new MongoClient(getMongoUri(), {
            // 100+ sessions each issue many small findOne/updateOne calls (every Signal
            // key read/write is its own document). A pool of 10 made those calls queue up
            // behind each other (unbounded wait queue = growing memory + stalled sessions).
            // Atlas free tier allows 500 connections, so 30 is safe. Override: MONGO_POOL_SIZE.
            maxPoolSize: Math.max(5, parseInt(process.env.MONGO_POOL_SIZE || '30', 10) || 30),
            serverSelectionTimeoutMS: 10000,
        });
        await _client.connect();
    }
    return _client.db(DB_NAME);
}

//===================
// TTL index: MongoDB auto-deletes documents once they pass their
//===================
// expireAt time. No cron job needed — the database does it natively
// in the background. We stamp each doc with expireAt based on its type.
async function ensureTTLIndex(collection) {
    if (_ttlIndexReady) return;
    try {
        await collection.createIndex(
            { expireAt: 1 },
            { expireAfterSeconds: 0, name: 'expireAt_ttl' }
        );
        _ttlIndexReady = true;
        console.log('[MongoAuth] TTL index ready — stale keys will auto-expire');
    } catch (e) {
        console.log('[MongoAuth] TTL index setup skipped:', e.message);
    }
}

function getKeyTypeFromDocId(docId) {
    // docId looks like "pre-key-123" or "app-state-sync-key-abc" etc.
    for (const type of Object.keys(TTL_DAYS)) {
        if (docId.startsWith(type + '-')) return type;
    }
    return null;
}

async function useMongoDBAuthState(sessionId) {
    const db         = await getDB();
    const collection = db.collection('sessions');
    await ensureTTLIndex(collection);

    async function readData(id) {
        try {
            const doc = await collection.findOne({ _id: `${sessionId}:${id}` });
            if (!doc) return null;
            return JSON.parse(doc.data, BufferJSON.reviver);
        } catch { return null; }
    }

    async function writeData(id, value) {
        try {
            const data = JSON.stringify(value, BufferJSON.replacer);
            const set  = { data, updatedAt: new Date() };

            // creds.json never expires. Everything else gets a TTL stamp
            // based on its key type so Mongo can clean it up automatically.
            if (id !== 'creds') {
                const keyType = getKeyTypeFromDocId(id);
                const days = TTL_DAYS[keyType] || 14;
                set.expireAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            }

            await collection.updateOne(
                { _id: `${sessionId}:${id}` },
                { $set: set },
                { upsert: true }
            );
        } catch {}
    }

    async function removeData(id) {
        try {
            await collection.deleteOne({ _id: `${sessionId}:${id}` });
        } catch {}
    }

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    if (!SAVE_KEY_TYPES.has(type)) return {};
                    const data = {};
                    await Promise.all(ids.map(async id => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category of Object.keys(data)) {
                        if (!SAVE_KEY_TYPES.has(category)) continue;
                        for (const id of Object.keys(data[category])) {
                            const value = data[category][id];
                            const docId = `${category}-${id}`;
                            if (value) tasks.push(writeData(docId, value));
                            else        tasks.push(removeData(docId));
                        }
                    }
                    if (tasks.length) await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', creds);
        }
    };
}

//===================
// Manual cleanup — deletes stale pre-key/session/sender-key docs across
//===================
// ALL sessions immediately, for a specific number, or globally on demand.
// Useful right now to clear the 23k+ backlog without waiting for TTL to catch up.
async function cleanupStaleKeys(phoneNumber = null) {
    const db         = await getDB();
    const collection = db.collection('sessions');

    const now = new Date();
    const filter = { expireAt: { $lt: now } };
    if (phoneNumber) filter._id = new RegExp(`^${phoneNumber}:`);

    const result = await collection.deleteMany(filter);
    return result.deletedCount;
}

//===================
// Immediate forced purge — deletes ALL pre-key/session/sender-key docs
//===================
// (ignoring TTL) for a given number. Use this once to nuke the existing
// 23k+ backlog instantly instead of waiting for expireAt to pass.
async function forcePurgeKeys(phoneNumber = null) {
    const db         = await getDB();
    const collection = db.collection('sessions');

    const orConditions = Object.keys(TTL_DAYS).map(type => ({
        _id: phoneNumber
            ? new RegExp(`^${phoneNumber}:${type}-`)
            : new RegExp(`:${type}-`)
    }));

    const result = await collection.deleteMany({ $or: orConditions });
    return result.deletedCount;
}

//===================
// Full wipe — deletes EVERY document for a number (creds included).
//===================
// This is what logout()/delete-session should call so a fresh pairing
// never collides with stale leftover data.
async function wipeSession(phoneNumber) {
    const db         = await getDB();
    const collection = db.collection('sessions');
    const result = await collection.deleteMany({ _id: new RegExp(`^${phoneNumber}:`) });
    return result.deletedCount;
}

//===================
// Paired-since timestamp — stamped once on first real connection, in its
//===================
// own small doc so it survives bot restarts (unlike an in-memory Map) and
// is never overwritten by later reconnects.
async function setPairedAt(phoneNumber) {
    const db         = await getDB();
    const collection = db.collection('sessions');
    const docId      = `${phoneNumber}:meta`;
    const existing   = await collection.findOne({ _id: docId });
    if (existing?.pairedAt) return existing.pairedAt;
    const pairedAt = new Date();
    await collection.updateOne({ _id: docId }, { $set: { pairedAt } }, { upsert: true });
    return pairedAt;
}

async function getPairedAt(phoneNumber) {
    const db         = await getDB();
    const collection = db.collection('sessions');
    const doc = await collection.findOne({ _id: `${phoneNumber}:meta` });
    return doc?.pairedAt || null;
}

//===================
// One-time "you're online" notification marker. Stored in the same :meta doc as
// pairedAt so it survives restarts (previously it was an in-memory flag, so every
// process restart re-sent the online message to every restored session).
//===================
async function hasWelcomeSent(phoneNumber) {
    const db = await getDB();
    const doc = await db.collection('sessions').findOne({ _id: `${phoneNumber}:meta` }, { projection: { welcomeSentAt: 1 } });
    return !!doc?.welcomeSentAt;
}

async function markWelcomeSent(phoneNumber) {
    const db = await getDB();
    await db.collection('sessions').updateOne(
        { _id: `${phoneNumber}:meta` },
        { $set: { welcomeSentAt: new Date() } },
        { upsert: true }
    );
}

//===================
// Saved-session discovery for startup restoration.
// A :creds doc is written as soon as a pairing code is *requested*, even if the user
// never enters it, so abandoned pairing attempts used to be restored (and reconnect-looped)
// forever. Only creds with registered:true are real sessions.
//===================
async function listSavedSessions() {
    const db = await getDB();
    const docs = await db.collection('sessions')
        .find({ _id: /:creds$/ }, { projection: { _id: 1, data: 1, updatedAt: 1 } })
        .toArray();
    const registered = [];
    const unregistered = [];
    for (const d of docs) {
        const phone = String(d._id).split(':')[0];
        if (/"registered"\s*:\s*true/.test(d.data || '')) registered.push(phone);
        else unregistered.push({ phone, updatedAt: d.updatedAt ? new Date(d.updatedAt).getTime() : 0 });
    }
    return { registered, unregistered };
}

// Remove leftovers of a pairing attempt that never completed. Refuses to touch a
// session whose creds are registered.
async function purgeUnregistered(phoneNumber) {
    const db = await getDB();
    const collection = db.collection('sessions');
    const creds = await collection.findOne({ _id: `${phoneNumber}:creds` }, { projection: { data: 1 } });
    if (creds && /"registered"\s*:\s*true/.test(creds.data || '')) return 0;
    const result = await collection.deleteMany({ _id: new RegExp(`^${phoneNumber}:`) });
    return result.deletedCount;
}

// Generic collection accessor on the SAME Mongo client/pool the auth state uses (no second connection).
// Used for persistent bot-level data such as the advertisement scheduler.
async function getCollection(name) {
    const db = await getDB();
    return db.collection(name);
}

module.exports = {
    getCollection, useMongoDBAuthState, cleanupStaleKeys, forcePurgeKeys, wipeSession, setPairedAt, getPairedAt, hasWelcomeSent, markWelcomeSent, listSavedSessions, purgeUnregistered };
