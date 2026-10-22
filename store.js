class MessageStore {
    constructor() {
        this.messages = {};
        this.chats = {};
        this.contacts = {};
        this.MAX_MESSAGES_PER_CHAT = 50; // reduced from 200 — at 30+ sessions, 200 msgs×hundreds of chats per session stacks up to GBs of RAM
        // Hard ceilings on the *number* of chats/contacts kept per session. The per-chat
        // message cap above bounds each chat, but nothing bounded how many chats/contacts
        // a session accumulates (Baileys pushes the whole contact list on connect).
        // Only getMessage() is used elsewhere (anti-delete), so evicting the oldest
        // entries beyond these ceilings does not change any feature.
        this.MAX_CHATS_WITH_MESSAGES = 300;
        this.MAX_CHAT_META = 1000;
        this.MAX_CONTACTS = 1000;
        this.destroyed = false;
    }

    _evictOldest(obj, max) {
        const keys = Object.keys(obj);
        if (keys.length <= max) return;
        const drop = keys.length - max;
        for (let i = 0; i < drop; i++) delete obj[keys[i]];
    }

    bind(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                if (!msg.key?.remoteJid) continue;
                const jid = msg.key.remoteJid;
                if (this.destroyed) return;
                if (!this.messages[jid]) {
                    this.messages[jid] = new Map();
                    this._evictOldest(this.messages, this.MAX_CHATS_WITH_MESSAGES);
                }
                this.messages[jid].set(msg.key.id, msg);
                if (this.messages[jid].size > this.MAX_MESSAGES_PER_CHAT) {
                    const firstKey = this.messages[jid].keys().next().value;
                    this.messages[jid].delete(firstKey);
                }
            }
        });

        ev.on('messages.update', (updates) => {
            for (const update of updates) {
                if (!update.key?.remoteJid) continue;
                const jid = update.key.remoteJid;
                if (!this.messages[jid]) continue;
                const existing = this.messages[jid].get(update.key.id);
                if (existing) {
                    this.messages[jid].set(update.key.id, { ...existing, ...update });
                }
            }
        });

        ev.on('chats.upsert', (chats) => {
            if (this.destroyed) return;
            for (const chat of chats) {
                this.chats[chat.id] = { ...this.chats[chat.id], ...chat };
            }
            this._evictOldest(this.chats, this.MAX_CHAT_META);
        });
        ev.on('chats.update', (updates) => {
            for (const update of updates) {
                if (this.chats[update.id]) {
                    this.chats[update.id] = { ...this.chats[update.id], ...update };
                }
            }
        });

        ev.on('contacts.upsert', (contacts) => {
            if (this.destroyed) return;
            for (const contact of contacts) {
                this.contacts[contact.id] = { ...this.contacts[contact.id], ...contact };
            }
            this._evictOldest(this.contacts, this.MAX_CONTACTS);
        });
        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (this.contacts[update.id]) {
                    this.contacts[update.id] = { ...this.contacts[update.id], ...update };
                }
            }
        });
    }

    getMessage(jid, id) {
        return this.messages[jid]?.get(id) || null;
    }

    getMessages(jid) {
        return this.messages[jid] ? [...this.messages[jid].values()] : [];
    }

    clearOldMessages(maxAgeMs = 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAgeMs;
        for (const jid of Object.keys(this.messages)) {
            for (const [id, msg] of this.messages[jid]) {
                const ts = (msg.messageTimestamp || 0) * 1000;
                if (ts < cutoff) this.messages[jid].delete(id);
            }
            if (this.messages[jid].size === 0) delete this.messages[jid];
        }
    }

    // Full teardown — called when a session disconnects/logs out so its
    // data doesn't linger and doesn't get counted in memory forever.
    destroy() {
        this.destroyed = true;
        this.messages = {};
        this.chats = {};
        this.contacts = {};
    }
}

//===================
// Per-session store registry
//===================
// Previously this file exported ONE shared singleton store used by
// every connected number. That meant:
//   - chats/contacts/messages sharing the same JID across different
//     sessions overwrote each other's data
//   - the dataset grew unbounded across ALL sessions combined, so
//     every message event on every number scanned/mutated one giant
//     shared object — this is why the bot got slower the more
//     sessions were connected, and slower over time as it grew
//
// Fix: each phone number now gets its own isolated MessageStore
// instance. Call getStore(phoneNumber) instead of importing a
// shared instance directly.

const storeRegistry = new Map(); // phoneNumber -> MessageStore

function getStore(phoneNumber) {
    let store = storeRegistry.get(phoneNumber);
    // A destroyed store must never be handed out again (e.g. session wiped, then re-paired).
    if (!store || store.destroyed) {
        store = new MessageStore();
        storeRegistry.set(phoneNumber, store);
    }
    return store;
}

function getStoreCount() { return storeRegistry.size; }

function destroyStore(phoneNumber) {
    const store = storeRegistry.get(phoneNumber);
    if (store) store.destroy();
    storeRegistry.delete(phoneNumber);
}

// Auto-clear old messages across all active per-session stores every hour
const _sweepTimer = setInterval(() => {
    for (const store of storeRegistry.values()) {
        store.clearOldMessages();
    }
}, 60 * 60 * 1000);
if (_sweepTimer.unref) _sweepTimer.unref();

module.exports = { getStore, destroyStore, getStoreCount };
