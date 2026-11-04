const {
    downloadMediaMessage
} = require("@whiskeysockets/baileys");

//===================
// BAILEYS MODULE
//===================
const {
    makeWASocket,
    downloadContentFromMessage,
    emitGroupParticipantsUpdate,
    emitGroupUpdate,
    generateWAMessageContent,
    generateWAMessage,
    makeInMemoryStore,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    MediaType,
    areJidsSameUser,
    WAMessageStatus,
    downloadAndSaveMediaMessage,
    AuthenticationState,
    GroupMetadata,
    initInMemoryKeyStore,
    getContentType,
    MiscMessageGenerationOptions,
    useSingleFileAuthState,
    BufferJSON,
    WAMessageProto,
    MessageOptions,
    WAFlag,
    WANode,
    WAMetric,
    ChatModification,
    MessageTypeProto,
    WALocationMessage,
    WAContextInfo,
    proto,
    WAGroupMetadata,
    ProxyAgent,
    waChatKey,
    MimetypeMap,
    MediaPathMap,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMessageContent,
    WAMessage,
    BaileysError,
    WA_MESSAGE_STATUS_TYPE,
    MediaconnInfo,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    WAMediaUpload,
    mentionedJid,
    processTime,
    Browser,
    MessageType,
    Presence,
    WA_MESSAGE_STUB_TYPES,
    Mimetype,
    relayWAMessage,
    Browsers,
    GroupSettingChange,
    WASocket,
    getStream,
    WAProto,
    isBaileys,
    AnyMessageContent,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
    templateMessage
} = require('@whiskeysockets/baileys');

const config = require('./config');
const AIP = require('./utils/aiProviders');   // provider chain for the plain ai/ask/gpt command
const LINKPREVIEW = require('./utils/linkPreview');   // real preview (title/description/thumbnail) for links in group statuses
const EXTRA = require('./utils/extraCommands');   // handlers for the newer commands (dispatched from the switch below)
const MENTION = require('./utils/mentionResponse');   // per-bot custom response when the bot is @mentioned
const BOTID = require('./utils/botIdentity');   // this session's real bot identity (phone JID + LID) for mention/reply detection

const { runtime,
 imageToSticker, 
 videoToSticker,
 videoToAudio, 
 uploadToCatbox, 
 decodeJid, 
 formatRuntime, 
 formatSize } = require('./utils/functions');
 const { handleMichiko, isMichikoTrigger, MICHIKO_PERSONA, getMichikoReply, getMichikoHistory, clearMichikoHistory, AI_FAILURE_REPLY, HOSTILE_REPLY } = require('./michiko');
 const { handleWCG } = require('./wcg');
 const { sendTetris, send2048, sendFlappy, sendTicTacToe, sendSimon, sendSnake, sendBreakout, sendPong, sendWhack, sendInvaders, sendMemory, sendMinesweeper, sendHangman, sendConnectFour, sendReaction, sendBubblePop, sendWordle, sendWordSearch, sendRPS, sendCheckers, sendStackTower, sendSudoku, sendFruitSlicer, sendArchery, sendAirHockey, sendChess, sendLudo } = require('./games');
const fs = require('fs');
const fsPromises = require('fs').promises; // ✅ non‑blocking
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath; // fluent-ffmpeg (used inside wa-sticker-formatter) reads this
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const moment = require('moment-timezone');
const axios = require('axios');
const FormData = require('form-data');
const yts = require('yt-search');

//===================
// Heavstal API constants
//===================
const HEAVSTAL_KEY = 'ht_live_74717f5f78ba30a2d1ff867fb36827fe';
const HEAVSTAL_BASE = 'https://heavstal.com.ng/api/v1/';
const GZ_BASE = 'https://zstlab.cyou';
const GZ_KEY = 'zst_TP4xQJH5BbUsIzrhSX1fAxfcf9NikYch5quEidrM';
const BASE_URL = "https://api.princetechn.com";
const API_KEY = "prince";

let userSettings = new Map();
let sudoUsers = new Map();

//setwelcone attachment
const groupWelcomeSettings = new Map();
const WELCOME_FILE = path.join(__dirname, 'database', 'welcome_settings.json');
if (fs.existsSync(WELCOME_FILE)) {
    try {
        const wd = JSON.parse(fs.readFileSync(WELCOME_FILE, 'utf-8'));
        for (const [key, cfg] of Object.entries(wd)) { 
            groupWelcomeSettings.set(key, cfg);
        }
    } catch {}
}
function saveWelcomeSettings() {
    const out = Object.fromEntries(groupWelcomeSettings);
    fs.writeFileSync(WELCOME_FILE, JSON.stringify(out, null, 2));
}


// Scopes a group-JID key by bot number, no session overlap
function scopedKey(sock, groupJid) {
    if (!sock || !sock.user || !sock.user.id) {
        throw new Error(`scopedKey called with an invalid sock (got: ${typeof sock === 'string' ? `"${sock}"` : typeof sock}). Check the call site — did you forget to pass sock as the first argument?`);
    }
    const botNumber = decodeJid(sock.user.id).split('@')[0];
    return `${botNumber}:${groupJid}`;
}


let bannedUsers = new Map();
const pendingAntiAction = new Map();
const BANNED_FILE = path.join(__dirname, 'database', 'banned_users.json');
if (fs.existsSync(BANNED_FILE)) {
    const bd = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf-8'));
    for (const [grp, users] of Object.entries(bd)) {
        bannedUsers.set(grp, new Set(users));
    }
}

function saveBanned() {
    const out = {};
    for (const [grp, users] of bannedUsers) out[grp] = Array.from(users);
    fs.writeFileSync(BANNED_FILE, JSON.stringify(out, null, 2));
}

// reveal once view with emoji (no prefix needed)
function isDlvoEmoji(m) {
    const triggers = ['🥹','😂','🤣','😊','☺️','😍','🥰','😘','😗','😙','😚','🙂','🤗','🤩','🤔','🫣','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🫠','🫡','🤭','🫢','🤫','🤥','😬','😳','🥺','😟','😦','😧','😨','😰','😱','😖','😞','😓','😩','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💔','❤️‍🔥','❤️‍🩹','💖','💗','💓','💞','💕','💘','💝','💟','👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🙏','💅','🤳','💪','🦾','🖕','✍️','🤝','🔥','✨','⭐','🌟','💫','⚡','💥','💯','🎉','🎊','🎁','🏆','🥇','🥈','🥉','😎','🤓','🧐','😕','😟','😢','😭','😩','😫','😤','😠','😡','🤯','🥶','🥵','😇','🥳']
    return triggers.includes((m.body || '').trim())
}


//===================
// Group protection settings
//===================
let groupProtection = new Map();
const PROTECTION_FILE = path.join(__dirname, 'database', 'group_protection.json');
if (fs.existsSync(PROTECTION_FILE)) {
    try {
        const pd = JSON.parse(fs.readFileSync(PROTECTION_FILE, 'utf-8'));
        for (const [grp, cfg] of Object.entries(pd)) {
            cfg.warnCount = new Map(Object.entries(cfg.warnCount || {}));
            groupProtection.set(grp, cfg);
        }
    } catch {}
}

function saveProtection() {
    const out = {};
    for (const [grp, cfg] of groupProtection) {
        out[grp] = { ...cfg, warnCount: Object.fromEntries(cfg.warnCount || new Map()) };
    }
    fs.writeFileSync(PROTECTION_FILE, JSON.stringify(out, null, 2));
}

function getGroupProtection(sock, grp) {
    const key = scopedKey(sock, grp);
    if (!groupProtection.has(key)) {
        groupProtection.set(key, {
            antilink: false, antifwd: false, antibot: false,
            antitag: false, antigroupmention: false, antigroupstatus: false, flood: false, floodLimit: 5, floodInterval: 5000,
            warnCount: new Map(), maxWarns: 3,
            badWords: [
                'fuck', 'fucking', 'fucker', 'motherfucker',
                'bitch', 'bastard', 'asshole', 'cunt',
                'nigger', 'nigga', 'whore', 'slut',
                'dick', 'pussy', 'retard', 'faggot'
            ],
            linkWhitelist: []
        });
    }
    return groupProtection.get(key);
}

//===================
// Active member tracker (resets automatically at midnight, no file needed)
//===================
const activeMembersTracker = new Map(); 

function getTodayDateStr() {
    return moment().tz(config.timezone || 'Africa/Lagos').format('YYYY-MM-DD');
}

function trackActiveMember(sock, groupJid, senderJid) {
    const key = scopedKey(sock, groupJid);
    const today = getTodayDateStr();
    let entry = activeMembersTracker.get(key);
    if (!entry || entry.date !== today) {
        entry = { date: today, counts: new Map() };
        activeMembersTracker.set(key, entry);
    }
    entry.counts.set(senderJid, (entry.counts.get(senderJid) || 0) + 1);
}

const floodTracker = new Map();
const autoReactGroups = new Map();
// Pending add confirmations
const pendingAdd = new Map();

//===================
// Ephoto text effect URLs
//===================
const ephotoEffects = {
    // GLITCH / TECH
    glitchtext: 'https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html',
    pixelglitch: 'https://en.ephoto360.com/create-pixel-glitch-text-effect-online-769.html',
    neonglitch: 'https://en.ephoto360.com/create-impressive-neon-glitch-text-effects-online-768.html',
    glitch2: 'https://en.ephoto360.com/create-glitch-text-effect-style-tik-tok-983.html',
    cyberpunk: 'https://en.ephoto360.com/create-a-cyberpunk-style-glitch-text-effect-online-974.html',
    // NEON / GLOW
    advancedglow: 'https://en.ephoto360.com/advanced-glow-effects-74.html',
    neontext: 'https://en.ephoto360.com/neon-text-effect-online-879.html',
    neonlight: 'https://en.ephoto360.com/create-light-effects-green-neon-online-429.html',
    neonmetal: 'https://en.ephoto360.com/neon-metal-text-effect-online-919.html',
    // TEXT / WRITE
    writetext: 'https://en.ephoto360.com/write-text-on-wet-glass-online-589.html',
    fogtext: 'https://en.ephoto360.com/write-text-effect-on-foggy-glass-online-588.html',
    sandwriting: 'https://en.ephoto360.com/write-name-on-sand-online-103.html',
    graffiti: 'https://en.ephoto360.com/create-graffiti-text-effects-online-770.html',
    typographytext: 'https://en.ephoto360.com/create-typography-text-effect-on-pavement-online-774.html',
    // FLAGS
    flagtext: 'https://en.ephoto360.com/nigeria-3d-flag-text-effect-online-free-753.html',
    goldflag: 'https://en.ephoto360.com/3d-golden-flag-text-effect-online-738.html',
    // 3D STYLES
    '3dstone': 'https://en.ephoto360.com/3d-stone-text-effect-online-105.html',
    '3dmetal': 'https://en.ephoto360.com/3d-metal-text-effect-online-110.html',
    '3dchrome': 'https://en.ephoto360.com/create-3d-chrome-text-effect-online-982.html',
    '3dgold': 'https://en.ephoto360.com/create-3d-gold-text-effect-online-983.html',
    // FUN / MODERN
    gaminglogo: 'https://en.ephoto360.com/create-esport-logo-online-101.html',
    cartoontext: 'https://en.ephoto360.com/cartoon-style-text-effect-online-783.html',
    flame: 'https://en.ephoto360.com/flame-text-effect-online-107.html',
    smoke: 'https://en.ephoto360.com/smoke-text-effect-online-108.html',
    ice: 'https://en.ephoto360.com/ice-text-effect-online-1070.html',
    // EXTRA (30+ total)
    rusticwood: 'https://en.ephoto360.com/create-rustic-wood-text-effect-online-805.html',
    goldleaf: 'https://en.ephoto360.com/create-gold-leaf-text-effect-online-809.html',
    chalkboard: 'https://en.ephoto360.com/create-chalk-text-effect-online-808.html',
    watercolor: 'https://en.ephoto360.com/watercolor-text-effect-online-806.html',
    retro80s: 'https://en.ephoto360.com/retro-text-effect-online-800.html',
    horror: 'https://en.ephoto360.com/horror-bloody-text-effect-online-801.html',
    galaxy: 'https://en.ephoto360.com/galaxy-text-effect-online-802.html',
    rainbow: 'https://en.ephoto360.com/rainbow-text-effect-online-803.html',
    matrix: 'https://en.ephoto360.com/matrix-text-effect-online-804.html',
};

//===================
// Chatbot System Prompt
//===================
const CHATBOT_SYSTEM_PROMPT = MICHIKO_PERSONA;

// Sticker commands
const STICKCMD_DIR = path.join(__dirname, 'database', 'stickcmds');
if (!fs.existsSync(STICKCMD_DIR)) fs.mkdirSync(STICKCMD_DIR, { recursive: true });

const stickerCmdsMaps = new Map(); 

function getStickerCmds(botNum) {
    if (!stickerCmdsMaps.has(botNum)) {
        const file = path.join(STICKCMD_DIR, `${botNum}.json`);
        let m = new Map();
        if (fs.existsSync(file)) {
            try { m = new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf-8')))); } catch {}
        }
        stickerCmdsMaps.set(botNum, m);
    }
    return stickerCmdsMaps.get(botNum);
} 

function saveStickerCmds(botNum) {
    const file = path.join(STICKCMD_DIR, `${botNum}.json`);
    const m = getStickerCmds(botNum);
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(m), null, 2));
}

//===================
// Chatbot / AI settings
//===================

// Active game sessions
const gameSessions = new Map();

//===================
// Economy database
//===================
const ECONOMY_FILE = path.join(__dirname, 'database', 'economy.json');
let economyData = {};
if (fs.existsSync(ECONOMY_FILE)) {
    try { economyData = JSON.parse(fs.readFileSync(ECONOMY_FILE, 'utf-8')); } catch {}
}
function saveEconomy() { fs.writeFileSync(ECONOMY_FILE, JSON.stringify(economyData, null, 2)); }
function getWallet(jid) {
    const id = jid.split('@')[0];
    if (!economyData[id]) {
        economyData[id] = {
            cash: 500,
            bank: 0,
            lastDaily: 0,
            lastWork: 0,
            lastCrime: 0,
            lastHunt: 0,
            lastFish: 0,
            lastMine: 0,
            lastRob: 0,
            lastGamble: 0,
            lastInterest: 0,
            dailyStreak: 0,
            gamblesLeft: 5,
            gamblesReset: 0,
            jailUntil: 0,
            xp: 0,
            level: 1,
            totalEarned: 0,
            inventory: []
        };
    }
    // Patch old wallets missing new fields
    const w = economyData[id];
    if (w.lastCrime === undefined) w.lastCrime = 0;
    if (w.lastHunt === undefined) w.lastHunt = 0;
    if (w.lastFish === undefined) w.lastFish = 0;
    if (w.lastMine === undefined) w.lastMine = 0;
    if (w.lastRob === undefined) w.lastRob = 0;
    if (w.lastGamble === undefined) w.lastGamble = 0;
    if (w.lastInterest === undefined) w.lastInterest = 0;
    if (w.dailyStreak === undefined) w.dailyStreak = 0;
    if (w.gamblesLeft === undefined) w.gamblesLeft = 5;
    if (w.gamblesReset === undefined) w.gamblesReset = 0;
    if (w.jailUntil === undefined) w.jailUntil = 0;
    if (w.xp === undefined) w.xp = 0;
    if (w.level === undefined) w.level = 1;
    if (w.totalEarned === undefined) w.totalEarned = 0;
    return w;
}

//===================
// XP HELPER FUNCTIONS
//===================
function getXpForLevel(level) {
    return level * level * 100; // level 1=100, level 2=400, level 3=900...
}

function addXp(wallet, amount) {
    wallet.xp = (wallet.xp || 0) + amount;
    const xpNeeded = getXpForLevel(wallet.level || 1);
    let leveledUp = false;
    while (wallet.xp >= getXpForLevel(wallet.level)) {
        wallet.xp -= getXpForLevel(wallet.level);
        wallet.level++;
        const bonus = wallet.level * 500;
        wallet.cash += bonus;
        leveledUp = { level: wallet.level, bonus };
    }
    return leveledUp;
}

function formatCooldown(ms) {
    if (ms <= 0) return '0s';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
}

function getLevelTitle(level) {
    if (level < 5) return '🧑 Beginner';
    if (level < 10) return '🔰 Rookie';
    if (level < 15) return '⚔️ Hustler';
    if (level < 20) return '💼 Dealer';
    if (level < 25) return '🏆 Pro';
    if (level < 35) return '💎 Elite';
    if (level < 50) return '👑 Legend';
    return '🌟 Godlike';
}
const SHOP_ITEMS = [
    { id: 1, name: 'Lucky Coin', price: 500, desc: 'Increases gamble win chance', emoji: '🪙' },
    { id: 2, name: 'Shield', price: 1000, desc: 'Protects from rob once', emoji: '🛡️' },
    { id: 3, name: 'Pickaxe', price: 800, desc: 'Doubles work earnings', emoji: '⛏️' },
    { id: 4, name: 'VIP Pass', price: 5000, desc: 'VIP badge on profile', emoji: '⭐' },
    { id: 5, name: 'Magic Bag', price: 2000, desc: 'Doubles daily reward', emoji: '🎒' },
];


const economyEnabled = new Map();

// Load settings from file
const SETTINGS_FILE = path.join(__dirname, 'database', 'user_settings.json');
if (fs.existsSync(SETTINGS_FILE)) {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    userSettings = new Map(Object.entries(data.userSettings || {}));
    const rawSudo = data.sudoUsers || {};
    if (Array.isArray(rawSudo)) {
        console.log('[Settings] Legacy flat sudoUsers detected — resetting to per-bot format');
    } else {
        for (const [botNum, users] of Object.entries(rawSudo)) {
            sudoUsers.set(botNum, new Set(Array.isArray(users) ? users : []));
        }
    }
}

function saveSettings() {
    // Convert per-bot 
    const sudoObj = {};
    for (const [botNum, usersSet] of sudoUsers) {
        sudoObj[botNum] = Array.from(usersSet);
    }
    const data = {
        userSettings: Object.fromEntries(userSettings),
        sudoUsers: sudoObj
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Get the sudo Set for a specific bot number (creates empty Set if none exists)
function getBotSudoUsers(botNum) {
    if (!sudoUsers.has(botNum)) sudoUsers.set(botNum, new Set());
    return sudoUsers.get(botNum);
}

function getDefaultSettings() {
    return {
        prefix: '.',
        mode: 'public',
        menuImage: null,
        botName: config.botName,
        aliveMessage: null,
        ownerNumber: null,
        autoTyping:    false,
        autoRecording: false,
        autoRead:      false,
        alwaysOnline:  false,
        chatbotEnabled:  false,
        chatbotPrivate:  false,
        autoViewStatus:  false,  
        anticall: false,
    };
}

function getUserSettings(userId) {
    if (!userSettings.has(userId)) {
        userSettings.set(userId, getDefaultSettings());
    }
    return userSettings.get(userId);
}

function updateUserSettings(userId, newSettings) {
    const current = getUserSettings(userId);
    const updated = { ...current, ...newSettings };
    userSettings.set(userId, updated);
    saveSettings();
    return updated;
}

function normalizeNumber(num) {
    return num.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}


//===================
// Anti-feature actions
//===================
async function doAntiAction(sock, from, sender, senderNumber, m, prot, actionName) {
    // Delete the message
    try { await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: m.key.id, participant: m.key.participant || sender } }); } catch {}
    
    const mode = prot[actionName];
    if (mode === 'warn' || mode === 'warn/delete') {
        const wc = (prot.warnCount.get(sender) || 0) + 1;
        prot.warnCount.set(sender, wc);
        if (wc >= prot.maxWarns) {
            prot.warnCount.delete(sender);
            try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
            await sock.sendMessage(from, { text: `🚫 @${senderNumber} removed after ${prot.maxWarns} warnings.`, mentions: [sender] });
        } else {
            await sock.sendMessage(from, { text: `⚠️ @${senderNumber} Warning ${wc}/${prot.maxWarns}! Violation detected.`, mentions: [sender] });
        }
    } else if (mode === 'kick' || mode === 'delete/kick') {
        try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
        await sock.sendMessage(from, { text: `🚷 @${senderNumber} was removed. Reason: ${actionName} violation.`, mentions: [sender] });
    } else {
        // on / delete only
        await sock.sendMessage(from, { text: `⚠️ @${senderNumber} that is not allowed here 🫩!`, mentions: [sender] });
    }
}

//===================
// Participant helpers.
// Newer Baileys builds deliver group participants as OBJECTS ({ id, phoneNumber, lid, admin }) and may use
// @lid ids; older ones deliver plain strings. Every handler below accepts both. (Treating an object as a
// string is what made welcome/goodbye and anti-promote/demote silently do nothing.)
//===================
const pJid = (p) => typeof p === 'string' ? p : ((p && (p.id || p.jid || p.phoneNumber)) || '');
const pAlt = (p) => (p && typeof p === 'object') ? (p.phoneNumber || p.pn || '') : '';
const jDigits = (j) => String(j || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
function botDigits(sock) {
    const s = new Set();
    for (const j of [sock?.user?.id, sock?.user?.lid, sock?.user?.jid]) { const d = jDigits(j); if (d) s.add(d); }
    return s;
}
function isBotParticipant(sock, p) {
    const ids = botDigits(sock);
    return [pJid(p), pAlt(p), p && p.lid].some((x) => x && ids.has(jDigits(x)));
}

// ---- repeat group-status posters (see antistatusspam) ----
const SPAMMERS_FILE = path.join(__dirname, 'database', 'status_spammers.json');
const statusSpammers = new Set();   // entries are `${botNumber}:${spammerNumber}` so each connected bot keeps its own list
const spamKey = (sock, num) => `${jDigits(sock?.user?.id)}:${num}`;
try { for (const n of JSON.parse(fs.readFileSync(SPAMMERS_FILE, 'utf-8'))) statusSpammers.add(String(n)); } catch {}
function saveSpammers() { try { fs.writeFileSync(SPAMMERS_FILE, JSON.stringify([...statusSpammers])); } catch {} }
const statusSpamTrack = new Map();   // `${group}|${sender}` -> [{ t, id }]
function isGroupStatusMsg(m) {
    const msg = m && m.message;
    if (!msg) return false;
    const keys = Object.keys(msg);
    if (keys.includes('groupStatusMessageV2') || keys.includes('groupStatusMessage') || keys.includes('groupStatusMentionMessage')) return true;
    let raw = '';
    try { raw = JSON.stringify(msg); } catch {}
    return raw.includes('"groupStatusMessageV2"') || raw.includes('"groupStatusMessage"') || raw.includes('"groupStatusMentionMessage"');
}

function registerGroupEvents(sock) {
    //===================
    // Welcome / Goodbye
    //===================
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            if (action !== 'add' && action !== 'remove') return;
            const key = scopedKey(sock, id);
            const settings = groupWelcomeSettings.get(key);
            if (!settings) return;
            if (!(action === 'add' ? settings.welcome : settings.goodbye)) return;

            let groupMetadata;
            try { groupMetadata = await sock.groupMetadata(id); } catch { return; }
            const count = groupMetadata?.participants?.length || 0;
            const subject = groupMetadata?.subject || 'this group';

            for (const p of (participants || [])) {
                if (isBotParticipant(sock, p)) continue;
                const jid = pJid(p);
                if (!jid) continue;
                const tag = `@${jDigits(jid)}`;

                if (action === 'add') {
                    let profilePic = null;
                    for (const cand of [jid, pAlt(p)]) {
                        if (!cand || profilePic) continue;
                        try { profilePic = await sock.profilePictureUrl(cand, 'image'); } catch {}
                    }
                    if (!profilePic) profilePic = 'https://files.catbox.moe/5kv07a.jpg';
                    const text = (settings.welcomeMessage ||
                        `╭━━❏ *WELCOME* ❏━━⬣\n┃\n┃ ✨ Hello @user!\n┃ 👋 Welcome to @group\n┃ 👥 Members: @count\n╰━━━━━━━━━━━━━━━━⬣`)
                        .replace(/@user/g, tag).replace(/@group/g, subject).replace(/@count/g, count);
                    try {
                        await sock.sendMessage(id, { image: { url: profilePic }, caption: text, mentions: [jid] });
                    } catch {
                        await sock.sendMessage(id, { text, mentions: [jid] });   // picture host unreachable: still welcome them
                    }
                } else {
                    const text = (settings.goodbyeMessage ||
                        `╭━━❏ *GOODBYE* ❏━━⬣\n┃\n┃ 👋 @user has left.\n┃ 👥 Members: @count\n╰━━━━━━━━━━━━━━━━⬣`)
                        .replace(/@user/g, tag).replace(/@group/g, subject).replace(/@count/g, count);
                    await sock.sendMessage(id, { text, mentions: [jid] });
                }
            }
        } catch (e) {
            console.log('Welcome/goodbye error:', e.message);
        }
    });

    //===================
    // Anti-promote / Anti-demote   (+ re-join check for known status spammers)
    //===================
    sock.ev.on('group-participants.update', async ({ id, participants, action, author, authorPn }) => {
        try {
            if (!['promote', 'demote', 'add'].includes(action)) return;
            const prot = getGroupProtection(sock, id);

            // Known status spammers are removed again the moment they rejoin (only while antistatusspam is on).
            if (action === 'add') {
                if (!prot.antistatusspam || !statusSpammers.size) return;
                const bad = (participants || []).filter((p) => [pJid(p), pAlt(p)].some((x) => x && statusSpammers.has(spamKey(sock, jDigits(x)))));
                if (!bad.length) return;
                const meta = await sock.groupMetadata(id).catch(() => null);
                if (!meta) return;
                const me = meta.participants.find((x) => isBotParticipant(sock, x));
                if (!me || !me.admin) return;
                for (const p of bad) { try { await sock.groupParticipantsUpdate(id, [pJid(p)], 'remove'); } catch {} }
                return;
            }

            if ((action === 'promote' && !prot.antipromote) || (action === 'demote' && !prot.antidemote)) return;

            // The bot's own changes (the owner using .promote / .demote, or this handler's revert) are never reverted.
            const authorIds = [author, authorPn].filter(Boolean);
            const ids = botDigits(sock);
            if (authorIds.some((a) => ids.has(jDigits(a)))) return;

            const groupMeta = await sock.groupMetadata(id).catch(() => null);
            if (!groupMeta) return;
            const meBot = groupMeta.participants.find((x) => isBotParticipant(sock, x));
            if (!meBot || !(meBot.admin === 'admin' || meBot.admin === 'superadmin')) return;   // cannot revert without admin rights

            const targets = (participants || []).filter((p) => !isBotParticipant(sock, p)).map(pJid).filter(Boolean);
            if (!targets.length) return;
            const revert = action === 'promote' ? 'demote' : 'promote';
            for (const jid of targets) {
                try { await sock.groupParticipantsUpdate(id, [jid], revert); } catch (e) { console.log(`[anti-${action}] revert failed:`, e.message); }
            }
            const who = author || authorPn;
            if (who) {
                await sock.sendMessage(id, {
                    text: `🛡️ @${jDigits(who)} tried to ${action} someone, but *anti-${action}* is on. Action reverted.`,
                    mentions: [who]
                }).catch(() => {});
            }
        } catch (e) {
            console.log('Antipromote/antidemote error:', e.message);
        }
    });
}

//===================
// Anti-delete
// Listens to BOTH ways WhatsApp reports a delete-for-everyone (the revoke protocol message and the
// messages.update revoke event), de-duplicates them, looks the original up in the message store and posts it back.
// It does not depend on who deleted it or on the bot being admin.
//===================
function registerAntiDelete(sock, store) {
    if (!sock || !sock.ev || !store) return;
    const handled = new Map();
    const unwrap = (msg) => {
        let cur = msg;
        for (let i = 0; i < 4 && cur; i++) {
            const inner = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message || cur.viewOnceMessageV2?.message ||
                          cur.viewOnceMessageV2Extension?.message || cur.documentWithCaptionMessage?.message;
            if (!inner) break;
            cur = inner;
        }
        return cur || {};
    };
    const dl = async (node, type) => {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(node, type);
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        return Buffer.concat(chunks);
    };

    async function onRevoke(chat, deletedId, deleterJid) {
        try {
            if (!chat || !chat.endsWith('@g.us') || !deletedId) return;
            const prot = getGroupProtection(sock, chat);
            if (!prot.antidelete) return;

            const dedupe = chat + '|' + deletedId;
            if (handled.has(dedupe)) return;
            handled.set(dedupe, Date.now());
            if (handled.size > 500) handled.delete(handled.keys().next().value);

            const orig = store.getMessage(chat, deletedId);
            if (orig?.key?.fromMe) return;                                         // the bot's own deletions
            const senderJid = orig?.key?.participant || orig?.participant || deleterJid || '';
            const num = jDigits(senderJid);
            const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const header = `🗑️ *ANTI-DELETE*\n👤 @${num || 'unknown'}\n🕐 ${time}\n━━━━━━━━━━━━━━`;
            const mentions = senderJid ? [senderJid] : [];

            if (!orig || !orig.message) {
                return void await sock.sendMessage(chat, { text: `${header}\n\n❓ A message was deleted, but it was sent before the bot started (or is no longer in memory), so it can't be recovered.`, mentions });
            }
            const content = unwrap(orig.message);
            const type = Object.keys(content).find((k) => !['senderKeyDistributionMessage', 'messageContextInfo'].includes(k));
            if (!type || ['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage'].includes(type)) return;
            const node = content[type] || {};
            const cap = node.caption || '';

            if (type === 'conversation' || type === 'extendedTextMessage') {
                const t = content.conversation || node.text || '';
                return void await sock.sendMessage(chat, { text: `${header}\n\n💬 ${t}`, mentions });
            }
            const kinds = { imageMessage: ['image', '🖼️ Image'], videoMessage: ['video', '🎥 Video'], audioMessage: ['audio', '🎵 Audio'], stickerMessage: ['sticker', '🎭 Sticker'] };
            if (kinds[type]) {
                const [mt, label] = kinds[type];
                try {
                    const buf = await dl(node, mt);
                    if (mt === 'image') await sock.sendMessage(chat, { image: buf, caption: `${header}\n\n${label}${cap ? `\n📝 ${cap}` : ''}`, mentions });
                    else if (mt === 'video') await sock.sendMessage(chat, { video: buf, mimetype: node.mimetype || 'video/mp4', caption: `${header}\n\n${label}${cap ? `\n📝 ${cap}` : ''}`, mentions });
                    else {
                        await sock.sendMessage(chat, { text: `${header}\n\n${label}`, mentions });
                        if (mt === 'audio') await sock.sendMessage(chat, { audio: buf, mimetype: node.mimetype || 'audio/mpeg', ptt: !!node.ptt });
                        else await sock.sendMessage(chat, { sticker: buf });
                    }
                } catch {
                    await sock.sendMessage(chat, { text: `${header}\n\n${label}\n⚠️ Could not recover the file (WhatsApp no longer serves it).`, mentions });
                }
                return;
            }
            if (type === 'documentMessage') {
                try {
                    const buf = await dl(node, 'document');
                    await sock.sendMessage(chat, { text: `${header}\n\n📎 Document`, mentions });
                    await sock.sendMessage(chat, { document: buf, mimetype: node.mimetype || 'application/octet-stream', fileName: node.fileName || 'file' });
                } catch {
                    await sock.sendMessage(chat, { text: `${header}\n\n📎 Document: ${node.fileName || 'unknown'}\n⚠️ Could not recover the file.`, mentions });
                }
                return;
            }
            await sock.sendMessage(chat, { text: `${header}\n\n📩 Deleted message (${type.replace(/Message$/, '')})`, mentions });
        } catch (e) {
            console.log('Anti-delete error:', e.message);
        }
    }

    // 1) messages.update carrying the revoke
    sock.ev.on('messages.update', (updates) => {
        for (const u of (updates || [])) {
            const st = u?.update?.messageStubType;
            if (st === 1 || st === 'REVOKE' || (u?.update && 'message' in u.update && u.update.message === null)) {
                onRevoke(u.key?.remoteJid, u.key?.id, u.key?.participant || u.update?.key?.participant);
            }
        }
    });
    // 2) the revoke protocol message arriving as an ordinary message
    sock.ev.on('messages.upsert', ({ messages }) => {
        for (const m of (messages || [])) {
            const pm = m?.message?.protocolMessage;
            if (pm && pm.key && (pm.type === 0 || pm.type === 'REVOKE')) {
                onRevoke(m.key?.remoteJid || pm.key.remoteJid, pm.key.id, m.key?.participant || pm.key.participant);
            }
        }
    });
}

//===================
// BASE
//===================
module.exports = handleMessage = async (sock, rawMessage, chatUpdate, store) => {
    let m = null;
    try {
        m = rawMessage;
        if (!m) return;
             

        // --- Standalone Variables ---
        const from = m.key?.remoteJid || m.sender || m.chat;
        const sender = m.sender || from;
        const pushname = m.pushName || m.senderName || "User";
        const isGroup = m.isGroup || (from && from.endsWith('@g.us')) || false;
        const body = m.body || '';
        
        // Get bot number
        const botNumber = decodeJid(sock.user.id);
        const botNumberRaw = botNumber.split('@')[0];
        
        // Owner check — true if sender is this bot's own paired number,
        // OR the hardcoded developer/owner number from config (always has access, on any instance)
        const devNumberRaw = String(config.devNumber || config.botOwner || '').replace(/[^0-9]/g, '');
        const senderNumberRaw = sender.split('@')[0].split(':')[0];
        const isCreator = normalizeNumber(botNumberRaw) === sender ||
            (devNumberRaw && senderNumberRaw === devNumberRaw);
        const isSudo = getBotSudoUsers(botNumberRaw).has(sender.split('@')[0]) || isCreator;
        // GLOBAL owner (the MICHIKO MD developer) — NOT the per-bot isCreator, which is true for every user on their own bot.
        // Computed here from the sender's number; used for owner-only global features (ads, maintenance, stats).
        const isGlobalOwner = !!devNumberRaw && senderNumberRaw === devNumberRaw;
        const isBotOwner = senderNumberRaw === botNumberRaw;   // the person who controls THIS connected bot
        
        const senderNumber = sender.split('@')[0];
        const userSetting = getUserSettings(botNumberRaw);
        const mode = userSetting.mode;
        let prefix = userSetting.prefix;
        
        // Detect prefix from message
        let isCmd = body.startsWith(prefix);
        let command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : '';
        let args = body.trim().split(/ +/).slice(1);
        let text = args.join(" ");

        //===================
        // GROUP / ADMIN CHECKS
        //===================
        let isAdmin = false;
        let isBotAdmin = false;
        let groupName = null;

        if (isGroup) {
            try {
                const groupMetadata = await sock.groupMetadata(from);
                groupName = groupMetadata.subject;
                const participants = groupMetadata.participants || [];

                const botId = sock.user?.id || '';
                const botLid = sock.user?.lid || '';
                const botRaw = botId.split(':')[0].split('@')[0];
                const botLidRaw = botLid ? botLid.split(':')[0].split('@')[0] : null;
                const senderRaw = sender.split(':')[0].split('@')[0];

                for (const p of participants) {
                    const pIdRaw = p.id.split('@')[0].split(':')[0];
                    const pLidRaw = p.lid ? p.lid.split('@')[0].split(':')[0] : null;
                    const isAdminRole = p.admin === 'admin' || p.admin === 'superadmin';

                    if (isAdminRole) {
                        if (
                            pIdRaw === botRaw ||
                            (botLidRaw && pLidRaw === botLidRaw) ||
                            (botLidRaw && pIdRaw === botLidRaw) ||
                            (pLidRaw && pLidRaw === botRaw)
                        ) isBotAdmin = true;

                        if (
                            pIdRaw === senderRaw ||
                            (pLidRaw && pLidRaw === senderRaw)
                        ) isAdmin = true;
                    }
                }

                if (isCreator) isAdmin = true;
            } catch (err) {
                // Silent fail
            }
        }
        
        //===================
        // ACTIVE MEMBER TRACKING (every group message counts, resets daily)
        //===================
        if (isGroup && !m.key.fromMe && sender !== botNumber) {
            try { trackActiveMember(sock, from, sender); } catch (e) { console.log('trackActiveMember error:', e.message); }
        }

        //===================
        // CONSOLE LOGGER
        //===================
        const timeNow = moment().tz(config.timezone || 'Africa/Lagos').format('YYYY-MM-DD HH:mm:ss');
        console.log('\n' + chalk.gray('────────────────────────────────────────'));
        console.log(chalk.bold.cyan('🤖 MICHIKO-MD') + chalk.gray(' • ') + chalk.green(timeNow));
        console.log(chalk.gray('────────────────────────────────────────'));
        console.log(chalk.white('👤 User      : ') + chalk.magenta(pushname));
        console.log(chalk.white('📞 Number    : ') + chalk.red(senderNumber));
        console.log(chalk.white('💬 Message   : ') + chalk.yellow(body.substring(0, 100) || '[Media/Sticker]'));
        
        if (isCmd) {
            console.log(chalk.white('⚡ Command   : ') + chalk.blue(command));
            console.log(chalk.white('📝 Prefix    : ') + chalk.cyan(prefix));
        }

        if (isGroup) {
            console.log(chalk.white('👥 Group     : ') + chalk.green(groupName || 'Unknown'));
            console.log(chalk.white('👑 Admin     : ') + (isAdmin ? chalk.green('Yes') : chalk.red('No')));
            console.log(chalk.white('🤖 Bot Admin : ') + (isBotAdmin ? chalk.green('Yes') : chalk.red('No')));
        } else {
            console.log(chalk.white('🔒 Chat Type : ') + chalk.cyan('Private Chat'));
        }
        console.log(chalk.gray('────────────────────────────────────────\n'));

        //===================
        // REPLY FUNCTION
        //===================
        const Shefzyreply = async (text) => {
    const styledMessage = `❏ *${userSetting.botName || config.botName}*\n${text}`;
    return await sock.sendMessage(from, { text: styledMessage }, { quoted: m });
};

        //===================
        // CATEGORY MENU HELPER (used by mediamenu, groupmenu, gamemenu, etc.)
        //===================
        const sendMenuSection = async (title, body) => {
            const sectionText = `
╭✰ ${userSetting.botName || config.botName} — ${title}
╰✰
${body}

> Type ${prefix}menu to see all categories
> ${config.productBrand}`;
            await sock.sendMessage(from, { text: sectionText }, { quoted: m });
        };
        
        //===================
        // AUTO VIEW STATUS
        //===================
if (m.key.remoteJid === 'status@broadcast' && userSetting.autoViewStatus) {
    try {
        await sock.readMessages([m.key]);
        await sock.sendMessage('status@broadcast', { react: { key: m.key, text: '💚' } });
    } catch {}
    return;
}

if (!sock._anticallRegistered) {
    sock._anticallRegistered = true;
    sock.ev.on('call', async (calls) => {
        for (const call of calls) {
            if (call.status === 'offer') {
                const setting = getUserSettings(botNumberRaw);
                if (setting.anticall) {
                    try {
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, {
                            text: '📵 Auto-rejected. Bot cannot receive calls.'
                        });
                    } catch (e) { console.log('anticall err:', e.message); }
                }
            }
        }
    });
}

        //===================
        // BAN ENFORCEMENT
        //===================
        if (isGroup && !isCreator && !isSudo) {
            const groupBanned = bannedUsers.get(from);
            if (groupBanned && groupBanned.has(senderNumber)) {
                if (isBotAdmin) {
                    try {
                        await sock.sendMessage(from, {
                            delete: {
                                remoteJid: from,
                                id: m.key.id,
                                fromMe: false,
                                participant: sender
                            }
                        });
                    } catch {}
                }
                return;
            }
        }

        //===================
        // ANTI-SPAM ENFORCEMENT (runs on every group message)
        //===================
        if (isGroup && isBotAdmin && !isAdmin && !isSudo && !isCreator) {
            const prot = getGroupProtection(sock, from);

            // anti status spam: kick whoever keeps posting group statuses (default: 3 within 15 minutes)
            if (prot.antistatusspam && isGroupStatusMsg(m) && !m.key.fromMe) {
                const limit = Math.max(2, parseInt(prot.statusSpamLimit, 10) || 3);
                const windowMs = Math.max(1, parseInt(prot.statusSpamWindowMin, 10) || 15) * 60000;
                const trackKey = from + '|' + sender;
                const now = Date.now();
                const list = (statusSpamTrack.get(trackKey) || []).filter((x) => now - x.t < windowMs);
                if (!list.some((x) => x.id === m.key.id)) list.push({ t: now, id: m.key.id });
                statusSpamTrack.set(trackKey, list);
                if (statusSpamTrack.size > 2000) statusSpamTrack.delete(statusSpamTrack.keys().next().value);
                try { await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: m.key.id, participant: m.key.participant || sender } }); } catch {}
                if (list.length >= limit) {
                    statusSpamTrack.delete(trackKey);
                    try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
                    statusSpammers.add(spamKey(sock, senderNumber)); saveSpammers();
                    await sock.sendMessage(from, { text: `🚷 @${senderNumber} was removed for posting group status ${limit} times in a row (status spam).`, mentions: [sender] }).catch(() => {});
                    return;
                }
                if (list.length === limit - 1) {
                    await sock.sendMessage(from, { text: `⚠️ @${senderNumber} stop posting group statuses here. One more and you will be removed.`, mentions: [sender] }).catch(() => {});
                }
            }

// antilink                    
if (prot.antilink) {
    const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|www\.[^\s]+)/gi;
    const linkMatches = body.match(linkRegex);

    if (linkMatches) {
        // Check if EVERY matched link is whitelisted — if even one isn't, take action
        const whitelist = prot.linkWhitelist || [];
        const isAllAllowed = linkMatches.every(link => {
            const cleanLink = link.replace(/^https?:\/\//, '').toLowerCase();
            return whitelist.some(allowed => cleanLink.includes(allowed));
        });

        if (!isAllAllowed) {
            await doAntiAction(sock, from, sender, senderNumber, m, prot, 'antilink');
            return;
        }
    }
}
//===================
// antibadword
//===================
if (prot.antibadword && prot.badWords?.length) {
    const lowerBody = body.toLowerCase();
    const foundWord = prot.badWords.find(w => {
        // Word-boundary match — won't flag "class" for banned "ass"
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordRegex = new RegExp('\\b' + escaped + '\\b', 'i');
        return wordRegex.test(lowerBody);
    });
    if (foundWord) {
        await doAntiAction(sock, from, sender, senderNumber, m, prot, 'antibadword');
        return;
    }
}

            //===================
            // antifwd
            //===================
            if (prot.antifwd) {
                const msgVals = m.message ? Object.values(m.message) : [];
                const isFwd = !!(
                    m.msg?.contextInfo?.isForwarded ||
                    msgVals.some(v => v?.contextInfo?.isForwarded) ||
                    (m.msg?.contextInfo?.forwardingScore && m.msg.contextInfo.forwardingScore > 0)
                );
                if (isFwd) {
                    await doAntiAction(sock, from, sender, senderNumber, m, prot, 'antifwd');
                    return;
                }
            }

            //===================
            // antibot
            //===================

if (prot.antibot && from.endsWith('@g.us') && !m.key.fromMe) {
    const botPatterns = [
        /^(pong|!pong|✅\s*pong)\s*$/i,
        /^\[BOT\]/i,
        /^(✅|❌|🤖)\s*(command|cmd|usage)\s*:/i,
        /^\*?(ping|pong|alive|uptime|runtime)\*?\s*[:=]\s*\d/i,
        /^[╔╗╚╝║═┃┏┓┗┛━]{3,}/,
        /^(\[.*BOT.*\]|\{.*BOT.*\})/i,
    ];
    const isBotLike = botPatterns.some(p => p.test(body.trim()));
    if (isBotLike) {
        await doAntiAction(sock, from, sender, senderNumber, m, prot, 'antibot');
        return;
    }
}

// antigroupmention
if (prot.antigroupmention) {
    try {
        const msgKeys = m.message ? Object.keys(m.message) : [];
        const isGroupStatusMention = m.message?.protocolMessage?.type === 0 || 
                                     msgKeys.includes('groupStatusMentionMessage') ||
                                     (m.message?.messageContextInfo && 
                                      m.message?.messageContextInfo?.statusAttributionType === 4); 
       
        const isGroupStatus = msgKeys.includes('groupStatusMessageV2') || 
                              msgKeys.includes('groupStatusMessage');
        
        if (isGroupStatusMention || isGroupStatus) {
            // Delete the status mention/group status message
            try {
                await sock.sendMessage(from, {
                    delete: { remoteJid: from, fromMe: false, id: m.key.id, participant: m.key.participant }
                });
            } catch {}
            
            const gMode = prot.antigroupmention;
            if (gMode === 'warn' || gMode === 'warn/delete') {
                const gWarnCount = (prot.warnCount.get(sender) || 0) + 1;
                prot.warnCount.set(sender, gWarnCount);
                if (gWarnCount >= prot.maxWarns) {
                    prot.warnCount.delete(sender);
                    try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
                    await sock.sendMessage(from, { text: `🚫 @${senderNumber} removed after ${prot.maxWarns} warnings for group tagging.`, mentions: [sender] });
                } else {
                    await sock.sendMessage(from, { text: `⚠️ @${senderNumber} Warning ${gWarnCount}/${prot.maxWarns} — do not tag this group!`, mentions: [sender] });
                }
            } else if (gMode === 'kick' || gMode === 'delete/kick') {
                try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
                await sock.sendMessage(from, { text: `🚷 @${senderNumber} was removed for tagging this group.`, mentions: [sender] });
            } else {
                await sock.sendMessage(from, { text: `🚫 @${senderNumber} Do not tag this group from your status!`, mentions: [sender] });
            }
            return;
        }
    } catch {}
}

//anti group status
if (prot.antigroupstatus && from.endsWith('@g.us') && !m.key.fromMe) {
    const rawJson = JSON.stringify(m.message || {});
    const msgKeys2 = Object.keys(m.message || {});
    const isGroupStatus =
        // these two are the actual keys Baileys uses when a status is
        // posted so this group can see it -- the old check never looked
        // for them, which is why nothing was ever caught/deleted
        msgKeys2.includes('groupStatusMessageV2') ||
        msgKeys2.includes('groupStatusMessage') ||
        msgKeys2.includes('groupStatusMentionMessage') ||
        msgKeys2.includes('statusMentionMessage') ||
        rawJson.includes('"groupStatusMessageV2"') ||
        rawJson.includes('"groupStatusMessage"') ||
        rawJson.includes('"groupStatusMentionMessage"') ||
        rawJson.includes('"statusMentionMessage"') ||
        (m.message?.messageContextInfo?.statusAttributionType != null) ||
        (m.key?.remoteJid?.includes('@g.us') && rawJson.includes('status@broadcast'));

    if (isGroupStatus) {
        try {
            await sock.sendMessage(from, {
                delete: { remoteJid: from, fromMe: false, id: m.key.id, participant: m.key.participant }
            });
        } catch {}
        return; // silent delete
    }
}

            //===================
            // flood detector
            //===================
            if (prot.flood) {
                if (!floodTracker.has(from)) floodTracker.set(from, new Map());
                const groupFlood = floodTracker.get(from);
                const now = Date.now();
                const fd = groupFlood.get(sender) || { count: 0, start: now };
                if (now - fd.start > prot.floodInterval) {
                    fd.count = 1; fd.start = now;
                } else {
                    fd.count++;
                }
                groupFlood.set(sender, fd);
                if (fd.count >= prot.floodLimit) {
                    fd.count = 0;
                    try {
                        await sock.groupParticipantsUpdate(from, [sender], 'remove');
                        await sock.sendMessage(from, { text: `⚠️ @${senderNumber} was removed for spamming!`, mentions: [sender] });
                    } catch {}
                }
            }
        }

// 🔕 Silent VO emoji trigger
if (isDlvoEmoji(m) && m.quoted && isCreator) {
    try {
        const buffer = await m.quoted.download()
        if (!buffer) return

        const type = m.quoted.mtype

        if (type === 'imageMessage') {
            await sock.sendMessage(sender, { image: buffer })
        } else if (type === 'videoMessage') {
            await sock.sendMessage(sender, { video: buffer })
        } else if (type === 'audioMessage') {
            await sock.sendMessage(sender, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                ptt: true
            })
        }

        return // 🚫 stop everything silently
    } catch {
        return
    }
}

        //===================
        // AUTO REACT
        //===================
        if (isGroup && autoReactGroups.has(from)) {
            const reactEmoji = autoReactGroups.get(from);
            try {
                await sock.sendMessage(from, { react: { text: reactEmoji, key: m.key } });
            } catch {}
        }

        //===================
        // AUTO READ
        //===================
        if (userSetting.autoRead && m.key) {
            try { await sock.readMessages([m.key]); } catch {}
        }

        //===================
        // ALWAYS ONLINE presence
        //===================
        if (userSetting.alwaysOnline) {
            try { await sock.sendPresenceUpdate('available', from); } catch {}
        }

        //===================
        // AUTO TYPING / RECORDING (set when command is used)
        //===================
        if (isCmd && userSetting.autoTyping) {
            try { await sock.sendPresenceUpdate('composing', from); } catch {}
        }
        if (isCmd && userSetting.autoRecording) {
            try { await sock.sendPresenceUpdate('recording', from); } catch {}
        }

        //===================
        // MAINTENANCE GATE (owner can still use commands) + CUSTOM MENTION RESPONSE
        //===================
        if (isCmd && EXTRA.maintenanceBlocks(isGlobalOwner)) {
            const note = EXTRA.maintenanceNotice(botNumberRaw + '|' + senderNumberRaw);
            if (note) { try { await sock.sendMessage(from, { text: note }, { quoted: m }); } catch {} }
            return;
        }
        // Was THIS session's bot mentioned? Decided from WhatsApp's mention metadata against the identity of the active
        // socket (phone JID + LID) — never from a display name.
        let botMentioned = false;
        if (isGroup && !isCmd) { try { botMentioned = await BOTID.mentionsBot(m, sock, from); } catch (e) { console.log('[mention detect]', e.message); } }
        let mentionHandled = false;   // true => the per-bot mention response owns this message; the chatbot must not also answer
        if (!isCmd && isGroup) {
            try {
                mentionHandled = await MENTION.maybeRespond({
                    sock, m, from, isGroup, isCmd, body, botNumberRaw, userSetting, botMentioned,
                    chatbotEnabled: !!userSetting.chatbotEnabled
                });
            } catch (e) { console.log('[mention response]', e.message); }
        }

        //===================
        // CHATBOT AUTO-RESPONSE
        //===================
        // Group chatbot (userSetting.chatbotEnabled) and private chatbot (userSetting.chatbotPrivate) are independent,
        // per-bot settings. Triggers:
        //   group  : THIS bot's real identity is @mentioned, OR the message replies to a message the chatbot itself sent
        //   private: any direct message (never the owner's own outgoing messages)
        // Anything else in a group is ignored.
        if (!isCmd && (userSetting.chatbotEnabled || userSetting.chatbotPrivate) && !mentionHandled) {
            const isDm = !isGroup && !String(from).endsWith('@broadcast') && !String(from).endsWith('@newsletter');
            const dmMode = isDm && !!userSetting.chatbotPrivate && !(m.key && m.key.fromMe);
            const groupMode = isGroup && !!userSetting.chatbotEnabled && (botMentioned || BOTID.isReplyToChatbotMessage(m, sock));
            if ((dmMode || groupMode) && body && body.trim().length > 0) {
                try {
                    // Per-session, per-user, per-chat history — bounded and isolated in michiko.js
                    const histKey = botNumberRaw + '|' + sender + '|' + from;
                    const hist = getMichikoHistory(histKey);

                    // Clean @mentions from body. A bare tag still gets a natural answer.
                    const cleanMsg = body.replace(/@\d+/g, '').trim();
                    const prompt = cleanMsg || '(they only tagged you without a message: greet them naturally in one short line)';

                    // Chat only (no downloader / web-search tools), same persona + brain as the "michiko ..." trigger.
                    const reply = await getMichikoReply(config, hist, prompt, {
                        enableTools: false,
                        rateLimitKey: histKey
                    });

                    if (reply) {
                        hist.push({ role: 'user', content: prompt });
                        hist.push({ role: 'assistant', content: reply });
                        if (hist.length > 10) hist.splice(0, hist.length - 10);
                        const sentCb = await sock.sendMessage(from, { text: reply }, { quoted: m });
                        BOTID.recordChatbotMessage(sock, sentCb && sentCb.key && sentCb.key.id);   // so a reply to THIS message continues the chat
                    }
                } catch (e) { console.log('chatbot error:', e.message); }
            }
        }

        // Check private mode
        // In private mode: only creator, sudo can use bot — BUT group admins can still use admin commands
        if (mode === 'private' && !isSudo && !isCreator) return;
        
//===================
// ANTI ACTION SELECTION HANDLER
//===================
if (!isCmd && pendingAntiAction.has(sender + from)) {
    const pa = pendingAntiAction.get(sender + from);
    const choice = body.trim();
    if (['1','2','3'].includes(choice)) {
        pendingAntiAction.delete(sender + from);
        const prot = getGroupProtection(sock, from);
        const modeMap = { '1': 'delete', '2': 'warn/delete', '3': 'delete/kick' };
        const modeLabel = { '1': 'Delete only', '2': 'Warn & Delete', '3': 'Delete & Kick' };
        prot[pa.feature] = modeMap[choice];
        saveProtection();
        await Shefzyreply(`✅ *${pa.feature}* activated!\n\n⚙️ Mode: *${modeLabel[choice]}*`);
        return;
    }
}       
        
        
        //===================
        // PENDING ADDCASE HANDLER
        //===================
        if (!isCmd && global._pendingAddcase && global._pendingAddcase.waiter === sender) {
            const paCmd = global._pendingAddcase.cmd;
            global._pendingAddcase = null;
            const DEV_NUM2 = String(config.devNumber || config.botOwner || '').replace(/[^0-9]/g,'');
            if (senderNumber === DEV_NUM2) {
                try {
                    const fcPa = await fsPromises.readFile(__filename, 'utf-8');
                    if (fcPa.includes("case '" + paCmd + "':")) {
                        return await Shefzyreply('❌ Case *' + paCmd + '* already exists!');
                    }
                    const injection = "\n            case '" + paCmd + "': {\n                " + body + "\n                break;\n            }\n";
                    const insertAt2 = fcPa.lastIndexOf("            default:");
                    const newFilePa = fcPa.slice(0, insertAt2) + injection + fcPa.slice(insertAt2);
                    fs.writeFileSync(__filename, newFilePa);
                    await Shefzyreply('✅ Case *' + paCmd + '* added! Restart bot to activate.');
                } catch (e) { await Shefzyreply('❌ AddCase failed: ' + e.message); }
                return;
            }
        }

        //===================
        // ADD CONFIRMATION HANDLER
        //===================
        if (!isCmd && pendingAdd.has(sender)) {
            const lowerBody = body.trim().toLowerCase();
            if (lowerBody === 'yes' || lowerBody === 'y') {
                const addData = pendingAdd.get(sender);
                pendingAdd.delete(sender);
                try {
                    await sock.groupParticipantsUpdate(addData.groupJid, [addData.targetJid], 'add');
                    await sock.sendMessage(from, { text: `✅ @${addData.targetJid.split('@')[0]} has been added to the group!`, mentions: [addData.targetJid] }, { quoted: m });
                } catch (e) {
                    await sock.sendMessage(from, { text: `❌ Failed to add ${addData.targetJid.split('@')[0]}! They may have privacy settings blocking adds.` }, { quoted: m });
                }
            } else if (lowerBody === 'no' || lowerBody === 'n') {
                pendingAdd.delete(sender);
                await Shefzyreply('❌ Add cancelled.');
            }
            return;
        }


if (!isCmd && m.mtype === 'stickerMessage') {
    try {
        const crypto = require('crypto');
        const stkBuf = await m.download();
        const stkHash = crypto.createHash('sha256').update(stkBuf).digest('hex').slice(0, 16);
        const botStkCmds = getStickerCmds(botNumberRaw);
        if (botStkCmds.has(stkHash)) {
            const stkCmd = botStkCmds.get(stkHash);
            command = stkCmd.cmd;
            isCmd = true;
            args = [];
            text = '';
        }
    } catch {}
}

const wcgHandled = await handleWCG(sock, m, body, command, args, isCmd, from, sender, pushname, prefix, Shefzyreply);
if (wcgHandled) return;

        if (isMichikoTrigger(body)) {
            await handleMichiko(sock, m, body, config);
            return;
        }
        

 
        // check for prefix 🫩
        if (!isCmd) return;
        

        
        function resolveTarget(fallbackArg) {
            
            if (m.quoted?.sender) {
                const s = m.quoted.sender;
                return s.includes('@') ? s : s + '@s.whatsapp.net';
            }

            const mentionList = m.msg?.contextInfo?.mentionedJid || [];
            if (Array.isArray(mentionList) && mentionList.length > 0) {
                return mentionList[0];
            }
          
            if (fallbackArg) {
                const num = String(fallbackArg).replace(/[^0-9]/g, '');
                if (num) return num + '@s.whatsapp.net';
            }
            return null;
        }
        //===================
        // COMMANDS
        //===================
        switch(command) {
case 'pair':
case 'pairguide':
case 'connect': {
    const pairText = `╭━━━━━━━━━━━━━━━━━━━━━━━━⬣
┃ 🔗 *MICHIKO MD — PAIRING GUIDE*
┃
┃ Choose your preferred pairing method:
┃
┃ 🌐 *Web Pair (Browser)*
┃ ┗ https://michikopair.vercel.app/
┃
┃ 🤖 *Telegram Pair Bot*
┃ ┗ http://t.me/Michiko3bot
┃
┃ ━━━━━━━━━━━━━━━━━━━━━━━
┃ 📖 *How to pair:*
┃ 1️⃣ Visit any link above
┃ 2️⃣ Enter your number with country code
┃ 3️⃣ Get your pairing code
┃ 4️⃣ Open WhatsApp → Settings
┃    → Linked Devices → Link a Device
┃ 5️⃣ Tap *"Link with phone number"*
┃    and enter the code ✅
┃
┃ ⚠️ *Note:* Use responsibly.
┃ Michiko MD is not affiliated
┃ with Meta or WhatsApp LLC.
╰━━━━━━━━━━━━━━━━━━━━━━━━⬣`;
    await Shefzyreply(pairText);
    break;
}

case 'repo':
case 'source':
case 'github': {
    const repoText = `╭━━━━━━━━━━━━━━━━━━━━━━━━⬣
┃ 🗂️ *MICHIKO MD — SOURCE CODE*
┃
┃ 📦 *Repository:*
┃ github.com/shefzy-tech/michiko-md
┃
┃ 🌟 Star the repo if you enjoy using
┃ Michiko MD — it helps a lot!
┃
┃ 👨‍💻 *Developer:* Mr Shefzy
┃ 🏷️ *Brand:* ShefzyTech
┃ 📌 *Version:* v3.0.0
┃
┃ ${config.productBrand}
╰━━━━━━━━━━━━━━━━━━━━━━━━⬣`;
    await Shefzyreply(repoText);
    break;
}

case 'listactive':
case 'activetoday':
case 'la': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');

    const key = scopedKey(sock, from);
    const today = getTodayDateStr();
    const entry = activeMembersTracker.get(key);

    if (!entry || entry.date !== today || entry.counts.size === 0) {
        return Shefzyreply('📊 No active members recorded yet today.');
    }

    const sorted = Array.from(entry.counts.entries()).sort((a, b) => b[1] - a[1]);

    let listText = `📊 *Active Members Today*\n📅 ${today}\n👥 ${sorted.length} active member(s)\n\n`;
    const mentions = [];
    sorted.forEach(([jid, count], i) => {
        listText += `${i + 1}. @${jid.split('@')[0]} — ${count} message${count !== 1 ? 's' : ''}\n`;
        mentions.push(jid);
    });

    await sock.sendMessage(from, { text: listText, mentions }, { quoted: m });
    break;
}

case 'mtag': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo');
    if (!m.isGroup) return m.reply('❌ This command works in groups only.');

    // 2. Parse args
    const amount  = parseInt(args[0], 10);
    const content = args.slice(1).join(' ').trim();

    if (!amount || amount < 1) {
        return m.reply('❌ Usage: .mtag <amount> <content>\nExample: .mtag 5 Hello everyone!');
    }
    if (amount > 50) {
        return m.reply('❌ Maximum 50 messages per command (to avoid WhatsApp rate-limits).');
    }
    if (!content) {
        return m.reply('❌ Please provide the content to send.');
    }

    try {
        // 3. Fetch all group member JIDs
        const groupMetadata = await sock.groupMetadata(m.from);
        const participants  = groupMetadata.participants || [];
        const mentionJids   = participants.map(p => p.id).filter(Boolean);

        if (!mentionJids.length) {
            return m.reply('❌ No members found in this group.');
        }

        // 4. Fire all messages in parallel — fast, no delays
        const sends = [];
        for (let i = 0; i < amount; i++) {
            sends.push(
                sock.sendMessage(
                    m.from,
                    {
                        text: content,
                        mentions: mentionJids   // invisible mentions
                    }
                )
            );
        }
        await Promise.all(sends);

        // 5. (Optional) confirmation — silently skipped to avoid extra noise
        // If you want a confirmation, uncomment the next line:
        // await m.reply(`✅ Sent *${amount}* message(s) tagging ${mentionJids.length} members.`);

    } catch (e) {
        console.error('[mtag]', e);
        m.reply(`❌ Failed: ${e.message}`);
    }
    break;
}

// movie /film  
 case 'menu': {
    const menuText = `
╭✰ ${userSetting.botName}
┃ 📱 Version: ${config.botVersion}
┃ 👑 Owner: ${config.botOwner}
┃ 👤 User: ${pushname}
┃ 🤖 Bot: ${botNumberRaw}
┃ ⏰ Runtime: ${formatRuntime(process.uptime())}
┃ 🔧 Mode: ${mode.toUpperCase()}
┃ 📝 Prefix: ${prefix}
┃ 👥 Status: ${isGroup ? 'Group: ' + groupName : 'Private Chat'}
┃ 🖥️ Host: ${config.hostName || 'Pterodactyl'}
┃ 💻 Platform: ${process.platform}
┃ 🏷️ ${config.productBrand}
╰✰

▶ᴛʏᴘᴇ ᴍᴇɴᴜ2 ғᴏʀ sʜᴏʀᴛᴇʀ ᴍᴇɴᴜ ʟɪsᴛ

【 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒 】

╭✰ ⟬ 𝐌𝐄𝐃𝐈𝐀 ⟭
│ ${prefix}sticker
│ ${prefix}stickervid
│ ${prefix}toimage
│ ${prefix}tovideo
│ ${prefix}toaudio
│ ${prefix}tovoice
│ ${prefix}tourl
│ ${prefix}togif
│ ${prefix}todoc <filename>
│ ${prefix}toview
│ ${prefix}toviewonce
│ ${prefix}vv
│ ${prefix}vv2
│ ${prefix}take <packname>
│ ${prefix}mediatag
│ ${prefix}removebg
│ ${prefix}imgtext
│ ${prefix}ocr
│ ${prefix}wm
│ ${prefix}sub
│ ${prefix}subtitle
│ ${prefix}mtovideo
│ ${prefix}couplepp
│ ${prefix}steal
│ ${prefix}del
│ ${prefix}delete
│ ${prefix}forward <jid>
│ ${prefix}volaudio <vol>
│ ${prefix}volvideo <vol>
╰✰

╭✰ ⟬ 𝐒𝐓𝐈𝐂𝐊𝐄𝐑 𝐓𝐎𝐎𝐋𝐒 ⟭
│ ${prefix}stickerinfo
│ ${prefix}txtsticker
│ ${prefix}tgsticker <t.me/addstickers/link>
│ ${prefix}album
╰✰

╭✰ ⟬ 𝐎𝐖𝐍𝐄𝐑 ⟭
│ ${prefix}owner
│ ${prefix}ping
│ ${prefix}runtime
│ ${prefix}profile
│ ${prefix}support
│ ${prefix}feedback
│ ${prefix}alive
│ ${prefix}setalive <text>
│ ${prefix}setsudo @user
│ ${prefix}delsudo @user
│ ${prefix}listsudo
│ ${prefix}block <num>
│ ${prefix}unblock <num>
│ ${prefix}listblocked
│ ${prefix}setpp (reply image)
│ ${prefix}delpp
│ ${prefix}setppname <text>
│ ${prefix}setbio <text>
│ ${prefix}getpp
│ ${prefix}getname
│ ${prefix}pinchat
│ ${prefix}unpinchat
│ ${prefix}join <link>
│ ${prefix}joinch <link>
│ ${prefix}leave
│ ${prefix}broadcast <text>
│ ${prefix}broadcast2 <234> <text>
│ ${prefix}save (reply media)
│ ${prefix}sendgclink <num>
│ ${prefix}reactch <link> <emoji>
│ ${prefix}idch
│ ${prefix}checkidch
│ ${prefix}autotyping
│ ${prefix}autorecording
│ ${prefix}autoread
│ ${prefix}autoviewstatus on/off
│ ${prefix}alwaysonline
│ ${prefix}autoreact
│ ${prefix}anticall on/off
│ ${prefix}listgc
│ ${prefix}totalcmd
│ ${prefix}totalmembers
│ ${prefix}membercount
│ ${prefix}mblock
│ ${prefix}mbsearch
╰✰

╭✰ ⟬ 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 ⟭
│ ${prefix}setprefix <sym>
│ ${prefix}public
│ ${prefix}private
│ ${prefix}setname <name>
│ ${prefix}setowner <num>
│ ${prefix}setmenuimage <url>
│ ${prefix}setwelcome on/off/reset
│ ${prefix}setgoodbye on/off/reset
│ ${prefix}modstatus
│ ${prefix}modsettings
╰✰

╭✰ ⟬ 𝐒𝐓𝐀𝐓𝐔𝐒 ⟭
│ ${prefix}togcstatus
│ ${prefix}totgstatus2 / poststatus
│ ${prefix}mstatus /groupstatus
╰✰


╭✰ ⟬ 𝐆𝐑𝐎𝐔𝐏 ⟭
│ ${prefix}kick @user
│ ${prefix}add <num>
│ ${prefix}promote @user
│ ${prefix}demote @user
│ ${prefix}promoteall
│ ${prefix}demoteall
│ ${prefix}demotealladmins
│ ${prefix}kickall
│ ${prefix}findfriends
│ ${prefix}ban @user
│ ${prefix}unban @user
│ ${prefix}listban
│ ${prefix}warn @user
│ ${prefix}unwarn @user
│ ${prefix}listwarn
│ ${prefix}resetwarns @user
│ ${prefix}autolink (any url)
│ ${prefix}mtag
│ ${prefix}tagall
│ ${prefix}hidetag <text>
│ ${prefix}tagadmins
│ ${prefix}announce <text>
│ ${prefix}open
│ ${prefix}close
│ ${prefix}opentime
│ ${prefix}closetime
│ ${prefix}setgcname <name>
│ ${prefix}setgcdesc <text>
│ ${prefix}setgcpp (reply image)
│ ${prefix}delgcpp
│ ${prefix}getlink
│ ${prefix}revoke
│ ${prefix}acceptall
│ ${prefix}rejectall
│ ${prefix}gcinfo
│ ${prefix}mention set <text|emoji|sticker>
│ ${prefix}mention off
│ ${prefix}grouptag <tag|off>
│ ${prefix}groupid
│ ${prefix}listmembers
│ ${prefix}admins
│ ${prefix}pin
│ ${prefix}unpin
│ ${prefix}poll <q>|<o1>|<o2>
│ ${prefix}creategc <name>
│ ${prefix}left
│ ${prefix}find
│ ${prefix}listactive
╰✰

╭✰ ⟬ 𝐆𝐑𝐎𝐔𝐏 𝐌𝐀𝐍𝐀𝐆𝐄𝐌𝐄𝐍𝐓 ⟭
│ ${prefix}mute-gc <dur>
│ ${prefix}unmute-gc
│ ${prefix}announcement <text>
│ ${prefix}report @user
│ ${prefix}event Title | DD/MM/YYYY | HH:MM
│ ${prefix}eventinfo (reply)
│ ${prefix}online @user
│ ${prefix}contact <num> [name]
╰✰

╭✰ ⟬ 𝐏𝐑𝐎𝐓𝐄𝐂𝐓𝐈𝐎𝐍 ⟭
│ ${prefix}antilink on/off/warn/kick/reset
│ ${prefix}antifwd on/off/warn/kick
│ ${prefix}antibot on/off/warn/kick
│ ${prefix}antigroupmention on/off/warn/kick
│ ${prefix}antispam on/off/warn/kick
│ ${prefix}antitag on/off/warn/kick
│ ${prefix}antibadword on/off
│ ${prefix}antibadwords add <word>
│ ${prefix}antipromote on/off
│ ${prefix}antidemote on/off
│ ${prefix}flood on/off
│ ${prefix}antidelete on/off/warn/kick
│ ${prefix}antigroupstatus on/off/warn/kick
│ ${prefix}antistatusspam on/off
╰✰

╭✰ ⟬ 𝐈𝐍𝐓𝐄𝐑𝐀𝐂𝐓𝐈𝐕𝐄 ⟭
│ ${prefix}button <q> | <b1> | <b2>
│ ${prefix}list <title> <desc> <opt...>
│ ${prefix}edit <text> (reply bot)
│ ${prefix}keep (reply)
│ ${prefix}fwdviewonce <jid>
│ ${prefix}reactto <emoji> (reply)
│ ${prefix}pollresults (reply)
╰✰

╭✰ ⟬ 𝐈𝐌𝐀𝐆𝐄 𝐏𝐑𝐎𝐂𝐄𝐒𝐒𝐈𝐍𝐆 ⟭
│ ${prefix}mich-meme top | bottom (reply)
│ ${prefix}quoteimg <text> | <author>
│ ${prefix}crop <wxh> (reply)
│ ${prefix}resize <50%> or <200x200>
│ ${prefix}filter greyscale|sepia|blur
│ ${prefix}wanted (reply image)
│ ${prefix}wasted (reply image)
│ ${prefix}jail (reply image)
│ ${prefix}invert (reply image)
│ ${prefix}rainbow (reply image)
│ ${prefix}hd / enhance (reply image)
│ ${prefix}carbon <code>
│ ${prefix}brat <text>
╰✰

╭✰ ⟬ 𝐔𝐓𝐈𝐋𝐈𝐓𝐘 ⟭
│ ${prefix}say <text>
│ ${prefix}translate <lang> <text>
│ ${prefix}tr <lang> <text>
│ ${prefix}style <text>
│ ${prefix}fancy <text>
│ ${prefix}readmore <text>
│ ${prefix}calc <expr>
│ ${prefix}timezone <city>
│ ${prefix}botinfo
│ ${prefix}sessioninfo
│ ${prefix}status
│ ${prefix}calculator <expr>
│ ${prefix}morse <text>
│ ${prefix}morsecode <text>
│ ${prefix}ssweb <url>
│ ${prefix}screenshot <url>
│ ${prefix}imgur (reply)
│ ${prefix}get <url>
│ ${prefix}checkweb <url>
│ ${prefix}urlinfo <url>
│ ${prefix}linkinfo <url>
│ ${prefix}passcheck <pwd>
│ ${prefix}passwordcheck <pwd>
│ ${prefix}getdevice
│ ${prefix}archive
│ ${prefix}unarchive
│ ${prefix}setcmd
│ ${prefix}delcmd
│ ${prefix}listcmd
│ ${prefix}tts <text>
│ ${prefix}speak <text>
│ ${prefix}whois @user
│ ${prefix}app
│ ${prefix}dl <url>
│ ${prefix}flip
│ ${prefix}reset
│ ${prefix}top
│ ${prefix}scores
│ ${prefix}pay @user <amt>
│ ${prefix}bet <amt>
│ ${prefix}rch <link>
│ ${prefix}img <q>
│ ${prefix}describe <url>
│ ${prefix}qrcode <text>
│ ${prefix}readqr (reply image)
│ ${prefix}shorturl <url>
│ ${prefix}pdftotext (reply pdf)
│ ${prefix}advice
│ ${prefix}colorinfo <hex>
│ ${prefix}genderpredict <name>
│ ${prefix}zipcode <zip> <country>
│ ${prefix}aidetect <text>
│ ${prefix}forecast <city>
╰✰

╭✰ ⟬ 𝐒𝐄𝐀𝐑𝐂𝐇 ⟭
│ ${prefix}google <q>
│ ${prefix}gsearch <q>
│ ${prefix}wiki <q>
│ ${prefix}wikipedia <q>
│ ${prefix}npmsearch <pkg>
│ ${prefix}npmstalk <pkg>
│ ${prefix}pinterest <q>
│ ${prefix}pixabay <q>
│ ${prefix}gimage <q>
│ ${prefix}dictionary <word>
│ ${prefix}define <word>
│ ${prefix}moviesearch <title>
│ ${prefix}movieinfo <title>
│ ${prefix}imdb <title>
│ ${prefix}moviedb <title>
│ ${prefix}recipe <dish>
│ ${prefix}weather <city>
│ ${prefix}wth <city>
│ ${prefix}wx <city>
│ ${prefix}ipinfo <ip>
│ ${prefix}track-ip <ip>
│ ${prefix}myip
│ ${prefix}bible <ref>
│ ${prefix}quran <ref>
│ ${prefix}element <name>
│ ${prefix}shazam
│ ${prefix}horoscope <sign>
│ ${prefix}tiktokstalk <user>
│ ${prefix}igstalk <user>
│ ${prefix}ytstalk <user>
│ ${prefix}fbstalk <user>
│ ${prefix}twstalk <user>
│ ${prefix}wastalk <num>
│ ${prefix}inspiration
│ ${prefix}nasaphoto
│ ${prefix}apod
│ ${prefix}news <topic>
│ ${prefix}randomfact
│ ${prefix}rfact
│ ${prefix}mfact
│ ${prefix}numberfact <n>
│ ${prefix}asteroid
│ ${prefix}waifu
│ ${prefix}ero
│ ${prefix}artwork <query>
│ ${prefix}musicinfo <artist>
│ ${prefix}michsearch <title>
│ ${prefix}wallpaper <query>
│ ${prefix}xnxx
╰✰

╭✰ ⟬ 𝐅𝐔𝐍 & 𝐒𝐎𝐂𝐈𝐀𝐋 ⟭
│ ${prefix}truth
│ ${prefix}dare
│ ${prefix}wyr
│ ${prefix}wouldyou
│ ${prefix}ship @u1 @u2
│ ${prefix}riddle
│ ${prefix}pickupline
│ ${prefix}rizz
│ ${prefix}insult
│ ${prefix}simi <msg>
│ ${prefix}catfact
│ ${prefix}catpic
│ ${prefix}dogpic
│ ${prefix}emojimix 😎+🥰
│ ${prefix}emix 😎+🥰
│ ${prefix}meme
│ ${prefix}joke
│ ${prefix}jokeplus <category>
│ ${prefix}dadjoke
│ ${prefix}chucknorris <category>
│ ${prefix}breakingbad
│ ${prefix}fact
│ ${prefix}quote
│ ${prefix}numbergame
│ ${prefix}nsfwgen <prompt>
│ ${prefix}text2nsfw <prompt>
│ ${prefix}8ball
│ ${prefix}fortune
│ ${prefix}tarot
│ ${prefix}battle @user
╰✰

╭✰ ⟬ 𝐄𝐂𝐎𝐍𝐎𝐌𝐘 ⟭
│ ${prefix}economy on/off
│ ${prefix}bal
│ ${prefix}balance
│ ${prefix}wallet
│ ${prefix}daily
│ ${prefix}work
│ ${prefix}deposit <amt>
│ ${prefix}withdraw <amt>
│ ${prefix}give @user <amt>
│ ${prefix}rob @user
│ ${prefix}gamble <amt>
│ ${prefix}lb
│ ${prefix}leaderboard
│ ${prefix}shop
│ ${prefix}buy <item>
│ ${prefix}inv
│ ${prefix}inventory
│ ${prefix}steal
│ ${prefix}crime
│ ${prefix}hunt
│ ${prefix}fish
│ ${prefix}mine
│ ${prefix}level
│ ${prefix}ecoinfo
│ ${prefix}bail
╰✰

╭✰ ⟬ 𝐀𝐍𝐈𝐌𝐄 & 𝐆𝐈𝐅 ⟭
│ ${prefix}animenews
│ ${prefix}animewlp
│ ${prefix}animewallpaper
│ ${prefix}animechar <name>
│ ${prefix}animerec <title>
│ ${prefix}animesearch <title>
│ ${prefix}animequote <name>
│ ${prefix}digimon <name>
│ ${prefix}hug
│ ${prefix}kiss
│ ${prefix}kill
│ ${prefix}slap
│ ${prefix}pat
│ ${prefix}lick
│ ${prefix}bite
│ ${prefix}yeet
│ ${prefix}bully
│ ${prefix}bonk
│ ${prefix}wink
│ ${prefix}poke
│ ${prefix}nom
│ ${prefix}smile
│ ${prefix}wave
│ ${prefix}blush
│ ${prefix}dance
│ ${prefix}cry
│ ${prefix}happy
│ ${prefix}laugh
│ ${prefix}angry
│ ${prefix}cuddle
│ ${prefix}highfive
│ ${prefix}shoot
│ ${prefix}sleep
│ ${prefix}awoo
│ ${prefix}smug
│ ${prefix}glomp
│ ${prefix}cringe
│ ${prefix}handhold
│ ${prefix}shinobu
│ ${prefix}fox
│ ${prefix}koala
│ ${prefix}bird
│ ${prefix}panda
│ ${prefix}dog
│ ${prefix}cat
╰✰

╭✰ ⟬ 𝐄𝐏𝐇𝐎𝐓𝐎 𝐄𝐅𝐅𝐄𝐂𝐓𝐒 ⟭
│ ${prefix}ephotolist
│ ${prefix}ephotostyles
│ ${prefix}glitchtext <text>
│ ${prefix}cyberpunk <text>
│ ${prefix}neonmetal <text>
│ ${prefix}gaminglogo <text>
│ ${prefix}graffiti <text>
│ ${prefix}sandwriting <text>
│ ${prefix}galaxy <text>
│ ${prefix}rainbow <text>
│ ${prefix}matrix <text>
│ ${prefix}watercolor <text>
│ ${prefix}neonlight <text>
│ ${prefix}glitch2 <text>
│ ${prefix}chalkboard <text>
│ ${prefix}3dstone <text>
│ ${prefix}3dgold <text>
│ ${prefix}goldflag <text>
│ ${prefix}smoke <text>
│ ${prefix}ice <text>
│ ${prefix}underwater <text>
│ ${prefix}vaporwave <text>
│ ${prefix}color <hex>
│ ${prefix}currency <amt> <from> <to>
╰✰

╭✰ ⟬ 𝐀𝐈 ⟭
│ ${prefix}ask <q>
│ ${prefix}ai <q>
│ ${prefix}gpt <q>
│ ${prefix}codeai <desc>
│ ${prefix}codegen <desc>
│ ${prefix}imagine <prompt>
│ ${prefix}imagine-ai <prompt>
│ ${prefix}imagine2 <prompt>
│ ${prefix}sdimage <prompt>
│ ${prefix}aiimage <prompt>
│ ${prefix}aiimage2 <prompt>
│ ${prefix}aigenimage <prompt>
│ ${prefix}flux <prompt>
│ ${prefix}fluxxmd <prompt>
│ ${prefix}pollinations <prompt>
│ ${prefix}genimage <prompt>
│ ${prefix}nanobananapro <prompt>
│ ${prefix}gen <prompt>
│ ${prefix}generate <prompt>
│ ${prefix}gemini-vision <url>
│ ${prefix}chatbot on/off
│ ${prefix}chatbot private on/off
│ ${prefix}chatbot clear
│ ${prefix}summarize <text|reply> (also ${prefix}summary, ${prefix}tldr)
│ ${prefix}rewrite <text|reply>
│ ${prefix}explain <text|reply>
╰✰

╭✰ ⟬ 𝐀𝐔𝐃𝐈𝐎 𝐄𝐅𝐅𝐄𝐂𝐓𝐒 ⟭
│ ${prefix}bass
│ ${prefix}blown
│ ${prefix}deep
│ ${prefix}robot
│ ${prefix}tiny
│ ${prefix}chipmunk
│ ${prefix}slowed
│ ${prefix}reverb
│ ${prefix}nightcore
│ ${prefix}earrape
│ ${prefix}echo
│ ${prefix}underwater
│ ${prefix}telephone
│ ${prefix}reverse
│ ${prefix}vaporwave
╰✰

╭✰ ⟬ 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 ⟭
│ ${prefix}play <song>
│ ${prefix}song <name>
│ ${prefix}sing <name>
│ ${prefix}music <name>
│ ${prefix}sonu <prompt>
│ ${prefix}scdlsearch <song>
│ ${prefix}gitclone <url>
│ ${prefix}pinterestdl <url>
│ ${prefix}ytmp3 <link>
│ ${prefix}ytmp4 <link>
│ ${prefix}ytaudio <link>
│ ${prefix}ytvideo <link>
│ ${prefix}ytsearch <q>
│ ${prefix}tiktok <link>
│ ${prefix}tt <link>
│ ${prefix}tiktokmp3 <link>
│ ${prefix}tiktokimg <link>
│ ${prefix}ttsearch <q>
│ ${prefix}ig <link>
│ ${prefix}igdl <link>
│ ${prefix}fbdl <link>
│ ${prefix}scdl <link>
│ ${prefix}soundcloud <link>
│ ${prefix}tw <link>
│ ${prefix}dlall <url>
│ ${prefix}downloadall <url>
│ ${prefix}apk <app>
│ ${prefix}apkdl <app>
│ ${prefix}apkdownload <app>
│ ${prefix}mediafire <link>
│ ${prefix}mfdl <link>
│ ${prefix}pintdl <link>
│ ${prefix}gdrive <link>
│ ${prefix}spotifysearch <song>
│ ${prefix}spsearch <song>
│ ${prefix}spotifydl <id>
│ ${prefix}lyrics <song>
│ ${prefix}lyric <song>
│ ${prefix}lyric2 <song>
│ ${prefix}film <title>
│ ${prefix}movie <title>
│ ${prefix}movie2 <title>
│ ${prefix}movie2detail <url>
│ ${prefix}moviebox <title>
│ ${prefix}moviedetail <url>
│ ${prefix}movie-dl <url>
│ ${prefix}cinesubz <title>
│ ${prefix}video <q>
│ ${prefix}moviedl <title>
│ ${prefix}seriesdl <title> <s> <ep>
│ ${prefix}michsearch <title>
│ ${prefix}trending
╰✰

╭✰ ⟬ 𝐒𝐏𝐎𝐑𝐓𝐒 ⟭
│ ${prefix}livescore
│ ${prefix}scores
│ ${prefix}fixtures <league>
│ ${prefix}schedule <league>
│ ${prefix}sportnews <topic>
│ ${prefix}standings <league>
│ ${prefix}table <league>
│ ${prefix}team <name>
│ ${prefix}player <name>
│ ${prefix}league <name>
│ ${prefix}h2h <team1> vs <team2>
│ ${prefix}sporttrivia
│ ${prefix}sportanswer <answer>
│ ${prefix}transfers
│ ${prefix}transfernews
│ ${prefix}sportstats <team>
│ ${prefix}f1
│ ${prefix}nhl
╰✰

╭✰ ⟬ 𝐅𝐔𝐍 𝐅𝐀𝐂𝐓𝐒 & 𝐈𝐍𝐅𝐎 ⟭
│ ${prefix}cocktail <name>
│ ${prefix}makeup <brand>
│ ${prefix}disney <character>
│ ${prefix}remotejobs <skill>
│ ${prefix}chucknorris <category>
│ ${prefix}asteroid
│ ${prefix}artwork <query>
│ ${prefix}nasaphoto
╰✰

╭✰ ⟬ 𝐆𝐀𝐌𝐄𝐒 ⟭
│ ${prefix}games
│ ${prefix}gamelist
│ ${prefix}tictactoe @user
│ ${prefix}ttt @user
│ ${prefix}tttmove <1-9>
│ ${prefix}numguess
│ ${prefix}numbergame
│ ${prefix}guess <num>
│ ${prefix}rps rock/paper/scissors
│ ${prefix}trivia
│ ${prefix}answer a/b/c/d
│ ${prefix}scramble
│ ${prefix}unscramble <word>
│ ${prefix}hangman
│ ${prefix}hmguess <letter>
│ ${prefix}mathquiz
│ ${prefix}mathans <num>
│ ${prefix}dice
│ ${prefix}coinflip
│ ${prefix}wouldyou
│ ${prefix}wyr
│ ${prefix}wordchain
│ ${prefix}wcg
│ ${prefix}emojiquiz
│ ${prefix}eqanswer <guess>
│ ${prefix}sporttrivia
│ ${prefix}sportanswer <answer>
│ ${prefix}endgame
│ ${prefix}tetris
│ ${prefix}2048
│ ${prefix}flappy
│ ${prefix}xo
│ ${prefix}simon
│ ${prefix}snake
│ ${prefix}breakout
│ ${prefix}pong
│ ${prefix}whack
│ ${prefix}invaders
│ ${prefix}memory
│ ${prefix}minesweeper
│ ${prefix}hangmangame
│ ${prefix}connect4
│ ${prefix}reaction
│ ${prefix}bubblepop
│ ${prefix}wordle
│ ${prefix}wordsearch
│ ${prefix}rpsgame
│ ${prefix}checkers
│ ${prefix}stacktower
│ ${prefix}sudoku
│ ${prefix}fruitslicer
│ ${prefix}archery
│ ${prefix}airhockey
│ ${prefix}chess
│ ${prefix}ludo
╰✰
> © Powered by ShefzyTech`;
    if (userSetting.menuImage) {
        try {
            const imageBuffer = await axios.get(userSetting.menuImage, { responseType: 'arraybuffer' });
            await sock.sendMessage(from, { image: imageBuffer.data, caption: menuText }, { quoted: m });
        } catch (err) {
            await sock.sendMessage(from, { text: menuText }, { quoted: m });
        }
    } else {
        await sock.sendMessage(from, { text: menuText }, { quoted: m });
    }
    break;
}      
        
case 'menu2': {
    const menuText = `
╭✰ ${userSetting.botName}
┃ 📱 Version: ${config.botVersion}
┃ 👑 Owner: ${config.botOwner}
┃ 👤 User: ${pushname}
┃ 🤖 Bot: ${botNumberRaw}
┃ ⏰ Runtime: ${formatRuntime(process.uptime())}
┃ 🔧 Mode: ${mode.toUpperCase()}
┃ 📝 Prefix: ${prefix}
┃ 👥 Status: ${isGroup ? 'Group: ' + groupName : 'Private Chat'}
┃ 🖥️ Host: ${config.hostName || 'Pterodactyl'}
┃ 💻 Platform: ${process.platform}
┃ 🏷️ ${config.productBrand}
╰✰

【 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒 】

│ ${prefix}mediamenu 
│ ${prefix}stickermenu 
│ ${prefix}ownermenu 
│ ${prefix}settingsmenu 
│ ${prefix}statusmenu 
│ ${prefix}groupmenu
│ ${prefix}interactivemenu
│ ${prefix}imagemenu
│ ${prefix}utilitymenu
│ ${prefix}searchmenu 
│ ${prefix}funmenu
│ ${prefix}economymenu
│ ${prefix}animemenu
│ ${prefix}effectsmenu 
│ ${prefix}aimenu 
│ ${prefix}audiomenu 
│ ${prefix}downloadmenu
│ ${prefix}sportsmenu 
│ ${prefix}gamemenu

> ${config.productBrand}`;
    if (userSetting.menuImage) {
        try {
            const imageBuffer = await axios.get(userSetting.menuImage, { responseType: 'arraybuffer' });
            await sock.sendMessage(from, { image: imageBuffer.data, caption: menuText }, { quoted: m });
        } catch (err) {
            await sock.sendMessage(from, { text: menuText }, { quoted: m });
        }
    } else {
        await sock.sendMessage(from, { text: menuText }, { quoted: m });
    }
    break;
}

case 'mediamenu': {
    await sendMenuSection('MEDIA & STICKER CONVERSION', `
╭✰ ⟬ 𝐌𝐄𝐃𝐈𝐀 ⟭
│ ${prefix}sticker
│ ${prefix}stickervid
│ ${prefix}toimage
│ ${prefix}tovideo
│ ${prefix}toaudio
│ ${prefix}tovoice
│ ${prefix}tourl
│ ${prefix}togif
│ ${prefix}todoc <filename>
│ ${prefix}toview
│ ${prefix}toviewonce
│ ${prefix}vv
│ ${prefix}vv2
│ ${prefix}take <packname>
│ ${prefix}mediatag
│ ${prefix}removebg
│ ${prefix}imgtext
│ ${prefix}ocr
│ ${prefix}wm
│ ${prefix}sub
│ ${prefix}subtitle
│ ${prefix}mtovideo
│ ${prefix}couplepp
│ ${prefix}steal
│ ${prefix}del
│ ${prefix}delete
│ ${prefix}forward <jid>
│ ${prefix}volaudio <vol>
│ ${prefix}volvideo <vol>
╰✰`);
    break;
}

case 'stickermenu': {
    await sendMenuSection('STICKER TOOLS', `
╭✰ ⟬ 𝐒𝐓𝐈𝐂𝐊𝐄𝐑 𝐓𝐎𝐎𝐋𝐒 ⟭
│ ${prefix}stickerinfo
│ ${prefix}txtsticker
│ ${prefix}tgsticker <t.me/addstickers/link>
│ ${prefix}album
╰✰`);
    break;
}

case 'ownermenu': {
    await sendMenuSection('OWNER & BOT MANAGEMENT', `
╭✰ ⟬ 𝐎𝐖𝐍𝐄𝐑 ⟭
│ ${prefix}owner
│ ${prefix}ping
│ ${prefix}runtime
│ ${prefix}profile
│ ${prefix}support
│ ${prefix}feedback
│ ${prefix}alive
│ ${prefix}setalive <text>
│ ${prefix}setsudo @user
│ ${prefix}delsudo @user
│ ${prefix}listsudo
│ ${prefix}block <num>
│ ${prefix}unblock <num>
│ ${prefix}listblocked
│ ${prefix}setpp (reply image)
│ ${prefix}delpp
│ ${prefix}setppname <text>
│ ${prefix}setbio <text>
│ ${prefix}getpp
│ ${prefix}getname
│ ${prefix}pinchat
│ ${prefix}unpinchat
│ ${prefix}join <link>
│ ${prefix}joinch <link>
│ ${prefix}leave
│ ${prefix}broadcast <text>
│ ${prefix}broadcast2 <234> <text>
│ ${prefix}save (reply media)
│ ${prefix}sendgclink <num>
│ ${prefix}reactch <link> <emoji>
│ ${prefix}idch
│ ${prefix}checkidch
│ ${prefix}autotyping
│ ${prefix}autorecording
│ ${prefix}autoread
│ ${prefix}autoviewstatus on/off
│ ${prefix}alwaysonline
│ ${prefix}autoreact
│ ${prefix}anticall on/off
│ ${prefix}listgc
│ ${prefix}totalcmd
│ ${prefix}totalmembers
│ ${prefix}membercount
│ ${prefix}mblock
│ ${prefix}mbsearch
╰✰`);
    break;
}

case 'settingsmenu': {
    await sendMenuSection('BOT SETTINGS', `
╭✰ ⟬ 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 ⟭
│ ${prefix}setprefix <sym>
│ ${prefix}public
│ ${prefix}private
│ ${prefix}setname <name>
│ ${prefix}setowner <num>
│ ${prefix}setmenuimage <url>
│ ${prefix}setwelcome on/off/reset
│ ${prefix}setgoodbye on/off/reset
│ ${prefix}modstatus
│ ${prefix}modsettings
╰✰`);
    break;
}

case 'statusmenu': {
    await sendMenuSection('STATUS POSTING', `
╭✰ ⟬ 𝐒𝐓𝐀𝐓𝐔𝐒 ⟭
│ ${prefix}togcstatus
│ ${prefix}totgstatus2 / poststatus
│ ${prefix}mstatus /groupstatus
╰✰`);
    break;
}

case 'groupmenu': {
    await sendMenuSection('GROUP, MODERATION & PROTECTION', `
╭✰ ⟬ 𝐆𝐑𝐎𝐔𝐏 ⟭
│ ${prefix}kick @user
│ ${prefix}add <num>
│ ${prefix}promote @user
│ ${prefix}demote @user
│ ${prefix}promoteall
│ ${prefix}demoteall
│ ${prefix}demotealladmins
│ ${prefix}kickall
│ ${prefix}findfriends
│ ${prefix}ban @user
│ ${prefix}unban @user
│ ${prefix}listban
│ ${prefix}warn @user
│ ${prefix}unwarn @user
│ ${prefix}listwarn
│ ${prefix}resetwarns @user
│ ${prefix}autolink (any url)
│ ${prefix}mtag
│ ${prefix}tagall
│ ${prefix}hidetag <text>
│ ${prefix}tagadmins
│ ${prefix}announce <text>
│ ${prefix}open
│ ${prefix}close
│ ${prefix}opentime
│ ${prefix}closetime
│ ${prefix}setgcname <name>
│ ${prefix}setgcdesc <text>
│ ${prefix}setgcpp (reply image)
│ ${prefix}delgcpp
│ ${prefix}getlink
│ ${prefix}revoke
│ ${prefix}acceptall
│ ${prefix}rejectall
│ ${prefix}gcinfo
│ ${prefix}mention set <text|emoji|sticker>
│ ${prefix}mention off
│ ${prefix}grouptag <tag|off>
│ ${prefix}groupid
│ ${prefix}listmembers
│ ${prefix}admins
│ ${prefix}pin
│ ${prefix}unpin
│ ${prefix}poll <q>|<o1>|<o2>
│ ${prefix}creategc <name>
│ ${prefix}left
│ ${prefix}find
│ ${prefix}listactive
╰✰

╭✰ ⟬ 𝐆𝐑𝐎𝐔𝐏 𝐌𝐀𝐍𝐀𝐆𝐄𝐌𝐄𝐍𝐓 ⟭
│ ${prefix}mute-gc <dur>
│ ${prefix}unmute-gc
│ ${prefix}announcement <text>
│ ${prefix}report @user
│ ${prefix}event Title | DD/MM/YYYY | HH:MM
│ ${prefix}eventinfo (reply)
│ ${prefix}online @user
│ ${prefix}contact <num> [name]
╰✰

╭✰ ⟬ 𝐏𝐑𝐎𝐓𝐄𝐂𝐓𝐈𝐎𝐍 ⟭
│ ${prefix}antilink on/off/warn/kick/reset
│ ${prefix}antifwd on/off/warn/kick
│ ${prefix}antibot on/off/warn/kick
│ ${prefix}antigroupmention on/off/warn/kick
│ ${prefix}antispam on/off/warn/kick
│ ${prefix}antitag on/off/warn/kick
│ ${prefix}antibadword on/off
│ ${prefix}antibadwords add <word>
│ ${prefix}antipromote on/off
│ ${prefix}antidemote on/off
│ ${prefix}flood on/off
│ ${prefix}antidelete on/off/warn/kick
│ ${prefix}antigroupstatus on/off/warn/kick
│ ${prefix}antistatusspam on/off
╰✰`);
    break;
}

case 'interactivemenu': {
    await sendMenuSection('BUTTONS, LISTS & POLLS', `
╭✰ ⟬ 𝐈𝐍𝐓𝐄𝐑𝐀𝐂𝐓𝐈𝐕𝐄 ⟭
│ ${prefix}button <q> | <b1> | <b2>
│ ${prefix}list <title> <desc> <opt...>
│ ${prefix}edit <text> (reply bot)
│ ${prefix}keep (reply)
│ ${prefix}fwdviewonce <jid>
│ ${prefix}reactto <emoji> (reply)
│ ${prefix}pollresults (reply)
╰✰`);
    break;
}

case 'imagemenu': {
    await sendMenuSection('IMAGE EDITING', `
╭✰ ⟬ 𝐈𝐌𝐀𝐆𝐄 𝐏𝐑𝐎𝐂𝐄𝐒𝐒𝐈𝐍𝐆 ⟭
│ ${prefix}mich-meme top | bottom (reply)
│ ${prefix}quoteimg <text> | <author>
│ ${prefix}crop <wxh> (reply)
│ ${prefix}resize <50%> or <200x200>
│ ${prefix}filter greyscale|sepia|blur
│ ${prefix}wanted (reply image)
│ ${prefix}wasted (reply image)
│ ${prefix}jail (reply image)
│ ${prefix}invert (reply image)
│ ${prefix}rainbow (reply image)
│ ${prefix}hd / enhance (reply image)
│ ${prefix}carbon <code>
│ ${prefix}brat <text>
╰✰`);
    break;
}

case 'utilitymenu': {
    await sendMenuSection('EVERYDAY UTILITIES', `
╭✰ ⟬ 𝐔𝐓𝐈𝐋𝐈𝐓𝐘 ⟭
│ ${prefix}say <text>
│ ${prefix}translate <lang> <text>
│ ${prefix}tr <lang> <text>
│ ${prefix}style <text>
│ ${prefix}fancy <text>
│ ${prefix}readmore <text>
│ ${prefix}calc <expr>
│ ${prefix}timezone <city>
│ ${prefix}botinfo
│ ${prefix}sessioninfo
│ ${prefix}status
│ ${prefix}calculator <expr>
│ ${prefix}morse <text>
│ ${prefix}morsecode <text>
│ ${prefix}ssweb <url>
│ ${prefix}screenshot <url>
│ ${prefix}imgur (reply)
│ ${prefix}get <url>
│ ${prefix}checkweb <url>
│ ${prefix}urlinfo <url>
│ ${prefix}linkinfo <url>
│ ${prefix}passcheck <pwd>
│ ${prefix}passwordcheck <pwd>
│ ${prefix}getdevice
│ ${prefix}archive
│ ${prefix}unarchive
│ ${prefix}setcmd
│ ${prefix}delcmd
│ ${prefix}listcmd
│ ${prefix}tts <text>
│ ${prefix}speak <text>
│ ${prefix}whois @user
│ ${prefix}app
│ ${prefix}dl <url>
│ ${prefix}flip
│ ${prefix}reset
│ ${prefix}top
│ ${prefix}scores
│ ${prefix}pay @user <amt>
│ ${prefix}bet <amt>
│ ${prefix}rch <link>
│ ${prefix}img <q>
│ ${prefix}describe <url>
│ ${prefix}qrcode <text>
│ ${prefix}readqr (reply image)
│ ${prefix}shorturl <url>
│ ${prefix}pdftotext (reply pdf)
│ ${prefix}advice
│ ${prefix}colorinfo <hex>
│ ${prefix}genderpredict <name>
│ ${prefix}zipcode <zip> <country>
│ ${prefix}aidetect <text>
│ ${prefix}forecast <city>
╰✰`);
    break;
}

case 'searchmenu': {
    await sendMenuSection('SEARCH & LOOKUP', `
╭✰ ⟬ 𝐒𝐄𝐀𝐑𝐂𝐇 ⟭
│ ${prefix}google <q>
│ ${prefix}gsearch <q>
│ ${prefix}wiki <q>
│ ${prefix}wikipedia <q>
│ ${prefix}npmsearch <pkg>
│ ${prefix}npmstalk <pkg>
│ ${prefix}pinterest <q>
│ ${prefix}pixabay <q>
│ ${prefix}gimage <q>
│ ${prefix}dictionary <word>
│ ${prefix}define <word>
│ ${prefix}moviesearch <title>
│ ${prefix}movieinfo <title>
│ ${prefix}imdb <title>
│ ${prefix}moviedb <title>
│ ${prefix}recipe <dish>
│ ${prefix}weather <city>
│ ${prefix}wth <city>
│ ${prefix}wx <city>
│ ${prefix}ipinfo <ip>
│ ${prefix}track-ip <ip>
│ ${prefix}myip
│ ${prefix}bible <ref>
│ ${prefix}quran <ref>
│ ${prefix}element <name>
│ ${prefix}shazam
│ ${prefix}horoscope <sign>
│ ${prefix}tiktokstalk <user>
│ ${prefix}igstalk <user>
│ ${prefix}ytstalk <user>
│ ${prefix}fbstalk <user>
│ ${prefix}twstalk <user>
│ ${prefix}wastalk <num>
│ ${prefix}inspiration
│ ${prefix}nasaphoto
│ ${prefix}apod
│ ${prefix}news <topic>
│ ${prefix}randomfact
│ ${prefix}rfact
│ ${prefix}mfact
│ ${prefix}numberfact <n>
│ ${prefix}asteroid
│ ${prefix}waifu
│ ${prefix}ero
│ ${prefix}artwork <query>
│ ${prefix}musicinfo <artist>
│ ${prefix}michsearch <title>
│ ${prefix}wallpaper <query>
│ ${prefix}xnxx
╰✰`);
    break;
}

case 'funmenu': {
    await sendMenuSection('FUN & SOCIAL', `
╭✰ ⟬ 𝐅𝐔𝐍 & 𝐒𝐎𝐂𝐈𝐀𝐋 ⟭
│ ${prefix}truth
│ ${prefix}dare
│ ${prefix}wyr
│ ${prefix}wouldyou
│ ${prefix}ship @u1 @u2
│ ${prefix}riddle
│ ${prefix}pickupline
│ ${prefix}rizz
│ ${prefix}insult
│ ${prefix}simi <msg>
│ ${prefix}catfact
│ ${prefix}catpic
│ ${prefix}dogpic
│ ${prefix}emojimix 😎+🥰
│ ${prefix}emix 😎+🥰
│ ${prefix}meme
│ ${prefix}joke
│ ${prefix}jokeplus <category>
│ ${prefix}dadjoke
│ ${prefix}chucknorris <category>
│ ${prefix}breakingbad
│ ${prefix}fact
│ ${prefix}quote
│ ${prefix}numbergame
│ ${prefix}nsfwgen <prompt>
│ ${prefix}text2nsfw <prompt>
│ ${prefix}8ball
│ ${prefix}fortune
│ ${prefix}tarot
│ ${prefix}battle @user
╰✰

╭✰ ⟬ 𝐅𝐔𝐍 𝐅𝐀𝐂𝐓𝐒 & 𝐈𝐍𝐅𝐎 ⟭
│ ${prefix}cocktail <name>
│ ${prefix}makeup <brand>
│ ${prefix}disney <character>
│ ${prefix}remotejobs <skill>
│ ${prefix}chucknorris <category>
│ ${prefix}asteroid
│ ${prefix}artwork <query>
│ ${prefix}nasaphoto
╰✰`);
    break;
}

case 'economymenu': {
    await sendMenuSection('ECONOMY GAME', `
╭✰ ⟬ 𝐄𝐂𝐎𝐍𝐎𝐌𝐘 ⟭
│ ${prefix}economy on/off
│ ${prefix}bal
│ ${prefix}balance
│ ${prefix}wallet
│ ${prefix}daily
│ ${prefix}work
│ ${prefix}deposit <amt>
│ ${prefix}withdraw <amt>
│ ${prefix}give @user <amt>
│ ${prefix}rob @user
│ ${prefix}gamble <amt>
│ ${prefix}lb
│ ${prefix}leaderboard
│ ${prefix}shop
│ ${prefix}buy <item>
│ ${prefix}inv
│ ${prefix}inventory
│ ${prefix}steal
│ ${prefix}crime
│ ${prefix}hunt
│ ${prefix}fish
│ ${prefix}mine
│ ${prefix}level
│ ${prefix}ecoinfo
│ ${prefix}bail
╰✰`);
    break;
}

case 'animemenu': {
    await sendMenuSection('ANIME & REACTION GIFS', `
╭✰ ⟬ 𝐀𝐍𝐈𝐌𝐄 & 𝐆𝐈𝐅 ⟭
│ ${prefix}animenews
│ ${prefix}animewlp
│ ${prefix}animewallpaper
│ ${prefix}animechar <name>
│ ${prefix}animerec <title>
│ ${prefix}animesearch <title>
│ ${prefix}animequote <name>
│ ${prefix}digimon <name>
│ ${prefix}hug
│ ${prefix}kiss
│ ${prefix}kill
│ ${prefix}slap
│ ${prefix}pat
│ ${prefix}lick
│ ${prefix}bite
│ ${prefix}yeet
│ ${prefix}bully
│ ${prefix}bonk
│ ${prefix}wink
│ ${prefix}poke
│ ${prefix}nom
│ ${prefix}smile
│ ${prefix}wave
│ ${prefix}blush
│ ${prefix}dance
│ ${prefix}cry
│ ${prefix}happy
│ ${prefix}laugh
│ ${prefix}angry
│ ${prefix}cuddle
│ ${prefix}highfive
│ ${prefix}shoot
│ ${prefix}sleep
│ ${prefix}awoo
│ ${prefix}smug
│ ${prefix}glomp
│ ${prefix}cringe
│ ${prefix}handhold
│ ${prefix}shinobu
│ ${prefix}fox
│ ${prefix}koala
│ ${prefix}bird
│ ${prefix}panda
│ ${prefix}dog
│ ${prefix}cat
╰✰`);
    break;
}

case 'effectsmenu': {
    await sendMenuSection('TEXT/PHOTO STYLING EFFECTS', `
╭✰ ⟬ 𝐄𝐏𝐇𝐎𝐓𝐎 𝐄𝐅𝐅𝐄𝐂𝐓𝐒 ⟭
│ ${prefix}ephotolist
│ ${prefix}ephotostyles
│ ${prefix}glitchtext <text>
│ ${prefix}cyberpunk <text>
│ ${prefix}neonmetal <text>
│ ${prefix}gaminglogo <text>
│ ${prefix}graffiti <text>
│ ${prefix}sandwriting <text>
│ ${prefix}galaxy <text>
│ ${prefix}rainbow <text>
│ ${prefix}matrix <text>
│ ${prefix}watercolor <text>
│ ${prefix}neonlight <text>
│ ${prefix}glitch2 <text>
│ ${prefix}chalkboard <text>
│ ${prefix}3dstone <text>
│ ${prefix}3dgold <text>
│ ${prefix}goldflag <text>
│ ${prefix}smoke <text>
│ ${prefix}ice <text>
│ ${prefix}underwater <text>
│ ${prefix}vaporwave <text>
│ ${prefix}color <hex>
│ ${prefix}currency <amt> <from> <to>
╰✰`);
    break;
}

case 'aimenu': {
    await sendMenuSection('AI CHAT & IMAGE GENERATION', `
╭✰ ⟬ 𝐀𝐈 ⟭
│ ${prefix}ask <q>
│ ${prefix}ai <q>
│ ${prefix}gpt <q>
│ ${prefix}codeai <desc>
│ ${prefix}codegen <desc>
│ ${prefix}imagine <prompt>
│ ${prefix}imagine-ai <prompt>
│ ${prefix}imagine2 <prompt>
│ ${prefix}sdimage <prompt>
│ ${prefix}aiimage <prompt>
│ ${prefix}aiimage2 <prompt>
│ ${prefix}aigenimage <prompt>
│ ${prefix}flux <prompt>
│ ${prefix}fluxxmd <prompt>
│ ${prefix}pollinations <prompt>
│ ${prefix}genimage <prompt>
│ ${prefix}nanobananapro <prompt>
│ ${prefix}gen <prompt>
│ ${prefix}generate <prompt>
│ ${prefix}gemini-vision <url>
│ ${prefix}chatbot on/off
│ ${prefix}chatbot private on/off
│ ${prefix}chatbot clear
│ ${prefix}summarize <text|reply> (also ${prefix}summary, ${prefix}tldr)
│ ${prefix}rewrite <text|reply>
│ ${prefix}explain <text|reply>
╰✰`);
    break;
}

case 'audiomenu': {
    await sendMenuSection('VOICE/AUDIO EFFECTS', `
╭✰ ⟬ 𝐀𝐔𝐃𝐈𝐎 𝐄𝐅𝐅𝐄𝐂𝐓𝐒 ⟭
│ ${prefix}bass
│ ${prefix}blown
│ ${prefix}deep
│ ${prefix}robot
│ ${prefix}tiny
│ ${prefix}chipmunk
│ ${prefix}slowed
│ ${prefix}reverb
│ ${prefix}nightcore
│ ${prefix}earrape
│ ${prefix}echo
│ ${prefix}underwater
│ ${prefix}telephone
│ ${prefix}reverse
│ ${prefix}vaporwave
╰✰`);
    break;
}

case 'downloadmenu': {
    await sendMenuSection('DOWNLOADERS (MUSIC, VIDEO, APPS)', `
╭✰ ⟬ 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 ⟭
│ ${prefix}play <song>
│ ${prefix}song <name>
│ ${prefix}sing <name>
│ ${prefix}music <name>
│ ${prefix}sonu <prompt>
│ ${prefix}scdlsearch <song>
│ ${prefix}gitclone <url>
│ ${prefix}pinterestdl <url>
│ ${prefix}ytmp3 <link>
│ ${prefix}ytmp4 <link>
│ ${prefix}ytaudio <link>
│ ${prefix}ytvideo <link>
│ ${prefix}ytsearch <q>
│ ${prefix}tiktok <link>
│ ${prefix}tt <link>
│ ${prefix}tiktokmp3 <link>
│ ${prefix}tiktokimg <link>
│ ${prefix}ttsearch <q>
│ ${prefix}ig <link>
│ ${prefix}igdl <link>
│ ${prefix}fbdl <link>
│ ${prefix}scdl <link>
│ ${prefix}soundcloud <link>
│ ${prefix}tw <link>
│ ${prefix}dlall <url>
│ ${prefix}downloadall <url>
│ ${prefix}apk <app>
│ ${prefix}apkdl <app>
│ ${prefix}apkdownload <app>
│ ${prefix}mediafire <link>
│ ${prefix}mfdl <link>
│ ${prefix}pintdl <link>
│ ${prefix}gdrive <link>
│ ${prefix}spotifysearch <song>
│ ${prefix}spsearch <song>
│ ${prefix}spotifydl <id>
│ ${prefix}lyrics <song>
│ ${prefix}lyric <song>
│ ${prefix}lyric2 <song>
│ ${prefix}film <title>
│ ${prefix}movie <title>
│ ${prefix}movie2 <title>
│ ${prefix}movie2detail <url>
│ ${prefix}moviebox <title>
│ ${prefix}moviedetail <url>
│ ${prefix}movie-dl <url>
│ ${prefix}cinesubz <title>
│ ${prefix}video <q>
│ ${prefix}moviedl <title>
│ ${prefix}seriesdl <title> <s> <ep>
│ ${prefix}michsearch <title>
│ ${prefix}trending
╰✰`);
    break;
}

case 'sportsmenu': {
    await sendMenuSection('LIVE SCORES & SPORTS TRIVIA', `
╭✰ ⟬ 𝐒𝐏𝐎𝐑𝐓𝐒 ⟭
│ ${prefix}livescore
│ ${prefix}scores
│ ${prefix}fixtures <league>
│ ${prefix}schedule <league>
│ ${prefix}sportnews <topic>
│ ${prefix}standings <league>
│ ${prefix}table <league>
│ ${prefix}team <name>
│ ${prefix}player <name>
│ ${prefix}league <name>
│ ${prefix}h2h <team1> vs <team2>
│ ${prefix}sporttrivia
│ ${prefix}sportanswer <answer>
│ ${prefix}transfers
│ ${prefix}transfernews
│ ${prefix}sportstats <team>
│ ${prefix}f1
│ ${prefix}nhl
╰✰`);
    break;
}

case 'gamemenu': {
    await sendMenuSection('MINI GAMES', `
╭✰ ⟬ 𝐆𝐀𝐌𝐄𝐒 ⟭
│ ${prefix}games
│ ${prefix}gamelist
│ ${prefix}tictactoe @user
│ ${prefix}ttt @user
│ ${prefix}tttmove <1-9>
│ ${prefix}numguess
│ ${prefix}numbergame
│ ${prefix}guess <num>
│ ${prefix}rps rock/paper/scissors
│ ${prefix}trivia
│ ${prefix}answer a/b/c/d
│ ${prefix}scramble
│ ${prefix}unscramble <word>
│ ${prefix}hangman
│ ${prefix}hmguess <letter>
│ ${prefix}mathquiz
│ ${prefix}mathans <num>
│ ${prefix}dice
│ ${prefix}coinflip
│ ${prefix}wouldyou
│ ${prefix}wyr
│ ${prefix}wordchain
│ ${prefix}wcg
│ ${prefix}emojiquiz
│ ${prefix}eqanswer <guess>
│ ${prefix}sporttrivia
│ ${prefix}sportanswer <answer>
│ ${prefix}endgame
│ ${prefix}tetris
│ ${prefix}2048
│ ${prefix}flappy
│ ${prefix}xo
│ ${prefix}simon
│ ${prefix}snake
│ ${prefix}breakout
│ ${prefix}pong
│ ${prefix}whack
│ ${prefix}invaders
│ ${prefix}memory
│ ${prefix}minesweeper
│ ${prefix}hangmangame
│ ${prefix}connect4
│ ${prefix}reaction
│ ${prefix}bubblepop
│ ${prefix}wordle
│ ${prefix}wordsearch
│ ${prefix}rpsgame
│ ${prefix}checkers
│ ${prefix}stacktower
│ ${prefix}sudoku
│ ${prefix}fruitslicer
│ ${prefix}archery
│ ${prefix}airhockey
│ ${prefix}chess
│ ${prefix}ludo
╰✰`);
    break;
}


case 'xvid':
case 'xnxx': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'xnxx <search terms>\nExample: ' + prefix + 'xnxx step mom');
    try {
        const xnxxRes = await axios.get(`${BASE_URL}/api/search/xnxxsearch`, {
            params: { query: text.trim() },
            headers: { 'x-api-key': API_KEY },
            timeout: 25000
        });

        const data = xnxxRes.data;
        if (!data?.results?.length) {
            return Shefzyreply('❌ No results found for: *' + text + '*');
        }

        const results = data.results.slice(0, 10);
        let message = '🔞 *XNXX Search Results*\n';
        message += '🔎 Query: *' + text + '*\n';
        message += '━━━━━━━━━━━━━━━━━\n\n';
        results.forEach((r, i) => {
            message += `*${i + 1}.* ${r.title}\n🔗 ${r.link}\n\n`;
        });
        message += '━━━━━━━━━━━━━━━━━\n';
        message += `📊 Showing ${results.length} of ${data.results.length} results`;

        await sock.sendMessage(from, { text: message }, { quoted: m });
    } catch(e) {
        console.log('[xnxx]', e.response?.status, e.message);
        await Shefzyreply('❌ Search failed: ' + (e.response?.status ? 'HTTP ' + e.response.status : e.message));
    }
    break;
}



case 'wallpaper': {
    if (!text) return Shefzyreply(`❌ Usage: ${prefix}wallpaper <query>\n\nExample:\n${prefix}wallpaper Sunset Scenes`);
    
    try {
        await Shefzyreply('🔍 Searching wallpapers...');
        
        const axios = require('axios');
        const url = `${BASE_URL}/api/search/wallpaper?apikey=${API_KEY}&query=${encodeURIComponent(text)}`;
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (!data.success || !data.results || data.results.length === 0) {
            return Shefzyreply('❌ No wallpapers found for: ' + text);
        }
        
        // Get first 5 results
        const results = data.results.slice(0, 5);
        let reply = `🖼️ *Wallpaper Results for "${text}"*\n\n`;
        
        for (let i = 0; i < results.length; i++) {
            const wallpaper = results[i];
            const imageUrl = wallpaper.image && wallpaper.image.length > 0 ? wallpaper.image[0] : 'N/A';
            reply += `┌─❏ *${i + 1}. ${wallpaper.type || 'Unknown'}*\n`;
            reply += `│ 🖼️ ${imageUrl}\n`;
            reply += `└────────────────\n\n`;
        }
        
        await Shefzyreply(reply);
        
    } catch(e) {
        console.error('[wallpaper]', e.message);
        await Shefzyreply('❌ Wallpaper search failed: ' + e.message);
    }
    break;
}

case 'waifu': {
    try {
        await Shefzyreply('🖼️ Fetching waifu image...');
        
        const axios = require('axios');
        const url = 'https://nekos.life/api/v2/img/waifu';
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (!data || !data.url) {
            return Shefzyreply('❌ No waifu image found. Please try again later.');
        }
        
        await sock.sendMessage(from, {
            image: { url: data.url },
            caption: `🖼️ *Waifu*\n\n✨ Powered by Michiko`
        }, { quoted: m });
        
    } catch(e) {
        console.error('[waifu]', e.message);
        await Shefzyreply('❌ Failed to fetch waifu image: ' + e.message);
    }
    break;
}

case 'ero': {
    try {
        await Shefzyreply('🔞 Fetching image...');
        
        const axios = require('axios');
        const url = 'https://nekos.life/api/v2/img/ero';
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (!data || !data.url) {
            return Shefzyreply('❌ No image found. Please try again later.');
        }
        
        await sock.sendMessage(from, {
            image: { url: data.url },
            caption: `🔞 *Ero Anime*\n\n⚠️ NSFW Content\n✨ Powered by Michiko`
        }, { quoted: m });
        
    } catch(e) {
        console.error('[ero]', e.message);
        await Shefzyreply('❌ Failed to fetch image: ' + e.message);
    }
    break;
}

case 'animequote': {
    if (!text) return Shefzyreply(`❌ Usage: ${prefix}animequote <character name>\n\nExample:\n${prefix}animequote lelouch`);
    
    try {
        await Shefzyreply('🔍 Searching for anime quote...');
        
        const axios = require('axios');
        const url = `${BASE_URL}/api/anime/char-quotes?apikey=${API_KEY}&character=${encodeURIComponent(text)}`;
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (!data.success || !data.result) {
            return Shefzyreply('❌ No quote found for character: ' + text);
        }
        
        const quote = data.result;
        let reply = `📜 *Anime Quote*\n\n`;
        reply += `┌─❏ *Character:* ${quote.character}\n`;
        reply += `│ 📺 *Anime:* ${quote.show}\n`;
        reply += `│ 💬 *Quote:*\n│ "${quote.quote}"\n`;
        reply += `└────────────────\n\n✨ Powered by Michiko`;
        
        await Shefzyreply(reply);
        
    } catch(e) {
        console.error('[animequote]', e.message);
        await Shefzyreply('❌ Failed to fetch anime quote: ' + e.message);
    }
    break;
}

case 'gitclone': {
    if (!text) return Shefzyreply(`❌ Usage: ${prefix}gitclone <github url>`);
    
    try {
        // Extract owner/repo from URL
        const match = text.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) return Shefzyreply('❌ Invalid GitHub URL');
        
        const [, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, '');
        const downloadUrl = `https://api.github.com/repos/${owner}/${cleanRepo}/zipball/main`;
        
        let reply = `📦 *GitHub Clone*\n\n`;
        reply += `┌─❏ *Repository:* ${cleanRepo}\n`;
        reply += `│ 📥 *Download:* ${downloadUrl}\n`;
        reply += `└────────────────\n\n✨ Powered by Michiko`;
        
        await Shefzyreply(reply);
        
    } catch(e) {
        console.error('[gitclone]', e.message);
        await Shefzyreply('❌ Failed: ' + e.message);
    }
    break;
}

case 'pindl':
case 'pinterestdl': {
    if (!text) return Shefzyreply(`❌ Usage: ${prefix}pinterestdl <pinterest url>\n\nExample:\n${prefix}pinterestdl https://pin.it/1cR6JJNpv`);

    const url = text.trim();
    if (!url.includes('pinterest') && !url.includes('pin.it')) {
        return Shefzyreply('❌ Invalid URL — use a Pinterest link.');
    }

    await sock.sendMessage(from, { react: { text: '🕕', key: m.key } });

    try {
        const { data: res } = await axios.get(`https://api.azbry.com/api/download/pinterest?url=${encodeURIComponent(url)}`, { timeout: 20000 });

        if (!res?.status || !res?.result) {
            throw new Error('Failed to fetch data from Pinterest API.');
        }

        const data = res.result;
        let mediaUrl = null;
        let mediaType = null;

        if (data.type === 'video') {
            mediaUrl = data.videos?.[0]?.url || data.download;
            mediaType = 'video';
        } else if (data.images?.length > 0) {
            const orig = data.images.find(img => img.name === 'orig') || data.images[data.images.length - 1];
            mediaUrl = orig?.url;
            mediaType = 'image';
        } else if (data.download) {
            mediaUrl = data.download;
            mediaType = 'image';
        }

        if (!mediaUrl) throw new Error('No media found in that pin.');

        if (mediaType === 'video' && mediaUrl.includes('.m3u8')) {
            await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
            return Shefzyreply(`❌ This pin's video is only available as a stream format that can't be sent directly — try a different pin.`);
        }

        const caption = `📌 *Pinterest Download*\n\n┌─❏ *Title:* ${data.title || 'Untitled'}\n└────────────────\n\n✨ Powered by Michiko`;

        if (mediaType === 'video') {
            await sock.sendMessage(from, { video: { url: mediaUrl }, caption }, { quoted: m });
        } else {
            await sock.sendMessage(from, { image: { url: mediaUrl }, caption }, { quoted: m });
        }

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.log(chalk.red('[PINTERESTDL] Error:'), e.message);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        await Shefzyreply(`❌ Couldn't download that pin — try again.`);
    }
    break;
}
//===================
// qrcode: generate QR code from text/link
//===================
case 'qrcode':
case 'qr': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'qrcode <text or link>\nExample: qrcode https://google.com');
    try {
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=' + encodeURIComponent(text);
        await sock.sendMessage(from, {
            image: { url: qrUrl },
            caption: '📱 *QR Code Generated!*\n\n📝 Content: ' + text
        }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ QR generation failed: ' + e.message);
    }
    break;
}

//===================
// michsearch
//===================
case 'michsearch':
case 'cinemasearch': {
    if (!text) return Shefzyreply(
        '❌ Usage: ' + prefix + 'michsearch <title>\n\n' +
        'Examples:\n' +
        prefix + 'michsearch inception\n' +
        prefix + 'michsearch the boys\n\n' +
        'To download:\n' +
        prefix + 'moviedl <title> [quality]\n' +
        prefix + 'seriesdl <title> <season> <episode> [quality]'
    );
    try {
        await Shefzyreply('🔍 Searching: *' + text + '*...');
        const sRes = await axios.get(GZ_BASE + '/api/search', {
            params: { apikey: GZ_KEY, query: text, subjectType: 'ALL', page: 1, perPage: 8 },
            timeout: 20000
        });
        const items = gzItems(sRes.data);
        if (!items.length) return Shefzyreply('❌ No results found for: *' + text + '*');

        let msg = '🎬 *Search Results — ' + text + '*\n\n';
        items.slice(0, 8).forEach((s, i) => {
            const type = s.subjectType === 1 ? '🎬 Movie' : s.subjectType === 2 ? '📺 Series' : '🎵 Other';
            msg += `${i + 1}. ${type} *${s.title || 'Unknown'}*\n`;
            msg += `   📅 ${(s.releaseDate || 'N/A').slice(0, 4)} | ⭐ ${s.imdbRatingValue || 'N/A'} | 🎭 ${s.genre || 'N/A'}\n\n`;
        });
        msg += '💡 Download:\n' +
            prefix + 'moviedl <title> [quality]\n' +
            prefix + 'seriesdl <title> <season> <episode> [quality]\n\n' +
            '🎞️ Qualities: 360p 480p 720p 1080p';
        await Shefzyreply(msg);
    } catch (e) {
        await Shefzyreply('❌ Search failed: ' + e.message);
    }
    break;
}

//===================
// trending
//===================
case 'trending':
case 'cinematrend': {
    const tSub = (args[0] || 'all').toLowerCase();
    const typeParam = tSub === 'movie' ? 'MOVIE' : tSub === 'series' ? 'TV' : 'ALL';
    const typeLabel = tSub === 'movie' ? 'Movies' : tSub === 'series' ? 'Series' : 'Movies & Series';
    try {
        await Shefzyreply('🔥 Fetching trending ' + typeLabel + '...');

        let items = [];
        // Try multiple endpoints
        for (const endpoint of ['/api/trending', '/api/hot-movies-series', '/api/homepage']) {
            try {
                const tRes = await axios.get(GZ_BASE + endpoint, {
                    params: { apikey: GZ_KEY, subjectType: typeParam, page: 1, perPage: 10 },
                    timeout: 15000
                });
                items = gzItems(tRes.data);
                if (items.length) break;
            } catch {}
        }

        if (!items.length) return Shefzyreply(
            '❌ Trending unavailable right now.\n\n' +
            '💡 Try: ' + prefix + 'michsearch <title>'
        );

        let msg = '🔥 *Trending ' + typeLabel + '*\n\n';
        items.slice(0, 8).forEach((s, i) => {
            const type = s.subjectType === 1 ? '🎬' : s.subjectType === 2 ? '📺' : '🎵';
            msg += `${i + 1}. ${type} *${s.title || 'Unknown'}*\n`;
            msg += `   📅 ${(s.releaseDate || 'N/A').slice(0, 4)} | ⭐ ${s.imdbRatingValue || 'N/A'} | 🎭 ${s.genre || 'N/A'}\n\n`;
        });
        msg += '💡 ' + prefix + 'trending movie | ' + prefix + 'trending series';
        await Shefzyreply(msg);
    } catch (e) {
        await Shefzyreply('❌ Trending failed: ' + e.message);
    }
    break;
}

//===================
// moviedl
//===================
case 'moviedl':
case 'cinedownload': {
    if (!text) return Shefzyreply(
        '❌ Usage: ' + prefix + 'moviedl <title> [quality]\n\n' +
        'Examples:\n' +
        prefix + 'moviedl gang of lagos\n' +
        prefix + 'moviedl inception 1080p\n' +
        prefix + 'moviedl the boys 480p\n\n' +
        '🎞️ Qualities: 360p 480p 720p 1080p\n' +
        '⚠️ Default: 720p'
    );

    const qualityKeywords = ['360p', '480p', '720p', '1080p', '240p'];
    let preferredQuality = null;
    let movieQuery = text;
    const lastArg = args[args.length - 1]?.toLowerCase();
    if (qualityKeywords.includes(lastArg)) {
        preferredQuality = lastArg;
        movieQuery = args.slice(0, -1).join(' ');
    }

    try {
        await Shefzyreply('🔍 Searching: *' + movieQuery + '*...');

        let movie = null;
        for (const sType of ['MOVIE', 'ALL']) {
            const sRes = await axios.get(GZ_BASE + '/api/search', {
                params: { apikey: GZ_KEY, query: movieQuery, subjectType: sType, page: 1, perPage: 8 },
                timeout: 20000
            });
            const items = gzItems(sRes.data);
            movie = items.find(i => i.subjectType === 1) || (sType === 'ALL' ? items[0] : null);
            if (movie) break;
        }
        if (!movie) return Shefzyreply('❌ Movie not found: *' + movieQuery + '*\n\nCheck spelling or try a different title.');

        const subjectId = movie.subjectId;
        const title = movie.title || movieQuery;
        const poster = movie.cover?.url || null;
        const year = (movie.releaseDate || '').slice(0, 4);
        const rating = movie.imdbRatingValue || 'N/A';
        const genre = movie.genre || 'N/A';

        //===================
        // Get detailPath
        //===================
        let detailPath = movie.detailPath || '';
        try {
            const dRes = await axios.get(GZ_BASE + '/api/item-details', {
                params: { apikey: GZ_KEY, subjectId },
                timeout: 20000
            });
            const detail = dRes.data?.data || dRes.data;
            detailPath = detail?.detailPath || detail?.path || movie.detailPath || '';
        } catch {}

        //===================
        // Get media links
        //===================
        const mRes = await axios.get(GZ_BASE + '/api/media', {
            params: { apikey: GZ_KEY, subjectId, detailPath, season: 0, episode: 0 },
            timeout: 30000
        });

        const downloads = gzDownloads(mRes.data);
        if (!downloads.length) {
            const noMsg = '🎬 *' + title + '* (' + year + ')\n⭐ ' + rating + '\n\n❌ No download links available.\n\n💡 Try: ' + prefix + 'film ' + movieQuery;
            if (poster) {
                await sock.sendMessage(from, { image: { url: poster }, caption: noMsg }, { quoted: m });
            } else {
                await Shefzyreply(noMsg);
            }
            break;
        }

        //===================
        // Pick quality
        //===================
        const chosen = _pickQuality(downloads, preferredQuality);
        const dlUrl = _getUrl(chosen);
        const quality = String(chosen?.quality ?? chosen?.label ?? chosen?.resolution ?? chosen?.name ?? 'Unknown');
        const fileSize = chosen?.fileSize || chosen?.size || null;

        if (!dlUrl) {
            await Shefzyreply('❌ Could not extract download URL.\n\n🔧 Raw: ' + JSON.stringify(chosen)?.slice(0, 300));
            break;
        }

        //===================
        // Send processing message
        //===================
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Processing Movie...*\n\n📤 Uploading document. Please wait!'
        }, { quoted: m });

        //===================
        // Send the video as document
        //===================
        const fileName = `${title.replace(/[^a-zA-Z0-9 ]/g, '_')}_${quality}.mp4`;
        const success = await _sendVideoStream(sock, from, m, dlUrl, fileName, '', title, quality, fileSize);

        //===================
        // Delete the processing message
        //===================
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch {}

        if (!success) {
            // _sendVideoStream already sent the fallback link
        }

    } catch (e) {
        console.log('[moviedl] Error:', e.response?.status, e.message);
        await Shefzyreply('❌ Movie download failed: ' + (e.response?.status ? 'HTTP ' + e.response.status + ' — ' : '') + e.message);
    }
    break;
}

//===================
// seriesdl
//===================
case 'seriesdl':
case 'seriesdownload':
case 'epdl': {
    if (!text) return Shefzyreply(
        '❌ Usage: ' + prefix + 'seriesdl <title> <season> <episode> [quality]\n\n' +
        'Examples:\n' +
        prefix + 'seriesdl the boys 1 1\n' +
        prefix + 'seriesdl solo leveling 1 10 720p\n' +
        prefix + 'seriesdl game of thrones 1 4 480p\n\n' +
        '🎞️ Qualities: 360p 480p 720p 1080p\n' +
        '⚠️ Default: Season 1 Episode 1 if not specified.'
    );

    const sAllArgs = text.trim().split(' ');
    const qualityKeywords2 = ['360p', '480p', '720p', '1080p', '240p'];
    let preferredQuality2 = null;
    let workArgs = [...sAllArgs];

    if (qualityKeywords2.includes(workArgs[workArgs.length - 1]?.toLowerCase())) {
        preferredQuality2 = workArgs[workArgs.length - 1].toLowerCase();
        workArgs = workArgs.slice(0, -1);
    }

    let season = 1, episode = 1, seriesTitle = text;
    if (workArgs.length >= 3) {
        const ep = parseInt(workArgs[workArgs.length - 1]);
        const se = parseInt(workArgs[workArgs.length - 2]);
        if (!isNaN(ep) && !isNaN(se)) {
            episode = ep;
            season = se;
            seriesTitle = workArgs.slice(0, -2).join(' ');
        }
    } else if (workArgs.length === 2) {
        const ep = parseInt(workArgs[workArgs.length - 1]);
        if (!isNaN(ep)) {
            episode = ep;
            seriesTitle = workArgs.slice(0, -1).join(' ');
        }
    } else {
        seriesTitle = workArgs.join(' ');
    }

    const epLabel = 'S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');

    try {
        await Shefzyreply('🔍 Searching series: *' + seriesTitle + '*...');

        let show = null;
        for (const sType of ['TV', 'ALL']) {
            const sRes = await axios.get(GZ_BASE + '/api/search', {
                params: { apikey: GZ_KEY, query: seriesTitle, subjectType: sType, page: 1, perPage: 10 },
                timeout: 20000
            });
            const items = gzItems(sRes.data);
            const series = items.filter(i => i.subjectType === 2);
            if (series.length) {
                const titleLower = seriesTitle.toLowerCase();
                const individual = series.find(s =>
                    !(/S\d+-S\d+/i.test(s.title)) &&
                    s.title.toLowerCase().includes(titleLower.split(' ')[0])
                );
                show = individual || series[0];
                break;
            }
            if (!show && items.length) { show = items[0]; }
        }

        if (!show) return Shefzyreply('❌ Series not found: *' + seriesTitle + '*\n\nCheck spelling or try a different title.');

        const subjectId = show.subjectId;
        const title = show.title || seriesTitle;
        const poster = show.cover?.url || null;
        const year = (show.releaseDate || '').slice(0, 4);
        const rating = show.imdbRatingValue || 'N/A';
        const genre = show.genre || 'N/A';

        await Shefzyreply(
            '✅ Found: *' + title + '* (' + year + ')\n' +
            '⭐ ' + rating + ' | 🎭 ' + genre + '\n\n' +
            '⏳ Fetching *' + epLabel + '*...'
        );

        let detailPath = show.detailPath || '';
        try {
            const dRes = await axios.get(GZ_BASE + '/api/item-details', {
                params: { apikey: GZ_KEY, subjectId },
                timeout: 20000
            });
            const detail = dRes.data?.data || dRes.data;
            detailPath = detail?.detailPath || detail?.path || show.detailPath || '';
        } catch {}

        const mRes = await axios.get(GZ_BASE + '/api/media', {
            params: { apikey: GZ_KEY, subjectId, detailPath, season, episode },
            timeout: 30000
        });

        const downloads = gzDownloads(mRes.data);
        if (!downloads.length) {
            const noMsg =
                '📺 *' + title + ' — ' + epLabel + '*\n\n' +
                '❌ Episode not available on this source.\n\n' +
                '💡 Tips:\n' +
                '• Try a different episode number\n' +
                '• The series may use a season pack — try ' + prefix + 'seriesdl ' + seriesTitle + ' 1 1';
            if (poster) {
                await sock.sendMessage(from, { image: { url: poster }, caption: noMsg }, { quoted: m });
            } else {
                await Shefzyreply(noMsg);
            }
            break;
        }

        const chosen = _pickQuality(downloads, preferredQuality2);
        const dlUrl = _getUrl(chosen);
        const quality = String(chosen?.quality ?? chosen?.label ?? chosen?.resolution ?? chosen?.name ?? 'Unknown');
        const fileSize = chosen?.fileSize || chosen?.size || null;

        if (!dlUrl) {
            await Shefzyreply('❌ Could not extract episode URL.\n\n🔧 Raw: ' + JSON.stringify(chosen)?.slice(0, 300));
            break;
        }

        //===================
        // Send processing message
        //===================
        const processingMsg = await sock.sendMessage(from, {
            text: '⏳ *Processing Episode...*\n\n📤 Uploading document. Please wait!'
        }, { quoted: m });

        //===================
        // Send the episode as document
        //===================
        const fileName = `${title.replace(/[^a-zA-Z0-9 ]/g, '_')}_${epLabel}_${quality}.mp4`;
        const success = await _sendVideoStream(sock, from, m, dlUrl, fileName, '', `${title} ${epLabel}`, quality, fileSize);

        //===================
        // Delete the processing message
        //===================
        try {
            await sock.sendMessage(from, { delete: processingMsg.key });
        } catch {}

    } catch (e) {
        console.log('[seriesdl] Error:', e.response?.status, e.message);
        await Shefzyreply('❌ Series download failed: ' + (e.response?.status ? 'HTTP ' + e.response.status + ' — ' : '') + e.message);
    }
    break;
}
//===================
// genderpredict: predict gender from name
//===================
case 'genderpredict':
case 'gendername': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'genderpredict <name>\nExample: genderpredict James');
    try {
        const gpRes = await axios.get('https://api.genderize.io/?name=' + encodeURIComponent(text.trim()), { timeout: 10000 });
        const gp = gpRes.data;
        if (!gp.name) return Shefzyreply('❌ Could not predict gender for: ' + text);
        const emoji = gp.gender === 'male' ? '👨' : gp.gender === 'female' ? '👩' : '🧑';
        const prob = gp.probability ? (gp.probability * 100).toFixed(1) : 'N/A';
        await Shefzyreply(
            emoji + ' *Gender Prediction*\n\n' +
            '📝 Name: *' + gp.name + '*\n' +
            '⚧ Gender: *' + (gp.gender || 'Unknown') + '*\n' +
            '📊 Confidence: *' + prob + '%*\n' +
            '🌍 Sample size: ' + (gp.count || 'N/A').toLocaleString() + ' people'
        );
    } catch (e) {
        await Shefzyreply('❌ Gender prediction failed: ' + e.message);
    }
    break;
}

//===================
// zipcode: lookup postal/zip code info
//===================
case 'zipcode':
case 'postalcode': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'zipcode <zip> <country code>\nExample: zipcode 10001 us\nExample: zipcode 100001 cn');
    const zipParts = text.trim().split(' ');
    const zipCode = zipParts[0];
    const zipCountry = (zipParts[1] || 'us').toLowerCase();
    try {
        const zcRes = await axios.get(`https://api.zippopotam.us/${zipCountry}/${zipCode}`, { timeout: 10000 });
        const zc = zcRes.data;
        if (!zc['post code']) return Shefzyreply('❌ Zip code not found: ' + zipCode);
        const places = zc.places || [];
        const placeList = places.slice(0, 5).map(p =>
            '📍 ' + p['place name'] + ', ' + p['state'] + ' (' + p['state abbreviation'] + ')'
        ).join('\n');
        await Shefzyreply(
            '📮 *Zip Code Info*\n\n' +
            '📬 Code: *' + zc['post code'] + '*\n' +
            '🌍 Country: *' + zc['country'] + '* (' + zc['country abbreviation'] + ')\n\n' +
            '📍 *Locations:*\n' + placeList
        );
    } catch (e) {
        if (e.response?.status === 404) return Shefzyreply('❌ Zip code *' + zipCode + '* not found for country *' + zipCountry.toUpperCase() + '*');
        await Shefzyreply('❌ Zip code lookup failed: ' + e.message);
    }
    break;
}

//===================
// advice: random advice slip
//===================
case 'advice':
case 'adviceslip': {
    try {
        const avRes = await axios.get('https://api.adviceslip.com/advice', {
            headers: { 'Accept': 'application/json' },
            timeout: 10000
        });
        const slip = avRes.data?.slip;
        if (!slip) throw new Error('No advice returned');
        await Shefzyreply('💡 *Advice #' + slip.id + '*\n\n_"' + slip.advice + '"_');
    } catch (e) {
        const fallback = [
            'Take it one day at a time.',
            'Be kind to yourself.',
            'Progress, not perfection.',
            'Rest is productive too.',
            'Your effort today shapes your tomorrow.'
        ];
        await Shefzyreply('💡 *Advice*\n\n_"' + fallback[Math.floor(Math.random() * fallback.length)] + '"_');
    }
    break;
}

//===================
// chucknorris: Chuck Norris jokes
//===================
case 'chucknorris':
case 'chuck': {
    const cnCategory = (args[0] || '').toLowerCase();
    const validCats = ['animal', 'career', 'celebrity', 'dev', 'explicit', 'fashion', 'food', 'history', 'money', 'movie', 'music', 'political', 'religion', 'science', 'sport', 'travel'];
    try {
        let cnUrl = 'https://api.chucknorris.io/jokes/random';
        if (cnCategory && validCats.includes(cnCategory) && cnCategory !== 'explicit') {
            cnUrl += '?category=' + cnCategory;
        }
        const cnRes = await axios.get(cnUrl, { timeout: 10000 });
        const joke = cnRes.data?.value;
        if (!joke) throw new Error('No joke');
        await Shefzyreply(
            '🥋 *Chuck Norris Fact*\n\n' + joke + '\n\n' +
            '📂 Categories: ' + validCats.filter(c => c !== 'explicit').join(', ')
        );
    } catch (e) {
        await Shefzyreply('❌ Chuck Norris API failed: ' + e.message);
    }
    break;
}

//===================
// cocktail: search cocktail recipes
//===================
case 'cocktail':
case 'drink': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'cocktail <name>\nExample: cocktail margarita\nOr: cocktail random');
    try {
        let ctUrl;
        if (text.toLowerCase() === 'random') {
            ctUrl = 'https://www.thecocktaildb.com/api/json/v1/1/random.php';
        } else {
            ctUrl = 'https://www.thecocktaildb.com/api/json/v1/1/search.php?s=' + encodeURIComponent(text);
        }
        const ctRes = await axios.get(ctUrl, { timeout: 12000 });
        const drink = ctRes.data?.drinks?.[0];
        if (!drink) return Shefzyreply('❌ Cocktail not found: *' + text + '*\n\nTry: cocktail random');

        // Build ingredients list
        const ingredients = [];
        for (let i = 1; i <= 15; i++) {
            const ing = drink['strIngredient' + i];
            const measure = drink['strMeasure' + i];
            if (ing) ingredients.push((measure ? measure.trim() + ' ' : '') + ing);
        }

        const info =
            '🍹 *' + drink.strDrink + '*\n\n' +
            '🏷️ Category: ' + (drink.strCategory || 'N/A') + '\n' +
            '🍸 Glass: ' + (drink.strGlass || 'N/A') + '\n' +
            '🔞 Alcoholic: ' + (drink.strAlcoholic || 'N/A') + '\n\n' +
            '🧪 *Ingredients:*\n' + ingredients.map(i => '• ' + i).join('\n') + '\n\n' +
            '📋 *Instructions:*\n' + (drink.strInstructions || 'N/A').slice(0, 500);

        const thumb = drink.strDrinkThumb;
        if (thumb) {
            await sock.sendMessage(from, { image: { url: thumb }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Cocktail search failed: ' + e.message);
    }
    break;
}

//===================
// asteroid: near-Earth asteroid data
//===================
case 'asteroid':
case 'nearearth': {
    try {
        await Shefzyreply('🌌 Fetching near-Earth asteroid data...');
        const astRes = await axios.get('https://ssd-api.jpl.nasa.gov/cad.api?limit=5&sort=-dist&dist-max=0.05', { timeout: 15000 });
        const data = astRes.data;
        const fields = data.fields || [];
        const objects = data.data || [];
        if (!objects.length) return Shefzyreply('❌ No asteroid data available right now.');

        const desIdx = fields.indexOf('des');
        const distIdx = fields.indexOf('dist');
        const dateIdx = fields.indexOf('cd');
        const vrelIdx = fields.indexOf('v_rel');
        const diamIdx = fields.indexOf('diameter');

        const astText = objects.slice(0, 5).map((obj, i) => {
            const dist = parseFloat(obj[distIdx] || 0);
            const distKm = (dist * 149597870.7).toFixed(0);
            return (
                `${i+1}. ☄️ *${obj[desIdx] || 'Unknown'}*\n` +
                `   📏 Distance: ${Number(distKm).toLocaleString()} km\n` +
                `   📅 Close approach: ${obj[dateIdx] || 'N/A'}\n` +
                `   💨 Speed: ${parseFloat(obj[vrelIdx] || 0).toFixed(2)} km/s\n` +
                `   📐 Diameter: ${obj[diamIdx] ? parseFloat(obj[diamIdx]).toFixed(3) + ' km' : 'Unknown'}`
            );
        }).join('\n\n');

        await Shefzyreply('☄️ *Near-Earth Asteroids*\n\n' + astText + '\n\n🔭 Source: NASA JPL Close Approach Data');
    } catch (e) {
        await Shefzyreply('❌ Asteroid data failed: ' + e.message);
    }
    break;
}

//===================
// artwork: search Met Museum artworks
//===================
case 'artwork':
case 'metmuseum': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'artwork <search term>\nExample: artwork sunflowers\nExample: artwork random');
    try {
        await Shefzyreply('🎨 Searching artworks...');
        let objectId;
        if (text.toLowerCase() === 'random') {
            // Random object from highlighted objects
            const randRes = await axios.get('https://collectionapi.metmuseum.org/public/collection/v1/objects?hasImages=true', { timeout: 15000 });
            const ids = randRes.data?.objectIDs || [];
            objectId = ids[Math.floor(Math.random() * Math.min(ids.length, 1000))];
        } else {
            const searchRes = await axios.get('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=' + encodeURIComponent(text), { timeout: 15000 });
            const ids = searchRes.data?.objectIDs || [];
            if (!ids.length) return Shefzyreply('❌ No artworks found for: *' + text + '*');
            objectId = ids[0];
        }
        const artRes = await axios.get('https://collectionapi.metmuseum.org/public/collection/v1/objects/' + objectId, { timeout: 15000 });
        const art = artRes.data;
        if (!art) return Shefzyreply('❌ Artwork not found.');
        const info =
            '🎨 *' + (art.title || 'Untitled') + '*\n\n' +
            '👨‍🎨 Artist: ' + (art.artistDisplayName || 'Unknown') + '\n' +
            '📅 Date: ' + (art.objectDate || 'N/A') + '\n' +
            '🏛️ Department: ' + (art.department || 'N/A') + '\n' +
            '🌍 Culture: ' + (art.culture || 'N/A') + '\n' +
            '🖼️ Medium: ' + (art.medium || 'N/A') + '\n' +
            '📐 Dimensions: ' + (art.dimensions || 'N/A') + '\n' +
            '🏛️ Museum: The Metropolitan Museum of Art\n' +
            '🔗 ' + (art.objectURL || 'https://metmuseum.org');
        const imgUrl = art.primaryImageSmall || art.primaryImage;
        if (imgUrl) {
            await sock.sendMessage(from, { image: { url: imgUrl }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Artwork search failed: ' + e.message);
    }
    break;
}

//===================
// aidetect: detect if text was AI-written
//===================
case 'aidetect':
case 'isaitext': {
    const detectText = text || m.quoted?.text;
    if (!detectText) return Shefzyreply('❌ Usage: ' + prefix + 'aidetect <text>\nOr reply to a message\nExample: aidetect The quick brown fox jumped...');
    if (detectText.length < 50) return Shefzyreply('❌ Text is too short! Provide at least 50 characters for accurate detection.');
    try {
        await Shefzyreply('🔍 Analyzing text...');
        const aidRes = await axios.post('https://checktica.com/api/detect', {
            text: detectText.slice(0, 2000)
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000
        });
        const result = aidRes.data;
        const score = result?.ai_probability ?? result?.score ?? result?.result?.ai_probability;
        if (score === undefined) throw new Error('No score returned');
        const pct = (parseFloat(score) * 100).toFixed(1);
        const isAi = parseFloat(pct) >= 70;
        const emoji = isAi ? '🤖' : '👤';
        await Shefzyreply(
            emoji + ' *AI Text Detection*\n\n' +
            '📊 AI Probability: *' + pct + '%*\n' +
            '🏷️ Verdict: *' + (isAi ? 'Likely AI Generated 🤖' : 'Likely Human Written 👤') + '*\n\n' +
            '📝 Analyzed: ' + detectText.slice(0, 80) + (detectText.length > 80 ? '...' : '')
        );
    } catch (e) {
        // Fallback simple heuristic
        const words = detectText.split(' ').length;
        const avgWordLen = detectText.replace(/\s/g, '').length / words;
        const hasFormalWords = /furthermore|moreover|however|therefore|consequently|nevertheless/i.test(detectText);
        const score2 = (hasFormalWords ? 60 : 30) + (avgWordLen > 5.5 ? 20 : 0);
        await Shefzyreply(
            '🔍 *AI Text Detection*\n\n' +
            '⚠️ Could not connect to detection API\n' +
            '📊 Basic analysis: *' + score2 + '% AI-like patterns*\n\n' +
            '💡 For accurate results try: writer.com/ai-content-detector'
        );
    }
    break;
}

//===================
// nasaphoto / apod: NASA Astronomy Picture of the Day
//===================
case 'nasaphoto':
case 'apod':
case 'nasa': {
    try {
        await Shefzyreply('🔭 Fetching NASA picture of the day...');
        // APOD with demo key (limited but works)
        const nasaRes = await axios.get('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY', { timeout: 20000 });
        const apod = nasaRes.data;
        if (!apod) throw new Error('No data');
        const info =
            '🔭 *NASA — Astronomy Picture of the Day*\n\n' +
            '🌟 *' + (apod.title || 'Untitled') + '*\n' +
            '📅 Date: ' + (apod.date || 'N/A') + '\n' +
            '👨‍🔬 Credit: ' + (apod.copyright || 'NASA') + '\n\n' +
            '📝 ' + (apod.explanation || '').slice(0, 500) + (apod.explanation?.length > 500 ? '...' : '');
        const mediaUrl = apod.url || apod.hdurl;
        if (mediaUrl && apod.media_type === 'image') {
            await sock.sendMessage(from, { image: { url: mediaUrl }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info + (mediaUrl ? '\n\n🔗 ' + mediaUrl : ''));
        }
    } catch (e) {
        await Shefzyreply('❌ NASA APOD failed: ' + e.message + '\n\n🔗 Visit: https://apod.nasa.gov');
    }
    break;
}

//===================
// f1: Formula 1 data
//===================
case 'f1':
case 'formula1': {
    const f1Sub = (args[0] || 'latest').toLowerCase();
    try {
        if (f1Sub === 'drivers' || f1Sub === 'standings') {
            // Driver standings via Ergast
            const f1Res = await axios.get('https://ergast.com/api/f1/current/driverStandings.json', { timeout: 15000 });
            const standings = f1Res.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
            if (!standings.length) return Shefzyreply('❌ F1 standings not available right now.');
            const top10 = standings.slice(0, 10).map(s =>
                `${s.position}. 🏎️ *${s.Driver.givenName} ${s.Driver.familyName}*\n` +
                `   🏁 ${s.Constructors[0]?.name || 'N/A'} | 🏆 ${s.points} pts`
            ).join('\n\n');
            await Shefzyreply('🏎️ *F1 Driver Standings ' + new Date().getFullYear() + '*\n\n' + top10);
        } else if (f1Sub === 'constructors' || f1Sub === 'teams') {
            const f1Res = await axios.get('https://ergast.com/api/f1/current/constructorStandings.json', { timeout: 15000 });
            const standings = f1Res.data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
            const teamList = standings.slice(0, 10).map(s =>
                `${s.position}. 🏎️ *${s.Constructor.name}* — ${s.points} pts`
            ).join('\n');
            await Shefzyreply('🏎️ *F1 Constructor Standings ' + new Date().getFullYear() + '*\n\n' + teamList);
        } else if (f1Sub === 'schedule' || f1Sub === 'races') {
            const f1Res = await axios.get('https://ergast.com/api/f1/current.json', { timeout: 15000 });
            const races = f1Res.data?.MRData?.RaceTable?.Races || [];
            const upcoming = races.filter(r => new Date(r.date) >= new Date()).slice(0, 5);
            if (!upcoming.length) return Shefzyreply('❌ No upcoming F1 races found.');
            const raceList = upcoming.map((r, i) =>
                `${i+1}. 🏁 *${r.raceName}*\n   📍 ${r.Circuit.circuitName}, ${r.Circuit.Location.country}\n   📅 ${r.date}`
            ).join('\n\n');
            await Shefzyreply('🏎️ *Upcoming F1 Races*\n\n' + raceList);
        } else {
            // Latest race result
            const f1Res = await axios.get('https://ergast.com/api/f1/current/last/results.json', { timeout: 15000 });
            const race = f1Res.data?.MRData?.RaceTable?.Races?.[0];
            if (!race) return Shefzyreply('❌ No recent race data found.');
            const top5 = (race.Results || []).slice(0, 5).map(r =>
                `${r.position}. 🏎️ *${r.Driver.givenName} ${r.Driver.familyName}*\n` +
                `   🏁 ${r.Constructor.name} | ⏱️ ${r.Time?.time || r.status}`
            ).join('\n\n');
            await Shefzyreply(
                '🏎️ *' + race.raceName + ' Results*\n' +
                '📅 ' + race.date + ' | 📍 ' + race.Circuit.circuitName + '\n\n' +
                top5 + '\n\n' +
                '💡 Options: f1 drivers | f1 constructors | f1 schedule'
            );
        }
    } catch (e) {
        await Shefzyreply('❌ F1 data failed: ' + e.message);
    }
    break;
}

//===================
// nhl: NHL stats and scores
//===================
case 'nhl': {
    const nhlSub = (args[0] || 'scores').toLowerCase();
    try {
        if (nhlSub === 'standings') {
            const nhlRes = await axios.get('https://api-web.nhle.com/v1/standings/now', { timeout: 15000 });
            const standings = nhlRes.data?.standings || [];
            const top10 = standings.slice(0, 10).map((t, i) =>
                `${i+1}. 🏒 *${t.teamName?.default || t.teamAbbrev?.default}*\n` +
                `   W:${t.wins} L:${t.losses} OT:${t.otLosses} | Pts: ${t.points}`
            ).join('\n\n');
            await Shefzyreply('🏒 *NHL Standings*\n\n' + top10);
        } else {
            // Today's scores
            const today = new Date().toISOString().split('T')[0];
            const nhlRes = await axios.get('https://api-web.nhle.com/v1/score/' + today, { timeout: 15000 });
            const games = nhlRes.data?.games || [];
            if (!games.length) return Shefzyreply('🏒 No NHL games today.\n\nTry: ' + prefix + 'nhl standings');
            const gameText = games.slice(0, 8).map(g =>
                `🏒 *${g.awayTeam?.abbrev}* vs *${g.homeTeam?.abbrev}*\n` +
                `   📊 ${g.awayTeam?.score ?? '?'} - ${g.homeTeam?.score ?? '?'}\n` +
                `   🕐 ${g.gameState || 'Scheduled'}`
            ).join('\n\n');
            await Shefzyreply('🏒 *NHL Scores — Today*\n\n' + gameText + '\n\nTry: ' + prefix + 'nhl standings');
        }
    } catch (e) {
        await Shefzyreply('❌ NHL data failed: ' + e.message);
    }
    break;
}

//===================
// tarot: daily tarot card reading
//===================
case 'tarot':
case 'tarotcard': {
    try {
        const tarotRes = await axios.get('https://tarotapi.dev/api/v1/cards/random?n=1', { timeout: 12000 });
        const card = tarotRes.data?.cards?.[0];
        if (!card) throw new Error('No card data');
        const meanings = card.meaning_up || card.meaning_rev || 'Seek within yourself for the answer.';
        await Shefzyreply(
            '🔮 *Tarot Card Reading*\n\n' +
            '🃏 *' + (card.name || 'Unknown Card') + '*\n' +
            '📂 Type: ' + (card.type || 'N/A') + '\n' +
            '🌟 Suit: ' + (card.suit || 'Major Arcana') + '\n' +
            '⬆️ Upright: ' + (card.meaning_up || 'N/A').slice(0, 200) + '\n' +
            '⬇️ Reversed: ' + (card.meaning_rev || 'N/A').slice(0, 200) + '\n\n' +
            '📖 *Description:*\n' + (card.desc || 'No description available.').slice(0, 400)
        );
    } catch (e) {
        // Fallback with static cards
        const cards = [
            { name: 'The Fool', meaning: 'New beginnings, innocence, spontaneity. A leap of faith awaits you.' },
            { name: 'The Star', meaning: 'Hope, inspiration, serenity. Better days are coming.' },
            { name: 'The Moon', meaning: 'Illusion, fear, the unconscious. Trust your intuition.' },
            { name: 'The Sun', meaning: 'Joy, success, positivity. Bright times are ahead.' },
            { name: 'The Tower', meaning: 'Sudden change, upheaval, revelation. Embrace transformation.' },
            { name: 'The World', meaning: 'Completion, integration, accomplishment. You are whole.' },
        ];
        const card2 = cards[Math.floor(Math.random() * cards.length)];
        await Shefzyreply('🔮 *Tarot Reading*\n\n🃏 *' + card2.name + '*\n\n📖 ' + card2.meaning);
    }
    break;
}

//===================
// makeup: search makeup products
//===================
case 'makeup':
case 'beauty': {
    if (!text) return Shefzyreply(
        '❌ Usage: ' + prefix + 'makeup <brand or type>\n\n' +
        'Examples:\n' +
        '• makeup maybelline\n' +
        '• makeup lipstick\n' +
        '• makeup nyx blush\n\n' +
        'Brands: maybelline, nyx, covergirl, milani, elf, almay'
    );
    try {
        await Shefzyreply('💄 Searching makeup products...');
        // Try brand first, then product type
        const brands = ['maybelline', 'nyx', 'covergirl', 'milani', 'elf', 'almay', 'wet n wild', 'revlon', 'loreal'];
        const productTypes = ['blush', 'bronzer', 'eyebrow', 'eyeliner', 'eyeshadow', 'foundation', 'lip liner', 'lipstick', 'mascara', 'nail polish'];
        const textL = text.toLowerCase();
        const brand = brands.find(b => textL.includes(b));
        const ptype = productTypes.find(p => textL.includes(p));

        let mkUrl = 'https://makeup-api.herokuapp.com/api/v1/products.json?';
        if (brand) mkUrl += 'brand=' + encodeURIComponent(brand) + '&';
        if (ptype) mkUrl += 'product_type=' + encodeURIComponent(ptype) + '&';

        const mkRes = await axios.get(mkUrl, { timeout: 15000 });
        const products = mkRes.data || [];
        if (!products.length) return Shefzyreply('❌ No products found for: *' + text + '*\n\nTry a brand name like: maybelline, nyx, elf');

        const top3 = products.slice(0, 3);
        let msg = '💄 *Makeup Products — ' + text + '*\n\n';
        for (const p of top3) {
            msg += `*${p.name || 'Unknown'}*\n`;
            msg += `🏷️ Brand: ${p.brand || 'N/A'}\n`;
            msg += `📂 Type: ${p.product_type || 'N/A'}\n`;
            msg += `💰 Price: ${p.price ? '$' + p.price : 'N/A'}\n`;
            msg += `⭐ Rating: ${p.rating || 'N/A'}\n`;
            msg += `🔗 ${p.product_link || ''}\n\n`;
        }
        msg += '💡 Showing ' + top3.length + ' of ' + products.length + ' results';

        // Send with image if available
        const firstImg = top3[0]?.image_link;
        if (firstImg) {
            await sock.sendMessage(from, { image: { url: firstImg }, caption: msg }, { quoted: m });
        } else {
            await Shefzyreply(msg);
        }
    } catch (e) {
        await Shefzyreply('❌ Makeup search failed: ' + e.message);
    }
    break;
}

//===================
// jokeplus: advanced jokes with filters
//===================
case 'jokeplus':
case 'jokex': {
    const jTypes = ['any', 'single', 'twopart'];
    const jCats = ['programming', 'misc', 'dark', 'pun', 'spooky', 'christmas'];
    const jCat = args.find(a => jCats.includes(a.toLowerCase())) || 'any';
    const jType = args.find(a => jTypes.includes(a.toLowerCase())) || 'any';
    try {
        const jUrl = `https://v2.jokeapi.dev/joke/${jCat === 'any' ? 'Any' : jCat}?blacklistFlags=racist,sexist&type=${jType === 'any' ? '' : jType}&lang=en`;
        const jRes = await axios.get(jUrl, { timeout: 10000 });
        const joke = jRes.data;
        if (joke.error) throw new Error(joke.message || 'API error');
        let jokeText;
        if (joke.type === 'single') {
            jokeText = joke.joke;
        } else {
            jokeText = joke.setup + '\n\n_' + joke.delivery + '_';
        }
        await Shefzyreply(
            '😂 *Joke (' + (joke.category || jCat) + ')*\n\n' + jokeText + '\n\n' +
            '💡 Categories: ' + jCats.join(', ')
        );
    } catch (e) {
        await Shefzyreply('❌ Joke API failed: ' + e.message);
    }
    break;
}

//===================
// remotejobs: browse remote job listings
//===================
case 'remotejobs':
case 'jobs': {
    const jobQuery = text || '';
    try {
        await Shefzyreply('💼 Fetching remote jobs...');
        let jobUrl = 'https://jobicy.com/api/v2/remote-jobs?count=5';
        if (jobQuery) jobUrl += '&tag=' + encodeURIComponent(jobQuery);
        const jobRes = await axios.get(jobUrl, { timeout: 20000 });
        const jobs = jobRes.data?.jobs || [];
        if (!jobs.length) return Shefzyreply('❌ No remote jobs found' + (jobQuery ? ' for: ' + jobQuery : '') + '\n\nTry: jobs developer\nTry: jobs design\nTry: jobs marketing');
        let msg = '💼 *Remote Jobs' + (jobQuery ? ' — ' + jobQuery : '') + '*\n\n';
        jobs.slice(0, 5).forEach((j, i) => {
            msg += `${i+1}. *${j.jobTitle || 'Unknown Role'}*\n`;
            msg += `   🏢 ${j.companyName || 'N/A'}\n`;
            msg += `   💰 ${j.annualSalaryMin ? '$' + Number(j.annualSalaryMin).toLocaleString() + ' - $' + Number(j.annualSalaryMax).toLocaleString() : 'Salary N/A'}\n`;
            msg += `   🌍 ${j.jobGeo || 'Worldwide'}\n`;
            msg += `   🔗 ${j.url || ''}\n\n`;
        });
        msg += '💡 Showing ' + Math.min(jobs.length, 5) + ' of ' + jobs.length + ' jobs\nFilter: jobs <skill>';
        await Shefzyreply(msg);
    } catch (e) {
        await Shefzyreply('❌ Jobs fetch failed: ' + e.message + '\n\n🔗 Visit: https://jobicy.com/remote-jobs');
    }
    break;
}

//===================
// colorinfo: get full info on a hex color
//===================
case 'colorinfo':
case 'color': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'colorinfo <hex color>\nExample: colorinfo ff0000\nExample: colorinfo 1a2b3c');
    const hexInput = text.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{3,6}$/.test(hexInput)) return Shefzyreply('❌ Invalid hex color! Example: ff0000 or 1a2b3c');
    try {
        const colorRes = await axios.get('https://www.thecolorapi.com/id?hex=' + hexInput + '&format=json', { timeout: 10000 });
        const c = colorRes.data;
        if (!c.name) throw new Error('No data');
        await Shefzyreply(
            '🎨 *Color Info*\n\n' +
            '🏷️ Name: *' + c.name.value + '*\n' +
            '🔵 Hex: *#' + c.hex?.value + '*\n' +
            '🔴 RGB: *' + c.rgb?.value + '*\n' +
            '🟡 HSL: *' + c.hsl?.value + '*\n' +
            '🟢 HSV: *' + c.hsv?.value + '*\n' +
            '🔷 CMYK: *' + c.cmyk?.value + '*\n' +
            '🌑 XYZ: *' + c.XYZ?.value + '*\n\n' +
            '🖼️ Preview: https://www.thecolorapi.com/id?hex=' + hexInput + '&format=svg'
        );
    } catch (e) {
        await Shefzyreply('❌ Color info failed: ' + e.message);
    }
    break;
}

//===================
// moviedb: free movie/series info
//===================
case 'moviedb':
case 'filminfo': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'moviedb <title>\nExample: moviedb inception');
    try {
        await Shefzyreply('🎬 Searching movies...');
        // Using OMDB (free key included)
        const omdbRes = await axios.get('https://www.omdbapi.com/?apikey=thewdb&t=' + encodeURIComponent(text), { timeout: 12000 });
        const mv = omdbRes.data;
        if (mv.Response === 'False' || !mv.Title) {
            // Try search instead of exact match
            const omdbSearch = await axios.get('https://www.omdbapi.com/?apikey=thewdb&s=' + encodeURIComponent(text), { timeout: 12000 });
            const first = omdbSearch.data?.Search?.[0];
            if (!first) return Shefzyreply('❌ Movie not found: *' + text + '*');
            const mvDetail = await axios.get('https://www.omdbapi.com/?apikey=thewdb&i=' + first.imdbID, { timeout: 12000 });
            const m2 = mvDetail.data;
            const info2 =
                '🎬 *' + m2.Title + '* (' + m2.Year + ')\n\n' +
                '🎭 Genre: ' + (m2.Genre || 'N/A') + '\n' +
                '⏱️ Runtime: ' + (m2.Runtime || 'N/A') + '\n' +
                '⭐ IMDB: ' + (m2.imdbRating || 'N/A') + '/10\n' +
                '🎬 Director: ' + (m2.Director || 'N/A') + '\n' +
                '🌟 Cast: ' + (m2.Actors || 'N/A') + '\n' +
                '🏆 Awards: ' + (m2.Awards || 'N/A') + '\n\n' +
                '📖 ' + (m2.Plot || 'N/A');
            if (m2.Poster && m2.Poster !== 'N/A') {
                await sock.sendMessage(from, { image: { url: m2.Poster }, caption: info2 }, { quoted: m });
            } else {
                await Shefzyreply(info2);
            }
            break;
        }
        const info =
            '🎬 *' + mv.Title + '* (' + mv.Year + ')\n\n' +
            '🎭 Genre: ' + (mv.Genre || 'N/A') + '\n' +
            '⏱️ Runtime: ' + (mv.Runtime || 'N/A') + '\n' +
            '⭐ IMDB: ' + (mv.imdbRating || 'N/A') + '/10\n' +
            '🎬 Director: ' + (mv.Director || 'N/A') + '\n' +
            '🌟 Cast: ' + (mv.Actors || 'N/A') + '\n' +
            '🏆 Awards: ' + (mv.Awards || 'N/A') + '\n\n' +
            '📖 ' + (mv.Plot || 'N/A');
        if (mv.Poster && mv.Poster !== 'N/A') {
            await sock.sendMessage(from, { image: { url: mv.Poster }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Movie info failed: ' + e.message);
    }
    break;
}

//===================
// musicinfo: artist/album metadata
//===================
case 'musicinfo':
case 'artistinfo': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'musicinfo <artist name>\nExample: musicinfo Drake');
    try {
        await Shefzyreply('🎵 Searching artist info...');
        const mbRes = await axios.get('https://musicbrainz.org/ws/2/artist/?query=' + encodeURIComponent(text) + '&fmt=json', {
            headers: { 'User-Agent': 'MichikoBot/3.0 (shefzytech@gmail.com)' },
            timeout: 15000
        });
        const artist = mbRes.data?.artists?.[0];
        if (!artist) return Shefzyreply('❌ Artist not found: *' + text + '*');

        // Get releases
        const relRes = await axios.get(`https://musicbrainz.org/ws/2/release?artist=${artist.id}&fmt=json&limit=5`, {
            headers: { 'User-Agent': 'MichikoBot/3.0 (shefzytech@gmail.com)' },
            timeout: 15000
        }).catch(() => null);
        const releases = relRes?.data?.releases || [];

        const msg =
            '🎵 *' + artist.name + '*\n\n' +
            '🎭 Type: ' + (artist.type || 'N/A') + '\n' +
            '🌍 Country: ' + (artist.country || 'N/A') + '\n' +
            '📅 Active: ' + (artist['life-span']?.begin || 'N/A') + ' — ' + (artist['life-span']?.end || 'Present') + '\n' +
            '🏷️ Genres: ' + (artist.tags?.slice(0, 5).map(t => t.name).join(', ') || 'N/A') + '\n' +
            '⭐ Score: ' + (artist.score || 'N/A') + '\n\n' +
            (releases.length ? '💿 *Recent Releases:*\n' + releases.map((r, i) => `${i+1}. ${r.title} (${r.date?.split('-')[0] || 'N/A'})`).join('\n') : '');
        await Shefzyreply(msg);
    } catch (e) {
        await Shefzyreply('❌ Music info failed: ' + e.message);
    }
    break;
}

//===================
// digimon: Digimon character info
//===================
case 'digimon': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'digimon <name or random>\nExample: digimon agumon\nExample: digimon random');
    try {
        let digi;
        if (text.toLowerCase() === 'random') {
            const randId = Math.floor(Math.random() * 1460) + 1;
            const dRes = await axios.get('https://digi-api.com/api/v1/digimon/' + randId, { timeout: 12000 });
            digi = dRes.data;
        } else {
            const dRes = await axios.get('https://digi-api.com/api/v1/digimon?name=' + encodeURIComponent(text), { timeout: 12000 });
            digi = dRes.data?.content?.[0];
            if (!digi) return Shefzyreply('❌ Digimon not found: *' + text + '*');
            const dDetail = await axios.get('https://digi-api.com/api/v1/digimon/' + digi.id, { timeout: 12000 });
            digi = dDetail.data;
        }
        if (!digi) return Shefzyreply('❌ Digimon not found!');
        const levels = digi.levels?.map(l => l.level).join(', ') || 'N/A';
        const types = digi.types?.map(t => t.type).join(', ') || 'N/A';
        const attribs = digi.attributes?.map(a => a.attribute).join(', ') || 'N/A';
        const fields = digi.fields?.map(f => f.field).join(', ') || 'N/A';
        const info =
            '🦕 *' + (digi.name || 'Unknown') + '*\n\n' +
            '⭐ Level: ' + levels + '\n' +
            '🔷 Type: ' + types + '\n' +
            '🔮 Attribute: ' + attribs + '\n' +
            '📂 Field: ' + fields + '\n\n' +
            '📖 ' + (digi.descriptions?.find(d => d.language === 'en')?.description || 'No description available.').slice(0, 400);
        const imgUrl = digi.images?.[0]?.href;
        if (imgUrl) {
            await sock.sendMessage(from, { image: { url: imgUrl }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Digimon search failed: ' + e.message);
    }
    break;
}

//===================
// disney: Disney character info
//===================
case 'disney':
case 'disneychar': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'disney <character name>\nExample: disney mickey\nExample: disney random');
    try {
        let char;
        if (text.toLowerCase() === 'random') {
            const randPage = Math.floor(Math.random() * 100) + 1;
            const dRes = await axios.get('https://api.disneyapi.dev/character?page=' + randPage + '&pageSize=1', { timeout: 12000 });
            char = dRes.data?.data?.[0];
        } else {
            const dRes = await axios.get('https://api.disneyapi.dev/character?name=' + encodeURIComponent(text), { timeout: 12000 });
            char = dRes.data?.data?.[0];
        }
        if (!char) return Shefzyreply('❌ Disney character not found: *' + text + '*');
        const info =
            '🏰 *' + (char.name || 'Unknown') + '*\n\n' +
            '🎬 Films: ' + (char.films?.slice(0, 5).join(', ') || 'N/A') + '\n' +
            '📺 TV Shows: ' + (char.tvShows?.slice(0, 5).join(', ') || 'N/A') + '\n' +
            '🎮 Video Games: ' + (char.videoGames?.slice(0, 3).join(', ') || 'N/A') + '\n' +
            '🎠 Park Attractions: ' + (char.parkAttractions?.slice(0, 3).join(', ') || 'N/A') + '\n' +
            '🔗 ' + (char.sourceUrl || 'https://disneyapi.dev');
        const imgUrl = char.imageUrl;
        if (imgUrl) {
            await sock.sendMessage(from, { image: { url: imgUrl }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Disney search failed: ' + e.message);
    }
    break;
}

//===================
// breakingbad: Breaking Bad quotes
//===================
case 'breakingbad':
case 'bbquote': {
    try {
        const bbRes = await axios.get('https://api.breakingbadquotes.xyz/v1/quotes', { timeout: 10000 });
        const quote = bbRes.data?.[0];
        if (!quote) throw new Error('No quote');
        await Shefzyreply('🔵 *Breaking Bad Quote*\n\n_"' + quote.quote + '"_\n\n— *' + quote.author + '*');
    } catch (e) {
        const fallback = [
            { q: 'I am the one who knocks.', a: 'Walter White' },
            { q: 'Yeah, science!', a: 'Jesse Pinkman' },
            { q: 'Say my name.', a: 'Walter White' },
            { q: "You clearly don't know who you're talking to.", a: 'Walter White' },
            { q: "I watched Jane die. I could have saved her, but I didn't.", a: 'Walter White' },
        ];
        const f = fallback[Math.floor(Math.random() * fallback.length)];
        await Shefzyreply('🔵 *Breaking Bad Quote*\n\n_"' + f.q + '"_\n\n— *' + f.a + '*');
    }
    break;
}

//===================
// betterweather: Open-Meteo (no key needed)
//===================
case 'forecast':
case 'betterweather': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'forecast <city>\nExample: forecast Lagos');
    try {
        await Shefzyreply('🌤️ Fetching forecast for: *' + text + '*...');
        // First geocode the city
        const geoRes = await axios.get('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(text) + '&count=1&language=en&format=json', { timeout: 10000 });
        const loc = geoRes.data?.results?.[0];
        if (!loc) return Shefzyreply('❌ City not found: *' + text + '*');

        // Get weather
        const wtRes = await axios.get(
            `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
            `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
            `&timezone=auto&forecast_days=5`,
            { timeout: 15000 }
        );
        const w = wtRes.data;
        const cur = w.current;
        const daily = w.daily;

        const weatherCodes = {
            0: '☀️ Clear', 1: '🌤️ Mainly Clear', 2: '⛅ Partly Cloudy', 3: '☁️ Overcast',
            45: '🌫️ Foggy', 48: '🌫️ Icy Fog', 51: '🌦️ Light Drizzle', 53: '🌧️ Drizzle',
            61: '🌧️ Light Rain', 63: '🌧️ Moderate Rain', 65: '🌧️ Heavy Rain',
            71: '🌨️ Light Snow', 73: '❄️ Moderate Snow', 75: '❄️ Heavy Snow',
            80: '🌦️ Rain Showers', 95: '⛈️ Thunderstorm', 99: '⛈️ Heavy Thunderstorm'
        };

        const wDesc = weatherCodes[cur.weather_code] || '🌡️ Unknown';
        let msg =
            '🌤️ *Weather — ' + loc.name + ', ' + (loc.country || '') + '*\n\n' +
            '*Current:*\n' +
            wDesc + '\n' +
            '🌡️ Temp: *' + cur.temperature_2m + '°C* (Feels: ' + cur.apparent_temperature + '°C)\n' +
            '💧 Humidity: ' + cur.relative_humidity_2m + '%\n' +
            '💨 Wind: ' + cur.wind_speed_10m + ' km/h\n\n' +
            '*5-Day Forecast:*\n';

        const days = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];
        for (let i = 0; i < 5; i++) {
            const dCode = weatherCodes[daily.weather_code[i]] || '🌡️';
            msg += `${days[i]}: ${dCode} ${daily.temperature_2m_min[i]}°C — ${daily.temperature_2m_max[i]}°C 🌧️${daily.precipitation_sum[i]}mm\n`;
        }
        await Shefzyreply(msg);
    } catch (e) {
        await Shefzyreply('❌ Forecast failed: ' + e.message);
    }
    break;
}

//===================
// pollinationsimg: AI image generation (no key)
//===================
case 'genimage':
case 'pollinationsimg':
case 'pollinations': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'genimage <prompt>\nExample: genimage a futuristic city at night');
    try {
        await Shefzyreply('🎨 Generating image...\n\n📝 Prompt: ' + text);
        const safePrompt = encodeURIComponent(text.slice(0, 500));
        const seed = Math.floor(Math.random() * 99999);
        const imgUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=768&height=768&seed=${seed}&nologo=true`;
        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 60000 });
        await sock.sendMessage(from, {
            image: Buffer.from(imgBuf.data),
            caption: '🎨 *AI Generated Image*\n\n📝 Prompt: ' + text,
            mimetype: 'image/jpeg'
        }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Image generation failed: ' + e.message + '\n\n💡 Try a simpler prompt');
    }
    break;
}




//===================
// readqr: decode a QR code from image
//===================
case 'readqr':
case 'scanqr': {
    if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to a QR code image with ' + prefix + 'readqr');
    try {
        await Shefzyreply('🔍 Scanning QR code...');
        const qrBuf = await m.quoted.download();
        // Upload to imgbb first then scan
        const qrForm = new FormData();
        qrForm.append('image', qrBuf.toString('base64'));
        qrForm.append('key', '6d207e02198a847aa98d0a2a901485a5');
        const uploadRes = await axios.post('https://api.imgbb.com/1/upload', qrForm, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 20000
        });
        const imgUrl = uploadRes.data?.data?.url;
        if (!imgUrl) throw new Error('Upload failed');
        const scanRes = await axios.get('https://api.qrserver.com/v1/read-qr-code/?fileurl=' + encodeURIComponent(imgUrl), { timeout: 15000 });
        const result = scanRes.data?.[0]?.symbol?.[0]?.data;
        if (!result) return Shefzyreply('❌ No QR code found in the image!');
        await Shefzyreply('✅ *QR Code Decoded!*\n\n📋 Content:\n' + result);
    } catch (e) {
        await Shefzyreply('❌ QR scan failed: ' + e.message);
    }
    break;
}

//===================
// shorturl / tinyurl
//===================
case 'shorturl':
case 'tinyurl':
case 'shrink': {
    const urlToShorten = args[0] || text;
    if (!urlToShorten || !urlToShorten.startsWith('http')) return Shefzyreply('❌ Usage: ' + prefix + 'shorturl <url>\nExample: shorturl https://google.com');
    try {
        // TinyURL API (free, no key)
        const tRes = await axios.get('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(urlToShorten), { timeout: 10000 });
        if (tRes.data && tRes.data.startsWith('http')) {
            await Shefzyreply('🔗 *URL Shortened!*\n\n📎 Original:\n' + urlToShorten + '\n\n✅ Short URL:\n' + tRes.data);
        } else {
            throw new Error('Invalid response');
        }
    } catch (e) {
        // Fallback: is.gd
        try {
            const igRes = await axios.get('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(urlToShorten), { timeout: 10000 });
            await Shefzyreply('🔗 *URL Shortened!*\n\n📎 Original:\n' + urlToShorten + '\n\n✅ Short URL:\n' + igRes.data);
        } catch {
            await Shefzyreply('❌ URL shortening failed: ' + e.message);
        }
    }
    break;
}

//===================
// pdftotext: extract text from PDF
//===================
case 'pdftotext':
case 'pdftxt': {
    if (!m.quoted || m.quoted.mtype !== 'documentMessage') return Shefzyreply('❌ Reply to a PDF document with ' + prefix + 'pdftotext');
    const mime = m.quoted.mimetype || m.quoted.msg?.mimetype || '';
    if (!mime.includes('pdf')) return Shefzyreply('❌ The replied document must be a PDF file!');
    try {
        await Shefzyreply('📄 Extracting text from PDF...');
        const pdfBuf = await m.quoted.download();
        // Use pdf2json via base64 approach with pdfextract API
        const pdfForm = new FormData();
        pdfForm.append('file', pdfBuf, { filename: 'document.pdf', contentType: 'application/pdf' });
        const pdfRes = await axios.post('https://api.pdfrest.com/extracted-text', pdfForm, {
            headers: { ...pdfForm.getHeaders(), 'Api-Key': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
            timeout: 30000
        }).catch(() => null);

        // Fallback: use pdf-co or simple text extraction
        if (!pdfRes?.data) {
            // Try Heavstal doc-extract
            const hvPdf = await axios.post(HEAVSTAL_BASE + 'doc-extract', pdfForm, {
                headers: { ...pdfForm.getHeaders(), 'x-api-key': HEAVSTAL_KEY },
                timeout: 30000
            }).catch(() => null);

            const extracted = hvPdf?.data?.data?.text || hvPdf?.data?.text;
            if (extracted) {
                const chunks = extracted.slice(0, 3000);
                return await Shefzyreply('📄 *PDF Text Extracted*\n\n' + chunks + (extracted.length > 3000 ? '\n\n_(truncated — ' + extracted.length + ' chars total)_' : ''));
            }
            return await Shefzyreply('❌ Could not extract text from this PDF. It may be image-based or encrypted.');
        }

        const text2 = pdfRes.data?.extracted_text || pdfRes.data?.text || '';
        await Shefzyreply('📄 *PDF Text Extracted*\n\n' + text2.slice(0, 3000) + (text2.length > 3000 ? '\n\n_(truncated)_' : ''));
    } catch (e) {
        await Shefzyreply('❌ PDF extraction failed: ' + e.message);
    }
    break;
}

//===================
// forward / fwrd: forward a message to a JID
//===================
case 'forward':
case 'fwrd': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner/sudo only!');
    if (!m.quoted) return Shefzyreply('❌ Reply to a message to forward it!');
    const fwTarget = args[0];
    if (!fwTarget) return Shefzyreply('❌ Usage: ' + prefix + 'forward <jid or number>\nExample: forward 234xxx or forward 1234@g.us');
    try {
        const fwJid = fwTarget.includes('@') ? fwTarget : fwTarget.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        const fwMsg = m.quoted;
        const fwMtype = fwMsg.mtype;

        if (fwMtype === 'conversation' || fwMtype === 'extendedTextMessage') {
            await sock.sendMessage(fwJid, { text: fwMsg.text || fwMsg.body });
        } else if (fwMtype === 'imageMessage') {
            const buf = await fwMsg.download();
            await sock.sendMessage(fwJid, { image: buf, caption: fwMsg.caption || '' });
        } else if (fwMtype === 'videoMessage') {
            const buf = await fwMsg.download();
            await sock.sendMessage(fwJid, { video: buf, caption: fwMsg.caption || '' });
        } else if (fwMtype === 'audioMessage') {
            const buf = await fwMsg.download();
            await sock.sendMessage(fwJid, { audio: buf, mimetype: 'audio/mpeg' });
        } else if (fwMtype === 'stickerMessage') {
            const buf = await fwMsg.download();
            await sock.sendMessage(fwJid, { sticker: buf });
        } else if (fwMtype === 'documentMessage') {
            const buf = await fwMsg.download();
            await sock.sendMessage(fwJid, { document: buf, mimetype: fwMsg.mimetype || 'application/octet-stream', fileName: fwMsg.fileName || 'file' });
        } else {
            return Shefzyreply('❌ Unsupported message type to forward!');
        }
        await Shefzyreply('✅ Message forwarded to ' + fwJid.split('@')[0]);
    } catch (e) {
        await Shefzyreply('❌ Forward failed: ' + e.message);
    }
    break;
}

//===================
// volaudio / audiovol: adjust audio volume
//===================
case 'volaudio':
case 'audiovolume':
case 'audvol': {
    if (!m.quoted || !['audioMessage', 'videoMessage'].includes(m.quoted.mtype)) {
        return Shefzyreply('❌ Reply to an audio or video with ' + prefix + 'volaudio <volume>\nExample: volaudio 2.0 (2x louder) or volaudio 0.5 (half)');
    }
    const volLevel = parseFloat(args[0]);
    if (isNaN(volLevel) || volLevel <= 0 || volLevel > 10) return Shefzyreply('❌ Volume must be between 0.1 and 10\nExample: volaudio 2.0');
    const { exec: vaExec } = require('child_process');
    const { promisify: vaProm } = require('util');
    const vaExecP = vaProm(vaExec);
    const vaDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(vaDir)) fs.mkdirSync(vaDir, { recursive: true });
    const vaTs = Date.now();
    const vaIn = path.join(vaDir, 'va_' + vaTs + '_in.mp3');
    const vaOut = path.join(vaDir, 'va_' + vaTs + '_out.mp3');
    try {
        await Shefzyreply('🔊 Adjusting volume to ' + volLevel + 'x...');
        const vaBuf = await m.quoted.download();
        fs.writeFileSync(vaIn, vaBuf);
        await vaExecP('"' + ffmpegPath + '" -y -i "' + vaIn + '" -filter:a "volume=' + volLevel + '" "' + vaOut + '"');
        const vaResult = fs.readFileSync(vaOut);
        await sock.sendMessage(from, { audio: vaResult, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Volume adjustment failed: ' + e.message);
    } finally {
        for (const f of [vaIn, vaOut]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
    }
    break;
}

//===================
// volvideo: adjust video volume
//===================
case 'volvideo':
case 'videovolume':
case 'vidvol': {
    if (!m.quoted || m.quoted.mtype !== 'videoMessage') {
        return Shefzyreply('❌ Reply to a video with ' + prefix + 'volvideo <volume>\nExample: volvideo 2.0');
    }
    const vvLevel = parseFloat(args[0]);
    if (isNaN(vvLevel) || vvLevel <= 0 || vvLevel > 10) return Shefzyreply('❌ Volume must be between 0.1 and 10');
    const { exec: vvExec } = require('child_process');
    const { promisify: vvProm } = require('util');
    const vvExecP = vvProm(vvExec);
    const vvDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(vvDir)) fs.mkdirSync(vvDir, { recursive: true });
    const vvTs = Date.now();
    const vvIn = path.join(vvDir, 'vv_' + vvTs + '_in.mp4');
    const vvOut = path.join(vvDir, 'vv_' + vvTs + '_out.mp4');
    try {
        await Shefzyreply('🔊 Adjusting video volume to ' + vvLevel + 'x...');
        const vvBuf = await m.quoted.download();
        fs.writeFileSync(vvIn, vvBuf);
        await vvExecP('"' + ffmpegPath + '" -y -i "' + vvIn + '" -filter:a "volume=' + vvLevel + '" -c:v copy "' + vvOut + '"');
        const vvResult = fs.readFileSync(vvOut);
        await sock.sendMessage(from, { video: vvResult, mimetype: 'video/mp4' }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Video volume adjustment failed: ' + e.message);
    } finally {
        for (const f of [vvIn, vvOut]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
    }
    break;
}

//===================
// horoscope: daily horoscope by zodiac sign
//===================
case 'horoscope':
case 'zodiac': {
    const signs = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
    const sign = (args[0] || text || '').toLowerCase().trim();
    if (!sign || !signs.includes(sign)) {
        return Shefzyreply('❌ Usage: ' + prefix + 'horoscope <sign>\n\nSigns: ' + signs.join(', '));
    }
    try {
        const horoRes = await axios.get('https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=' + sign + '&day=TODAY', { timeout: 12000 });
        const h = horoRes.data?.data;
        if (!h) throw new Error('no data');
        const emojiMap = {
            aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍',
            libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓'
        };
        await Shefzyreply(
            emojiMap[sign] + ' *' + sign.toUpperCase() + ' Horoscope*\n' +
            '📅 ' + (h.date || 'Today') + '\n\n' +
            '📖 ' + (h.horoscope_data || h.description || 'No reading available')
        );
    } catch (e) {
        // Fallback with static readings
        const readings = [
            'Today brings new opportunities. Trust your instincts and move forward with confidence.',
            'Focus on what matters most. A challenge today leads to growth tomorrow.',
            'Your energy is high today. Use it to tackle goals you have been postponing.',
            'Relationships take center stage. A meaningful conversation could change everything.',
            'Financial matters need attention. Be cautious with spending today.',
        ];
        await Shefzyreply(
            '✨ *' + sign.toUpperCase() + ' Daily Reading*\n\n' +
            readings[Math.floor(Math.random() * readings.length)]
        );
    }
    break;
}

//===================
// dadjoke
//===================
case 'dadjoke':
case 'djoke': {
    try {
        const djRes = await axios.get('https://icanhazdadjoke.com/', {
            headers: { 'Accept': 'application/json', 'User-Agent': 'MichikoBot/1.0' },
            timeout: 10000
        });
        await Shefzyreply('👨 *Dad Joke*\n\n' + djRes.data.joke);
    } catch {
        const dadJokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "I'm reading a book about anti-gravity. It's impossible to put down!",
            "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
            "Why did the scarecrow win an award? Because he was outstanding in his field!",
            "I used to hate facial hair, but then it grew on me."
        ];
        await Shefzyreply('👨 *Dad Joke*\n\n' + dadJokes[Math.floor(Math.random() * dadJokes.length)]);
    }
    break;
}

//===================
// wordchain / wcg: word chain game
//===================
case 'wordchain':
case 'wcg': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    const wcKey = from + '_wordchain';
    const wcSub = (args[0] || '').toLowerCase();

    if (wcSub === 'stop' || wcSub === 'end') {
        if (!gameSessions.has(wcKey)) return Shefzyreply('❌ No word chain game running!');
        const wc = gameSessions.get(wcKey);
        gameSessions.delete(wcKey);
        return Shefzyreply('🔤 *Word Chain Ended!*\n\n📊 Total words: ' + wc.words.length + '\n🏆 Last word: *' + (wc.lastWord || 'N/A') + '*');
    }

    if (gameSessions.has(wcKey)) {
        // Player submitting a word
        const wc = gameSessions.get(wcKey);
        const newWord = (text || args[0] || '').toLowerCase().trim().replace(/[^a-z]/g, '');
        if (!newWord) return Shefzyreply('❌ Send a valid word!');
        const lastChar = wc.lastWord.slice(-1);
        if (newWord[0] !== lastChar) return Shefzyreply('❌ Word must start with *' + lastChar.toUpperCase() + '*!\nLast word: *' + wc.lastWord + '*');
        if (wc.words.includes(newWord)) return Shefzyreply('❌ *' + newWord + '* already used! Try another word.');
        if (newWord.length < 2) return Shefzyreply('❌ Word must be at least 2 letters!');
        wc.words.push(newWord);
        wc.lastWord = newWord;
        wc.lastPlayer = sender;
        await sock.sendMessage(from, {
            text: '✅ *' + newWord.toUpperCase() + '*\n\n🔤 Next word must start with: *' + newWord.slice(-1).toUpperCase() + '*\n📊 Words so far: ' + wc.words.length + '\n\n💡 Type any word starting with *' + newWord.slice(-1).toUpperCase() + '*',
            mentions: [sender]
        }, { quoted: m });
        break;
    }

    // Start new game
    const startWords = ['apple', 'orange', 'elephant', 'tiger', 'river', 'nature', 'energy', 'yellow', 'water', 'light'];
    const startWord = startWords[Math.floor(Math.random() * startWords.length)];
    gameSessions.set(wcKey, { lastWord: startWord, words: [startWord], lastPlayer: null });
    await Shefzyreply('🔤 *Word Chain Game Started!*\n\n📌 Rules:\n• Each word must start with the last letter of the previous word\n• No repeating words\n• Min 2 letters\n\n🎯 Starting word: *' + startWord.toUpperCase() + '*\n\nNext word must start with: *' + startWord.slice(-1).toUpperCase() + '*\n\nStop game: ' + prefix + 'wcg stop');
    break;
}

//===================
// rich-message HTML mini games (games.js) — Tetris, 2048, Flappy Dash
//===================
case 'tetris': {
    try {
        await sendTetris(sock, from);
        await sock.sendMessage(from, { react: { text: '🧱', key: m.key } });
    } catch (error) {
        console.error('tetris error:', error);
        await Shefzyreply('❌ Could not load Tetris: ' + error.message);
    }
    break;
}

case '2048':
case 'game2048': {
    try {
        await send2048(sock, from);
        await sock.sendMessage(from, { react: { text: '🔢', key: m.key } });
    } catch (error) {
        console.error('2048 error:', error);
        await Shefzyreply('❌ Could not load 2048: ' + error.message);
    }
    break;
}

case 'flappy':
case 'flappybird':
case 'flappydash': {
    try {
        await sendFlappy(sock, from);
        await sock.sendMessage(from, { react: { text: '🐦', key: m.key } });
    } catch (error) {
        console.error('flappy error:', error);
        await Shefzyreply('❌ Could not load Flappy Dash: ' + error.message);
    }
    break;
}

case 'xo':
case 'tictactoeai': {
    try {
        await sendTicTacToe(sock, from);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
    } catch (error) {
        console.error('xo error:', error);
        await Shefzyreply('❌ Could not load Tic-Tac-Toe: ' + error.message);
    }
    break;
}

case 'simon':
case 'simonsays': {
    try {
        await sendSimon(sock, from);
        await sock.sendMessage(from, { react: { text: '🎨', key: m.key } });
    } catch (error) {
        console.error('simon error:', error);
        await Shefzyreply('❌ Could not load Simon Says: ' + error.message);
    }
    break;
}

case 'snake': {
    try {
        await sendSnake(sock, from);
        await sock.sendMessage(from, { react: { text: '🐍', key: m.key } });
    } catch (error) {
        console.error('snake error:', error);
        await Shefzyreply('❌ Could not load Snake: ' + error.message);
    }
    break;
}

case 'breakout':
case 'brickbreaker': {
    try {
        await sendBreakout(sock, from);
        await sock.sendMessage(from, { react: { text: '🧱', key: m.key } });
    } catch (error) {
        console.error('breakout error:', error);
        await Shefzyreply('❌ Could not load Breakout: ' + error.message);
    }
    break;
}

case 'pong': {
    try {
        await sendPong(sock, from);
        await sock.sendMessage(from, { react: { text: '🏓', key: m.key } });
    } catch (error) {
        console.error('pong error:', error);
        await Shefzyreply('❌ Could not load Pong: ' + error.message);
    }
    break;
}

case 'whack':
case 'whackamole': {
    try {
        await sendWhack(sock, from);
        await sock.sendMessage(from, { react: { text: '🔨', key: m.key } });
    } catch (error) {
        console.error('whack error:', error);
        await Shefzyreply('❌ Could not load Whack-a-Mole: ' + error.message);
    }
    break;
}

case 'invaders':
case 'spaceinvaders': {
    try {
        await sendInvaders(sock, from);
        await sock.sendMessage(from, { react: { text: '👾', key: m.key } });
    } catch (error) {
        console.error('invaders error:', error);
        await Shefzyreply('❌ Could not load Space Invaders: ' + error.message);
    }
    break;
}

case 'memory':
case 'memorymatch': {
    try {
        await sendMemory(sock, from);
        await sock.sendMessage(from, { react: { text: '🧠', key: m.key } });
    } catch (error) {
        console.error('memory error:', error);
        await Shefzyreply('❌ Could not load Memory Match: ' + error.message);
    }
    break;
}

case 'minesweeper':
case 'mines': {
    try {
        await sendMinesweeper(sock, from);
        await sock.sendMessage(from, { react: { text: '💣', key: m.key } });
    } catch (error) {
        console.error('minesweeper error:', error);
        await Shefzyreply('❌ Could not load Minesweeper: ' + error.message);
    }
    break;
}

case 'hangmangame': {
    try {
        await sendHangman(sock, from);
        await sock.sendMessage(from, { react: { text: '📝', key: m.key } });
    } catch (error) {
        console.error('hangmangame error:', error);
        await Shefzyreply('❌ Could not load Hangman: ' + error.message);
    }
    break;
}

case 'connect4':
case 'connectfour': {
    try {
        await sendConnectFour(sock, from);
        await sock.sendMessage(from, { react: { text: '🔴', key: m.key } });
    } catch (error) {
        console.error('connect4 error:', error);
        await Shefzyreply('❌ Could not load Connect Four: ' + error.message);
    }
    break;
}

case 'reaction':
case 'reactiontest': {
    try {
        await sendReaction(sock, from);
        await sock.sendMessage(from, { react: { text: '⚡', key: m.key } });
    } catch (error) {
        console.error('reaction error:', error);
        await Shefzyreply('❌ Could not load Reaction Test: ' + error.message);
    }
    break;
}

case 'bubblepop': {
    try {
        await sendBubblePop(sock, from);
        await sock.sendMessage(from, { react: { text: '🫧', key: m.key } });
    } catch (error) {
        console.error('bubblepop error:', error);
        await Shefzyreply('❌ Could not load Bubble Pop: ' + error.message);
    }
    break;
}

case 'wordle': {
    try {
        await sendWordle(sock, from);
        await sock.sendMessage(from, { react: { text: '🟩', key: m.key } });
    } catch (error) {
        console.error('wordle error:', error);
        await Shefzyreply('❌ Could not load Wordle: ' + error.message);
    }
    break;
}

case 'wordsearch': {
    try {
        await sendWordSearch(sock, from);
        await sock.sendMessage(from, { react: { text: '🔎', key: m.key } });
    } catch (error) {
        console.error('wordsearch error:', error);
        await Shefzyreply('❌ Could not load Word Search: ' + error.message);
    }
    break;
}

case 'rpsgame': {
    try {
        await sendRPS(sock, from);
        await sock.sendMessage(from, { react: { text: '✊', key: m.key } });
    } catch (error) {
        console.error('rpsgame error:', error);
        await Shefzyreply('❌ Could not load Rock Paper Scissors: ' + error.message);
    }
    break;
}

case 'checkers': {
    try {
        await sendCheckers(sock, from);
        await sock.sendMessage(from, { react: { text: '⚫', key: m.key } });
    } catch (error) {
        console.error('checkers error:', error);
        await Shefzyreply('❌ Could not load Checkers: ' + error.message);
    }
    break;
}

case 'stacktower':
case 'stack': {
    try {
        await sendStackTower(sock, from);
        await sock.sendMessage(from, { react: { text: '🗼', key: m.key } });
    } catch (error) {
        console.error('stacktower error:', error);
        await Shefzyreply('❌ Could not load Stack Tower: ' + error.message);
    }
    break;
}

case 'sudoku': {
    try {
        await sendSudoku(sock, from);
        await sock.sendMessage(from, { react: { text: '🔢', key: m.key } });
    } catch (error) {
        console.error('sudoku error:', error);
        await Shefzyreply('❌ Could not load Sudoku: ' + error.message);
    }
    break;
}

case 'fruitslicer':
case 'slicer': {
    try {
        await sendFruitSlicer(sock, from);
        await sock.sendMessage(from, { react: { text: '🍉', key: m.key } });
    } catch (error) {
        console.error('fruitslicer error:', error);
        await Shefzyreply('❌ Could not load Fruit Slicer: ' + error.message);
    }
    break;
}

case 'archery': {
    try {
        await sendArchery(sock, from);
        await sock.sendMessage(from, { react: { text: '🏹', key: m.key } });
    } catch (error) {
        console.error('archery error:', error);
        await Shefzyreply('❌ Could not load Archery: ' + error.message);
    }
    break;
}

case 'airhockey':
case 'hockey': {
    try {
        await sendAirHockey(sock, from);
        await sock.sendMessage(from, { react: { text: '🏒', key: m.key } });
    } catch (error) {
        console.error('airhockey error:', error);
        await Shefzyreply('❌ Could not load Air Hockey: ' + error.message);
    }
    break;
}

case 'chess': {
    try {
        await sendChess(sock, from);
        await sock.sendMessage(from, { react: { text: '♟️', key: m.key } });
    } catch (error) {
        console.error('chess error:', error);
        await Shefzyreply('❌ Could not load Chess: ' + error.message);
    }
    break;
}

case 'ludo': {
    try {
        await sendLudo(sock, from);
        await sock.sendMessage(from, { react: { text: '🎲', key: m.key } });
    } catch (error) {
        console.error('ludo error:', error);
        await Shefzyreply('❌ Could not load Ludo: ' + error.message);
    }
    break;
}

//===================
// emojiquiz: guess the emoji
//===================
case 'emojiquiz':
case 'eqz': {
    const emojiQuizzes = [
        { emoji: '🌊🏄', answer: 'surfing' },
        { emoji: '🍕🍕🍕', answer: 'pizza party' },
        { emoji: '👑🦁', answer: 'lion king' },
        { emoji: '🕷️🕸️🦸', answer: 'spider man' },
        { emoji: '❄️👸', answer: 'frozen' },
        { emoji: '🚀🌙', answer: 'moon landing' },
        { emoji: '🦇🕵️', answer: 'batman' },
        { emoji: '🏴‍☠️⚓🌊', answer: 'pirates' },
        { emoji: '🎸🤘🎵', answer: 'rock music' },
        { emoji: '👻🎃🕯️', answer: 'halloween' },
        { emoji: '🌹💀☠️', answer: 'beauty and the beast' },
        { emoji: '🐟🤿🌊', answer: 'finding nemo' },
        { emoji: '🧙‍♂️⚡📚', answer: 'harry potter' },
        { emoji: '🦸‍♂️🦸‍♀️💥', answer: 'avengers' },
        { emoji: '🚗⚡🤖', answer: 'transformers' },
    ];
    const eqKey = from + '_emojiquiz';
    if (gameSessions.has(eqKey)) {
        const eq = gameSessions.get(eqKey);
        if (Date.now() > eq.expires) {
            gameSessions.delete(eqKey);
        } else {
            return Shefzyreply('⚠️ A quiz is still running!\nAnswer: ' + prefix + 'eqanswer <your guess>\nGive up: ' + prefix + 'eqanswer skip');
        }
    }
    const quiz = emojiQuizzes[Math.floor(Math.random() * emojiQuizzes.length)];
    gameSessions.set(eqKey, { answer: quiz.answer, expires: Date.now() + 45000 });
    await Shefzyreply('🎮 *Emoji Quiz!*\n\n' + quiz.emoji + '\n\nWhat does this represent?\n\nAnswer: ' + prefix + 'eqanswer <guess> (45s)');
    setTimeout(() => {
        if (gameSessions.has(eqKey)) {
            gameSessions.delete(eqKey);
            sock.sendMessage(from, { text: '⏰ Time\'s up! The answer was: *' + quiz.answer + '*' });
        }
    }, 45000);
    break;
}

case 'eqanswer':
case 'eqa': {
    const eqKey2 = from + '_emojiquiz';
    if (!gameSessions.has(eqKey2)) return Shefzyreply('❌ No emoji quiz running! Start with: ' + prefix + 'emojiquiz');
    const eq = gameSessions.get(eqKey2);
    if (Date.now() > eq.expires) {
        gameSessions.delete(eqKey2);
        return Shefzyreply('⏰ Time\'s up! The answer was: *' + eq.answer + '*');
    }
    const guess = text.toLowerCase().trim();
    gameSessions.delete(eqKey2);
    if (guess === 'skip') return Shefzyreply('⏭️ Skipped! The answer was: *' + eq.answer + '*');
    if (guess === eq.answer || eq.answer.includes(guess) || guess.includes(eq.answer.split(' ')[0])) {
        await Shefzyreply('🎉 *Correct!* The answer was *' + eq.answer + '*!\n\n🏆 Well done @' + senderNumber + '!');
    } else {
        await Shefzyreply('❌ Wrong! The answer was *' + eq.answer + '*\nYou guessed: *' + guess + '*');
    }
    break;
}

//===================
// brat text effect (viral trend)
//===================
case 'brat':
case 'brattext': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'brat <text>\nExample: brat michiko');
    try {
        const sharp = require('sharp');
        const bratText = text.toLowerCase().trim();
        // Brat style: lime green (#8ACE00) background, blurry/smudged black text
        const width = 800, height = 400;
        const fontSize = bratText.length > 10 ? 60 : 80;
        const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#8ACE00"/>
            <text x="50%" y="55%" fill="#000000" font-size="${fontSize}" 
                  font-weight="900" text-anchor="middle" font-family="Arial, sans-serif"
                  dominant-baseline="middle" letter-spacing="-2"
                  style="filter: blur(0.8px)">${bratText}</text>
        </svg>`;
        const bratImg = await sharp(Buffer.from(svg))
            .blur(0.6)
            .png()
            .toBuffer();
        await sock.sendMessage(from, {
            image: bratImg,
            caption: '💚 *brat*',
            mimetype: 'image/png'
        }, { quoted: m });
    } catch (e) {
        console.log('brat error:', e.message);
        await Shefzyreply('❌ Brat effect failed: ' + e.message);
    }
    break;
}

//===================
// carbon: code screenshot
//===================
case 'carbon':
case 'code2img': {
    if (!text && !m.quoted?.text) return Shefzyreply('❌ Usage: ' + prefix + 'carbon <code>\nOr reply to a code message');
    try {
        const codeText = text || m.quoted.text;
        await Shefzyreply('⏳ Generating code image...');
        // Use Carbon API
        const carbonRes = await axios.post('https://carbonara.solopov.dev/api/cook', {
            code: codeText,
            theme: 'one-dark',
            language: 'auto',
            fontFamily: 'Fira Code',
            fontSize: '14px',
            backgroundColor: '#1e1e2e',
            paddingVertical: '40px',
            paddingHorizontal: '40px',
        }, {
            responseType: 'arraybuffer',
            timeout: 30000
        });
        await sock.sendMessage(from, {
            image: Buffer.from(carbonRes.data),
            caption: '💻 *Code Image*',
            mimetype: 'image/png'
        }, { quoted: m });
    } catch (e) {
        // Fallback: ray.so style via sharp
        try {
            const sharp = require('sharp');
            const codeText2 = (text || m.quoted?.text || '').slice(0, 500);
            const lines = codeText2.split('\n');
            const height = Math.max(300, lines.length * 24 + 80);
            const svg = `<svg width="800" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#1e1e2e" rx="12"/>
                <circle cx="30" cy="30" r="8" fill="#ff5f57"/>
                <circle cx="55" cy="30" r="8" fill="#febc2e"/>
                <circle cx="80" cy="30" r="8" fill="#28c840"/>
                ${lines.map((line, i) => `<text x="20" y="${60 + i * 22}" fill="#cdd6f4" font-size="13" font-family="monospace">${line.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}</text>`).join('')}
            </svg>`;
            const cImg = await sharp(Buffer.from(svg)).png().toBuffer();
            await sock.sendMessage(from, { image: cImg, caption: '💻 *Code Image*' }, { quoted: m });
        } catch {
            await Shefzyreply('❌ Carbon failed: ' + e.message);
        }
    }
    break;
}

//===================
// wanted: wanted poster meme
//===================
case 'wanted': {
    const mediaTypes = ['imageMessage'];
    const hasQuoted = m.quoted && mediaTypes.includes(m.quoted.mtype);
    const hasDirect = mediaTypes.includes(m.mtype);
    if (!hasQuoted && !hasDirect) return Shefzyreply('❌ Reply to or send an image with ' + prefix + 'wanted');
    try {
        const wantedBuf = hasQuoted ? await m.quoted.download() : await m.download();
        const sharp = require('sharp');
        const size = 400;
        const resized = await sharp(wantedBuf).resize(size, size, { fit: 'cover' }).toBuffer();
        const svg = `<svg width="500" height="600" xmlns="http://www.w3.org/2000/svg">
            <rect width="500" height="600" fill="#d4a656"/>
            <rect x="20" y="20" width="460" height="560" fill="none" stroke="#8B4513" stroke-width="8"/>
            <rect x="30" y="30" width="440" height="540" fill="none" stroke="#8B4513" stroke-width="3"/>
            <text x="250" y="85" text-anchor="middle" fill="#8B0000" font-size="52" font-weight="bold" font-family="serif">WANTED</text>
            <text x="250" y="110" text-anchor="middle" fill="#8B0000" font-size="18" font-family="serif">DEAD OR ALIVE</text>
            <image href="data:image/jpeg;base64,${resized.toString('base64')}" x="50" y="125" width="400" height="300"/>
            <text x="250" y="480" text-anchor="middle" fill="#8B0000" font-size="22" font-weight="bold" font-family="serif">REWARD: $50,000</text>
            <text x="250" y="520" text-anchor="middle" fill="#333" font-size="14" font-family="serif">For information leading to capture</text>
            <text x="250" y="555" text-anchor="middle" fill="#333" font-size="12" font-family="serif">Contact local authorities</text>
        </svg>`;
        const wanted = await sharp(Buffer.from(svg)).png().toBuffer();
        await sock.sendMessage(from, { image: wanted, caption: '🔫 *WANTED*' }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Wanted poster failed: ' + e.message);
    }
    break;
}

//===================
// wasted: GTA wasted effect
//===================
case 'wasted': {
    const hasQ = m.quoted && m.quoted.mtype === 'imageMessage';
    const hasD = m.mtype === 'imageMessage';
    if (!hasQ && !hasD) return Shefzyreply('❌ Reply to or send an image with ' + prefix + 'wasted');
    try {
        const wBuf = hasQ ? await m.quoted.download() : await m.download();
        const sharp = require('sharp');
        const wImg = await sharp(wBuf)
            .resize(512, 512, { fit: 'cover' })
            .greyscale()
            .toBuffer();
        const { width: wW, height: wH } = await sharp(wImg).metadata();
        const svg = `<svg width="${wW}" height="${wH}" xmlns="http://www.w3.org/2000/svg">
            <text x="50%" y="50%" text-anchor="middle" fill="#ff0000" font-size="80" 
                  font-weight="900" font-family="Impact" dominant-baseline="middle"
                  stroke="#000" stroke-width="3">WASTED</text>
        </svg>`;
        const wResult = await sharp(wImg)
            .composite([{ input: Buffer.from(svg), blend: 'over' }])
            .png().toBuffer();
        await sock.sendMessage(from, { image: wResult, caption: '💀 *WASTED*' }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Wasted effect failed: ' + e.message);
    }
    break;
}

//===================
// jail: put user behind bars
//===================
case 'jail': {
    const hasQJ = m.quoted && m.quoted.mtype === 'imageMessage';
    const hasDJ = m.mtype === 'imageMessage';
    if (!hasQJ && !hasDJ) return Shefzyreply('❌ Reply to or send an image with ' + prefix + 'jail');
    try {
        const jBuf = hasQJ ? await m.quoted.download() : await m.download();
        const sharp = require('sharp');
        const jImg = await sharp(jBuf).resize(400, 400, { fit: 'cover' }).toBuffer();
        const barSvg = `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="50" height="400" fill="rgba(80,40,0,0.85)"/>
            <rect x="75" y="0" width="50" height="400" fill="rgba(80,40,0,0.85)"/>
            <rect x="150" y="0" width="50" height="400" fill="rgba(80,40,0,0.85)"/>
            <rect x="225" y="0" width="50" height="400" fill="rgba(80,40,0,0.85)"/>
            <rect x="300" y="0" width="50" height="400" fill="rgba(80,40,0,0.85)"/>
            <rect x="350" y="0" width="50" height="400" fill="rgba(80,40,0,0.85)"/>
            <rect x="0" y="180" width="400" height="40" fill="rgba(60,30,0,0.9)"/>
            <text x="200" y="30" text-anchor="middle" fill="white" font-size="22" font-weight="bold" font-family="Arial">🔒 JAILED 🔒</text>
        </svg>`;
        const jResult = await sharp(jImg)
            .composite([{ input: Buffer.from(barSvg), blend: 'over' }])
            .png().toBuffer();
        await sock.sendMessage(from, { image: jResult, caption: '🔒 *JAILED!*' }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Jail effect failed: ' + e.message);
    }
    break;
}

//===================
// invert: invert image colors
//===================
case 'invert':
case 'negative': {
    const hasQI = m.quoted && m.quoted.mtype === 'imageMessage';
    const hasDI = m.mtype === 'imageMessage';
    if (!hasQI && !hasDI) return Shefzyreply('❌ Reply to or send an image with ' + prefix + 'invert');
    try {
        const iBuf = hasQI ? await m.quoted.download() : await m.download();
        const sharp = require('sharp');
        const iResult = await sharp(iBuf).negate().png().toBuffer();
        await sock.sendMessage(from, { image: iResult, caption: '🔄 *Inverted!*' }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Invert failed: ' + e.message);
    }
    break;
}

//===================
// rainbow: rainbow effect on image
//===================
case 'rainbow': {
    const hasQR = m.quoted && m.quoted.mtype === 'imageMessage';
    const hasDR = m.mtype === 'imageMessage';
    if (!hasQR && !hasDR) return Shefzyreply('❌ Reply to or send an image with ' + prefix + 'rainbow');
    try {
        const rBuf = hasQR ? await m.quoted.download() : await m.download();
        const sharp = require('sharp');
        const rMeta = await sharp(rBuf).metadata();
        const rW = rMeta.width, rH = rMeta.height;
        const rainbowSvg = `<svg width="${rW}" height="${rH}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#ff0000" stop-opacity="0.3"/>
                    <stop offset="16%" stop-color="#ff7700" stop-opacity="0.3"/>
                    <stop offset="33%" stop-color="#ffff00" stop-opacity="0.3"/>
                    <stop offset="50%" stop-color="#00ff00" stop-opacity="0.3"/>
                    <stop offset="66%" stop-color="#0000ff" stop-opacity="0.3"/>
                    <stop offset="83%" stop-color="#8b00ff" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="#ff0000" stop-opacity="0.3"/>
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#rainbow)"/>
        </svg>`;
        const rResized = await sharp(rBuf).resize(rW, rH).toBuffer();
        const rResult = await sharp(rResized)
            .composite([{ input: Buffer.from(rainbowSvg), blend: 'overlay' }])
            .png().toBuffer();
        await sock.sendMessage(from, { image: rResult, caption: '🌈 *Rainbow Effect!*' }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ Rainbow effect failed: ' + e.message);
    }
    break;
}

//===================
// remini / hd: AI image enhancer
//===================
case 'remini':
case 'enhance':
case 'hd': {
    const hasQH = m.quoted && m.quoted.mtype === 'imageMessage';
    const hasDH = m.mtype === 'imageMessage';
    if (!hasQH && !hasDH) return Shefzyreply('❌ Reply to or send an image with ' + prefix + 'hd');
    try {
        await Shefzyreply('✨ Enhancing image quality...');
        const hdBuf = hasQH ? await m.quoted.download() : await m.download();

        // Upload to get URL first
        const hdForm = new URLSearchParams();
        hdForm.append('key', '6d207e02198a847aa98d0a2a901485a5');
        hdForm.append('image', hdBuf.toString('base64'));
        const hdUpload = await axios.post('https://api.imgbb.com/1/upload', hdForm, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 20000
        });
        const hdUrl = hdUpload.data?.data?.url;
        if (!hdUrl) throw new Error('Upload failed');

        // Try remini-like enhancement via deep-image.ai (free tier)
        const diRes = await axios.post('https://deep-image.ai/rest_api/process_result', {
            url: hdUrl,
            width: 'x2',
            height: 'x2'
        }, {
            headers: { 'x-api-key': config.deepImageApiKey || '' },
            timeout: 30000
        }).catch(() => null);

        const enhancedUrl = diRes?.data?.result_url;

        if (enhancedUrl) {
            await sock.sendMessage(from, {
                image: { url: enhancedUrl },
                caption: '✨ *HD Enhanced!* (2x upscaled)'
            }, { quoted: m });
        } else {
            // Fallback: use sharp for basic sharpening + upscale
            const sharp = require('sharp');
            const hdResult = await sharp(hdBuf)
                .resize({ width: Math.min(2000, (await sharp(hdBuf).metadata()).width * 2), kernel: sharp.kernel.lanczos3 })
                .sharpen({ sigma: 1.5, m1: 1, m2: 0.5 })
                .modulate({ brightness: 1.05, saturation: 1.1 })
                .png()
                .toBuffer();
            await sock.sendMessage(from, { image: hdResult, caption: '✨ *Enhanced!* (sharpened + upscaled)' }, { quoted: m });
        }
    } catch (e) {
        await Shefzyreply('❌ Enhancement failed: ' + e.message);
    }
    break;
}

//===================
// anticall: auto-reject incoming calls
//===================
case 'anticall': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner/sudo only!');
    const acSub = args[0]?.toLowerCase();
    if (!acSub || !['on', 'off'].includes(acSub)) {
        const current = userSetting.anticall ? '✅ ON' : '❌ OFF';
        return Shefzyreply('📵 *Anti-Call*\n\nCurrent: ' + current + '\n\nUsage: ' + prefix + 'anticall on/off\n\nWhen ON, all incoming calls will be automatically rejected.');
    }
    updateUserSettings(botNumberRaw, { anticall: acSub === 'on' });
    await Shefzyreply('📵 Anti-call is now *' + acSub.toUpperCase() + '*\n\n' + (acSub === 'on' ? '✅ All incoming calls will be rejected.' : '❌ Calls will no longer be auto-rejected.'));
    break;
}

//===================
// listgc: list all groups bot is in
//===================
case 'listgc':
case 'listgroup':
case 'mygroups': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner/sudo only!');
    try {
        await Shefzyreply('⏳ Fetching all groups...');
        const allGroups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(allGroups);
        if (!groupList.length) return Shefzyreply('❌ Bot is not in any groups!');
        const chunks = [];
        let chunk = '👥 *Groups (' + groupList.length + ' total)*\n\n';
        groupList.forEach((g, i) => {
            const line = (i + 1) + '. *' + g.subject + '*\n   👤 ' + g.participants.length + ' members | 🆔 ' + g.id + '\n\n';
            if ((chunk + line).length > 3500) {
                chunks.push(chunk);
                chunk = '';
            }
            chunk += line;
        });
        if (chunk) chunks.push(chunk);
        for (const c of chunks) {
            await sock.sendMessage(from, { text: c }, { quoted: m });
            await new Promise(r => setTimeout(r, 500));
        }
    } catch (e) {
        await Shefzyreply('❌ Failed to fetch groups: ' + e.message);
    }
    break;
}

//===================
// pintdl: Pinterest image downloader
//===================
case 'pintdl':
case 'pintedl': {
    const pintUrl = args[0] || text;
    if (!pintUrl || !pintUrl.includes('pin')) return Shefzyreply('❌ Usage: ' + prefix + 'pintdl <pinterest link>\nExample: pintdl https://pin.it/xxxxx');
    try {
        await Shefzyreply('⏳ Downloading from Pinterest...');
        // Pinterest direct image extraction
        const pintRes = await axios.get(pintUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            },
            timeout: 15000,
            maxRedirects: 10
        });
        // Extract image from og:image meta tag
        const imgMatch = pintRes.data.match(/<meta property="og:image" content="([^"]+)"/i) ||
                          pintRes.data.match(/"orig":{"url":"([^"]+)"/i) ||
                          pintRes.data.match(/"url":"(https:\/\/i\.pinimg\.com\/originals\/[^"]+)"/i);
        const pintImg = imgMatch?.[1];
        if (pintImg) {
            await sock.sendMessage(from, {
                image: { url: pintImg },
                caption: '📌 *Pinterest Downloaded!*'
            }, { quoted: m });
        } else {
            // Fallback: try via cobalt
            const cobPint = await axios.post('https://cobalt.tools/api/json', {
                url: pintUrl
            }, {
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                timeout: 20000
            });
            const cobUrl = cobPint.data?.url;
            if (cobUrl) {
                await sock.sendMessage(from, { image: { url: cobUrl }, caption: '📌 *Pinterest Downloaded!*' }, { quoted: m });
            } else {
                await Shefzyreply('❌ Could not extract image from this Pinterest link!');
            }
        }
    } catch (e) {
        await Shefzyreply('❌ Pinterest download failed: ' + e.message);
    }
    break;
}

//===================
// gdrive: Google Drive downloader
//===================
case 'gdrive':
case 'gdrivedownload': {
    const gdriveUrl = args[0] || text;
    if (!gdriveUrl || !gdriveUrl.includes('drive.google.com')) {
        return Shefzyreply('❌ Usage: ' + prefix + 'gdrive <google drive link>\nExample: gdrive https://drive.google.com/file/d/xxxxx/view');
    }
    try {
        await Shefzyreply('⏳ Fetching Google Drive file...');
        // Extract file ID
        const fileIdMatch = gdriveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || gdriveUrl.match(/id=([a-zA-Z0-9_-]+)/);
        const fileId = fileIdMatch?.[1];
        if (!fileId) return Shefzyreply('❌ Invalid Google Drive link! Could not extract file ID.');

        // Direct download URL
        const directUrl = 'https://drive.google.com/uc?export=download&id=' + fileId;

        // Get file info first
        const infoRes = await axios.get('https://drive.google.com/file/d/' + fileId + '/view', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        }).catch(() => null);

        const nameMatch = infoRes?.data?.match(/<title>([^<]+)<\/title>/);
        const fileName = nameMatch ? nameMatch[1].replace(' - Google Drive', '').trim() : 'gdrive_file';

        // Try to download
        const dlRes = await axios.get(directUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxRedirects: 10,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const contentType = dlRes.headers['content-type'] || 'application/octet-stream';
        const fileBuffer = Buffer.from(dlRes.data);

        if (fileBuffer.length > 50 * 1024 * 1024) {
            return Shefzyreply('❌ File is too large to send on WhatsApp (>50MB)\n\n📥 Direct download link:\n' + directUrl);
        }

        if (contentType.includes('image')) {
            await sock.sendMessage(from, { image: fileBuffer, caption: '✅ ' + fileName }, { quoted: m });
        } else if (contentType.includes('video')) {
            await sock.sendMessage(from, { video: fileBuffer, caption: '✅ ' + fileName }, { quoted: m });
        } else if (contentType.includes('audio')) {
            await sock.sendMessage(from, { audio: fileBuffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
        } else {
            await sock.sendMessage(from, {
                document: fileBuffer,
                mimetype: contentType,
                fileName: fileName,
                caption: '✅ Downloaded from Google Drive'
            }, { quoted: m });
        }
    } catch (e) {
        console.log('gdrive error:', e.message);
        const fileIdFallback = (args[0] || text).match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (fileIdFallback) {
            await Shefzyreply('❌ Direct download failed (file may require Google login)\n\n📥 Try this link:\nhttps://drive.google.com/uc?export=download&id=' + fileIdFallback);
        } else {
            await Shefzyreply('❌ Google Drive download failed: ' + e.message);
        }
    }
    break;
}


//===================
// tiktokmp3: download TikTok audio only
//===================
case 'tiktokmp3':
case 'ttmp3':
case 'ttaudio': {
    const ttmp3Url = (args[0] || text || '').split(' ')[0];
    if (!ttmp3Url || !ttmp3Url.startsWith('http')) return Shefzyreply('❌ Usage: ' + prefix + 'tiktokmp3 <tiktok link>');
    try {
        await Shefzyreply('⏳ Extracting audio from TikTok...');
        let audioUrl = null;
        let title = 'TikTok Audio';

        // Primary: Heavstal TikTok
        try {
            const hvTt = await axios.post(HEAVSTAL_BASE.replace('/apis/', '/api/v1/') + 'tiktok',
                { query: ttmp3Url },
                { headers: { 'x-api-key': HEAVSTAL_KEY }, timeout: 30000 }
            );
            const d = hvTt.data?.data;
            audioUrl = d?.audio || d?.music || d?.audio_nowm;
            title = d?.title || 'TikTok Audio';
        } catch (e) { console.log('[ttmp3] Heavstal err:', e.message); }

        // Fallback: cobalt audio only
        if (!audioUrl) {
            try {
                const cobRes = await axios.post('https://cobalt.tools/api/json', {
                    url: ttmp3Url, aFormat: 'mp3', isAudioOnly: true
                }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
                audioUrl = cobRes.data?.url;
            } catch {}
        }

        if (!audioUrl) return Shefzyreply('❌ Could not extract audio from this TikTok!');

        const audioBuf = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 60000 });
        await sock.sendMessage(from, {
            audio: Buffer.from(audioBuf.data),
            mimetype: 'audio/mpeg',
            fileName: title.slice(0, 80) + '.mp3',
            ptt: false
        }, { quoted: m });
    } catch (e) {
        await Shefzyreply('❌ TikTok MP3 failed: ' + e.message);
    }
    break;
}

//===================
// tiktok image/photo slides
//===================
case 'tiktokimg':
case 'ttimg':
case 'ttphoto': {
    const ttImgUrl = (args[0] || text || '').split(' ')[0];
    if (!ttImgUrl || !ttImgUrl.startsWith('http')) return Shefzyreply('❌ Usage: ' + prefix + 'tiktokimg <tiktok photo/slideshow link>');
    try {
        await Shefzyreply('⏳ Downloading TikTok images...');

        // Heavstal TikTok - check for images array
        const hvRes = await axios.post(HEAVSTAL_BASE.replace('/apis/', '/api/v1/') + 'tiktok',
            { query: ttImgUrl },
            { headers: { 'x-api-key': HEAVSTAL_KEY }, timeout: 30000 }
        ).catch(() => null);

        const d = hvRes?.data?.data;
        const images = d?.images || d?.image_urls || d?.photos || [];

        if (images.length > 0) {
            await Shefzyreply('📸 Found ' + images.length + ' image(s), sending...');
            for (let i = 0; i < Math.min(images.length, 10); i++) {
                await sock.sendMessage(from, {
                    image: { url: images[i] },
                    caption: i === 0 ? ('📸 *TikTok Photo ' + (i + 1) + '/' + images.length + '*\n' + (d?.title || '')) : ('📸 ' + (i + 1) + '/' + images.length)
                }, { quoted: m });
                await new Promise(r => setTimeout(r, 500));
            }
        } else if (d?.video_nowm) {
            // It's a video, not images
            const vBuf = await axios.get(d.video_nowm, { responseType: 'arraybuffer', timeout: 60000 });
            await sock.sendMessage(from, {
                video: Buffer.from(vBuf.data),
                mimetype: 'video/mp4',
                caption: '🎬 This TikTok is a video, not a photo slideshow!'
            }, { quoted: m });
        } else {
            await Shefzyreply('❌ No images found! This TikTok may be a video.\nTry: ' + prefix + 'tiktok ' + ttImgUrl);
        }
    } catch (e) {
        await Shefzyreply('❌ TikTok image download failed: ' + e.message);
    }
    break;
}

//===================
// ttsearch: search TikTok videos
//===================
case 'ttsearch':
case 'tiktoksearch': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'ttsearch <query>\nExample: ttsearch funny cats');
    try {
        await Shefzyreply('🔍 Searching TikTok for: *' + text + '*...');
        // Use TikTok scraper via RapidAPI or Heavstal
        const ttSearchRes = await axios.get(HEAVSTAL_BASE + 'search/tiktok', {
            params: { q: text },
            headers: { 'x-api-key': HEAVSTAL_KEY },
            timeout: 20000
        }).catch(() => null);

        const results = ttSearchRes?.data?.data || ttSearchRes?.data?.results || [];
        if (!results.length) return Shefzyreply('❌ No TikTok results for: ' + text);

        const top5 = results.slice(0, 5);
        let msg = '🎵 *TikTok Search: ' + text + '*\n\n';
        top5.forEach((v, i) => {
            msg += (i + 1) + '. *' + (v.title || v.desc || 'TikTok Video').slice(0, 60) + '*\n';
            msg += '   👤 ' + (v.author || v.username || 'Unknown') + '\n';
            msg += '   ❤️ ' + ((v.likes || v.like_count || 0)).toLocaleString() + '\n';
            msg += '   🔗 ' + (v.url || v.link || '') + '\n\n';
        });
        await Shefzyreply(msg);
    } catch (e) {
        await Shefzyreply('❌ TikTok search failed: ' + e.message);
    }
    break;
}

//===================
// rizz: rizz/pickup line (alias)
//===================
case 'rizz':
case 'rizzline': {
    const rizzLines = [
        "Are you a bank loan? Because you have my interest.",
        "Do you have a sunburn, or are you always this hot?",
        "Is your name Wi-Fi? Because I'm feeling a connection.",
        "Are you a magician? Whenever I look at you, everyone else disappears.",
        "Do you believe in fate? Because I think we just met.",
        "Are you a parking ticket? Because you've got 'fine' written all over you.",
        "Is your dad a boxer? Because you're a knockout.",
        "Do you have a map? I keep getting lost in your eyes.",
        "Are you a campfire? Because you're hot and I want s'more.",
        "Is your name Google? Because you have everything I've been searching for.",
        "Are you a time traveler? Because I see you in my future.",
        "Do you like raisins? How do you feel about a date?",
    ];
    try {
        const rzRes = await axios.get('https://api.api-ninjas.com/v1/riddles?limit=1', {
            headers: { 'X-Api-Key': 'Kuo5cZ3ZmMM6uaMGJxxMnA==S8vBDvL3bJbUMnYP' },
            timeout: 8000
        }).catch(() => null);
        // Just use local lines since pickup line APIs are unreliable
        const line = rizzLines[Math.floor(Math.random() * rizzLines.length)];
        await Shefzyreply('💘 *Rizz Line*\n\n_"' + line + '"_\n\n✨ Use this wisely!');
    } catch {
        const line = rizzLines[Math.floor(Math.random() * rizzLines.length)];
        await Shefzyreply('💘 *Rizz Line*\n\n_"' + line + '"_\n\n✨ Use this wisely!');
    }
    break;
}

case 'tgsticker':
case 'telesticker':
case 'tgpack': {
    if (!text) return Shefzyreply(
        `❌ *Usage:*\n\n` +
        `${prefix}tgsticker <telegram sticker pack link>\n\n` +
        `📌 *Example:*\n` +
        `${prefix}tgsticker https://t.me/addstickers/PackName`
    );

    const tgLink = text.trim();
    const tgMatch = tgLink.match(/t\.me\/addstickers\/([a-zA-Z0-9_]+)/i);
    if (!tgMatch) return Shefzyreply('❌ Invalid Telegram sticker link!\n\nFormat: https://t.me/addstickers/PackName');

    const packName = tgMatch[1];
    const BOT_TOKEN = config.telegramBotToken || '';

    if (!BOT_TOKEN) return Shefzyreply('❌ Add *telegramBotToken* to your config.js.');

    try {
        await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
        await Shefzyreply(`🔍 Fetching sticker pack: *${packName}*...`);

        const stickerSetRes = await axios.get(
            `https://api.telegram.org/bot${BOT_TOKEN}/getStickerSet`,
            { params: { name: packName }, timeout: 15000 }
        );

        if (!stickerSetRes.data?.ok) {
            return Shefzyreply('❌ Sticker pack not found! Make sure the link is correct and the pack is public.');
        }

        const stickerSet = stickerSetRes.data.result;
        const stickers = stickerSet.stickers || [];

        if (!stickers.length) return Shefzyreply('❌ No stickers found in this pack!');

        // Send all if pack has 60 or less, otherwise cap at 60
        const limit = Math.min(stickers.length, 60);

        await Shefzyreply(
            `✅ *Pack Found!*\n\n` +
            `📦 Name: *${stickerSet.title}*\n` +
            `🎴 Total stickers: *${stickers.length}*\n` +
            `📤 Sending: *${limit}* stickers...\n\n` +
            `⏳ Please wait, this may take a moment...`
        );

        let sent = 0;
        let failed = 0;

        for (let i = 0; i < limit; i++) {
            const sticker = stickers[i];
            try {
                const fileRes = await axios.get(
                    `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
                    { params: { file_id: sticker.file_id }, timeout: 10000 }
                );

                if (!fileRes.data?.ok) { failed++; continue; }

                const filePath = fileRes.data.result.file_path;
                const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

                const stickerBufRes = await axios.get(fileUrl, {
                    responseType: 'arraybuffer',
                    timeout: 15000
                });
                const stickerBuf = Buffer.from(stickerBufRes.data);

                const waSticker = new Sticker(stickerBuf, {
                    pack: stickerSet.title || config.stickerPackname || 'Telegram Pack',
                    author: config.stickerAuthor || config.botOwner || 'Bot',
                    type: StickerTypes.FULL,
                    quality: 70
                });

                await sock.sendMessage(from, await waSticker.toMessage(), { quoted: m });
                sent++;

                // Progress update every 20 stickers so user knows it's still running
                if (sent % 20 === 0 && sent < limit) {
                    await Shefzyreply(`⏳ Progress: *${sent}/${limit}* stickers sent...`);
                }

                // 700ms delay between stickers
                await new Promise(r => setTimeout(r, 700));

            } catch (stickerErr) {
                console.log(`tgsticker error on sticker ${i+1}:`, stickerErr.message);
                failed++;
                continue;
            }
        }

        await sock.sendMessage(from, { react: { text: sent > 0 ? '✅' : '❌', key: m.key } });
        await Shefzyreply(
            `🎴 *Done!*\n\n` +
            `✅ Sent: *${sent}* stickers\n` +
            `❌ Failed: *${failed}*\n` +
            `📦 Pack: *${stickerSet.title}*` +
            (stickers.length > 60 ? `\n\n⚠️ Only first 60 of ${stickers.length} stickers were sent.` : '')
        );

    } catch (e) {
        console.log('tgsticker error:', e.message);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        if (e.response?.data?.description?.includes('not found')) {
            await Shefzyreply('❌ Sticker pack not found! The pack may be private or the name is wrong.');
        } else {
            await Shefzyreply('❌ Failed to fetch sticker pack: ' + e.message);
        }
    }
    break;
} 


case 'autoviewstatus':
case 'autoview': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
    const avSub = args[0]?.toLowerCase();
    if (!avSub || !['on','off'].includes(avSub)) {
        const current = userSetting.autoViewStatus ? '✅ ON' : '❌ OFF';
        return Shefzyreply(`👁️ *Auto View Status*\n\nCurrent: *${current}*\n\nUsage: ${prefix}autoviewstatus on/off\n\n💡 When ON, bot will automatically view and react 💚 to every status update from contacts.`);
    }
    userSetting.autoViewStatus = avSub === 'on';
    updateUserSettings(botNumberRaw, { autoViewStatus: avSub === 'on' });
    await Shefzyreply(`👁️ Auto View Status is now *${avSub.toUpperCase()}*\n\n${avSub === 'on' ? '✅ Bot will now auto-view and react 💚 to all status updates.' : '❌ Bot will no longer auto-view status updates.'}`);
    break;
}

// TOGCSTATUS — FIXED (works with reply AND text)
case 'togcstatus':
case 'poststatus': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');

    const DIRECT_MEDIA = ['imageMessage', 'videoMessage', 'audioMessage'].includes(m.mtype);
    if (!m.quoted && !text && !DIRECT_MEDIA) {
        return Shefzyreply(
            `❌ *Usage:*\n\n` +
            `*Text:*\n${prefix}togcstatus <text> [color]\n` +
            `Example: ${prefix}togcstatus Hello everyone! green\n\n` +
            `*Reply:*\nReply to any image/video/audio/text\n\n` +
            `*Colors:* red, blue, green, purple, orange, pink, black, teal, gold, random`
        );
    }

    try {
        //===================
        // Color map
        //===================
        const colorMap = {
            red:    0xffe74c3c,
            blue:   0xff2980b9,
            green:  0xff27ae60,
            purple: 0xff8e44ad,
            orange: 0xffe67e22,
            pink:   0xffe91e8c,
            black:  0xff1a1a1a,
            teal:   0xff16a085,
            gold:   0xfff39c12,
            dark:   0xff1a2a3a,
            navy:   0xff2c3e50,
            brown:  0xff6d4c41,
        };

        const allColors = Object.values(colorMap);

        const getColor = (colorName) => {
            if (!colorName) return allColors[Math.floor(Math.random() * allColors.length)];
            return colorMap[colorName.toLowerCase()] || allColors[Math.floor(Math.random() * allColors.length)];
        };

        // Extract color keyword from end of text args
        const colorKeywords = Object.keys(colorMap);
        let statusText = text;
        let chosenColorName = null;

        if (text) {
            const lastWord = args[args.length - 1]?.toLowerCase();
            if (colorKeywords.includes(lastWord)) {
                chosenColorName = lastWord;
                statusText = args.slice(0, -1).join(' ');
            }
        }

        let content;

        if (m.quoted || DIRECT_MEDIA) {
            const q = DIRECT_MEDIA ? { mtype: m.mtype, caption: '', text: '', download: () => m.download() } : m.quoted;
            const isImage = q.mtype === 'imageMessage';
            const isVideo = q.mtype === 'videoMessage';
            const isAudio = q.mtype === 'audioMessage';
            const isSticker = q.mtype === 'stickerMessage';
            const isDoc = q.mtype === 'documentMessage';
            const isText = !isImage && !isVideo && !isAudio && !isSticker && !isDoc &&
                (q.text || ['extendedTextMessage','conversation'].includes(q.mtype));

            if (isImage) {
                const buffer = await q.download();
                const caption = statusText || q.caption || '';
                const prepared = await prepareWAMessageMedia(
                    { image: buffer, caption },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };

            } else if (isVideo) {
                const buffer = await q.download();
                const caption = statusText || q.caption || '';
                const prepared = await prepareWAMessageMedia(
                    { video: buffer, caption },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };

            } else if (isAudio) {
                const buffer = await q.download();
                const prepared = await prepareWAMessageMedia(
                    { audio: buffer, mimetype: 'audio/mpeg' },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };

            } else if (isSticker) {
                // Convert sticker to image for status
                const buffer = await q.download();
                const sharp = require('sharp');
                const imgBuf = await sharp(buffer).png().toBuffer();
                const prepared = await prepareWAMessageMedia(
                    { image: imgBuf },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };

            } else if (isDoc) {
                // Send document caption as text status
                const docCaption = statusText || q.fileName || q.caption || 'Document';
                const ext = {
                    text: '📄 ' + docCaption,
                    backgroundArgb: getColor(chosenColorName),
                    font: 0
                };
                content = { groupStatusMessageV2: { message: { extendedTextMessage: ext } } };

            } else if (isText) {
                const msgText = statusText || q.text || 'Status';
                const ext = {
                    text: msgText,
                    backgroundArgb: getColor(chosenColorName),
                    font: 0
                };
                const urlMatch = msgText.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch) await LINKPREVIEW.fill(sock, ext, urlMatch[0]);
                content = { groupStatusMessageV2: { message: { extendedTextMessage: ext } } };

            } else {
                return Shefzyreply('❌ Unsupported message type!\nSupported: image, video, audio, sticker, text');
            }

        } else if (statusText) {
            // Pure text with optional color
            const ext = {
                text: statusText,
                backgroundArgb: getColor(chosenColorName),
                font: 0
            };
            const urlMatch = statusText.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) await LINKPREVIEW.fill(sock, ext, urlMatch[0]);
            content = { groupStatusMessageV2: { message: { extendedTextMessage: ext } } };
        }

        if (!content) return Shefzyreply('❌ No content to post.');

        const statusMsg = generateWAMessageFromContent(
            from,
            content,
            { userJid: sock.user.id }
        );
        await sock.relayMessage(from, statusMsg.message, { messageId: statusMsg.key.id });

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
        await Shefzyreply(
            '📢 *Group status posted!*' +
            (chosenColorName ? '\n🎨 Color: ' + chosenColorName : '')
        );

    } catch (error) {
        console.error('togcstatus error:', error);
        await Shefzyreply(`❌ Failed: ${error.message}`);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
    break;
}

case 'togcstatus2':
case 'poststatusto': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner/sudo only!');

    if (!args[0]) {
        return Shefzyreply(
            `❌ *Usage:*\n\n` +
            `${prefix}togcstatus2 <group link or jid> <caption>\n` +
            `Reply to an image/video/audio/text with this command.\n\n` +
            `Examples:\n` +
            `${prefix}togcstatus2 https://chat.whatsapp.com/AbCdEfG Hello group!\n` +
            `${prefix}togcstatus2 123456789-987654321@g.us Hello group!`
        );
    }

    const DIRECT_MEDIA2 = ['imageMessage', 'videoMessage', 'audioMessage'].includes(m.mtype);
    if (!m.quoted && !DIRECT_MEDIA2 && args.length < 2) {
        return Shefzyreply(
            `❌ *Usage:*\n\n` +
            `${prefix}togcstatus2 <group link or jid> <caption>\n` +
            `Or reply to an image/video/audio/text with:\n` +
            `${prefix}togcstatus2 <group link or jid>`
        );
    }

    try {
        const targetArg = args[0];
        const captionText = args.slice(1).join(' ');
        let targetJid = null;

        //===================
        // Resolve group link or raw JID
        //===================
        if (targetArg.includes('chat.whatsapp.com')) {
            const inviteCode = targetArg.split('chat.whatsapp.com/')[1]?.split(/[?&\s]/)[0];
            if (!inviteCode) return Shefzyreply('❌ Could not parse the invite link.');
            try {
                const inviteInfo = await sock.groupGetInviteInfo(inviteCode);
                targetJid = inviteInfo.id + '@g.us';
            } catch (e) {
                return Shefzyreply('❌ Invalid or expired group invite link.');
            }
        } else if (targetArg.endsWith('@g.us')) {
            targetJid = targetArg;
        } else if (/^\d+$/.test(targetArg)) {
            targetJid = targetArg + '@g.us';
        } else {
            return Shefzyreply('❌ Invalid group link or JID format.');
        }

        //===================
        // Check bot is actually in that group
        //===================
        let targetMeta;
        try {
            targetMeta = await sock.groupMetadata(targetJid);
        } catch (e) {
            return Shefzyreply('❌ Bot is not a member of that group, or the group does not exist.');
        }
        if (!targetMeta) {
            return Shefzyreply('❌ Bot is not a member of that group, or the group does not exist.');
        }

        //===================
        // Helper: pick a random background color
        //===================
        const randomBg = () => {
            const colors = [0xff1a2a3a, 0xff2c3e50, 0xff8e44ad, 0xff2980b9, 0xff27ae60];
            return colors[Math.floor(Math.random() * colors.length)];
        };

        let content;

        if (m.quoted || DIRECT_MEDIA2) {
            const q = DIRECT_MEDIA2 ? { mtype: m.mtype, caption: '', text: '', download: () => m.download() } : m.quoted;
            const isImage = q.mtype === 'imageMessage';
            const isVideo = q.mtype === 'videoMessage';
            const isAudio = q.mtype === 'audioMessage';
            const isText = !isImage && !isVideo && !isAudio &&
                (q.text || q.mtype === 'extendedTextMessage' || q.mtype === 'conversation');

            if (isImage) {
                const buffer = await q.download();
                const caption = captionText || q.caption || '';
                const prepared = await prepareWAMessageMedia(
                    { image: buffer, caption },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };
            }
            else if (isVideo) {
                const buffer = await q.download();
                const caption = captionText || q.caption || '';
                const prepared = await prepareWAMessageMedia(
                    { video: buffer, caption },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };
            }
            else if (isAudio) {
                const buffer = await q.download();
                const prepared = await prepareWAMessageMedia(
                    { audio: buffer, mimetype: 'audio/mpeg' },
                    { upload: sock.waUploadToServer }
                );
                content = { groupStatusMessageV2: { message: prepared } };
            }
            else if (isText) {
                const msgText = captionText || q.text || 'Status';
                const ext = {
                    text: msgText,
                    backgroundArgb: randomBg(),
                    font: 0
                };
                const urlMatch = msgText.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch) await LINKPREVIEW.fill(sock, ext, urlMatch[0]);
                content = { groupStatusMessageV2: { message: { extendedTextMessage: ext } } };
            }
            else {
                return Shefzyreply('❌ Unsupported quoted message type. Use image, video, audio, or text.');
            }
        }
        else if (captionText) {
            const ext = {
                text: captionText,
                backgroundArgb: randomBg(),
                font: 0
            };
            const urlMatch = captionText.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) await LINKPREVIEW.fill(sock, ext, urlMatch[0]);
            content = { groupStatusMessageV2: { message: { extendedTextMessage: ext } } };
        }

        if (!content) return Shefzyreply('❌ No content to post.');

        //===================
        // Generate and relay the group status message to the TARGET group
        //===================
        const statusMsg = generateWAMessageFromContent(
            targetJid,
            content,
            { userJid: sock.user.id }
        );
        await sock.relayMessage(targetJid, statusMsg.message, { messageId: statusMsg.key.id });

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
        await Shefzyreply(
            `📢 *Status posted successfully!*\n\n` +
            `🎯 Target group: *${targetMeta.subject}*`
        );

    } catch (error) {
        console.error('togcstatus2 error:', error);
        await Shefzyreply(`❌ Failed to post status to that group: ${error.message}`);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
    break;
}

// MSTATUS — broadcast a status to ALL groups. Media is sent WITH the command (image/video/audio + caption
// ".mstatus your caption") or by replying to it; text works the same way. Media is downloaded and uploaded ONCE
// and then relayed to every group.
case 'mstatus':
case 'groupstatus':
case 'broadcaststatus': {
    if (!isCreator && !isSudo) {
        return Shefzyreply('❌ *Access Denied*\nOnly bot owner/sudo can use this command.');
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const isRateLimitError = (err) => /rate-overlimit|too many requests|429/i.test((err && err.message) || '');
    const colors = { red: 0xffe74c3c, blue: 0xff2980b9, green: 0xff27ae60, purple: 0xff8e44ad, orange: 0xffe67e22, pink: 0xffe91e8c, black: 0xff1a1a1a, teal: 0xff16a085, gold: 0xfff39c12, dark: 0xff1a2a3a, navy: 0xff2c3e50, brown: 0xff6d4c41 };

    // ---- what is being posted
    const q = m.quoted;
    const directKind = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' }[m.mtype];
    const quotedKind = q ? { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker' }[q.mtype] : null;
    let kind = directKind || quotedKind || ((q && q.text) || text ? 'text' : null);
    if (!kind) {
        return Shefzyreply(
            `📌 *Group Status Broadcast*\n\n` +
            `Post to every group the bot is in.\n\n` +
            `• Send an image/video/audio WITH the caption: ${prefix}mstatus your caption\n` +
            `• Or reply to an image/video/audio/sticker with ${prefix}mstatus [caption]\n` +
            `• Or text: ${prefix}mstatus your text [color]\n\n` +
            `Colors (text): ${Object.keys(colors).join(', ')}`
        );
    }
    const source = directKind ? m : q;

    let statusText = text || '';
    let bgArgb = null;
    const lastWord = (args[args.length - 1] || '').toLowerCase();
    if (kind === 'text' && colors[lastWord]) { bgArgb = colors[lastWord]; statusText = args.slice(0, -1).join(' '); }
    if (bgArgb === null) { const all = Object.values(colors); bgArgb = all[Math.floor(Math.random() * all.length)]; }

    // ---- prepare ONCE
    let inner;
    try {
        if (kind === 'text') {
            const msgText = statusText || (q && q.text) || '';
            if (!msgText) return Shefzyreply('❌ Nothing to post. Add some text.');
            const ext = { text: msgText, backgroundArgb: bgArgb, font: 0 };
            const urlMatch = msgText.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) await LINKPREVIEW.fill(sock, ext, urlMatch[0]);
            inner = { extendedTextMessage: ext };
        } else {
            await Shefzyreply('⏳ Preparing media...');
            let buffer = await source.download();
            if (!buffer || !buffer.length) throw new Error('could not download the media');
            const caption = statusText || (directKind ? '' : (q && q.caption) || '');
            let mediaContent;
            if (kind === 'image') mediaContent = { image: buffer, caption };
            else if (kind === 'video') mediaContent = { video: buffer, caption };
            else if (kind === 'audio') mediaContent = { audio: buffer, mimetype: 'audio/mpeg' };
            else { const sharp = require('sharp'); mediaContent = { image: await sharp(buffer).png().toBuffer(), caption }; }
            inner = await prepareWAMessageMedia(mediaContent, { upload: sock.waUploadToServer });
        }
    } catch (err) {
        console.error('mstatus prepare error:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
        return Shefzyreply(`❌ Could not prepare the status: ${err.message}`);
    }

    const postOne = async (groupId) => {
        const statusMsg = generateWAMessageFromContent(groupId, { groupStatusMessageV2: { message: inner } }, { userJid: sock.user.id });
        await sock.relayMessage(groupId, statusMsg.message, { messageId: statusMsg.key.id });
    };

    const startMsg = await Shefzyreply('⏳ Fetching all groups...');
    const edit = async (t) => { try { await sock.sendMessage(from, { text: t, edit: startMsg.key }); } catch { await sock.sendMessage(from, { text: t }).catch(() => {}); } };

    try {
        const allGroups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(allGroups);
        if (groupIds.length === 0) return Shefzyreply('❌ Bot is not in any groups.');

        await edit(`🚀 *Group Status Broadcast Started*\n\n📊 Groups: ${groupIds.length}\n⏱️ Estimated time: ~${Math.ceil(groupIds.length * 1.2 / 60)} minute(s)`);

        let successCount = 0, failCount = 0, processed = 0, lastProgress = 0;
        let lastError = '';
        const PROGRESS_STEP = 30, BASE_DELAY_MS = 1200;

        for (let i = 0; i < groupIds.length; i++) {
            const gid = groupIds[i];
            let done = false;
            for (let attempt = 0; attempt < 2 && !done; attempt++) {
                try { await postOne(gid); successCount++; done = true; }
                catch (err) {
                    if (isRateLimitError(err) && attempt === 0) { await sleep(3000); continue; }
                    lastError = err.message || String(err);
                    console.error(`[mstatus] Failed on ${gid}:`, lastError);
                    failCount++; done = true;
                }
            }
            processed++;
            if (processed - lastProgress >= PROGRESS_STEP || processed === groupIds.length) {
                lastProgress = processed;
                await edit(`📊 *Progress*: ${processed}/${groupIds.length}\n✅ ${successCount} | ❌ ${failCount}`);
            }
            if (i < groupIds.length - 1) await sleep(BASE_DELAY_MS);
        }

        await edit(`✅ *Group Status Broadcast Completed*\n\n📊 Groups processed: ${processed}\n✅ Successful: ${successCount}\n❌ Failed: ${failCount}${failCount && lastError ? `\n\nLast error: ${lastError}` : ''}`);
        await sock.sendMessage(from, { react: { text: failCount && !successCount ? '❌' : '✅', key: m.key } });
    } catch (err) {
        console.error('mstatus error:', err);
        await Shefzyreply(`❌ *Broadcast failed*\n\n${err.message}`);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } }).catch(() => {});
    }
    break;
}

case 'kickalladmins':
case 'demotealladmins': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin to demote others!');
    
    const meta = await sock.groupMetadata(from);
    const participants = meta.participants;
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const userJid = sender;
    
    const admins = participants.filter(p => 
        (p.admin === 'admin' || p.admin === 'superadmin') && 
        p.id !== botJid && 
        p.id !== userJid
    );
    
    if (admins.length === 0) {
        return Shefzyreply('✅ No other admins to demote.');
    }
    
    await Shefzyreply(`⚡ Demoting ${admins.length} admin(s)...`);
    let success = 0;
    for (const admin of admins) {
        try {
            await sock.groupParticipantsUpdate(from, [admin.id], 'demote');
            success++;
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.log(`Failed to demote ${admin.id}:`, e.message);
        }
    }
    await Shefzyreply(`✅ Demoted ${success}/${admins.length} admins.\nOnly you and the bot remain as admins.`);
    break;
}

case 'searchfriends':
case 'findfriends': {
     if (!isSudo && !isCreator) return Shefzyreply('❌owner only')
    // No group restrictions – works in private chats as well
    const requested = Math.min(parseInt(args[0]) || 10, 20);
    await Shefzyreply(`🔍 Searching for ${requested} random WhatsApp friends...\n⏳ This may take a moment.`);
    
    // Generate many numbers (up to 8x requested) to increase hit rate
    const maxAttempts = requested * 8;
    const generated = new Set();
    const results = [];
    
    // Nigerian numbers: 234 + 10 digits (common prefixes)
    const prefixes = ['70', '80', '81', '90', '91', '70', '80', '81', '90', '91'];
    
    for (let attempt = 0; attempt < maxAttempts && results.length < requested; attempt++) {
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = Math.floor(10000000 + Math.random() * 89999999).toString().padStart(8, '0');
        const number = `234${prefix}${suffix}`;
        if (generated.has(number)) continue;
        generated.add(number);
        
        const jid = number + '@s.whatsapp.net';
        try {
            const [result] = await sock.onWhatsApp(jid);
            if (result?.exists) {
                let name = '';
                try {
                    const status = await sock.fetchStatus(jid);
                    name = status?.status ? status.status.slice(0, 30) : '';
                } catch {}
                results.push({ number, name });
            }
        } catch (err) {
            // ignore individual errors
        }
        await new Promise(r => setTimeout(r, 300)); // rate limit delay
    }
    
    if (results.length === 0) {
        return Shefzyreply('❌ No active WhatsApp numbers found.\nTry again later or use a different region code (edit the prefixes).');
    }
    
    let reply = `👥 *Random Friends Found* (${results.length})\n\n`;
    results.forEach((f, i) => {
        reply += `${i+1}. +${f.number}\n`;
        if (f.name) reply += `   📝 ${f.name}\n`;
    });
    reply += `\n⚠️ Respect privacy – these are public numbers.\n💡 Try again later for different results.`;
    await Shefzyreply(reply);
    break;
}

            case 'tourl': {
    // Check if there's media (quoted or direct)
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    const hasQuotedMedia = m.quoted && mediaTypes.includes(m.quoted.mtype);
    const hasDirectMedia = mediaTypes.includes(m.mtype);
    
    if (!hasQuotedMedia && !hasDirectMedia) {
        return Shefzyreply(`❌ Reply to a photo or video with *${prefix}tourl*`);
    }
    
    await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
    await Shefzyreply('*_💈 Uploading..._*');
    
    try {
        let mediaBuffer;
        if (hasQuotedMedia) {
            mediaBuffer = await m.quoted.download();
        } else {
            mediaBuffer = await m.download();
        }
        
        if (!mediaBuffer) throw new Error('Failed to download media');
        
        // Upload to ImgBB
        const formData = new URLSearchParams();
        const imgbbApiKey = config.imgbbApiKey || '6d207e02198a847aa98d0a2a901485a5';
        formData.append('key', imgbbApiKey);
        formData.append('image', mediaBuffer.toString('base64'));
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });
        
        if (response.data?.data?.url) {
            await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
            await Shefzyreply(
                `💈 *_UPLOAD SUCCESS_*\n\n` +
                `🌍 *URL:* ${response.data.data.url}\n` +
                `📅 *Expires:* Never\n` +
                `📦 *Size:* ${(mediaBuffer.length / 1024).toFixed(2)} KB`
            );
        } else {
            throw new Error('Upload failed - no URL returned');
        }
        
    } catch (err) {
        console.log('tourl error:', err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        await Shefzyreply(`❌ *_Error: ${err.message}_*`);
    }
    break;
}
            
            case 'sonu': {
    if (!text) {
        return Shefzyreply(
            `🎵 *SONU AI*\n_Generate a full song from any prompt_\n\n` +
            `*Usage:*\n${prefix}sonu <your prompt>\n\n` +
            `*Examples:*\n• ${prefix}sonu a woman running through the city\n` +
            `• ${prefix}sonu dark metal song about war\n` +
            `• ${prefix}sonu upbeat afrobeats love song\n\n` +
            `📡 *Powered by Omegatech*`
        );
    }
    try {
        await sock.sendMessage(from, { react: { text: '🎵', key: m.key } });
        await sock.sendPresenceUpdate('recording', from);
        await Shefzyreply('🎵 Generating your song...\n_This takes about 90 seconds_');

        const sonuRes = await axios.get(
            `https://omegatech-api.dixonomega.tech/api/ai/sonu3?action=full&prompt=${encodeURIComponent(text.trim())}`,
            { timeout: 120000 }
        );
        const data = sonuRes.data;

        if (!data.success || !data.url) {
            await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
            return Shefzyreply('❌ Music generation failed. Try again later.');
        }

        const title = data.title || 'Sonu AI';
        const tags = data.tags || 'AI Music';
        const duration = data.duration || 0;
        const mins = Math.floor(duration / 60);
        const secs = String(duration % 60).padStart(2, '0');

        await sock.sendMessage(from, {
            audio: { url: data.url },
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            ptt: false,
            contextInfo: {
                externalAdReply: {
                    title,
                    body: `🏷️ ${tags} | ⏱️ ${mins}:${secs}`,
                    sourceUrl: data.url,
                    thumbnailUrl: data.thumbnail,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    showAdAttribution: true,
                }
            }
        }, { quoted: m });

        if (data.lyrics) {
            await Shefzyreply(`📜 *${title}*\n\n${data.lyrics.slice(0, 3000)}`);
        }

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error('Sonu error:', e.message);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        await Shefzyreply('❌ Something went wrong. Try again later.');
    }
    break;
}

case 'scdlsearch':
case 'soundcloudplay': {
    // SoundCloud search + download
    global.scPlaySession = global.scPlaySession || {};
    const userId = sender;

    // If replying with a number to pick from results
    if (m.quoted && global.scPlaySession[userId] && /^\d+$/.test(text?.split(' ')[0])) {
        const index = parseInt(text.split(' ')[0]) - 1;
        const list = global.scPlaySession[userId];
        if (!list[index]) return Shefzyreply('❌ Invalid number.');

        await sock.sendMessage(from, { react: { text: '📥', key: m.key } });
        try {
            const dlRes = await axios.get(
                `https://omegatech-api.dixonomega.tech/api/download/soundcloudinfo?url=${encodeURIComponent(list[index].link)}`,
                { timeout: 30000 }
            );
            if (!dlRes.data.success) throw new Error('Failed to fetch file.');
            const res = dlRes.data.result;
            await sock.sendMessage(from, {
                audio: { url: res.mp3 },
                mimetype: 'audio/mpeg',
                fileName: `${res.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: res.title,
                        body: `👤 ${res.creator} | ⏱️ ${res.durationFormatted}`,
                        sourceUrl: list[index].link,
                        thumbnailUrl: res.creatorAvatar,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        showAdAttribution: true
                    }
                }
            }, { quoted: m });
            await Shefzyreply(`✅ *DOWNLOAD SUCCESS*\n\n🎵 Title: ${res.title}\n👤 Creator: ${res.creator}\n⏱️ Duration: ${res.durationFormatted}\n📦 Size: ${res.fileSize}\n🎚️ Quality: ${res.sampleRate}`);
            await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
        } catch (e) {
            await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
            await Shefzyreply(`❌ Download Error: ${e.message}`);
        }
        break;
    }

    if (!text) return Shefzyreply(`⚠️ Usage:\n${prefix}scdlsearch <song name>`);

    await sock.sendMessage(from, { react: { text: '🕒', key: m.key } });
    try {
        const searchRes = await axios.get(
            `https://omegatech-api.dixonomega.tech/api/Search/soundcloud?query=${encodeURIComponent(text)}`,
            { timeout: 20000 }
        );
        if (!searchRes.data.success || !searchRes.data.result.length) return Shefzyreply('❌ No results found.');

        const results = searchRes.data.result.slice(0, 5);
        global.scPlaySession[userId] = results;

        let msg = `🎵 *SOUNDCLOUD SEARCH RESULTS*\n\n`;
        results.forEach((v, i) => {
            msg += `*${i + 1}.* ${v.title}\n⏱️ Duration: ${v.duration}s\n👤 Creator: ${v.creator}\n\n`;
        });
        msg += `📥 Reply with number to download\nExample: 1`;

        await sock.sendMessage(from, { text: msg }, { quoted: m });
        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
    } catch (e) {
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        await Shefzyreply('❌ Search failed.');
    }
    break;
}
            
            case 'rfact':
            case 'mfact': {
                try {
                    const factRes = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 10000 });
                    await Shefzyreply('🧠 *Random Fact*\n\n' + factRes.data.text);
                } catch { await Shefzyreply('❌ Failed to fetch fact!'); }
                break;
            }

            case 'setmenuimage':
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can set menu image!');
                const imageUrl = args[0];
                if (!imageUrl) return Shefzyreply('❌ Usage: setmenuimage <url>\nGet URL using tourl first!');
                updateUserSettings(botNumberRaw, { menuImage: imageUrl });
                await Shefzyreply(`✅ Menu image set!\nURL: ${imageUrl}`);
                break;

            case 'setwelcome': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const wKey = scopedKey(sock, from);
    if (!groupWelcomeSettings.has(wKey)) {
        groupWelcomeSettings.set(wKey, { welcome: false, goodbye: false, welcomeMessage: null, goodbyeMessage: null });
    }
    const ws = groupWelcomeSettings.get(wKey);
    const subCmd = args[0]?.toLowerCase();

    if (subCmd === 'on') {
        ws.welcome = true;
        saveWelcomeSettings();
        await Shefzyreply('✅ *Welcome messages ON!*\n\n💡 Variables you can use in custom messages:\n• @user — mentions the new member\n• @group — group name\n• @count — member count');
    } else if (subCmd === 'off') {
        ws.welcome = false;
        saveWelcomeSettings();
        await Shefzyreply('❌ Welcome messages OFF.');
    } else if (subCmd === 'reset') {
        ws.welcomeMessage = null;
        saveWelcomeSettings();
        await Shefzyreply('✅ Welcome message reset to default.');
    } else if (subCmd === 'status') {
        await Shefzyreply(
            `📝 *Welcome Settings*\n\n` +
            `Status: ${ws.welcome ? '✅ ON' : '❌ OFF'}\n` +
            `Custom: ${ws.welcomeMessage ? '✅ Set' : '❌ Default'}\n\n` +
            (ws.welcomeMessage ? `*Current message:*\n${ws.welcomeMessage}` : '')
        );
    } else if (args.length > 0) {
        ws.welcomeMessage = args.join(' ');
        ws.welcome = true;
        saveWelcomeSettings();
        await Shefzyreply(`✅ Custom welcome message set and enabled!\n\n${ws.welcomeMessage}`);
    } else {
        await Shefzyreply(
            `📝 *Welcome Settings*\n\n` +
            `${prefix}setwelcome on — enable\n` +
            `${prefix}setwelcome off — disable\n` +
            `${prefix}setwelcome reset — restore default\n` +
            `${prefix}setwelcome status — view current\n` +
            `${prefix}setwelcome <message> — set custom\n\n` +
            `💡 Variables: @user @group @count`
        );
    }
    break;
}

case 'setgoodbye': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const gKey = scopedKey(sock, from);
    if (!groupWelcomeSettings.has(gKey)) {
        groupWelcomeSettings.set(gKey, { welcome: false, goodbye: false, welcomeMessage: null, goodbyeMessage: null });
    }
    const gs = groupWelcomeSettings.get(gKey);
    const goodbyeSub = args[0]?.toLowerCase();

    if (goodbyeSub === 'on') {
        gs.goodbye = true;
        saveWelcomeSettings();
        await Shefzyreply('✅ *Goodbye messages ON!*\n\n💡 Variables: @user @group @count');
    } else if (goodbyeSub === 'off') {
        gs.goodbye = false;
        saveWelcomeSettings();
        await Shefzyreply('❌ Goodbye messages OFF.');
    } else if (goodbyeSub === 'reset') {
        gs.goodbyeMessage = null;
        saveWelcomeSettings();
        await Shefzyreply('✅ Goodbye message reset to default.');
    } else if (goodbyeSub === 'status') {
        await Shefzyreply(
            `📝 *Goodbye Settings*\n\n` +
            `Status: ${gs.goodbye ? '✅ ON' : '❌ OFF'}\n` +
            `Custom: ${gs.goodbyeMessage ? '✅ Set' : '❌ Default'}\n\n` +
            (gs.goodbyeMessage ? `*Current message:*\n${gs.goodbyeMessage}` : '')
        );
    } else if (args.length > 0) {
        gs.goodbyeMessage = args.join(' ');
        gs.goodbye = true;
        saveWelcomeSettings();
        await Shefzyreply(`✅ Custom goodbye message set and enabled!\n\n${gs.goodbyeMessage}`);
    } else {
        await Shefzyreply(
            `📝 *Goodbye Settings*\n\n` +
            `${prefix}setgoodbye on — enable\n` +
            `${prefix}setgoodbye off — disable\n` +
            `${prefix}setgoodbye reset — restore default\n` +
            `${prefix}setgoodbye status — view current\n` +
            `${prefix}setgoodbye <message> — set custom\n\n` +
            `💡 Variables: @user @group @count`
        );
    }
    break;
}

            case 's':
case 'sticker':
case 'stiker': {
    if (!/image|video/.test(m.mtype) && !(m.quoted && /image|video/.test(m.quoted.mtype))) {
        return Shefzyreply(`Please reply to an image/video or send one with the command *${prefix}${command}*`);
    }
    try {
        let mediaBuffer;
        if (m.quoted && /image|video/.test(m.quoted.mtype)) {
            mediaBuffer = await m.quoted.download();
        } else {
            mediaBuffer = await m.download();
        }
        const sticker = new Sticker(mediaBuffer, {
            pack: config.stickerPackname,   
            author: config.stickerAuthor,   
            type: StickerTypes.FULL, 
            categories: ['🤩', '🎉'],
            quality: 70
        });
        await sock.sendMessage(from, await sticker.toMessage(), { quoted: m });
    } catch (e) {
        console.error("Sticker Creation Error:", e);
        Shefzyreply("Sorry, an error occurred. The media might be too large, corrupted, or unsupported.");
    }
    break;
}

            case 'stickervid': {
    if (!m.quoted && !m.message?.videoMessage) return Shefzyreply('❌ Reply to a video with ' + prefix + 'stickervid');
    let videoStickerBuffer;
    if (m.quoted && m.quoted.mtype === 'videoMessage') {
        videoStickerBuffer = await m.quoted.download();
    } else if (m.message?.videoMessage) {
        videoStickerBuffer = await m.download();
    } else {
        return Shefzyreply('❌ Please send/reply to a video!');
    }
    const stkPack = config.stickerPackname || userSetting.botName || config.botName || 'Michiko MD';
    const stkAuth = config.stickerAuthor || userSetting.ownerNumber || config.botOwner || 'Bot';
    const videoSticker = await videoToSticker(videoStickerBuffer, stkPack, stkAuth);
    await sock.sendMessage(from, { sticker: videoSticker }, { quoted: m });
    break;
}

            case 'toaudio': {
                if (!m.quoted && !m.message?.videoMessage) return Shefzyreply('❌ Reply to a video with ' + prefix + 'toaudio');
                let audioBuffer;
                if (m.quoted && m.quoted.mtype === 'videoMessage') {
                    audioBuffer = await m.quoted.download();
                } else if (m.message?.videoMessage) {
                    audioBuffer = await m.download();
                } else {
                    return Shefzyreply('❌ Please send/reply to a video!');
                }
                const audio = await videoToAudio(audioBuffer);
                await sock.sendMessage(from, { audio: audio, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
                break;
            }

            case 'setprefix': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can change prefix!');
                const newPrefix = args[0];
                if (!newPrefix || newPrefix.length > 2) return Shefzyreply('❌ Usage: setprefix <symbol>\nExample: setprefix /');
                updateUserSettings(botNumberRaw, { prefix: newPrefix });
                await Shefzyreply(`✅ Prefix changed to: ${newPrefix}`);
                break;
            }

            case 'public':
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can change mode!');
                updateUserSettings(botNumberRaw, { mode: 'public' });
                await Shefzyreply('✅ Public mode enabled!');
                break;

            case 'private':
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can change mode!');
                updateUserSettings(botNumberRaw, { mode: 'private' });
                await Shefzyreply('✅ Private mode enabled!');
                break;

            case 'setname': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can change bot name!');
                if (!text) return Shefzyreply('❌ Usage: setname <new name>');
                updateUserSettings(botNumberRaw, { botName: text });
                await Shefzyreply(`✅ Bot name changed to: ${text}`);
                break;
            }

            case 'setowner': {
                if (!isCreator) return Shefzyreply('❌ Only bot owner can change owner!');
                const newOwner = args[0];
                if (!newOwner) return Shefzyreply('❌ Usage: setowner <number>');
                // Per-bot: store in userSettings, not global config
                updateUserSettings(botNumberRaw, { ownerNumber: newOwner.replace(/[^0-9]/g,'') });
                await Shefzyreply(`✅ Bot owner set to: ${newOwner}`);
                break;
            }

            case 'profile': {
                const profileText = `📱 *User Profile*\n\n👤 Name: ${pushname}\n📞 Number: ${senderNumber}\n🔧 Mode: ${mode.toUpperCase()}\n📝 Prefix: ${prefix}\n🎨 Menu Image: ${userSetting.menuImage ? '✅ Set' : '❌ Not set'}\n👑 Sudo: ${isSudo ? '✅ Yes' : '❌ No'}\n👑 Owner: ${isCreator ? '✅ Yes' : '❌ No'}`;
                await sock.sendMessage(from, { text: profileText }, { quoted: m });
                break;
            }

            case 'setsudo': {
                if (!isCreator) return Shefzyreply('❌ Only bot owner can add sudo users!');
                const sudoJid = resolveTarget(args[0]);
                if (!sudoJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                const sudoNumber = sudoJid.split('@')[0];
                getBotSudoUsers(botNumberRaw).add(sudoNumber);
                saveSettings();
                await Shefzyreply(`✅ ${sudoNumber} added as sudo user!`);
                break;
            }

            case 'delsudo': {
                if (!isCreator) return Shefzyreply('❌ Only bot owner can remove sudo users!');
                const delSudoJid = resolveTarget(args[0]);
                if (!delSudoJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                const removeNumber = delSudoJid.split('@')[0];
                if (normalizeNumber(botNumberRaw) === normalizeNumber(removeNumber)) return Shefzyreply('❌ Cannot remove bot owner from sudo!');
                getBotSudoUsers(botNumberRaw).delete(removeNumber);
                saveSettings();
                await Shefzyreply(`✅ ${removeNumber} removed from sudo users!`);
                break;
            }

            case 'listsudo': {
                if (!isSudo) return Shefzyreply('❌ Only sudo users can view sudo list!');
                const botSudo = getBotSudoUsers(botNumberRaw);
                const sudoList = Array.from(botSudo).map((num, i) => `${i+1}. ${num}`).join('\n');
                await sock.sendMessage(from, { text: `👑 *Sudo Users*\n\n${sudoList || 'No sudo users'}\n\nTotal: ${botSudo.size}` }, { quoted: m });
                break;
            }

            case 'owner':
                await Shefzyreply(`👑 *Bot Owner*\n\n${config.botOwner}`);
                break;

            case 'runtime':
                await Shefzyreply(`⏰ *Bot Runtime*\n\n${formatRuntime(process.uptime())}`);
                break;

            case 'ping': {
    const start = m.messageTimestamp ? m.messageTimestamp * 1000 : Date.now();
    const end = Date.now();
    await Shefzyreply(`🏓 *Pong!*\n⏱️ ${end - start}ms`);
    break;
}

            case 'kick': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin to kick!');
                const kickJid = resolveTarget(args[0]);
                if (!kickJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                try {
                    await sock.groupParticipantsUpdate(from, [kickJid], 'remove');
                    await Shefzyreply(`✅ @${kickJid.split('@')[0]} has been kicked!`);
                } catch (e) { await Shefzyreply('❌ Failed to kick! Make sure bot is admin.'); }
                break;
            }

            case 'promote': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin to promote!');
                const promoteJid = resolveTarget(args[0]);
                if (!promoteJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                try {
                    await sock.groupParticipantsUpdate(from, [promoteJid], 'promote');
                    await Shefzyreply(`✅ @${promoteJid.split('@')[0]} has been promoted to admin!`);
                } catch (e) { await Shefzyreply('❌ Failed to promote! Make sure bot is admin.'); }
                break;
            }

            case 'demote': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin to demote!');
                const demoteJid = resolveTarget(args[0]);
                if (!demoteJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                try {
                    await sock.groupParticipantsUpdate(from, [demoteJid], 'demote');
                    await Shefzyreply(`✅ @${demoteJid.split('@')[0]} has been demoted!`);
                } catch (e) { await Shefzyreply('❌ Failed to demote! Make sure bot is admin.'); }
                break;
            }

            case 'del':
            case 'delete': {
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ No permission!');
                if (!m.quoted) return Shefzyreply('❌ Reply to a message!');
                try {
                    const delKey = {
                        remoteJid: from,
                        id: m.quoted.id,
                        fromMe: m.quoted.fromMe,
                        ...(isGroup ? { participant: m.quoted.sender } : {})
                    };
                    await sock.sendMessage(from, { delete: delKey });
                } catch (e) {
                    await Shefzyreply('❌ Failed to delete! Bot needs admin rights to delete others\' messages.');
                }
                break;
            }

            case 'tagall': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isBotAdmin) return Shefzyreply('❌ Admin or Bot Admin required!');
                const meta = await sock.groupMetadata(from);
                const members = meta.participants;
                const mentions = members.map(p => p.id);
                let tagText = '📢 *Mention All*\n\n';
                members.forEach((p, i) => {
                    tagText += `${i+1}. @${p.id.split('@')[0]}\n`;
                });
                await sock.sendMessage(from, { text: tagText, mentions: mentions }, { quoted: m });
                break;
            }

            //===================
            // toimage: sticker → image
            //===================
            case 'toimage': {
                if (!m.quoted || m.quoted.mtype !== 'stickerMessage') return Shefzyreply('❌ Reply to a sticker with ' + prefix + 'toimage');
                try {
                    const stickerBuf = await m.quoted.download();
                    const sharp = require('sharp');
                    const imgBuf = await sharp(stickerBuf).png().toBuffer();
                    await sock.sendMessage(from, { image: imgBuf }, { quoted: m });
                } catch (e) {
                    await Shefzyreply('❌ Failed to convert sticker to image!');
                }
                break;
            }

            case 'tovideo': {
    try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const fs = require('fs');
        const path = require('path');
        const { tmpdir } = require('os');
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);

        const quoted = m.quoted;
        
        // Check if quoted message is a sticker
        if (!quoted || quoted.mtype !== 'stickerMessage') {
            return Shefzyreply('⚠️ Reply to a *sticker* to convert to video!');
        }

        // Check if animated — field location depends on smsg version
        const isAnimated = quoted.isAnimated || quoted.isAnimated === true || 
                           (quoted.msg && quoted.msg.isAnimated) || false;
        if (!isAnimated) {
            return Shefzyreply('❌ This sticker is static.\nOnly *animated stickers* can be converted to video.');
        }

        // Download sticker
        const stickerBuffer = await quoted.download();
        
        if (!stickerBuffer || stickerBuffer.length === 0) {
            return Shefzyreply('❌ Failed to download sticker.');
        }

        const webpPath = path.join(tmpdir(), `sticker_${Date.now()}.webp`);
        const mp4Path = path.join(tmpdir(), `sticker_${Date.now()}.mp4`);
        
        fs.writeFileSync(webpPath, stickerBuffer);

        // Correct ffmpeg command for animated WebP to MP4
        const ffmpegCmd = `"${ffmpegPath}" -y -i "${webpPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,setpts=PTS-STARTPTS" -r 15 -c:v libx264 "${mp4Path}"`;
        
        await execPromise(ffmpegCmd);

        if (!fs.existsSync(mp4Path)) {
            throw new Error('MP4 file not created');
        }

        const videoBuffer = fs.readFileSync(mp4Path);
        
        // Send video
        await sock.sendMessage(from, { 
            video: videoBuffer, 
            mimetype: 'video/mp4',
            caption: '✅ Animated sticker converted to video!'
        }, { quoted: m });

        // Cleanup
        try {
            fs.unlinkSync(webpPath);
            fs.unlinkSync(mp4Path);
        } catch (cleanErr) {
            console.log('Cleanup error:', cleanErr.message);
        }

    } catch (err) {
        console.error('❌ tovideo error:', err);
        Shefzyreply(`💥 Failed to convert sticker to video.\nError: ${err.message}`);
    }
    break;
}

            case 'mtovideo':
case 'tomp4':
case 'stickertovideo': {
    if (!(m.quoted && m.quoted.mtype === 'stickerMessage') && m.mtype !== 'stickerMessage') {
        return Shefzyreply(`❌ Reply to a sticker with *${prefix}${command}*`);
    }

    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    let inputPath = null;
    let outputPath = null;

    try {
        const stickerMsg = m.quoted && m.quoted.mtype === 'stickerMessage' ? m.quoted : m;
        const buffer = await stickerMsg.download();

        const isAnimated = stickerMsg.msg?.isAnimated || stickerMsg.isAnimated || false;

        inputPath = path.join(os.tmpdir(), `sticker_in_${Date.now()}.webp`);
        fs.writeFileSync(inputPath, buffer);

        await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });

        if (isAnimated) {
            outputPath = path.join(os.tmpdir(), `sticker_out_${Date.now()}.mp4`);
            await execFileAsync(ffmpegPath, [
                '-i', inputPath,
                '-movflags', 'faststart',
                '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-y', outputPath
            ]);

            await sock.sendMessage(from, {
                video: fs.readFileSync(outputPath),
                caption: '✅ Sticker converted to video',
                gifPlayback: false
            }, { quoted: m });
        } else {
            outputPath = path.join(os.tmpdir(), `sticker_out_${Date.now()}.png`);
            await execFileAsync(ffmpegPath, ['-i', inputPath, '-y', outputPath]);

            await sock.sendMessage(from, {
                image: fs.readFileSync(outputPath),
                caption: '✅ Static sticker converted to image'
            }, { quoted: m });
        }

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
    } catch (e) {
        console.error('[tovideo]', e.message);
        await Shefzyreply(`❌ Conversion failed: ${e.message}`);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
    } finally {
        if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
    break;
}

            //===================
            // tovoice: video/audio → voice note
            //===================
            case 'tovoice': {
                if (!m.quoted && !m.message?.videoMessage && !m.message?.audioMessage) return Shefzyreply('❌ Reply to a video/audio with ' + prefix + 'tovoice');
                let voiceBuf;
                if (m.quoted && (m.quoted.mtype === 'videoMessage' || m.quoted.mtype === 'audioMessage')) {
                    voiceBuf = await m.quoted.download();
                } else {
                    voiceBuf = await m.download();
                }
                const { exec: execCb2 } = require('child_process');
                const { promisify: prom2 } = require('util');
                const execP2 = prom2(execCb2);
                const tmpDir2 = path.join(__dirname, 'temp');
                if (!fs.existsSync(tmpDir2)) fs.mkdirSync(tmpDir2, { recursive: true });
                const voiceIn  = path.join(tmpDir2, `vin_${Date.now()}.mp4`);
                const voiceOut = path.join(tmpDir2, `vout_${Date.now()}.ogg`);
                try {
                    fs.writeFileSync(voiceIn, voiceBuf);
                    await execP2(`"${ffmpegPath}" -y -i "${voiceIn}" -vn -c:a libopus "${voiceOut}"`);
                    const oggBuf = fs.readFileSync(voiceOut);
                    await sock.sendMessage(from, { audio: oggBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
                } catch (e) {
                    await Shefzyreply('❌ Failed to convert to voice note!');
                } finally {
                    try { if (fs.existsSync(voiceIn)) fs.unlinkSync(voiceIn); } catch {}
                    try { if (fs.existsSync(voiceOut)) fs.unlinkSync(voiceOut); } catch {}
                }
                break;
            }

            //===================
            // ban
            //===================
            case 'ban': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin to delete banned users\' messages!');
                const banJid = resolveTarget(args[0]);
                if (!banJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                const banTarget = banJid.split('@')[0];
                if (!bannedUsers.has(from)) bannedUsers.set(from, new Set());
                bannedUsers.get(from).add(banTarget);
                saveBanned();
                await sock.sendMessage(from, {
                    text: `╭─❏ 𝗠𝗜𝗖𝗛𝗜𝗞𝗢-𝗠𝗗\n│\n│ 🚫 @${banTarget} has been banned!\n│ All their messages will be auto-deleted.\n│\n╰─❏`,
                    mentions: [banJid]
                }, { quoted: m });
                break;
            }

            //===================
            // unban
            //===================
            case 'unban': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const unbanJid = resolveTarget(args[0]);
                if (!unbanJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                const unbanTarget = unbanJid.split('@')[0];
                bannedUsers.get(from)?.delete(unbanTarget);
                saveBanned();
                await Shefzyreply(`✅ @${unbanTarget} has been unbanned!`);
                break;
            }

            //===================
            // listban
            //===================
            case 'listban': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                const bl = bannedUsers.get(from);
                if (!bl || bl.size === 0) return Shefzyreply('✅ No banned users in this group.');
                const blList = Array.from(bl).map((n, i) => `${i+1}. ${n}`).join('\n');
                await Shefzyreply(`🚫 *Banned Users*\n\n${blList}\n\nTotal: ${bl.size}`);
                break;
            }

            //===================
            // block
            //===================
            case 'mblock': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can block!');
                const blockTarget = resolveTarget(args[0]);
                if (!blockTarget) return Shefzyreply('❌ Usage: block <number> or reply to user');
                try {
                    // updateBlockStatus is the correct Baileys method
                    await sock.updateBlockStatus(blockTarget, 'block');
                    await Shefzyreply(`✅ ${blockTarget.split('@')[0]} has been blocked!`);
                } catch (e) {
                    console.log('block error:', e.message);
                    await Shefzyreply('❌ Failed to block! Number may already be blocked or invalid.');
                }
                break;
            }
case 'block': {
if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can block!');
    if (!text) return Shefzyreply('Please provide a number to block. Example: !block 234xxx');
    const number = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await sock.updateBlockStatus(number, 'block');
    Shefzyreply(`Blocked ${number.split('@')[0]}.`);
    break;
}
            //===================
            // unblock
            //===================
            case 'unblock': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can unblock!');
                const unblockTarget = resolveTarget(args[0]);
                if (!unblockTarget) return Shefzyreply('❌ Usage: unblock <number> or reply to user');
                try {
                    await sock.updateBlockStatus(unblockTarget, 'unblock');
                    await Shefzyreply(`✅ ${unblockTarget.split('@')[0]} has been unblocked!`);
                } catch (e) {
                    console.log('unblock error:', e.message);
                    await Shefzyreply('❌ Failed to unblock!');
                }
                break;
            }

            //===================
            // listblocked
            //===================
            case 'listblocked': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                try {
                    const blocked = await sock.fetchBlocklist();
                    if (!blocked || blocked.length === 0) return Shefzyreply('✅ No blocked numbers.');
                    const bList = blocked.map((jid, i) => `${i+1}. ${jid.split('@')[0]}`).join('\n');
                    await Shefzyreply(`🚫 *Blocked Numbers*\n\n${bList}\n\nTotal: ${blocked.length}`);
                } catch (e) { await Shefzyreply('❌ Failed to fetch blocked list!'); }
                break;
            }

            //===================
            // setpp
            //===================
            case 'setpp': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to an image with ' + prefix + 'setpp');
                try {
                    const ppBuf = await m.quoted.download();
                    await sock.updateProfilePicture(sock.user.id, ppBuf);
                    await Shefzyreply('✅ Profile picture updated!');
                } catch (e) { await Shefzyreply('❌ Failed to update profile picture!'); }
                break;
            }

            //===================
            // delpp
            //===================
            case 'delpp': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                try {
                    await sock.removeProfilePicture(sock.user.id);
                    await Shefzyreply('✅ Profile picture removed!');
                } catch (e) { await Shefzyreply('❌ Failed to remove profile picture!'); }
                break;
            }

            //===================
            // setppname
            //===================
            case 'setppname': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!text) return Shefzyreply('❌ Usage: setppname <name>');
                try {
                    await sock.updateProfileName(text);
                    await Shefzyreply(`✅ Profile name set to: ${text}`);
                } catch (e) { await Shefzyreply('❌ Failed to update profile name!'); }
                break;
            }

            //===================
            // setbio
            //===================
            case 'setbio': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!text) return Shefzyreply('❌ Usage: setbio <text>');
                try {
                    // Try multiple method names for different Baileys versions
                    try {
                        await sock.updateProfileStatus(text);
                    } catch {
                        await sock.updateMyStatus(text);
                    }
                    await Shefzyreply(`✅ Bio updated to: ${text}`);
                } catch (e) {
                    console.log('setbio error:', e.message);
                    await Shefzyreply('❌ Failed to update bio!');
                }
                break;
            }

            //===================
            // join
            //===================
            case 'join': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const joinLink = args[0];
                if (!joinLink) return Shefzyreply('❌ Usage: join <group link>');
                try {
                    // Extract invite code from various link formats
                    let joinCode = joinLink;
                    if (joinLink.includes('chat.whatsapp.com/')) {
                        joinCode = joinLink.split('chat.whatsapp.com/').pop().split('?')[0].trim();
                    }
                    await sock.groupAcceptInvite(joinCode);
                    await Shefzyreply('✅ Successfully joined the group!');
                } catch (e) {
                    console.log('join error:', e.message);
                    await Shefzyreply('❌ Failed to join group! Make sure the link is valid and not expired.');
                }
                break;
            }

            //===================
            // joinch
            //===================
            case 'joinch': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const chLink = args[0];
                if (!chLink) return Shefzyreply('❌ Usage: joinch <channel link>');
                try {
                    let chJid = chLink;
                    // Extract channel ID and convert to @newsletter JID
                    if (chLink.includes('whatsapp.com/channel/')) {
                        const chId = chLink.split('whatsapp.com/channel/').pop().split('/')[0].trim();
                        chJid = chId + '@newsletter';
                    } else if (!chLink.includes('@newsletter')) {
                        chJid = chLink.trim() + '@newsletter';
                    }
                    // Try newsletterFollow first, then channelFollow as fallback
                    try {
                        await sock.newsletterFollow(chJid);
                    } catch {
                        await sock.channelFollow(chJid);
                    }
                    await Shefzyreply('✅ Successfully followed the channel!');
                } catch (e) {
                    console.log('joinch error:', e.message);
                    await Shefzyreply('❌ Failed to follow channel! Make sure the link is correct.');
                }
                break;
            }

            //===================
            // leave / left
            //===================
            case 'leave':
            case 'left': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo can make the bot leave!');
                if (!isGroup) return Shefzyreply('❌ Use this command in a group!');
                await Shefzyreply('👋 Goodbye everyone!');
                await sock.groupLeave(from);
                break;
            }

            //===================
            // broadcast
            //===================
            case 'broadcast': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!text) return Shefzyreply('❌ Usage: broadcast <message>');
                try {
                    const chats = await sock.groupFetchAllParticipating();
                    const groupJids = Object.keys(chats);
                    let sent = 0;
                    for (const jid of groupJids) {
                        try {
                            await sock.sendMessage(jid, { text: `📢 *Broadcast*\n\n${text}` });
                            sent++;
                            await new Promise(r => setTimeout(r, 1000));
                        } catch {}
                    }
                    await Shefzyreply(`✅ Broadcast sent to ${sent} groups!`);
                } catch (e) { await Shefzyreply('❌ Broadcast failed!'); }
                break;
            }

case 'broadcast2':
case 'bcast': {
    if (!isSudo && !isCreator) return Shefzyreply('❌ Owner only!');

    if (!text) return Shefzyreply(
        `📢 *Broadcast Usage*\n\n` +
        `${prefix}broadcast <country code(s)> <message>\n\n` +
        `Examples:\n` +
        `${prefix}broadcast 234 Hello everyone!\n` +
        `${prefix}broadcast 234,44,1 Check this out!\n\n` +
        `📌 Sends to 50–80 random numbers`
    );

    // Parse country codes and message
    const parts = text.trim().split(' ');
    const codesPart = parts[0];
    const broadcastMsg = parts.slice(1).join(' ');

    if (!broadcastMsg) return Shefzyreply('❌ Add a message after the country code!\nExample: ' + prefix + 'broadcast 234 Hello!');

    // Support comma-separated country codes: 234,44,1
    const countryCodes = codesPart.split(',').map(c => c.trim()).filter(c => /^\d{1,4}$/.test(c));
    if (!countryCodes.length) return Shefzyreply('❌ Invalid country code. Example: 234 or 234,44,1');

    // Number length ranges per code (realistic local number lengths)
    const numberLengths = {
        '234': 10, // Nigeria
        '44':  10, // UK
        '1':   10, // USA/Canada
        '27':  9,  // South Africa
        '233': 9,  // Ghana
        '254': 9,  // Kenya
        '255': 9,  // Tanzania
        '256': 9,  // Uganda
        '260': 9,  // Zambia
        '263': 9,  // Zimbabwe
        '251': 9,  // Ethiopia
        '243': 9,  // DR Congo
        '237': 9,  // Cameroon
        '225': 10, // Ivory Coast
        '221': 9,  // Senegal
        '212': 9,  // Morocco
        '20':  10, // Egypt
        '91':  10, // India
        '92':  10, // Pakistan
        '880': 10, // Bangladesh
        '62':  10, // Indonesia
        '55':  11, // Brazil
        '52':  10, // Mexico
    };

    const TARGET_MIN = 50;
    const TARGET_MAX = 80;
    const target = Math.floor(Math.random() * (TARGET_MAX - TARGET_MIN + 1)) + TARGET_MIN;
    const perCode = Math.ceil(target / countryCodes.length);

    // Generate random valid-looking numbers
    function generateNumbers(code, count) {
        const len = numberLengths[code] || 9;
        const nums = new Set();
        let attempts = 0;
        while (nums.size < count && attempts < count * 10) {
            attempts++;
            // Generate realistic local number
            let localNum = '';
            // First digit shouldn't be 0 (most countries)
            localNum += (Math.floor(Math.random() * 8) + 1).toString();
            for (let i = 1; i < len; i++) {
                localNum += Math.floor(Math.random() * 10).toString();
            }
            nums.add(code + localNum + '@s.whatsapp.net');
        }
        return [...nums];
    }

    const allNumbers = [];
    for (const code of countryCodes) {
        allNumbers.push(...generateNumbers(code, perCode));
    }

    // Shuffle and cap
    const shuffled = allNumbers.sort(() => Math.random() - 0.5).slice(0, target);

    await Shefzyreply(
        `📢 *Starting broadcast...*\n\n` +
        `🌍 Countries: ${countryCodes.map(c => '+' + c).join(', ')}\n` +
        `📨 Targets: ${shuffled.length} numbers\n` +
        `💬 Message: ${broadcastMsg.slice(0, 50)}${broadcastMsg.length > 50 ? '...' : ''}\n\n` +
        `⏳ Sending now... (this takes a few minutes)`
    );

    let sent = 0;
    let failed = 0;
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCH = 3000; // 3 seconds between batches
    const DELAY_BETWEEN_MSG = 800;    // 0.8s between each message

    for (let i = 0; i < shuffled.length; i += BATCH_SIZE) {
        const batch = shuffled.slice(i, i + BATCH_SIZE);
        for (const jid of batch) {
            try {
                await sock.sendMessage(jid, { text: broadcastMsg });
                sent++;
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_MSG));
            } catch {
                failed++;
            }
        }
        // Progress update every 20 sent
        if (sent > 0 && sent % 20 === 0) {
            await Shefzyreply(`📢 Progress: ${sent}/${shuffled.length} sent...`);
        }
        if (i + BATCH_SIZE < shuffled.length) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCH));
        }
    }

    await Shefzyreply(
        `✅ *Broadcast Complete!*\n\n` +
        `📨 Sent: ${sent}\n` +
        `❌ Failed: ${failed}\n` +
        `🌍 Countries: ${countryCodes.map(c => '+' + c).join(', ')}`
    );
    break;
}
            //===================
            // save
            //===================
            case 'save': {
                if (!m.quoted) return Shefzyreply('❌ Reply to a status/media with ' + prefix + 'save');
                const saveMtype = m.quoted.mtype;
                const saveableTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
                if (!saveableTypes.includes(saveMtype)) return Shefzyreply('❌ Reply to a media message!');
                try {
                    const saveBuf = await m.quoted.download();
                    if (saveMtype === 'imageMessage') {
                        await sock.sendMessage(from, { image: saveBuf, caption: '✅ Saved!' }, { quoted: m });
                    } else if (saveMtype === 'videoMessage') {
                        await sock.sendMessage(from, { video: saveBuf, caption: '✅ Saved!' }, { quoted: m });
                    } else if (saveMtype === 'audioMessage') {
                        await sock.sendMessage(from, { audio: saveBuf, mimetype: 'audio/mpeg' }, { quoted: m });
                    } else if (saveMtype === 'stickerMessage') {
                        await sock.sendMessage(from, { sticker: saveBuf }, { quoted: m });
                    } else if (saveMtype === 'documentMessage') {
                        await sock.sendMessage(from, { document: saveBuf, mimetype: m.quoted.mimetype || 'application/octet-stream', fileName: m.quoted.fileName || 'file' }, { quoted: m });
                    }
                } catch (e) { await Shefzyreply('❌ Failed to save media!'); }
                break;
            }

            //===================
            // sendgclink
            //===================
            case 'sendgclink': {
                if (!isGroup) return Shefzyreply('❌ Use this command in a group!');
                if (!isCreator && !isSudo && !isAdmin) return Shefzyreply('❌ Admin only!');
                const targetNum = args[0]?.replace(/[^0-9]/g, '');
                if (!targetNum) return Shefzyreply('❌ Usage: sendgclink <number>');
                try {
                    const inviteCode = await sock.groupInviteCode(from);
                    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    await sock.sendMessage(targetNum + '@s.whatsapp.net', {
                        text: `👥 *Group Invite*\n\nYou have been invited to join *${groupName}*\n\n🔗 ${inviteLink}`
                    });
                    await Shefzyreply(`✅ Group link sent to ${targetNum}!`);
                } catch (e) { await Shefzyreply('❌ Failed to send group link!'); }
                break;
            }

            //===================
            // reactch
            //===================
            // Usage: reactch <post_link> <emoji> [amount]
case 'reactch':
case 'rch':
case 'cnr':
case 'channelreact': {
    // Helper to react with timeout and detailed logging
    async function reactWithTimeout(sock, channelJid, postId, emoji, sessionId, timeoutMs = 10000) {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs));
        try {
            // Try both possible method names
            let reactionPromise;
            if (typeof sock.newsletterMsg === 'function') {
                reactionPromise = sock.newsletterMsg(channelJid, { react: emoji, id: postId });
            } else if (typeof sock.newsletterReactMessage === 'function') {
                reactionPromise = sock.newsletterReactMessage(channelJid, postId, emoji);
            } else {
                throw new Error('No channel reaction method (newsletterMsg or newsletterReactMessage) available');
            }
            const result = await Promise.race([reactionPromise, timeoutPromise]);
            console.log(`✅ Session ${sessionId} reacted with ${emoji}`);
            return result;
        } catch (err) {
            console.error(`❌ Session ${sessionId} failed:`, err.message);
            throw err;
        }
    }

    async function reactWithAllSessions(postLink, emojis) {
        const { getAllSessions } = require('./whatsapp');
        
        // Extract invite code and post ID from link
        const match = postLink.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)\/(\d+)/);
        if (!match) throw new Error('Invalid channel post link');
        const inviteCode = match[1];
        const postId = match[2];

        // Get all active sessions
        const allSessions = getAllSessions();
        const activeSessions = allSessions.filter(s => s.isOnline && s.sock);
        if (activeSessions.length === 0) throw new Error('No active WhatsApp sessions found');

        // Use the first active session to fetch channel metadata
        const primarySock = activeSessions[0].sock;
        let metadata;
        try {
            metadata = await primarySock.newsletterMetadata("invite", inviteCode);
        } catch (e) {
            throw new Error(`Failed to fetch channel metadata: ${e.message}`);
        }
        const channelJid = metadata.id; // e.g., 120363xxxxxx@newsletter
        console.log(`Channel JID: ${channelJid}, Post ID: ${postId}`);

        // React concurrently with timeout
        const results = await Promise.allSettled(
            activeSessions.map(session => {
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                const sessionId = session.phoneNumber || session.sock.user?.id || 'unknown';
                return reactWithTimeout(session.sock, channelJid, postId, emoji, sessionId, 10000);
            })
        );

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        return { successCount, total: activeSessions.length };
    }

    //===================
    // Command argument handling
    //===================
    const postLink = args[0];
    if (!postLink) {
        return Shefzyreply(
            `⚡ *Channel React (Multi‑Session)*\n\n` +
            `Usage: ${prefix}reactch <channel-post-link> [emoji1,emoji2,...]\n\n` +
            `Example: ${prefix}reactch https://whatsapp.com/channel/.../123 ❤️,🔥`
        );
    }

    let emojis = [];
    if (args[1]) {
        emojis = args.slice(1).join(' ').split(',').map(e => e.trim()).filter(Boolean);
    }
    if (emojis.length === 0) {
        emojis = ['❤️', '🔥', '😂', '👍', '🎉', '🤯', '🙏', '👏', '✨', '💯', '🚀', '⚡', '😎'];
    }
    if (emojis.length > 10) return Shefzyreply('❌ Maximum 10 emojis allowed.');

    try {
        await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
        const loadMsg = await Shefzyreply('⏳ Deploying reactions...');
        
        const { successCount, total } = await reactWithAllSessions(postLink, emojis);
        
        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
        await sock.sendMessage(from, {
            text: `🔥 *Reactions Sent!*\n\n📌 Post: ${postLink}\n😊 Emojis used: ${emojis.join(' ')}\n✅ Successful`,
            edit: loadMsg.key
        });
    } catch (err) {
        console.error('reactch error:', err);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        await Shefzyreply(`❌ Failed: ${err.message}`);
    }
    break;
}

            //===================
            // hidetag: tag all members silently
            //===================
            case 'hidetag': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                try {
                    const htMeta = await sock.groupMetadata(from);
                    const htMentions = htMeta.participants.map(p => p.id);
                    const htText = text || '​';
                    await sock.sendMessage(from, { text: htText, mentions: htMentions }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to hidetag!'); }
                break;
            }

            //===================
            // warn
            //===================
            case 'warn': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const warnJid = resolveTarget(args[0]);
                if (!warnJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                const warnNum = warnJid.split('@')[0];
                const prot = getGroupProtection(sock, from);
                const current = (prot.warnCount.get(warnJid) || 0) + 1;
                prot.warnCount.set(warnJid, current);
                saveProtection();
                if (current >= prot.maxWarns) {
                    prot.warnCount.delete(warnJid);
                    saveProtection();
                    try {
                        await sock.groupParticipantsUpdate(from, [warnJid], 'remove');
                        await Shefzyreply(`🚫 @${warnNum} reached ${prot.maxWarns} warnings and was kicked!`);
                    } catch { await Shefzyreply(`⚠️ @${warnNum} reached max warnings but kick failed. Make bot admin.`); }
                } else {
                    await sock.sendMessage(from, {
                        text: `⚠️ @${warnNum} has been warned! (${current}/${prot.maxWarns})
Next warn = kick.`,
                        mentions: [warnJid]
                    }, { quoted: m });
                }
                break;
            }

            //===================
            // unwarn
            //===================
            case 'unwarn': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const uwJid = resolveTarget(args[0]);
                if (!uwJid) return Shefzyreply('❌ Reply to user, @mention them, or provide number!');
                const prot = getGroupProtection(sock, from);
                prot.warnCount.delete(uwJid);
                saveProtection();
                await Shefzyreply(`✅ @${uwJid.split('@')[0]} warnings cleared!`);
                break;
            }

            //===================
            // listwarn
            //===================
            case 'listwarn': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                const prot = getGroupProtection(sock, from);
                if (!prot.warnCount || prot.warnCount.size === 0) return Shefzyreply('✅ No warned users.');
                const wList = Array.from(prot.warnCount.entries()).map(([j, c], i) => `${i+1}. ${j.split('@')[0]} — ${c}/${prot.maxWarns} warns`).join('\n');
                await Shefzyreply(`⚠️ *Warned Users*\n\n${wList}`);
                break;
            }

            //===================
            // open: allow all members to send
            //===================
            case 'open': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await Shefzyreply('🔓 Group is now *open* — all members can send messages!');
                } catch (e) { await Shefzyreply('❌ Failed to open group!'); }
                break;
            }

            //===================
            // close: only admins can send
            //===================
            case 'close': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    await sock.groupSettingUpdate(from, 'announcement');
                    await Shefzyreply('🔒 Group is now *closed* — only admins can send messages!');
                } catch (e) { await Shefzyreply('❌ Failed to close group!'); }
                break;
            }

            //===================
            // setgcname
            //===================
            case 'setgcname': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                if (!text) return Shefzyreply('❌ Usage: setgcname <new name>');
                try {
                    await sock.groupUpdateSubject(from, text);
                    await Shefzyreply(`✅ Group name changed to: *${text}*`);
                } catch (e) { await Shefzyreply('❌ Failed to change group name!'); }
                break;
            }

            //===================
            // setgcdesc
            //===================
            case 'setgcdesc': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                if (!text) return Shefzyreply('❌ Usage: setgcdesc <description>');
                try {
                    try {
                        await sock.groupUpdateDescription(from, text);
                    } catch {
                        await sock.groupUpdateSubjectDescription(from, text);
                    }
                    await Shefzyreply('✅ Group description updated!');
                } catch (e) {
                    console.log('setgcdesc error:', e.message);
                    await Shefzyreply('❌ Failed to update description! Bot must be admin.');
                }
                break;
            }

            //===================
            // setgcpp
            //===================
            case 'setgcpp': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to an image!');
                try {
                    const gcppBuf = await m.quoted.download();
                    await sock.updateProfilePicture(from, gcppBuf);
                    await Shefzyreply('✅ Group profile picture updated!');
                } catch (e) { await Shefzyreply('❌ Failed to update group picture!'); }
                break;
            }

            //===================
            // delgcpp
            //===================
            case 'delgcpp': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    await sock.removeProfilePicture(from);
                    await Shefzyreply('✅ Group profile picture removed!');
                } catch (e) { await Shefzyreply('❌ Failed to remove group picture!'); }
                break;
            }

            //===================
            // getlink
            //===================
            case 'getlink': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                try {
                    const invCode = await sock.groupInviteCode(from);
                    await Shefzyreply(`🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${invCode}`);
                } catch (e) { await Shefzyreply('❌ Failed to get group link!'); }
                break;
            }

            //===================
            // revoke
            //===================
            case 'reset':
            case 'revoke': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    await sock.groupRevokeInvite(from);
                    const newCode = await sock.groupInviteCode(from);
                    await Shefzyreply(`✅ Invite link revoked!\n\nNew link:\nhttps://chat.whatsapp.com/${newCode}`);
                } catch (e) { await Shefzyreply('❌ Failed to revoke invite link!'); }
                break;
            }

            //===================
            // gcinfo
            //===================
            case 'gcinfo': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                try {
                    const gcMeta = await sock.groupMetadata(from);
                    const created = new Date(gcMeta.creation * 1000).toLocaleDateString('en-NG', { timeZone: config.timezone || 'Africa/Lagos' });
                    const superAdmin = gcMeta.participants.find(p => p.admin === 'superadmin');
                    const admins = gcMeta.participants.filter(p => p.admin === 'admin');
                    const totalMembers = gcMeta.participants.length;
                    const allMentions = gcMeta.participants.map(p => p.id);

                    // Build info text with @mentions
                    let infoText = '📋 *Group Info*\n\n';
                    infoText += '👥 *Name:* ' + gcMeta.subject + '\n';
                    infoText += '📝 *Desc:* ' + (gcMeta.desc || 'No description') + '\n';
                    infoText += '👤 *Members:* ' + totalMembers + '\n';
                    infoText += '📅 *Created:* ' + created + '\n';
                    infoText += '🆔 *ID:* ' + from + '\n\n';

                    if (superAdmin) {
                        infoText += '👑 *Creator/SuperAdmin:*\n@' + superAdmin.id.split('@')[0] + '\n\n';
                    }
                    if (admins.length > 0) {
                        infoText += '⭐ *Admins (' + admins.length + '):*\n';
                        admins.forEach(a => { infoText += '@' + a.id.split('@')[0] + '\n'; });
                    }

                    // Try to get group profile picture
                    let gcPic = null;
                    try { gcPic = await sock.profilePictureUrl(from, 'image'); } catch {}

                    if (gcPic) {
                        await sock.sendMessage(from, {
                            image: { url: gcPic },
                            caption: infoText,
                            mentions: allMentions
                        }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, {
                            text: infoText,
                            mentions: allMentions
                        }, { quoted: m });
                    }
                } catch (e) {
                    console.log('gcinfo error:', e.message);
                    await Shefzyreply('❌ Failed to get group info!');
                }
                break;
            }

            //===================
            // listmembers
            //===================
            case 'listmembers': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                try {
                    const lmMeta = await sock.groupMetadata(from);
                    const lmMentions = lmMeta.participants.map(p => p.id);
                    let lmText = `👥 *Members (${lmMeta.participants.length})*

`;
                    lmMeta.participants.forEach((p, i) => {
                        const role = p.admin === 'superadmin' ? '👑' : p.admin === 'admin' ? '⭐' : '👤';
                        lmText += `${i+1}. ${role} @${p.id.split('@')[0]}
`;
                    });
                    await sock.sendMessage(from, { text: lmText, mentions: lmMentions }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to list members!'); }
                break;
            }

            //===================
            // admins
            //===================
            case 'admins': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                try {
                    const adMeta = await sock.groupMetadata(from);
                    const adAdmins = adMeta.participants.filter(p => p.admin);
                    if (!adAdmins.length) return Shefzyreply('❌ No admins found!');
                    const adMentions = adAdmins.map(p => p.id);
                    let adText = `👑 *Group Admins (${adAdmins.length})*

`;
                    adAdmins.forEach((p, i) => {
                        const role = p.admin === 'superadmin' ? '👑' : '⭐';
                        adText += `${i+1}. ${role} @${p.id.split('@')[0]}
`;
                    });
                    await sock.sendMessage(from, { text: adText, mentions: adMentions }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to list admins!'); }
                break;
            }

            //===================
            // announce
            //===================
            case 'announce': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!text) return Shefzyreply('❌ Usage: announce <message>');
                const anMeta = await sock.groupMetadata(from);
                const anMentions = anMeta.participants.map(p => p.id);
                const anText = `📢 *ANNOUNCEMENT*\n${'─'.repeat(25)}\n\n${text}\n\n${'─'.repeat(25)}\n👥 *${groupName}*`;
                await sock.sendMessage(from, { text: anText, mentions: anMentions }, { quoted: m });
                break;
            }

            //===================
            // antilink
            //===================
            
case 'antilink': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const alSub = args[0]?.toLowerCase();
    const prot = getGroupProtection(sock, from);
    if (!prot.linkWhitelist) prot.linkWhitelist = [];

    if (!alSub) {
        await Shefzyreply(
            '🔗 *Antilink Settings*\n\n' +
            'Available commands:\n\n' +
            '• ' + prefix + 'antilink kick\n' +
            '• ' + prefix + 'antilink delete\n' +
            '• ' + prefix + 'antilink warn 4\n' +
            '• ' + prefix + 'antilink allow <url>\n' +
            '• ' + prefix + 'antilink unallow <url>\n' +
            '• ' + prefix + 'antilink listallow\n' +
            '• ' + prefix + 'antilink status\n' +
            '• ' + prefix + 'antilink off\n\n' +
            '💡 Use ' + prefix + 'resetwarn to reset warnings'
        );
    } else if (alSub === 'off') {
        prot.antilink = false; saveProtection();
        await Shefzyreply('🔗 Anti-link is now *OFF*.');
    } else if (alSub === 'delete') {
        prot.antilink = 'delete';
        saveProtection();
        await Shefzyreply('🔗 Anti-link *ON* — Mode: *Delete only*');
    } else if (alSub === 'kick') {
        prot.antilink = 'delete/kick';
        saveProtection();
        await Shefzyreply('🔗 Anti-link *ON* — Mode: *Delete & Kick*');
    } else if (alSub === 'warn') {
        const warnNum = parseInt(args[1]);
        if (!warnNum || warnNum < 1) {
            await Shefzyreply('❌ Usage: ' + prefix + 'antilink warn <number>\nExample: ' + prefix + 'antilink warn 4');
        } else {
            prot.antilink = 'warn/delete';
            prot.maxWarns = warnNum;
            saveProtection();
            await Shefzyreply('🔗 Anti-link *ON* — Mode: *Warn & Delete*\n⚠️ Max warnings: *' + warnNum + '*');
        }
    } else if (alSub === 'allow') {
        const urlToAllow = args.slice(1).join(' ').trim();
        if (!urlToAllow) {
            await Shefzyreply('❌ Usage: ' + prefix + 'antilink allow <url>\nExample: ' + prefix + 'antilink allow chat.whatsapp.com');
        } else {
            const cleanUrl = urlToAllow.replace(/^https?:\/\//, '').toLowerCase();
            if (prot.linkWhitelist.includes(cleanUrl)) {
                await Shefzyreply('⚠️ "' + cleanUrl + '" is already whitelisted!');
            } else {
                prot.linkWhitelist.push(cleanUrl);
                saveProtection();
                await Shefzyreply('✅ Whitelisted: *' + cleanUrl + '*\n📋 Total allowed: ' + prot.linkWhitelist.length);
            }
        }
    } else if (alSub === 'unallow') {
        const urlToRemove = args.slice(1).join(' ').trim();
        if (!urlToRemove) {
            await Shefzyreply('❌ Usage: ' + prefix + 'antilink unallow <url>');
        } else {
            const cleanUrl2 = urlToRemove.replace(/^https?:\/\//, '').toLowerCase();
            const before = prot.linkWhitelist.length;
            prot.linkWhitelist = prot.linkWhitelist.filter(u => u !== cleanUrl2);
            saveProtection();
            if (prot.linkWhitelist.length < before) {
                await Shefzyreply('✅ Removed "' + cleanUrl2 + '" from whitelist!\n📋 Total allowed: ' + prot.linkWhitelist.length);
            } else {
                await Shefzyreply('⚠️ "' + cleanUrl2 + '" was not whitelisted!');
            }
        }
    } else if (alSub === 'listallow') {
        await Shefzyreply(
            '📋 *Whitelisted Links* (' + prot.linkWhitelist.length + ')\n\n' +
            (prot.linkWhitelist.length ? prot.linkWhitelist.map((u, i) => (i + 1) + '. ' + u).join('\n') : 'None — list is empty')
        );
    } else if (alSub === 'status') {
        const modeLabel = !prot.antilink ? '❌ OFF'
            : prot.antilink === 'delete' ? '🗑️ Delete only'
            : prot.antilink === 'warn/delete' ? '⚠️ Warn & Delete (max ' + prot.maxWarns + ')'
            : prot.antilink === 'delete/kick' ? '🚷 Delete & Kick'
            : '✅ ON';
        await Shefzyreply(
            '📊 *Anti-Link Status*\n\n' +
            'Mode: ' + modeLabel + '\n' +
            'Whitelisted links: ' + prot.linkWhitelist.length
        );
          } else if (alSub === 'reset') {
        prot.maxWarns = 3;
        saveProtection();
        await Shefzyreply('🔄 Anti-link warn limit reset to default: *3 warnings*');
    } else if (alSub === 'on') {
        pendingAntiAction.set(sender + from, { feature: 'antilink' });
        await sock.sendMessage(from, {
            text: '🔗 *Anti-Link Activated!*\n\nChoose what happens when a link is detected:\n\n1️⃣ Delete only\n2️⃣ Warn & Delete\n3️⃣ Delete & Kick\n\nReply with 1, 2, or 3.'
        }, { quoted: m });
        setTimeout(() => pendingAntiAction.delete(sender + from), 30000);
    } else {
        await Shefzyreply('❌ Unknown option. Use ' + prefix + 'antilink with no arguments to see usage.');
    }
    break;
}

case 'antigroupstatus': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const agsSub = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(agsSub)) return Shefzyreply('❌ Usage: ' + prefix + 'antigroupstatus on/off');
    const prot = getGroupProtection(sock, from);
    prot.antigroupstatus = agsSub === 'on';
    saveProtection();
    await Shefzyreply(`📵 Anti-group-status is now *${agsSub.toUpperCase()}*.\n\n${agsSub === 'on' ? '✅ Status posts to this group will be automatically deleted.' : '❌ Status posts will no longer be blocked.'}`);
    break;
}

case 'antistatusspam': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const prot = getGroupProtection(sock, from);
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'on' || sub === 'off') {
        prot.antistatusspam = sub === 'on';
        saveProtection();
        return Shefzyreply(`🛡️ Anti status-spam is now *${sub.toUpperCase()}*.\n\n${sub === 'on' ? `Anyone who posts group status ${prot.statusSpamLimit || 3} times within ${prot.statusSpamWindowMin || 15} minutes is removed (admins and the owner are exempt).\n⚠️ The bot must be an admin.` : ''}`);
    }
    if (sub === 'limit' || sub === 'window') {
        const n = parseInt(args[1], 10);
        if (!n || n < (sub === 'limit' ? 2 : 1) || n > 120) return Shefzyreply(`❌ Usage: ${prefix}antistatusspam ${sub} <number>`);
        if (sub === 'limit') prot.statusSpamLimit = n; else prot.statusSpamWindowMin = n;
        saveProtection();
        return Shefzyreply(`✅ ${sub === 'limit' ? 'Limit' : 'Window'} set to *${n}*${sub === 'window' ? ' minutes' : ' posts'}.`);
    }
    return Shefzyreply(`🛡️ *Anti Status-Spam*\nStatus: ${prot.antistatusspam ? '✅ ON' : '❌ OFF'}\nLimit: ${prot.statusSpamLimit || 3} posts\nWindow: ${prot.statusSpamWindowMin || 15} minutes\n\n${prefix}antistatusspam on/off\n${prefix}antistatusspam limit <n>\n${prefix}antistatusspam window <minutes>`);
}

case 'antidelete': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const adSub = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(adSub)) return Shefzyreply('❌ Usage: ' + prefix + 'antidelete on/off');
    const prot = getGroupProtection(sock, from);
    prot.antidelete = adSub === 'on';
    saveProtection();
    await Shefzyreply(`🗑️ Anti-delete is now *${adSub.toUpperCase()}*.\n\n${adSub === 'on' ? '✅ Messages deleted for everyone will be posted back in this group.' : ''}`);
    break;
}

            //===================
            // antifwd
            //===================
            case 'antifwd': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const afSub = args[0]?.toLowerCase();
                if (!afSub || !['on','off'].includes(afSub)) return Shefzyreply('❌ Usage: antifwd on/off');
                const prot = getGroupProtection(sock, from);
                prot.antifwd = afSub === 'on';
                saveProtection();
                await Shefzyreply(`📨 Anti-forward is now *${afSub.toUpperCase()}*.`);
                break;
            }

            //===================
            // antibot
            //===================
            case 'antibot': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const abSub = args[0]?.toLowerCase();
    if (!abSub || !['on','off'].includes(abSub)) return Shefzyreply('❌ Usage: antibot on/off');
    const prot = getGroupProtection(sock, from);
    if (abSub === 'off') {
        prot.antibot = false; saveProtection();
        return Shefzyreply('🤖 Anti-bot is now *OFF*.');
    }
    pendingAntiAction.set(sender + from, { feature: 'antibot' });
    await sock.sendMessage(from, {
        text: '🤖 *Anti-Bot Activated!*\n\nChoose what happens when a bot-like response is detected:\n\n1️⃣ Delete only\n2️⃣ Warn & Delete\n3️⃣ Delete & Kick\n\nReply with 1, 2, or 3.'
    }, { quoted: m });
    setTimeout(() => pendingAntiAction.delete(sender + from), 30000);
    break;
}

            //===================
            // flood
            //===================
            case 'flood': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const flSub = args[0]?.toLowerCase();
                if (!flSub || !['on','off'].includes(flSub)) return Shefzyreply('❌ Usage: flood on/off');
                const prot = getGroupProtection(sock, from);
                prot.flood = flSub === 'on';
                saveProtection();
                await Shefzyreply(`🌊 Flood detection is now *${flSub.toUpperCase()}*\nLimit: ${prot.floodLimit} msgs/${prot.floodInterval/1000}s.`);
                break;
            }


            //===================
            // antigroupmention: block status "@ This group was mentioned" messages
            //===================
            case 'antigroupmention':
            case 'antitag': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const atSub = args[0]?.toLowerCase();
                if (!atSub || !['on','off'].includes(atSub)) return Shefzyreply('❌ Usage: antigroupmention on/off');
                const prot = getGroupProtection(sock, from);
                prot.antigroupmention = atSub === 'on';
                prot.antitag = atSub === 'on';
                saveProtection();
                await Shefzyreply('🏷️ Anti Group Mention is now *' + atSub.toUpperCase() + '*\nMessages that tag this group from status will be auto-deleted.');
                break;
            }

            //===================
            // poll
            //===================
            // Usage: poll <question> | <option1> | <option2> | ...
            case 'poll': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const pollRaw = text;
                if (!pollRaw || !pollRaw.includes('|')) {
                    return Shefzyreply('❌ Usage: poll <question> | <option1> | <option2>\nExample: poll Favorite color? | Red | Blue | Green');
                }
                const pollParts = pollRaw.split('|').map(p => p.trim()).filter(Boolean);
                if (pollParts.length < 3) return Shefzyreply('❌ Need at least a question and 2 options!\nUsage: poll <question> | <option1> | <option2>');
                const pollQuestion = pollParts[0];
                const pollOptions = pollParts.slice(1).slice(0, 12); // WhatsApp max 12 options
                try {
                    await sock.sendMessage(from, {
                        poll: {
                            name: pollQuestion,
                            values: pollOptions,
                            selectableCount: 1
                        }
                    }, { quoted: m });
                } catch (e) {
                    console.log('poll error:', e.message);
                    await Shefzyreply('❌ Failed to create poll! Make sure your Baileys version supports polls.');
                }
                break;
            }


            //===================
            // add: add user to group with safety confirmation
            //===================
            case 'add': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin to add members!');
                const addJid = resolveTarget(args[0]);
                if (!addJid) return Shefzyreply('❌ Usage: add <number>');
                const addNum = addJid.split('@')[0];
                // Store pending and ask for confirmation
                pendingAdd.set(sender, { targetJid: addJid, groupJid: from });
                await sock.sendMessage(from, {
                    text: `⚠️ *Add Confirmation*\n\n📱 Number: *${addNum}*\n\n❓ Have you saved this number to avoid getting banned?\n\nReply *yes* to confirm or *no* to cancel.`,
                    mentions: [sender]
                }, { quoted: m });
                // Auto-cancel after 30s
                setTimeout(() => { pendingAdd.delete(sender); }, 30000);
                break;
            }

            //===================
            // tagadmins: mention all group admins
            //===================
            case 'tagadmins': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                try {
                    const taMeta = await sock.groupMetadata(from);
                    const taAdmins = taMeta.participants.filter(p => p.admin);
                    if (!taAdmins.length) return Shefzyreply('❌ No admins found!');
                    const taMentions = taAdmins.map(p => p.id);
                    let taText = `📢 *Admin Alert*\n\n${text || 'Admins are being tagged'}\n\n`;
                    taAdmins.forEach((p, i) => taText += `${i+1}. @${p.id.split('@')[0]}\n`);
                    await sock.sendMessage(from, { text: taText, mentions: taMentions }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to tag admins!'); }
                break;
            }

            //===================
            // kickall: kick all non-admin members
            //===================
            case 'kickall': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    const kaMeta = await sock.groupMetadata(from);
                    const botRawKa = botNumberRaw;
                    const toKick = kaMeta.participants.filter(p => {
                        const pRaw = p.id.split('@')[0].split(':')[0];
                        return !p.admin && pRaw !== botRawKa;
                    }).map(p => p.id);
                    if (!toKick.length) return Shefzyreply('✅ No non-admin members to kick!');
                    await Shefzyreply(`⏳ Kicking ${toKick.length} member(s)...`);
                    let kicked = 0;
                    for (const jid of toKick) {
                        try {
                            await sock.groupParticipantsUpdate(from, [jid], 'remove');
                            kicked++;
                            await new Promise(r => setTimeout(r, 500));
                        } catch {}
                    }
                    await Shefzyreply(`✅ Kicked ${kicked}/${toKick.length} members!`);
                } catch (e) { await Shefzyreply('❌ Failed to kickall!'); }
                break;
            }

            //===================
            // promoteall: promote all non-admin members
            //===================
            case 'promoteall': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    const paMeta = await sock.groupMetadata(from);
                    const toPromote = paMeta.participants.filter(p => !p.admin).map(p => p.id);
                    if (!toPromote.length) return Shefzyreply('✅ All members are already admin!');
                    await Shefzyreply(`⏳ Promoting ${toPromote.length} member(s)...`);
                    let promoted = 0;
                    for (const jid of toPromote) {
                        try {
                            await sock.groupParticipantsUpdate(from, [jid], 'promote');
                            promoted++;
                            await new Promise(r => setTimeout(r, 500));
                        } catch {}
                    }
                    await Shefzyreply(`✅ Promoted ${promoted}/${toPromote.length} members!`);
                } catch (e) { await Shefzyreply('❌ Failed to promoteall!'); }
                break;
            }

            //===================
            // demoteall: demote all admins except bot and creator
            //===================
            case 'demoteall': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    const daMeta = await sock.groupMetadata(from);
                    const botRawDa = botNumberRaw;
                    const toDemote = daMeta.participants.filter(p => {
                        if (!p.admin) return false;
                        if (p.admin === 'superadmin') return false; // skip creator
                        const pRaw = p.id.split('@')[0].split(':')[0];
                        return pRaw !== botRawDa; // skip bot itself
                    }).map(p => p.id);
                    if (!toDemote.length) return Shefzyreply('✅ No admins to demote!');
                    await Shefzyreply(`⏳ Demoting ${toDemote.length} admin(s)...`);
                    let demoted = 0;
                    for (const jid of toDemote) {
                        try {
                            await sock.groupParticipantsUpdate(from, [jid], 'demote');
                            demoted++;
                            await new Promise(r => setTimeout(r, 500));
                        } catch {}
                    }
                    await Shefzyreply(`✅ Demoted ${demoted}/${toDemote.length} admins!`);
                } catch (e) { await Shefzyreply('❌ Failed to demoteall!'); }
                break;
            }

            //===================
            // opentime: open group after a set time
            //===================
            // Usage: opentime 5s / 5m / 5h
            case 'opentime': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                const otArg = args[0];
                if (!otArg) return Shefzyreply('❌ Usage: opentime 5s / 5m / 5h');
                const otMatch = otArg.match(/^(\d+)(s|m|h)$/i);
                if (!otMatch) return Shefzyreply('❌ Usage: opentime 5s / 5m / 5h');
                const otVal = parseInt(otMatch[1]);
                const otUnit = otMatch[2].toLowerCase();
                const otMs = otUnit === 's' ? otVal * 1000 : otUnit === 'm' ? otVal * 60000 : otVal * 3600000;
                // Close group now
                await sock.groupSettingUpdate(from, 'announcement').catch(() => {});
                await Shefzyreply(`🔒 Group closed. Will open in *${otArg}*`);
                setTimeout(async () => {
                    try {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        await sock.sendMessage(from, { text: '🔓 Group is now *open*!' });
                    } catch {}
                }, otMs);
                break;
            }

            //===================
            // closetime: close group after a set time
            //===================
            case 'closetime': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                const ctArg = args[0];
                if (!ctArg) return Shefzyreply('❌ Usage: closetime 5s / 5m / 5h');
                const ctMatch = ctArg.match(/^(\d+)(s|m|h)$/i);
                if (!ctMatch) return Shefzyreply('❌ Usage: closetime 5s / 5m / 5h');
                const ctVal = parseInt(ctMatch[1]);
                const ctUnit = ctMatch[2].toLowerCase();
                const ctMs = ctUnit === 's' ? ctVal * 1000 : ctUnit === 'm' ? ctVal * 60000 : ctVal * 3600000;
                // Open group now
                await sock.groupSettingUpdate(from, 'not_announcement').catch(() => {});
                await Shefzyreply(`🔓 Group opened. Will close in *${ctArg}*`);
                setTimeout(async () => {
                    try {
                        await sock.groupSettingUpdate(from, 'announcement');
                        await sock.sendMessage(from, { text: '🔒 Group is now *closed*!' });
                    } catch {}
                }, ctMs);
                break;
            }

            //===================
            // acceptall: accept all pending join requests
            //===================
            case 'acceptall': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    const requests = await sock.groupRequestParticipantsList(from);
                    if (!requests || !requests.length) return Shefzyreply('✅ No pending join requests.');
                    await sock.groupRequestParticipantsUpdate(from, requests.map(r => r.jid), 'approve');
                    await Shefzyreply(`✅ Approved ${requests.length} join request(s)!`);
                } catch (e) {
                    console.log('acceptall error:', e.message);
                    await Shefzyreply('❌ Failed to accept requests! Make sure approval mode is on.');
                }
                break;
            }

            //===================
            // rejectall: reject all pending join requests
            //===================
            case 'rejectall': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                try {
                    const requests = await sock.groupRequestParticipantsList(from);
                    if (!requests || !requests.length) return Shefzyreply('✅ No pending join requests.');
                    await sock.groupRequestParticipantsUpdate(from, requests.map(r => r.jid), 'reject');
                    await Shefzyreply(`✅ Rejected ${requests.length} join request(s)!`);
                } catch (e) {
                    console.log('rejectall error:', e.message);
                    await Shefzyreply('❌ Failed to reject requests!');
                }
                break;
            }

            //===================
            // groupid: show current group JID
            //===================
            case 'groupid': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                await Shefzyreply(`🆔 *Group ID*\n\n\`${from}\`\n\n📋 Group: *${groupName}*`);
                break;
            }

            //===================
            // pin: pin a replied message in group
            //===================
            case 'pin': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                if (!m.quoted) return Shefzyreply('❌ Reply to a message to pin it!');
                try {
                    const duration = parseInt(args[0]) || 86400; // default 24h in seconds
                    await sock.sendMessage(from, {
                        pin: { type: 1, time: duration },
                        edit: m.quoted.fakeObj?.key || {
                            remoteJid: from,
                            id: m.quoted.id,
                            participant: m.quoted.sender
                        }
                    });
                    await Shefzyreply('📌 Message pinned!');
                } catch (e) {
                    console.log('pin error:', e.message);
                    await Shefzyreply('❌ Failed to pin message!');
                }
                break;
            }

            //===================
            // unpin: unpin a replied message
            //===================
            case 'unpin': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                if (!m.quoted) return Shefzyreply('❌ Reply to a pinned message to unpin it!');
                try {
                    await sock.sendMessage(from, {
                        pin: { type: 2 },
                        edit: {
                            remoteJid: from,
                            id: m.quoted.id,
                            participant: m.quoted.sender
                        }
                    });
                    await Shefzyreply('📌 Message unpinned!');
                } catch (e) {
                    console.log('unpin error:', e.message);
                    await Shefzyreply('❌ Failed to unpin message!');
                }
                break;
            }

            //===================
            // pinchat: pin a chat in bot WhatsApp
            //===================
            case 'pinchat': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                try {
                    await sock.chatModify({ pin: true }, from);
                    await Shefzyreply('📌 Chat pinned!');
                } catch (e) {
                    console.log('pinchat error:', e.message);
                    await Shefzyreply('❌ Failed to pin chat!');
                }
                break;
            }

            //===================
            // unpinchat: unpin a chat
            //===================
            case 'unpinchat': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                try {
                    await sock.chatModify({ pin: false }, from);
                    await Shefzyreply('📌 Chat unpinned!');
                } catch (e) { await Shefzyreply('❌ Failed to unpin chat!'); }
                break;
            }



            //===================
            // getpp: get profile picture of a user
            //===================
case 'getpp': {
    let targetJid = null
    if (m.quoted) {
        targetJid = m.quoted.sender;  
    }
    if (!targetJid) {
        const mentionList = m.msg?.contextInfo?.mentionedJid || [];
        if (Array.isArray(mentionList) && mentionList.length > 0) {
            targetJid = mentionList[0];
        }
    }
    if (!targetJid && args[0]) {
        const num = args[0].replace(/[^0-9]/g, '');
        if (!num) return m.reply('❌ Invalid number.\nUsage: .getpp <number> / reply to a message / mention a user');
        targetJid = num + '@s.whatsapp.net';
    }
    if (!targetJid) {
        targetJid = m.isGroup ? m.sender : m.from; 
    }
    try {
        let ppUrl;
        try {
            ppUrl = await sock.profilePictureUrl(targetJid, 'image');
        } catch {
            ppUrl = 'https://files.catbox.moe/5kv07a.jpg';
        }

        const targetNumber = targetJid.split('@')[0];
        await sock.sendMessage(
            m.from,
            {
                image: { url: ppUrl },
                caption: `📸 Profile picture of *+${targetNumber}*`,
                mentions: [targetJid]
            },
            { quoted: m }
        );

    } catch (e) {
        console.error('[getpp]', e.message);
        m.reply(`❌ Failed to fetch profile picture: ${e.message}`);
    }
    break;
}

            //===================
            // getname: get WhatsApp display name of a user
            //===================
            case 'getname': {
                const nameTarget = resolveTarget(args[0]) || sender;
                try {
                    const nameInfo = await sock.fetchStatus(nameTarget);
                    const contact = await sock.onWhatsApp(nameTarget);
                    const displayName = contact?.[0]?.notify || nameInfo?.status || 'Unknown';
                    await Shefzyreply(`👤 *Display Name*\n\n@${nameTarget.split('@')[0]}: *${displayName}*`);
                } catch (e) { await Shefzyreply('❌ Failed to get display name!'); }
                break;
            }

            //===================
            // autotyping: toggle auto-typing presence
            //===================
            case 'autotyping': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const atSub = args[0]?.toLowerCase();
                if (!atSub || !['on','off'].includes(atSub)) return Shefzyreply('❌ Usage: autotyping on/off');
                userSetting.autoTyping = atSub === 'on';
                if (atSub === 'on') userSetting.autoRecording = false; // can't do both
                await Shefzyreply(`⌨️ Auto-typing is now *${atSub.toUpperCase()}*`);
                break;
            }

            //===================
            // autorecording: toggle auto-recording presence
            //===================
            case 'autorecording': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const arSub = args[0]?.toLowerCase();
                if (!arSub || !['on','off'].includes(arSub)) return Shefzyreply('❌ Usage: autorecording on/off');
                userSetting.autoRecording = arSub === 'on';
                if (arSub === 'on') userSetting.autoTyping = false;
                await Shefzyreply(`🎙️ Auto-recording is now *${arSub.toUpperCase()}*`);
                break;
            }

            //===================
            // autoread: toggle auto-read for all messages
            //===================
            case 'autoread': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const autoReadSub = args[0]?.toLowerCase();
                if (!autoReadSub || !['on','off'].includes(autoReadSub)) return Shefzyreply('❌ Usage: autoread on/off');
                userSetting.autoRead = autoReadSub === 'on';
                await Shefzyreply(`📖 Auto-read is now *${autoReadSub.toUpperCase()}*`);
                break;
            }

            //===================
            // alwaysonline: toggle always-online presence
            //===================
            case 'alwaysonline': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const aoSub = args[0]?.toLowerCase();
                if (!aoSub || !['on','off'].includes(aoSub)) return Shefzyreply('❌ Usage: alwaysonline on/off');
                userSetting.alwaysOnline = aoSub === 'on';
                if (aoSub === 'on') {
                    try { await sock.sendPresenceUpdate('available'); } catch {}
                }
                await Shefzyreply(`🟢 Always-online is now *${aoSub.toUpperCase()}*`);
                break;
            }

            //===================
            // autoreact: auto-react to every message in group
            //===================
            case 'autoreact': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const arEmoji = args[0];
                if (!arEmoji) {
                    // Show status
                    const current = autoReactGroups.get(from);
                    return Shefzyreply(current
                        ? `✅ Auto-react is ON with ${current}\nUse: autoreact off — to disable`
                        : '❌ Auto-react is OFF\nUse: autoreact <emoji> — to enable');
                }
                if (arEmoji.toLowerCase() === 'off') {
                    autoReactGroups.delete(from);
                    await Shefzyreply('❌ Auto-react disabled!');
                } else {
                    autoReactGroups.set(from, arEmoji);
                    await Shefzyreply(`✅ Auto-react enabled with ${arEmoji}`);
                }
                break; 
            }

            //===================
            // idch: get channel info
            //===================
case 'checkidch':
case 'idch': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
    if (!text) return Shefzyreply("Please provide a WhatsApp Channel link.");
    if (!text.includes("https://whatsapp.com/channel/")) return Shefzyreply("The link you provided is not a valid WhatsApp Channel link.");

    try {
        let channelCode = text.split('https://whatsapp.com/channel/')[1];
        let res = await sock.newsletterMetadata("invite", channelCode);

        let responseText = `
*🆔 Channel ID:* ${res.id}
*📝 Name:* ${res.name}
*👥 Followers:* ${res.subscribers}
*🔒 Status:* ${res.state}
*✅ Verified:* ${res.verification === "VERIFIED" ? "Yes" : "No"}
        `.trim();

        await sock.sendMessage(from, {
            text: responseText,
            buttons: [
                {
                    buttonId: res.id,
                    buttonText: { displayText: `📋 Copy JID: ${res.id}` },
                    type: 1
                },
                {
                    buttonId: res.name,
                    buttonText: { displayText: `📋 Copy Name: ${res.name}` },
                    type: 1
                }
            ],
            headerType: 1
        }, { quoted: m });

    } catch (e) {
        console.error("Channel ID Error:", e);
        Shefzyreply("❌ Failed to fetch channel metadata. The link might be invalid or the channel private.");
    }
    break;
}



            //===================
            // UTILITY COMMANDS
            //===================

            //===================
            // say / tts
            //===================
            case 'say':
            case 'tts': {
                const ttsText = text || m.quoted?.text;
                if (!ttsText) return Shefzyreply('❌ Usage: say <text>');
                try {
                    const ttsUrl = `https://api.voicerss.org/?key=free&hl=en-us&src=${encodeURIComponent(ttsText)}&c=MP3&f=16khz_16bit_mono`;
                    // Use Google TTS as fallback (more reliable for free tier)
                    const gttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(ttsText)}&tl=en&client=tw-ob`;
                    const ttsRes = await axios.get(gttsUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
                    await sock.sendMessage(from, { audio: Buffer.from(ttsRes.data), mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
                } catch (e) {
                    console.log('tts error:', e.message);
                    await Shefzyreply('❌ TTS failed! Try a shorter text.');
                }
                break;
            }

            //===================
            // translate / tr
            //===================
            // Usage: translate <lang_code> <text>  OR  reply to text with translate <lang>
            case 'translate':
            case 'tr': {
                const trLang = args[0] || 'en';
                const trText = args.slice(1).join(' ') || m.quoted?.text;
                if (!trText) return Shefzyreply('❌ Usage: translate <lang_code> <text>\nExample: translate es Hello world\nOr reply to a message with: translate fr');
                try {
                    const trRes = await axios.get(
                        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${trLang}&dt=t&q=${encodeURIComponent(trText)}`
                    );
                    const translated = trRes.data[0].map(x => x[0]).join('');
                    const detected = trRes.data[2] || 'auto';
                    await Shefzyreply(`🌐 *Translation*\n\n🔤 Original (${detected}):\n${trText}\n\n✅ Translated (${trLang}):\n${translated}`);
                } catch (e) {
                    console.log('translate error:', e.message);
                    await Shefzyreply('❌ Translation failed! Check the language code and try again.');
                }
                break;
            }

            //===================
            // togif: sticker → GIF
            //===================
            case 'togif': {
    if (!m.quoted || m.quoted.mtype !== 'stickerMessage') return Shefzyreply('❌ Reply to a sticker with ' + prefix + 'togif');
    try {
        const { gifToMp4, sendAnimatedGif } = require('./utils/functions');
        const stickerBuf = await m.quoted.download();
        // Convert sticker (WebP) to MP4
        const mp4Buffer = await gifToMp4(stickerBuf);
        // Send as auto-playing GIF
        await sock.sendMessage(from, { video: mp4Buffer, mimetype: 'video/mp4', gifPlayback: true }, { quoted: m });
    } catch (e) {
        console.log('togif error:', e.message);
        await Shefzyreply('❌ Failed to convert sticker to GIF! Make sure ffmpeg is installed.');
    }
    break;
}

            //===================
            // todoc: send media as document
            //===================
            case 'todoc': {
                if (!m.quoted) return Shefzyreply('❌ Reply to a media message with ' + prefix + 'todoc <filename>');
                const docTypes = ['imageMessage','videoMessage','audioMessage','stickerMessage'];
                if (!docTypes.includes(m.quoted.mtype)) return Shefzyreply('❌ Reply to an image, video, audio or sticker!');
                const docName = text || `file_${Date.now()}`;
                const mimeMap = { imageMessage: 'image/jpeg', videoMessage: 'video/mp4', audioMessage: 'audio/mpeg', stickerMessage: 'image/webp' };
                const extMap = { imageMessage: '.jpg', videoMessage: '.mp4', audioMessage: '.mp3', stickerMessage: '.webp' };
                try {
                    const docBuf = await m.quoted.download();
                    const mime = mimeMap[m.quoted.mtype];
                    const ext = extMap[m.quoted.mtype];
                    const fileName = docName.includes('.') ? docName : docName + ext;
                    await sock.sendMessage(from, { document: docBuf, mimetype: mime, fileName }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to convert to document!'); }
                break;
            }

            //===================
            // toview / toviewonce: send media as view-once
            //===================
            case 'toview':
            case 'toviewonce': {
                if (!m.quoted) return Shefzyreply('❌ Reply to an image or video with ' + prefix + 'toview');
                if (!['imageMessage','videoMessage'].includes(m.quoted.mtype)) return Shefzyreply('❌ Only images and videos can be sent as view-once!');
                try {
                    const voBuf = await m.quoted.download();
                    if (m.quoted.mtype === 'imageMessage') {
                        await sock.sendMessage(from, { image: voBuf, viewOnce: true, caption: '' }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { video: voBuf, viewOnce: true, caption: '' }, { quoted: m });
                    }
                } catch (e) { await Shefzyreply('❌ Failed to send as view-once!'); }
                break;
            }

            //===================
            // vv: reveal view-once in chat
            //===================
            //===================
            // vv: reveal view-once in chat (all types)
            //===================
case 'vv': {
    if (!m.quoted) return Shefzyreply('❌ Reply to a view-once message!');

    const q = m.quoted;
    const mtype = q.mtype;

    // Detect view-once across all known structures
    const isViewOnce =
        mtype === 'viewOnceMessageV2' ||
        mtype === 'viewOnceMessage' ||
        mtype === 'viewOnceMessageV2Extension' ||
        q.viewOnce === true ||
        q.message?.viewOnceMessageV2 ||
        q.message?.viewOnceMessage ||
        q.message?.viewOnceMessageV2Extension ||
        q._data?.viewOnce === true;

    // Also allow replying to already-downloaded media types
    const isMedia = ['imageMessage','videoMessage','audioMessage','documentMessage'].includes(mtype);

    if (!isViewOnce && !isMedia) {
        return Shefzyreply('❌ That is not a view-once message!\n\nSupported: image, video, audio, document view-once.');
    }

    try {
        const vvBuf = await q.download();
        if (!vvBuf || vvBuf.length === 0) return Shefzyreply('❌ Could not download view-once content!');

        // Determine actual media type from inner message
        const innerMsg =
            q.message?.viewOnceMessageV2?.message ||
            q.message?.viewOnceMessage?.message ||
            q.message?.viewOnceMessageV2Extension?.message ||
            q.message || {};

        const innerType = Object.keys(innerMsg)[0] || mtype;

        const isVideo = innerType === 'videoMessage' || mtype === 'videoMessage' ||
            q.video || q.mimetype?.includes('video');
        const isAudio = innerType === 'audioMessage' || mtype === 'audioMessage' ||
            q.audio || q.mimetype?.includes('audio');
        const isDoc = innerType === 'documentMessage' || mtype === 'documentMessage';

        const innerData = innerMsg[innerType] || {};

        if (isVideo) {
            await sock.sendMessage(from, {
                video: vvBuf,
                mimetype: innerData.mimetype || 'video/mp4',
                caption: '👁️ *View-once revealed!*'
            }, { quoted: m });
        } else if (isAudio) {
            await sock.sendMessage(from, {
                audio: vvBuf,
                mimetype: innerData.mimetype || 'audio/mpeg',
                ptt: innerData.ptt || false
            }, { quoted: m });
        } else if (isDoc) {
            await sock.sendMessage(from, {
                document: vvBuf,
                mimetype: innerData.mimetype || 'application/octet-stream',
                fileName: innerData.fileName || 'view_once_file',
                caption: '👁️ *View-once revealed!*'
            }, { quoted: m });
        } else {
            // Default: image
            await sock.sendMessage(from, {
                image: vvBuf,
                mimetype: innerData.mimetype || 'image/jpeg',
                caption: '👁️ *View-once revealed!*'
            }, { quoted: m });
        }
    } catch (e) {
        console.log('[vv] error:', e.message);
        await Shefzyreply('❌ Failed to reveal view-once: ' + e.message);
    }
    break;
}

//===================
// vv2: silently send view-once to DM (all types)
//===================
case 'vv2': {
    if (!m.quoted) return Shefzyreply('❌ Reply to a view-once message!');

    const q2 = m.quoted;
    const mtype2 = q2.mtype;

    const isViewOnce2 =
        mtype2 === 'viewOnceMessageV2' ||
        mtype2 === 'viewOnceMessage' ||
        mtype2 === 'viewOnceMessageV2Extension' ||
        q2.viewOnce === true ||
        q2.message?.viewOnceMessageV2 ||
        q2.message?.viewOnceMessage ||
        q2.message?.viewOnceMessageV2Extension ||
        q2._data?.viewOnce === true;

    const isMedia2 = ['imageMessage','videoMessage','audioMessage','documentMessage'].includes(mtype2);

    if (!isViewOnce2 && !isMedia2) {
        return Shefzyreply('❌ That is not a view-once message!');
    }

    try {
        const vv2Buf = await q2.download();
        if (!vv2Buf || vv2Buf.length === 0) return Shefzyreply('❌ Could not download view-once content!');

        const innerMsg2 =
            q2.message?.viewOnceMessageV2?.message ||
            q2.message?.viewOnceMessage?.message ||
            q2.message?.viewOnceMessageV2Extension?.message ||
            q2.message || {};

        const innerType2 = Object.keys(innerMsg2)[0] || mtype2;

        const isVideo2 = innerType2 === 'videoMessage' || mtype2 === 'videoMessage' ||
            q2.video || q2.mimetype?.includes('video');
        const isAudio2 = innerType2 === 'audioMessage' || mtype2 === 'audioMessage' ||
            q2.audio || q2.mimetype?.includes('audio');
        const isDoc2 = innerType2 === 'documentMessage' || mtype2 === 'documentMessage';

        const innerData2 = innerMsg2[innerType2] || {};
        const dmJid = sender;

        // Send to DM silently — NO reaction, NO reply in group
        if (isVideo2) {
            await sock.sendMessage(dmJid, {
                video: vv2Buf,
                mimetype: innerData2.mimetype || 'video/mp4',
                caption: '👁️ *View-once (saved from group)*'
            });
        } else if (isAudio2) {
            await sock.sendMessage(dmJid, {
                audio: vv2Buf,
                mimetype: innerData2.mimetype || 'audio/mpeg',
                ptt: innerData2.ptt || false
            });
        } else if (isDoc2) {
            await sock.sendMessage(dmJid, {
                document: vv2Buf,
                mimetype: innerData2.mimetype || 'application/octet-stream',
                fileName: innerData2.fileName || 'view_once_file',
                caption: '👁️ *View-once (saved from group)*'
            });
        } else {
            await sock.sendMessage(dmJid, {
                image: vv2Buf,
                mimetype: innerData2.mimetype || 'image/jpeg',
                caption: '👁️ *View-once (saved from group)*'
            });
        }
        //===================
        // SILENT — no message sent in group after this
        //===================
    } catch (e) {
        console.log('[vv2] error:', e.message);
        // Even on error, stay silent in group
    }
    break;
}


            //===================
            // readmore
            //===================
            // Usage: readmore text before|text after readmore
            case 'readmore': {
    if (!text) 
        return Shefzyreply('Usage: .readmore <your message>');

    // Invisible character repeated to create "Read More"
    const more = String.fromCharCode(8206);
    const readMore = more.repeat(4000); // You can increase if needed

    const finalText = text + readMore;

    await sock.sendMessage(from, {
        text: finalText
    });

    break;
}
            //===================
            // ssweb: screenshot a website
            //===================
            case 'ssweb': {
                const ssUrl = args[0];
                if (!ssUrl) return Shefzyreply('❌ Usage: ssweb <url>\nExample: ssweb https://google.com');
                const ssFullUrl = ssUrl.startsWith('http') ? ssUrl : 'https://' + ssUrl;
                try {
                    await Shefzyreply('⏳ Taking screenshot...');
                    // microlink.io — free, reliable, no key needed
                    const ssRes = await axios.get('https://api.microlink.io/', {
                        params: { url: ssFullUrl, screenshot: true, meta: false },
                        timeout: 30000
                    });
                    const shotUrl = ssRes.data?.data?.screenshot?.url;
                    if (shotUrl) {
                        await sock.sendMessage(from, { image: { url: shotUrl }, caption: '📸 ' + ssFullUrl }, { quoted: m });
                    } else {
                        throw new Error('No screenshot URL returned');
                    }
                } catch (e) {
                    console.log('ssweb microlink failed:', e.message, '— trying thum.io');
                    try {
                        const thumUrl = 'https://image.thum.io/get/width/1280/crop/800/' + ssFullUrl;
                        await sock.sendMessage(from, { image: { url: thumUrl }, caption: '📸 ' + ssFullUrl }, { quoted: m });
                    } catch (e2) {
                        await Shefzyreply('❌ Screenshot failed! The site may be blocking automated screenshots.');
                    }
                }
                break;
            }

            //===================
            // get: fetch raw content from a URL
            //===================
            case 'get': {
                const getUrl = args[0];
                if (!getUrl || !getUrl.startsWith('http')) return Shefzyreply('❌ Usage: get <url>');
                try {
                    const getRes = await axios.get(getUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const getType = getRes.headers['content-type'] || '';
                    if (getType.includes('image')) {
                        await sock.sendMessage(from, { image: { url: getUrl }, caption: `📥 From: ${getUrl}` }, { quoted: m });
                    } else if (getType.includes('video')) {
                        await sock.sendMessage(from, { video: { url: getUrl }, caption: `📥 From: ${getUrl}` }, { quoted: m });
                    } else if (getType.includes('audio')) {
                        await sock.sendMessage(from, { audio: { url: getUrl }, mimetype: 'audio/mpeg' }, { quoted: m });
                    } else {
                        const txt = typeof getRes.data === 'string' ? getRes.data.slice(0, 3000) : JSON.stringify(getRes.data, null, 2).slice(0, 3000);
                        await Shefzyreply(`📥 *GET Response*\n\n${txt}`);
                    }
                } catch (e) { await Shefzyreply(`❌ Failed to fetch URL: ${e.message}`); }
                break;
            }

            //===================
            // checkweb: website/URL info
            //===================
            case 'checkweb': {
                const cwUrl = args[0];
                if (!cwUrl) return Shefzyreply('❌ Usage: checkweb <url>');
                try {
                    const cwStart = Date.now();
                    const cwRes = await axios.get(cwUrl.startsWith('http') ? cwUrl : 'https://' + cwUrl, {
                        timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5
                    });
                    const cwMs = Date.now() - cwStart;
                    const cwType = cwRes.headers['content-type'] || 'unknown';
                    const cwServer = cwRes.headers['server'] || 'unknown';
                    const cwSize = cwRes.headers['content-length'] || 'unknown';
                    await Shefzyreply(
                        `🌐 *Website Info*\n\n` +
                        `🔗 URL: ${cwUrl}\n` +
                        `✅ Status: ${cwRes.status} ${cwRes.statusText}\n` +
                        `⏱️ Response: ${cwMs}ms\n` +
                        `🖥️ Server: ${cwServer}\n` +
                        `📄 Content-Type: ${cwType}\n` +
                        `📦 Size: ${cwSize} bytes`
                    );
                } catch (e) {
                    const cwCode = e.response?.status || 'Error';
                    await Shefzyreply(`❌ *Website Check Failed*\n\nURL: ${cwUrl}\nStatus: ${cwCode}\nError: ${e.message}`);
                }
                break;
            }

            //===================
            // style / fancy: stylish text
            //===================
            case 'style':
            case 'fancy': {
                if (!text) return Shefzyreply('❌ Usage: style <text>');
                const styleMap = {
                    bold: t => t.split('').map(c => {
                        const n = c.charCodeAt(0);
                        if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D400 + n - 65);
                        if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D41A + n - 97);
                        if (n >= 48 && n <= 57) return String.fromCodePoint(0x1D7CE + n - 48);
                        return c;
                    }).join(''),
                    italic: t => t.split('').map(c => {
                        const n = c.charCodeAt(0);
                        if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D434 + n - 65);
                        if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D44E + n - 97);
                        return c;
                    }).join(''),
                    bubble: t => t.split('').map(c => {
                        const n = c.charCodeAt(0);
                        if (n >= 65 && n <= 90) return String.fromCodePoint(0x24B6 + n - 65);
                        if (n >= 97 && n <= 122) return String.fromCodePoint(0x24D0 + n - 97);
                        if (n >= 49 && n <= 57) return String.fromCodePoint(0x2460 + n - 49);
                        return c;
                    }).join(''),
                    small: t => t.toLowerCase().split('').map(c => 'abcdefghijklmnopqrstuvwxyz'.includes(c) ? 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖ𐞥ʳˢᵗᵘᵛʷˣʸᶻ'['abcdefghijklmnopqrstuvwxyz'.indexOf(c)] : c).join(''),
                    strike: t => t.split('').join('\u0336') + '\u0336'
                };
                const styledResults = Object.entries(styleMap).map(([name, fn]) => {
                    try { return `*${name}:* ${fn(text)}`; } catch { return `*${name}:* ${text}`; }
                }).join('\n');
                await Shefzyreply(`✨ *Styled Text*\n\n${styledResults}`);
                break;
            }

            //===================
            // calc / calculator
            //===================
            case 'calc':
            case 'calculator': {
                if (!text) return Shefzyreply('❌ Usage: calc <expression>\nExample: calc 2 + 2 * 5');
                try {
                    // Safe eval using Function constructor with restricted scope
                    const sanitized = text.replace(/[^0-9+\-*/().%^ ]/g, '').trim();
                    if (!sanitized) return Shefzyreply('❌ Invalid expression!');
                    const result = Function('"use strict"; return (' + sanitized + ')')();
                    await Shefzyreply(`🧮 *Calculator*\n\n📝 Expression: \`${sanitized}\`\n✅ Result: *${result}*`);
                } catch (e) { await Shefzyreply('❌ Invalid math expression!'); }
                break;
            }

            //===================
            // morse / morsecode
            //===================
            case 'morse':
            case 'morsecode': {
                if (!text) return Shefzyreply('❌ Usage: morse <text>\nExample: morse Hello World');
                const morseMap = {
                    A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.', H:'....', I:'..',
                    J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.', O:'---', P:'.--.', Q:'--.-', R:'.-.',
                    S:'...', T:'-', U:'..-', V:'...-', W:'.--', X:'-..-', Y:'-.--', Z:'--..',
                    '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....',
                    '6':'-....','7':'--...','8':'---..','9':'----.',' ':'/'
                };
                // Check if input looks like morse (contains . and -)
                const isMorseInput = /^[.\- /]+$/.test(text.trim());
                if (isMorseInput) {
                    // Decode morse → text
                    const revMorse = Object.fromEntries(Object.entries(morseMap).map(([k,v]) => [v,k]));
                    const decoded = text.trim().split(' / ').map(word =>
                        word.split(' ').map(code => revMorse[code] || '?').join('')
                    ).join(' ');
                    await Shefzyreply(`📡 *Morse Decoder*\n\n📥 Morse: \`${text}\`\n✅ Text: *${decoded}*`);
                } else {
                    // Encode text → morse
                    const encoded = text.toUpperCase().split('').map(c => morseMap[c] || '?').join(' ');
                    await Shefzyreply(`📡 *Morse Encoder*\n\n📝 Text: \`${text}\`\n✅ Morse: *${encoded}*`);
                }
                break;
            }

            //===================
            // urlinfo / linkinfo
            //===================
            case 'urlinfo':
            case 'linkinfo': {
                const liUrl = args[0];
                if (!liUrl) return Shefzyreply('❌ Usage: urlinfo <url>');
                try {
                    const parsedUrl = new URL(liUrl.startsWith('http') ? liUrl : 'https://' + liUrl);
                    const liRes = await axios.head(parsedUrl.href, { timeout: 10000, maxRedirects: 10 });
                    const info =
                        `🔗 *URL Info*\n\n` +
                        `📌 Protocol: ${parsedUrl.protocol}\n` +
                        `🖥️ Host: ${parsedUrl.hostname}\n` +
                        `📂 Path: ${parsedUrl.pathname || '/'}\n` +
                        `🔍 Query: ${parsedUrl.search || 'None'}\n` +
                        `✅ Status: ${liRes.status}\n` +
                        `📄 Type: ${liRes.headers['content-type'] || 'unknown'}\n` +
                        `🖥️ Server: ${liRes.headers['server'] || 'unknown'}\n` +
                        `🔒 HTTPS: ${parsedUrl.protocol === 'https:' ? 'Yes ✅' : 'No ❌'}`;
                    await Shefzyreply(info);
                } catch (e) { await Shefzyreply(`❌ Failed to get URL info: ${e.message}`); }
                break;
            }

            //===================
            // passcheck / passwordcheck
            //===================
            case 'passcheck':
            case 'passwordcheck': {
                const pwd = text;
                if (!pwd) return Shefzyreply('❌ Usage: passcheck <password>');
                let score = 0; const tips = [];
                if (pwd.length >= 8) score++; else tips.push('• Use at least 8 characters');
                if (pwd.length >= 12) score++; else tips.push('• 12+ characters is better');
                if (/[A-Z]/.test(pwd)) score++; else tips.push('• Add uppercase letters');
                if (/[a-z]/.test(pwd)) score++; else tips.push('• Add lowercase letters');
                if (/[0-9]/.test(pwd)) score++; else tips.push('• Add numbers');
                if (/[^A-Za-z0-9]/.test(pwd)) score++; else tips.push('• Add special characters (!@#$%)');
                const strengthLabel = score <= 2 ? '🔴 Weak' : score <= 4 ? '🟡 Medium' : '🟢 Strong';
                const bar = '█'.repeat(score) + '░'.repeat(6 - score);
                await Shefzyreply(
                    `🔐 *Password Strength Check*\n\n` +
                    `🔑 Password: \`${'*'.repeat(pwd.length)}\`\n` +
                    `📊 Score: ${score}/6\n` +
                    `[${bar}]\n` +
                    `💪 Strength: ${strengthLabel}\n` +
                    (tips.length ? `\n⚠️ *Suggestions:*\n${tips.join('\n')}` : '\n✅ Strong password!')
                );
                break;
            }

            //===================
            // getdevice: get WhatsApp device info from replied message
            //===================
            case 'getdevice': {
                if (!m.quoted) return Shefzyreply('❌ Reply to a message to get device info!');
                try {
                    // Device info is encoded in the message key ID prefix
                    const keyId = m.quoted.id || '';
                    let device = 'Unknown';
                    if (keyId.startsWith('3EB0')) device = 'WhatsApp Web';
                    else if (keyId.startsWith('3A')) device = 'iPhone';
                    else if (keyId.startsWith('BAE')) device = 'WhatsApp Official (Baileys)';
                    else if (keyId.length === 16) device = 'Android';
                    else if (keyId.startsWith('3AB')) device = 'WhatsApp Desktop';
                    const devInfo =
                        `📱 *Device Info*\n\n` +
                        `👤 User: @${m.quoted.sender?.split('@')[0] || 'Unknown'}\n` +
                        `📱 Device: *${device}*\n` +
                        `🆔 Message ID: \`${keyId}\``;
                    await sock.sendMessage(from, { text: devInfo, mentions: [m.quoted.sender] }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to get device info!'); }
                break;
            }

            //===================
            // archive: archive the current chat
            //===================
            case 'archive': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                try {
                    await sock.chatModify({ archive: true }, from);
                    await Shefzyreply('📦 Chat archived!');
                } catch (e) { await Shefzyreply('❌ Failed to archive chat!'); }
                break;
            }

            //===================
            // unarchive: unarchive the current chat
            //===================
            case 'unarchive': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                try {
                    await sock.chatModify({ archive: false }, from);
                    await Shefzyreply('📂 Chat unarchived!');
                } catch (e) { await Shefzyreply('❌ Failed to unarchive chat!'); }
                break;
            }

            //===================
            // setcmd: assign a command name to a sticker
            //===================
            case 'setcmd': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!m.quoted || m.quoted.mtype !== 'stickerMessage') return Shefzyreply('❌ Reply to a sticker with ' + prefix + 'setcmd <commandname>');
                if (!text) return Shefzyreply('❌ Usage: setcmd <commandname> (reply to sticker)');
                try {
                    const stickerBuf = await m.quoted.download();
                    const crypto = require('crypto');
                    const stickerHash = crypto.createHash('sha256').update(stickerBuf).digest('hex').slice(0, 16);
                    const stickerCmds = getStickerCmds(botNumberRaw);
stickerCmds.set(stickerHash, { cmd: text.toLowerCase(), setBy: senderNumber, setAt: Date.now() });
saveStickerCmds(botNumberRaw);
                    await Shefzyreply(`✅ Sticker command set!\nSticker: \`${stickerHash}\`\nCommand: *${text.toLowerCase()}*`);
                } catch (e) { await Shefzyreply('❌ Failed to set sticker command!'); }
                break;
            }

            //===================
            // delcmd: remove a sticker command
            //===================
            case 'delcmd': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!m.quoted || m.quoted.mtype !== 'stickerMessage') return Shefzyreply('❌ Reply to the sticker you want to unset!');
                try {
                    const stickerBuf = await m.quoted.download();
                    const crypto = require('crypto');
                    const stickerHash = crypto.createHash('sha256').update(stickerBuf).digest('hex').slice(0, 16);
                    const stickerCmds = getStickerCmds(botNumberRaw);
if (!stickerCmds.has(stickerHash)) return Shefzyreply('❌ That sticker has no command assigned!');
const old = stickerCmds.get(stickerHash);
stickerCmds.delete(stickerHash);
saveStickerCmds(botNumberRaw);
                    await Shefzyreply(`✅ Sticker command removed!\nWas: *${old.cmd}*`);
                } catch (e) { await Shefzyreply('❌ Failed to remove sticker command!'); }
                break;
            }

            //===================
            // listcmd: list all sticker commands
            //===================
            case 'listcmd': {
                const stickerCmds = getStickerCmds(botNumberRaw);
if (stickerCmds.size === 0) return Shefzyreply('📋 No sticker commands set yet.');
                const cmdList = Array.from(stickerCmds.entries()).map(([hash, data], i) =>
                    `${i+1}. *${data.cmd}* — \`${hash}\``
                ).join('\n');
                await Shefzyreply(`📋 *Sticker Commands (${stickerCmds.size})*\n\n${cmdList}`);
                break;
            }

            //===================
            // SEARCH COMMANDS
            //===================

            //===================
            // google
            //===================
            case 'google': {
                if (!text) return Shefzyreply('❌ Usage: google <query>');
                try {
                    let gResults = null;
                    if (config.googleApiKey && config.googleCx) {
                        try {
                            const gRes = await axios.get('https://www.googleapis.com/customsearch/v1', {
                                params: { key: config.googleApiKey, cx: config.googleCx, q: text, num: 3 },
                                timeout: 10000
                            });
                            const items = gRes.data.items || [];
                            if (items.length) {
                                gResults = items.map((it, i) => (i+1) + '. *' + it.title + '*\n' + (it.snippet||'') + '\n🔗 ' + it.link).join('\n\n');
                            }
                        } catch (gErr) { console.log('google api err:', gErr.message); }
                    }
                    if (!gResults) {
                        const ddRes = await axios.get('https://html.duckduckgo.com/html/', {
                            params: { q: text },
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                            timeout: 15000
                        });
                        const titles = [...ddRes.data.matchAll(/class="result__a"[^>]*>([^<]+)</g)].slice(0,3);
                        const snips = [...ddRes.data.matchAll(/class="result__snippet"[^>]*>([^<]+)</g)].slice(0,3);
                        const urls = [...ddRes.data.matchAll(/uddg=([^&"]+)/g)].slice(0,3);
                        if (titles.length) {
                            gResults = titles.map((t, i) => (i+1) + '. *' + t[1].trim() + '*\n' + (snips[i]?.[1]?.trim()||'') + '\n🔗 ' + (urls[i] ? decodeURIComponent(urls[i][1]) : '')).join('\n\n');
                        }
                    }
                    const ddUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(text);
                    await Shefzyreply('🔍 *Search: ' + text + '*\n\n' + (gResults || 'No results found') + '\n\n🔗 ' + ddUrl);
                } catch (e) {
                    console.log('google error:', e.message);
                    await Shefzyreply('🔍 *' + text + '*\n\n🔗 https://duckduckgo.com/?q=' + encodeURIComponent(text));
                }
                break;
            }

                        //===================
                        // wikipedia
                        //===================
            case 'wikipedia':
            case 'wiki': {
                if (!text) return Shefzyreply('❌ Usage: wikipedia <query>');
                try {
                    const wikiRes = await axios.get(
                        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`,
                        { timeout: 10000 }
                    );
                    const w = wikiRes.data;
                    if (w.type === 'disambiguation') return Shefzyreply(`❓ *${text}* is ambiguous. Be more specific!`);
                    const thumb = w.thumbnail?.source;
                    const reply =
                        `📖 *${w.title}*\n\n${w.extract?.slice(0, 800) || 'No description'}\n\n🔗 ${w.content_urls?.desktop?.page || ''}`;
                    if (thumb) {
                        await sock.sendMessage(from, { image: { url: thumb }, caption: reply }, { quoted: m });
                    } else {
                        await Shefzyreply(reply);
                    }
                } catch (e) { await Shefzyreply('❌ Wikipedia search failed! Check the query.'); }
                break;
            }

            //===================
            // npmsearch
            //===================
            case 'npmsearch': {
                if (!text) return Shefzyreply('❌ Usage: npmsearch <package>');
                try {
                    const npmRes = await axios.get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=5`, { timeout: 10000 });
                    const pkgs = npmRes.data.objects || [];
                    if (!pkgs.length) return Shefzyreply('❌ No packages found!');
                    const list = pkgs.map((p, i) =>
                        `*${i+1}. ${p.package.name}* v${p.package.version}\n${p.package.description || 'No description'}\n📦 ${p.package.links?.npm || ''}`
                    ).join('\n\n');
                    await Shefzyreply(`📦 *NPM Search: ${text}*\n\n${list}`);
                } catch (e) { await Shefzyreply('❌ NPM search failed!'); }
                break;
            }

            //===================
            // npmstalk
            //===================
            case 'npmstalk': {
                if (!text) return Shefzyreply('❌ Usage: npmstalk <package>');
                try {
                    const nsRes = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(text)}`, { timeout: 10000 });
                    const pkg = nsRes.data;
                    const latest = pkg['dist-tags']?.latest;
                    const info =
                        `📦 *NPM Package: ${pkg.name}*\n\n` +
                        `📝 ${pkg.description || 'No description'}\n` +
                        `🏷️ Version: *${latest}*\n` +
                        `📅 Published: ${pkg.time?.created?.split('T')[0] || 'Unknown'}\n` +
                        `🔄 Modified: ${pkg.time?.modified?.split('T')[0] || 'Unknown'}\n` +
                        `👤 Author: ${pkg.author?.name || 'Unknown'}\n` +
                        `📜 License: ${pkg.license || 'Unknown'}\n` +
                        `🔗 ${pkg.homepage || `https://npmjs.com/package/${pkg.name}`}`;
                    await Shefzyreply(info);
                } catch (e) { await Shefzyreply('❌ Package not found!'); }
                break;
            }

            //===================
            // pinterest
            //===================
            case 'pinterest': {
                if (!text) return Shefzyreply('❌ Usage: pinterest <query>');
                try {
                    // Pinterest blocks scraping — use Bing Images with site filter
                    const bingRes = await axios.get('https://www.bing.com/images/search', {
                        params: { q: text + ' site:pinterest.com', first: 1 },
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: 15000
                    });
                    const bingMatch = bingRes.data.match(/murl&quot;:&quot;(https?:\/\/[^&]+\.(?:jpg|jpeg|png|webp))&quot;/i)
                                   || bingRes.data.match(/"murl":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i);
                    if (bingMatch) {
                        await sock.sendMessage(from, {
                            image: { url: bingMatch[1] },
                            caption: '📌 *Pinterest: ' + text + '*'
                        }, { quoted: m });
                    } else {
                        await Shefzyreply('❌ No Pinterest results for: ' + text + '. Try pixabay instead!');
                    }
                } catch (e) {
                    console.log('pinterest error:', e.message);
                    await Shefzyreply('❌ Pinterest search failed! Try: pixabay ' + text);
                }
                break;
            }

            //===================
            // pixabay
            //===================
            case 'pixabay': {
                if (!text) return Shefzyreply('❌ Usage: pixabay <query>');
                try {
                    const pxKey = config.pixabayApiKey || config.PIXABAY_API_KEY || '';
                    if (!pxKey) return Shefzyreply('❌ Add pixabayApiKey to config.js. Get free key at pixabay.com/api/docs/');
                    const pxRes = await axios.get('https://pixabay.com/api/', {
                        params: { key: pxKey, q: text, image_type: 'photo', per_page: 10, safesearch: true },
                        timeout: 15000
                    });
                    const hits = pxRes.data.hits || [];
                    if (!hits.length) return Shefzyreply('❌ No Pixabay results for: ' + text);
                    const img = hits[Math.floor(Math.random() * Math.min(hits.length, 5))];
                    const imgUrl = img.largeImageURL || img.webformatURL;
                    await sock.sendMessage(from, {
                        image: { url: imgUrl },
                        caption: '🖼️ *Pixabay: ' + text + '*\n\n👤 ' + img.user + '\n👁️ ' + img.views.toLocaleString() + ' views\n❤️ ' + img.likes + ' likes\n🔗 ' + img.pageURL
                    }, { quoted: m });
                } catch (e) {
                    console.log('pixabay error:', e.response?.status, e.message);
                    await Shefzyreply('❌ Pixabay failed: ' + (e.response?.data?.message || e.message));
                }
                break;
            }

            //===================
            // dictionary / define
            //===================
            case 'dictionary':
            case 'define': {
                if (!text) return Shefzyreply('❌ Usage: define <word>');
                try {
                    const dictRes = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`, { timeout: 10000 });
                    const entry = dictRes.data[0];
                    const meanings = entry.meanings.slice(0, 2).map(m =>
                        `*${m.partOfSpeech}:*\n${m.definitions.slice(0,2).map((d,i) => `${i+1}. ${d.definition}${d.example ? '\n   _"'+d.example+'"_' : ''}`).join('\n')}`
                    ).join('\n\n');
                    const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';
                    await Shefzyreply(`📚 *${entry.word}* ${phonetic}\n\n${meanings}`);
                } catch (e) { await Shefzyreply(`❌ Word "${text}" not found in dictionary!`); }
                break;
            }

            //===================
            // weather
            //===================
            case 'weather': {
                if (!text) return Shefzyreply('❌ Usage: weather <city>');
                try {
                    const wtKey = config.weatherApiKey || 'bd5e378503939ddaee76f12ad7a97608';
                    const wtRes = await axios.get(
                        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(text)}&appid=${wtKey}&units=metric`,
                        { timeout: 10000 }
                    );
                    const w = wtRes.data;
                    const emojiMap = { Clear:'☀️', Clouds:'☁️', Rain:'🌧️', Drizzle:'🌦️', Thunderstorm:'⛈️', Snow:'❄️', Mist:'🌫️', Fog:'🌫️' };
                    const wEmoji = emojiMap[w.weather[0].main] || '🌡️';
                    await Shefzyreply(
                        `${wEmoji} *Weather in ${w.name}, ${w.sys.country}*\n\n` +
                        `🌡️ Temp: *${w.main.temp}°C* (Feels: ${w.main.feels_like}°C)\n` +
                        `💧 Humidity: ${w.main.humidity}%\n` +
                        `💨 Wind: ${w.wind.speed} m/s\n` +
                        `☁️ Condition: ${w.weather[0].description}\n` +
                        `👁️ Visibility: ${(w.visibility/1000).toFixed(1)} km`
                    );
                } catch (e) { await Shefzyreply(`❌ City "${text}" not found! Try a valid city name.\n\nNote: Add weatherApiKey to config.js for unlimited use.`); }
                break;
            }

            //===================
            // ipinfo / track-ip
            //===================
            case 'ipinfo':
            case 'track-ip': {
                const ipTarget = args[0];
                if (!ipTarget) return Shefzyreply('❌ Usage: ipinfo <ip or domain>');
                try {
                    const ipRes = await axios.get(`https://ipapi.co/${encodeURIComponent(ipTarget)}/json/`, { timeout: 10000 });
                    const ip = ipRes.data;
                    if (ip.error) return Shefzyreply(`❌ ${ip.reason || 'Invalid IP/domain'}`);
                    await Shefzyreply(
                        `🌐 *IP Info: ${ipTarget}*\n\n` +
                        `🔢 IP: ${ip.ip}\n` +
                        `🏳️ Country: ${ip.country_name} ${ip.country_code}\n` +
                        `🏙️ City: ${ip.city || 'Unknown'}\n` +
                        `🗺️ Region: ${ip.region || 'Unknown'}\n` +
                        `⏰ Timezone: ${ip.timezone || 'Unknown'}\n` +
                        `🏢 ISP: ${ip.org || 'Unknown'}\n` +
                        `📍 Coords: ${ip.latitude}, ${ip.longitude}`
                    );
                } catch (e) { await Shefzyreply('❌ Failed to get IP info!'); }
                break;
            }

            //===================
            // myip
            //===================
            case 'myip': {
                try {
                    const myipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
                    const ipInfoRes = await axios.get(`https://ipapi.co/${myipRes.data.ip}/json/`, { timeout: 10000 });
                    const ip = ipInfoRes.data;
                    await Shefzyreply(
                        `🌐 *Bot Server IP*\n\n` +
                        `🔢 IP: ${ip.ip}\n` +
                        `🏳️ Country: ${ip.country_name}\n` +
                        `🏙️ City: ${ip.city || 'Unknown'}\n` +
                        `🏢 ISP: ${ip.org || 'Unknown'}`
                    );
                } catch (e) { await Shefzyreply('❌ Failed to get IP!'); }
                break;
            }

            //===================
            // movie / imdb / movieinfo
            //===================
            
            case 'imdb':
            case 'movieinfo': {
                if (!text) return Shefzyreply('❌ Usage: movie <title>');
                try {
                    // Try OMDB first (works with any key or even expired keys for basic results)
                    const omdbKeys = [config.omdbApiKey, 'e3b1bb2c', 'f6a5c5d3', '9f29b9cf'].filter(Boolean);
                    let mv = null;
                    for (const k of omdbKeys) {
                        try {
                            const r = await axios.get('https://www.omdbapi.com/', { params: { t: text, apikey: k, plot: 'full' }, timeout: 10000 });
                            if (r.data.Response === 'True') { mv = r.data; break; }
                        } catch {}
                    }
                    if (mv) {
                        const info = '🎬 *' + mv.Title + '* (' + mv.Year + ')\n\n⭐ ' + mv.imdbRating + '/10\n🎭 ' + mv.Genre + '\n⏱️ ' + mv.Runtime + '\n🌍 ' + mv.Language + '\n📋 ' + mv.Director + '\n🎭 ' + mv.Actors + '\n\n📝 ' + mv.Plot;
                        if (mv.Poster && mv.Poster !== 'N/A') {
                            await sock.sendMessage(from, { image: { url: mv.Poster }, caption: info }, { quoted: m });
                        } else {
                            await Shefzyreply(info);
                        }
                    } else {
                        // Fallback: TMDB (free, no key for search)
                        const tmdb = await axios.get('https://api.themoviedb.org/3/search/movie', {
                            params: { api_key: process.env.TMDB_API_KEY || '', query: text },
                            timeout: 10000
                        });
                        const res = tmdb.data.results?.[0];
                        if (!res) return Shefzyreply('❌ Movie not found: ' + text);
                        const poster = res.poster_path ? 'https://image.tmdb.org/t/p/w500' + res.poster_path : null;
                        const info = '🎬 *' + res.title + '* (' + (res.release_date?.split('-')[0]||'N/A') + ')\n\n⭐ ' + res.vote_average?.toFixed(1) + '/10\n\n📝 ' + (res.overview?.slice(0,400)||'No overview');
                        if (poster) {
                            await sock.sendMessage(from, { image: { url: poster }, caption: info }, { quoted: m });
                        } else {
                            await Shefzyreply(info);
                        }
                    }
                } catch (e) {
                    console.log('imdb error:', e.message);
                    await Shefzyreply('❌ Movie search failed: ' + e.message);
                }
                break;
            }

            //===================
            // recipe
            //===================
            case 'recipe': {
                if (!text) return Shefzyreply('❌ Usage: recipe <dish name>');
                try {
                    const recRes = await axios.get(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(text)}`, { timeout: 10000 });
                    const meals = recRes.data.meals;
                    if (!meals) return Shefzyreply(`❌ No recipe found for: ${text}`);
                    const meal = meals[0];
                    const ingredients = [];
                    for (let i = 1; i <= 20; i++) {
                        if (meal[`strIngredient${i}`]) ingredients.push(`• ${meal[`strMeasure${i}`]} ${meal[`strIngredient${i}`]}`);
                        else break;
                    }
                    const recipeText =
                        `🍽️ *${meal.strMeal}*\n\n` +
                        `🌍 Category: ${meal.strCategory} | ${meal.strArea}\n\n` +
                        `🧂 *Ingredients:*\n${ingredients.join('\n')}\n\n` +
                        `📋 *Instructions (summary):*\n${meal.strInstructions?.slice(0, 500)}...`;
                    if (meal.strMealThumb) {
                        await sock.sendMessage(from, { image: { url: meal.strMealThumb }, caption: recipeText }, { quoted: m });
                    } else {
                        await Shefzyreply(recipeText);
                    }
                } catch (e) { await Shefzyreply('❌ Recipe search failed!'); }
                break;
            }

            //===================
            // bible
            //===================
            case 'bible': {
                if (!text) return Shefzyreply('❌ Usage: bible <book chapter:verse>\nExample: bible John 3:16');
                try {
                    const bibleRef = encodeURIComponent(text);
                    const bibleRes = await axios.get(`https://bible-api.com/${bibleRef}`, { timeout: 10000 });
                    const b = bibleRes.data;
                    if (b.error) return Shefzyreply(`❌ Reference not found: ${text}`);
                    await Shefzyreply(`📖 *${b.reference}*\n\n"${b.text?.trim()}"\n\n— ${b.translation_name || 'World English Bible'}`);
                } catch (e) { await Shefzyreply('❌ Bible reference not found! Try: bible John 3:16'); }
                break;
            }

            //===================
            // quran
            //===================
            case 'quran': {
                if (!text) return Shefzyreply('❌ Usage: quran <surah:verse>\nExample: quran 1:1');
                try {
                    const [surah, verse] = text.split(':');
                    const qRes = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${verse}/en.asad`, { timeout: 10000 });
                    const q = qRes.data.data;
                    const qArRes = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${verse}/ar.alafasy`, { timeout: 10000 });
                    const qAr = qArRes.data.data;
                    await Shefzyreply(
                        `📖 *Quran ${q.surah.name} (${q.surah.englishName}) — Verse ${q.numberInSurah}*\n\n` +
                        `Arabic:\n${qAr.text}\n\n` +
                        `English:\n${q.text}`
                    );
                } catch (e) { await Shefzyreply('❌ Verse not found! Try: quran 1:1'); }
                break;
            }

            //===================
            // element
            //===================
            case 'element': {
                if (!text) return Shefzyreply('❌ Usage: element <name or symbol>\nExample: element Gold  or  element Au');
                try {
                    const elRes = await axios.get(`https://api.ratemyprofessors.com/graphql`, { timeout: 5000 }).catch(() => null);
                    // Use PubChem for element data
                    const elSearch = await axios.get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(text)}/JSON`, { timeout: 10000 });
                    const props = elSearch.data.PC_Compounds?.[0]?.props || [];
                    const getName = (label) => props.find(p => p.urn?.label === label)?.value?.sval || 'Unknown';
                    const getMF = () => props.find(p => p.urn?.label === 'Molecular Formula')?.value?.sval || 'Unknown';
                    const getMW = () => props.find(p => p.urn?.label === 'Molecular Weight')?.value?.sval || 'Unknown';
                    await Shefzyreply(
                        `⚗️ *Element: ${text}*\n\n` +
                        `🔬 Formula: ${getMF()}\n` +
                        `⚖️ Molecular Weight: ${getMW()} g/mol\n` +
                        `🔗 Source: PubChem`
                    );
                } catch (e) {
                    // Fallback: basic element lookup table
                    const elements = { H:'Hydrogen,1,1.008', He:'Helium,2,4.003', Li:'Lithium,3,6.941', C:'Carbon,6,12.011', N:'Nitrogen,7,14.007', O:'Oxygen,8,15.999', Na:'Sodium,11,22.990', Fe:'Iron,26,55.845', Au:'Gold,79,196.967', Ag:'Silver,47,107.868' };
                    const key = Object.keys(elements).find(k => k.toLowerCase() === text.toLowerCase() || elements[k].split(',')[0].toLowerCase() === text.toLowerCase());
                    if (key) {
                        const [name, num, mass] = elements[key].split(',');
                        await Shefzyreply(`⚗️ *${name} (${key})*\n\n🔢 Atomic Number: ${num}\n⚖️ Atomic Mass: ${mass} u`);
                    } else {
                        await Shefzyreply('❌ Element not found! Try: element Gold or element Au');
                    }
                }
                break;
            }

            //===================
            // tiktokstalk
            //===================
            case 'tiktokstalk': {
                if (!text) return Shefzyreply('❌ Usage: tiktokstalk <username>');
                try {
                    const ttUser = text.replace('@', '');
                    const ttRes = await axios.get(
                        `https://www.tiktok.com/@${ttUser}`,
                        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 15000 }
                    );
                    const followerMatch = ttRes.data.match(/"followerCount":(\d+)/);
                    const followingMatch = ttRes.data.match(/"followingCount":(\d+)/);
                    const likeMatch = ttRes.data.match(/"heartCount":(\d+)/);
                    const videoMatch = ttRes.data.match(/"videoCount":(\d+)/);
                    const nickMatch = ttRes.data.match(/"nickname":"([^"]+)"/);
                    const bioMatch = ttRes.data.match(/"signature":"([^"]+)"/);
                    await Shefzyreply(
                        `🎵 *TikTok: @${ttUser}*\n\n` +
                        `👤 Name: ${nickMatch?.[1] || ttUser}\n` +
                        `📝 Bio: ${bioMatch?.[1] || 'No bio'}\n` +
                        `👥 Followers: ${followerMatch?.[1] ? Number(followerMatch[1]).toLocaleString() : 'Unknown'}\n` +
                        `➡️ Following: ${followingMatch?.[1] ? Number(followingMatch[1]).toLocaleString() : 'Unknown'}\n` +
                        `❤️ Likes: ${likeMatch?.[1] ? Number(likeMatch[1]).toLocaleString() : 'Unknown'}\n` +
                        `🎬 Videos: ${videoMatch?.[1] || 'Unknown'}\n` +
                        `🔗 https://tiktok.com/@${ttUser}`
                    );
                } catch (e) { await Shefzyreply('❌ Failed to fetch TikTok profile! Profile may be private or username incorrect.'); }
                break;
            }

            //===================
            // shazam / find: identify audio
            //===================
            case 'shazam':
case 'find': {
    if (!m.quoted || !['audioMessage','videoMessage'].includes(m.quoted.mtype)) {
        return Shefzyreply('❌ Reply to an audio or video message with ' + prefix + 'shazam');
    }
    try {
        const { exec: shExec } = require('child_process');
        const { promisify: shProm } = require('util');
        const crypto = require('crypto');
        const shExecP = shProm(shExec);
        const shDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(shDir)) fs.mkdirSync(shDir, { recursive: true });

        const shTs = Date.now();
        const shIn = path.join(shDir, `sh_${shTs}.mp3`);
        const shOut = path.join(shDir, `sh_${shTs}_out.mp3`);

        await Shefzyreply('🎵 Identifying song...');

        // Download and convert audio
        const shBuf = await m.quoted.download();
        fs.writeFileSync(shIn, shBuf);
        await shExecP(`"${ffmpegPath}" -y -i "${shIn}" -ar 44100 -ac 1 -t 30 "${shOut}"`);

        const audioData = fs.readFileSync(shOut);
        const audioLen = audioData.length;

        //===================
        // ACRCloud signature
        //===================
        const acrHost = config.acrcloudHost;
        const acrKey = config.acrcloudKey;
        const acrSecret = config.acrcloudSecret;

        if (!acrHost || !acrKey || !acrSecret) {
            // Fallback to audd.io if ACRCloud not configured
            const shForm = new FormData();
            shForm.append('file', audioData, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
            shForm.append('return', 'apple_music,spotify');
            if (config.auddApiKey) shForm.append('api_token', config.auddApiKey);
            const shRes = await axios.post('https://api.audd.io/', shForm, {
                headers: shForm.getHeaders(), timeout: 30000
            });
            const shData = shRes.data;
            for (const f of [shIn, shOut]) { try { fs.unlinkSync(f); } catch {} }
            if (shData.status === 'success' && shData.result) {
                const r = shData.result;
                return Shefzyreply(
                    `🎵 *Song Identified!*\n\n` +
                    `🎤 Title: *${r.title}*\n` +
                    `🎙️ Artist: ${r.artist}\n` +
                    `💿 Album: ${r.album || 'Unknown'}\n` +
                    `📅 Year: ${r.release_date || 'Unknown'}\n` +
                    `🎵 Spotify: ${r.spotify?.external_urls?.spotify || 'Not found'}`
                );
            }
            return Shefzyreply('❌ Could not identify the song!');
        }

        // Build ACRCloud signature
        const httpMethod = 'POST';
        const httpUri = '/v1/identify';
        const dataType = 'audio';
        const signatureVersion = '1';
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const sigString = [httpMethod, httpUri, acrKey, dataType, signatureVersion, timestamp].join('\n');
        const signature = crypto.createHmac('sha1', acrSecret)
            .update(sigString).digest('base64');

        const acrForm = new FormData();
        acrForm.append('sample', audioData, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
        acrForm.append('sample_bytes', audioLen.toString());
        acrForm.append('access_key', acrKey);
        acrForm.append('data_type', dataType);
        acrForm.append('signature_version', signatureVersion);
        acrForm.append('signature', signature);
        acrForm.append('timestamp', timestamp);

        const acrRes = await axios.post(`https://${acrHost}/v1/identify`, acrForm, {
            headers: acrForm.getHeaders(),
            timeout: 30000
        });

        // Cleanup temp files
        for (const f of [shIn, shOut]) { try { fs.unlinkSync(f); } catch {} }

        const acrData = acrRes.data;
        const music = acrData?.metadata?.music?.[0];

        if (acrData.status?.code === 0 && music) {
            const title = music.title || 'Unknown';
            const artist = music.artists?.map(a => a.name).join(', ') || 'Unknown';
            const album = music.album?.name || 'Unknown';
            const year = music.release_date || 'Unknown';
            const spotify = music.external_metadata?.spotify?.track?.id
                ? `https://open.spotify.com/track/${music.external_metadata.spotify.track.id}`
                : 'Not found';
            const youtube = music.external_metadata?.youtube?.vid
                ? `https://youtube.com/watch?v=${music.external_metadata.youtube.vid}`
                : 'Not found';

            await Shefzyreply(
                `🎵 *Song Identified!*\n\n` +
                `🎤 Title: *${title}*\n` +
                `🎙️ Artist: ${artist}\n` +
                `💿 Album: ${album}\n` +
                `📅 Year: ${year}\n` +
                `🎵 Spotify: ${spotify}\n` +
                `▶️ YouTube: ${youtube}`
            );
        } else if (acrData.status?.code === 1001) {
            await Shefzyreply('❌ No song found  make sure the audio contains music.');
        } else {
            await Shefzyreply(`❌ Could not identify the song! (${acrData.status?.msg || 'Unknown error'})`);
        }

    } catch (e) {
        console.log('shazam error:', e.message);
        await Shefzyreply('❌ Audio recognition failed: ' + e.message);
    }
    break;
}


            //===================
            // igstalk: Instagram profile
            //===================
            case 'igstalk':
            case 'instagram': {
                if (!text) return Shefzyreply('❌ Usage: igstalk <username>');
                try {
                    const igUser = text.replace('@','').replace('https://www.instagram.com/','').split('/')[0];
                    const igRes = await axios.get('https://www.instagram.com/' + igUser + '/', {
                        params: { __a: 1, __d: 'dis' },
                        headers: { 'User-Agent': 'Instagram 219.0.0.12.117 Android', 'Accept': 'application/json' },
                        timeout: 15000
                    });
                    const u = igRes.data?.graphql?.user || igRes.data?.data?.user;
                    if (!u) throw new Error('User not found');
                    const igTxt = '📸 *Instagram: @' + igUser + '*\n\n👤 ' + (u.full_name||igUser) + '\n📝 ' + (u.biography||'No bio').slice(0,100) + '\n👥 ' + (u.edge_followed_by?.count||0).toLocaleString() + ' followers\n➡️ ' + (u.edge_follow?.count||0).toLocaleString() + ' following\n📷 ' + (u.edge_owner_to_timeline_media?.count||0).toLocaleString() + ' posts\n✅ Verified: ' + (u.is_verified?'Yes':'No') + '\n🔒 Private: ' + (u.is_private?'Yes':'No') + '\n🔗 https://instagram.com/' + igUser;
                    const pp = u.profile_pic_url_hd || u.profile_pic_url;
                    if (pp) {
                        await sock.sendMessage(from, { image: { url: pp }, caption: igTxt }, { quoted: m });
                    } else {
                        await Shefzyreply(igTxt);
                    }
                } catch (e) {
                    console.log('igstalk error:', e.message);
                    await Shefzyreply('❌ Failed to fetch Instagram! Profile may be private or Instagram is blocking the request.');
                }
                break;
            }

            //===================
            // ytstalk: YouTube channel
            //===================
            case 'ytstalk':
            case 'youtube': {
                if (!text) return Shefzyreply('❌ Usage: ytstalk <@channelname>');
                try {
                    const ytHandle = text.replace('@','').replace('https://youtube.com/','').replace('https://www.youtube.com/','').replace('@','');
                    let ytText = null; let ppUrl = null;
                    if (config.youtubeApiKey) {
                        try {
                            const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
                                params: { part: 'snippet,statistics', forHandle: ytHandle, key: config.youtubeApiKey },
                                timeout: 10000
                            });
                            const ch = ytRes.data?.items?.[0];
                            if (ch) {
                                const sn = ch.snippet, st = ch.statistics;
                                ytText = '▶️ *YouTube: ' + sn.title + '*\n\n📝 ' + (sn.description?.slice(0,100)||'') + '\n👥 ' + Number(st.subscriberCount||0).toLocaleString() + ' subscribers\n🎬 ' + Number(st.videoCount||0).toLocaleString() + ' videos\n👁️ ' + Number(st.viewCount||0).toLocaleString() + ' views\n🔗 https://youtube.com/@' + ytHandle;
                                ppUrl = sn.thumbnails?.high?.url;
                            }
                        } catch {}
                    }
                    if (!ytText) {
                        const sc = await axios.get('https://www.youtube.com/@' + ytHandle, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
                        const nm = sc.data.match(/"channelMetadataRenderer":\{"title":"([^"]+)"/);
                        const sb = sc.data.match(/"subscriberCountText":\{"simpleText":"([^"]+)"\}/);
                        const pp = sc.data.match(/"avatar":\{"thumbnails":\[.*?"url":"([^"]+)"/s);
                        ytText = '▶️ *YouTube: ' + (nm?.[1]||ytHandle) + '*\n\n👥 ' + (sb?.[1]||'Unknown') + ' subscribers\n🔗 https://youtube.com/@' + ytHandle;
                        ppUrl = pp?.[1];
                    }
                    if (ppUrl) {
                        await sock.sendMessage(from, { image: { url: ppUrl }, caption: ytText }, { quoted: m });
                    } else {
                        await Shefzyreply(ytText);
                    }
                } catch (e) {
                    console.log('ytstalk error:', e.message);
                    await Shefzyreply('❌ Failed to fetch YouTube channel!');
                }
                break;
            }

            //===================
            // fbstalk: Facebook page/profile
            //===================
            case 'fbstalk':
            case 'facebook': {
                if (!text) return Shefzyreply('❌ Usage: fbstalk <username or page>');
                try {
                    const fbUser = text.replace('https://www.facebook.com/','').replace('https://fb.com/','').split('/')[0];
                    const fbRes = await axios.get('https://www.facebook.com/' + fbUser, {
                        headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
                        timeout: 15000
                    });
                    const nm = fbRes.data.match(/<title>([^<]+)<\/title>/);
                    const ds = fbRes.data.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/);
                    const im = fbRes.data.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
                    const name = (nm?.[1]||fbUser).replace(' | Facebook','').replace(' - Facebook','');
                    const fbTxt = '📘 *Facebook: ' + name + '*\n\n📝 ' + (ds?.[1]||'No info').slice(0,200) + '\n🔗 https://facebook.com/' + fbUser;
                    const img = im?.[1];
                    if (img && img.includes('facebook')) {
                        await sock.sendMessage(from, { image: { url: img }, caption: fbTxt }, { quoted: m });
                    } else {
                        await Shefzyreply(fbTxt);
                    }
                } catch (e) {
                    console.log('fbstalk error:', e.message);
                    await Shefzyreply('❌ Failed to fetch Facebook profile! Most profiles require login.');
                }
                break;
            }

            //===================
            // twstalk: Twitter/X profile
            //===================
            case 'twstalk':
            case 'twitter': {
                if (!text) return Shefzyreply('❌ Usage: twstalk <username>');
                try {
                    const twUser = text.replace('@','').replace('https://twitter.com/','').replace('https://x.com/','');
                    const nitters = ['https://nitter.privacydev.net','https://nitter.poast.org','https://nitter.1d4.us'];
                    let twData = null;
                    for (const n of nitters) {
                        try {
                            const r = await axios.get(n + '/' + twUser, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
                            const nm = r.data.match(/<title>([^(]+)\s*\(/);
                            const fo = r.data.match(/class="followers"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
                            const fi = r.data.match(/class="following"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
                            const bi = r.data.match(/class="profile-bio"[^>]*><p[^>]*>([^<]+)<\/p>/);
                            if (nm) { twData = { name: nm[1].trim(), followers: fo?.[1]||'?', following: fi?.[1]||'?', bio: bi?.[1]||'No bio' }; break; }
                        } catch {}
                    }
                    if (!twData) throw new Error('All Nitter instances failed');
                    await Shefzyreply('🐦 *Twitter/X: @' + twUser + '*\n\n👤 ' + twData.name + '\n📝 ' + twData.bio.slice(0,100) + '\n👥 ' + twData.followers + ' followers\n➡️ ' + twData.following + ' following\n🔗 https://x.com/' + twUser);
                } catch (e) {
                    console.log('twstalk error:', e.message);
                    await Shefzyreply('❌ Failed to fetch Twitter profile. Try: https://x.com/' + text.replace('@',''));
                }
                break;
            }

            //===================
            // wastalk: WhatsApp number info
            //===================
            case 'wastalk':
            case 'whatsapp': {
                const waTarget = resolveTarget(args[0]);
                if (!waTarget) return Shefzyreply('❌ Usage: wastalk <number> or reply to user');
                try {
                    const waNum = waTarget.split('@')[0];
                    const [result] = await sock.onWhatsApp(waTarget);
                    if (!result?.exists) return Shefzyreply('❌ +' + waNum + ' is not on WhatsApp!');
                    let waPp = null;
                    try { waPp = await sock.profilePictureUrl(waTarget, 'image'); } catch {}
                    let waStatus = 'No status';
                    try { const st = await sock.fetchStatus(waTarget); waStatus = st?.status || 'No status'; } catch {}
                    const waTxt = '📱 *WhatsApp Info*\n\n📞 Number: +' + waNum + '\n✅ On WhatsApp: Yes\n📝 Status: ' + waStatus + '\n🆔 JID: ' + result.jid;
                    if (waPp) {
                        await sock.sendMessage(from, { image: { url: waPp }, caption: waTxt }, { quoted: m });
                    } else {
                        await Shefzyreply(waTxt);
                    }
                } catch (e) {
                    console.log('wastalk error:', e.message);
                    await Shefzyreply('❌ Failed to get WhatsApp info!');
                }
                break;
            }


            //===================
            // ECONOMY
            //===================

            case 'economy': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isSudo && !isCreator) return Shefzyreply('❌ Owner only!');
    const econSub = args[0]?.toLowerCase();
    if (!econSub || !['on','off'].includes(econSub)) return Shefzyreply('❌ Usage: economy on/off');
    economyEnabled.set(from, econSub === 'on');
    await Shefzyreply('💰 Economy is now *' + econSub.toUpperCase() + '* in this group!');
    break;
}

case 'bal':
case 'wallet':
case 'balance': {
    const w = getWallet(sender);
    const xpNeeded = getXpForLevel(w.level);
    const xpBar = '█'.repeat(Math.floor((w.xp / xpNeeded) * 10)) + '░'.repeat(10 - Math.floor((w.xp / xpNeeded) * 10));
    const isJailed = w.jailUntil > Date.now();
    await Shefzyreply(
        '💰 *Wallet — ' + pushname + '*\n\n' +
        '💵 Cash: *$' + w.cash.toLocaleString() + '*\n' +
        '🏦 Bank: *$' + w.bank.toLocaleString() + '*\n' +
        '💎 Net Worth: *$' + (w.cash + w.bank).toLocaleString() + '*\n' +
        '📦 Items: ' + w.inventory.length + '\n\n' +
        '⭐ Level: *' + w.level + '* — ' + getLevelTitle(w.level) + '\n' +
        '✨ XP: ' + w.xp + '/' + xpNeeded + '\n' +
        '[' + xpBar + ']\n' +
        (isJailed ? '\n🔒 *JAILED* — Release in: ' + formatCooldown(w.jailUntil - Date.now()) : '')
    );
    break;
}

case 'daily': {
    const dw = getWallet(sender);
    const now = Date.now();
    const diff = now - (dw.lastDaily || 0);
    const DAILY_CD = 86400000; // 24h

    if (diff < DAILY_CD) {
        const rem = DAILY_CD - diff;
        return Shefzyreply('⏰ *Daily on cooldown!*\n\nCome back in: *' + formatCooldown(rem) + '*\n🔥 Current streak: *' + (dw.dailyStreak || 0) + ' days*');
    }

    // Check if streak continues (claimed within 48h)
    if (diff < 172800000) {
        dw.dailyStreak = (dw.dailyStreak || 0) + 1;
    } else {
        dw.dailyStreak = 1; // Reset streak
    }

    const hasMagicBag = dw.inventory.includes('Magic Bag');
    const baseReward = 500;
    const streakBonus = Math.min(dw.dailyStreak * 50, 1000); // max +1000 streak bonus
    const levelBonus = dw.level * 25;
    let reward = baseReward + streakBonus + levelBonus;
    if (hasMagicBag) reward *= 2;

    dw.cash += reward;
    dw.lastDaily = now;
    dw.totalEarned = (dw.totalEarned || 0) + reward;
    const lu = addXp(dw, 50);
    saveEconomy();

    let msg = '✅ *Daily Reward!*\n\n' +
        '💵 Base: $' + baseReward.toLocaleString() + '\n' +
        '🔥 Streak Bonus (+' + dw.dailyStreak + ' days): $' + streakBonus.toLocaleString() + '\n' +
        '⭐ Level Bonus (Lv.' + dw.level + '): $' + levelBonus.toLocaleString() + '\n' +
        (hasMagicBag ? '🎒 Magic Bag (2x): Applied!\n' : '') +
        '━━━━━━━━━\n' +
        '💰 Total: *$' + reward.toLocaleString() + '*\n' +
        '💵 Balance: $' + dw.cash.toLocaleString() + '\n' +
        '🔥 Streak: *' + dw.dailyStreak + ' days*' +
        (dw.dailyStreak >= 7 ? '\n🎉 7-day streak! Keep it up!' : '') +
        '\n✨ +50 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* You are now Level *' + lu.level + '*!\n💵 Level bonus: +$' + lu.bonus.toLocaleString();
    await Shefzyreply(msg);
    break;
}

case 'work': {
    const ww = getWallet(sender);
    const now = Date.now();
    const WORK_CD = 3600000; // 1 hour

    if (ww.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(ww.jailUntil - now) + '*\nYou cannot work while jailed.');

    if (now - (ww.lastWork || 0) < WORK_CD) {
        const rem = WORK_CD - (now - ww.lastWork);
        return Shefzyreply('⏰ *Work cooldown!*\n\nYou are tired. Rest for: *' + formatCooldown(rem) + '*');
    }

    const jobs = [
        { name: '🧹 Swept floors', pay: [100, 250] },
        { name: '💻 Fixed a bug', pay: [200, 400] },
        { name: '🚗 Delivered food', pay: [150, 300] },
        { name: '📦 Packed boxes', pay: [120, 280] },
        { name: '🎵 Performed music', pay: [200, 500] },
        { name: '🍳 Cooked meals', pay: [130, 270] },
        { name: '🏗️ Built furniture', pay: [250, 450] },
        { name: '📱 Sold phones', pay: [300, 600] },
        { name: '✂️ Cut hair', pay: [180, 350] },
        { name: '🎨 Painted a house', pay: [200, 450] },
    ];

    // 15% chance of job failure
    if (Math.random() < 0.15) {
        ww.lastWork = now;
        saveEconomy();
        return Shefzyreply('😞 *Job Failed!*\n\nYou were fired on your first day. Better luck next time!\n\n⏰ Cooldown: 1 hour');
    }

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const hasPickaxe = ww.inventory.includes('Pickaxe');
    const base = Math.floor(Math.random() * (job.pay[1] - job.pay[0])) + job.pay[0];
    const levelBonus = Math.floor(ww.level * 10);
    let earned = base + levelBonus;
    if (hasPickaxe) earned = Math.floor(earned * 2);

    ww.cash += earned;
    ww.lastWork = now;
    ww.totalEarned = (ww.totalEarned || 0) + earned;
    const lu = addXp(ww, 30);
    saveEconomy();

    let msg = '💼 *Work Done!*\n\n' +
        job.name + '\n' +
        '💵 Pay: $' + base.toLocaleString() + '\n' +
        '⭐ Level Bonus: $' + levelBonus.toLocaleString() + '\n' +
        (hasPickaxe ? '⛏️ Pickaxe (2x): Applied!\n' : '') +
        '━━━━━━━━━\n' +
        '💰 Earned: *$' + earned.toLocaleString() + '*\n' +
        '💵 Balance: $' + ww.cash.toLocaleString() + '\n' +
        '✨ +30 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*! +$' + lu.bonus.toLocaleString();
    await Shefzyreply(msg);
    break;
}

case 'crime': {
    const cw = getWallet(sender);
    const now = Date.now();
    const CRIME_CD = 1800000; // 30 min

    if (cw.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(cw.jailUntil - now) + '*');
    if (now - (cw.lastCrime || 0) < CRIME_CD) {
        return Shefzyreply('⏰ *Crime cooldown!*\n\nLay low for: *' + formatCooldown(CRIME_CD - (now - cw.lastCrime)) + '*');
    }

    const crimes = [
        { name: '🏪 Robbed a store', reward: [500, 1500], catchChance: 0.35 },
        { name: '💳 Card fraud', reward: [800, 2000], catchChance: 0.40 },
        { name: '🚗 Stole a car', reward: [1000, 3000], catchChance: 0.45 },
        { name: '🏦 Bank heist', reward: [2000, 5000], catchChance: 0.55 },
        { name: '💍 Jewelry theft', reward: [1500, 4000], catchChance: 0.50 },
        { name: '🖥️ Hacked a website', reward: [600, 1800], catchChance: 0.30 },
    ];

    const crime = crimes[Math.floor(Math.random() * crimes.length)];
    cw.lastCrime = now;

    if (Math.random() < crime.catchChance) {
        // Caught — go to jail + fine
        const fine = Math.floor(cw.cash * 0.25);
        cw.cash = Math.max(0, cw.cash - fine);
        const jailTime = 1800000; // 30 min jail
        cw.jailUntil = now + jailTime;
        saveEconomy();
        return Shefzyreply(
            '👮 *BUSTED!*\n\n' +
            crime.name + '\n\n' +
            '💸 Fine: *$' + fine.toLocaleString() + '*\n' +
            '🔒 Jailed for: *30 minutes*\n\n' +
            'You cannot earn while jailed!'
        );
    }

    const reward = Math.floor(Math.random() * (crime.reward[1] - crime.reward[0])) + crime.reward[0];
    const levelBonus = Math.floor(cw.level * 20);
    const total = reward + levelBonus;
    cw.cash += total;
    cw.totalEarned = (cw.totalEarned || 0) + total;
    const lu = addXp(cw, 60);
    saveEconomy();

    let msg = '😈 *Crime Successful!*\n\n' +
        crime.name + '\n' +
        '💵 Loot: $' + reward.toLocaleString() + '\n' +
        '⭐ Level Bonus: $' + levelBonus.toLocaleString() + '\n' +
        '━━━━━━━━━\n' +
        '💰 Total: *$' + total.toLocaleString() + '*\n' +
        '💵 Balance: $' + cw.cash.toLocaleString() + '\n' +
        '✨ +60 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*! +$' + lu.bonus.toLocaleString();
    await Shefzyreply(msg);
    break;
}

case 'hunt': {
    const hw = getWallet(sender);
    const now = Date.now();
    const HUNT_CD = 2700000; // 45 min

    if (hw.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(hw.jailUntil - now) + '*');
    if (now - (hw.lastHunt || 0) < HUNT_CD) {
        return Shefzyreply('⏰ *Hunt cooldown!*\n\nReady in: *' + formatCooldown(HUNT_CD - (now - hw.lastHunt)) + '*');
    }

    const animals = [
        { name: '🐇 Rabbit', reward: [100, 300], miss: 0.20 },
        { name: '🦊 Fox', reward: [200, 500], miss: 0.30 },
        { name: '🦌 Deer', reward: [400, 800], miss: 0.35 },
        { name: '🐗 Wild Boar', reward: [500, 1000], miss: 0.40 },
        { name: '🐻 Bear', reward: [800, 1500], miss: 0.50 },
        { name: '🦁 Lion', reward: [1200, 2500], miss: 0.60 },
        { name: '🐉 Dragon', reward: [3000, 6000], miss: 0.85 },
    ];

    hw.lastHunt = now;
    const animal = animals[Math.floor(Math.random() * animals.length)];

    if (Math.random() < animal.miss) {
        saveEconomy();
        return Shefzyreply('🏹 *You missed!*\n\n' + animal.name + ' got away!\nBetter luck next hunt.');
    }

    const reward = Math.floor(Math.random() * (animal.reward[1] - animal.reward[0])) + animal.reward[0];
    const levelBonus = Math.floor(hw.level * 15);
    const total = reward + levelBonus;
    hw.cash += total;
    hw.totalEarned = (hw.totalEarned || 0) + total;
    const lu = addXp(hw, 45);
    saveEconomy();

    let msg = '🏹 *Successful Hunt!*\n\n' +
        'You caught a ' + animal.name + '\n' +
        '💵 Reward: $' + reward.toLocaleString() + '\n' +
        '⭐ Level Bonus: $' + levelBonus.toLocaleString() + '\n' +
        '━━━━━━━━━\n' +
        '💰 Total: *$' + total.toLocaleString() + '*\n' +
        '💵 Balance: $' + hw.cash.toLocaleString() + '\n' +
        '✨ +45 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*! +$' + lu.bonus.toLocaleString();
    await Shefzyreply(msg);
    break;
}

case 'fish': {
    const fw = getWallet(sender);
    const now = Date.now();
    const FISH_CD = 1200000; // 20 min

    if (fw.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(fw.jailUntil - now) + '*');
    if (now - (fw.lastFish || 0) < FISH_CD) {
        return Shefzyreply('⏰ *Fishing cooldown!*\n\nReady in: *' + formatCooldown(FISH_CD - (now - fw.lastFish)) + '*');
    }

    fw.lastFish = now;

    const catches = [
        { name: '👟 Old Boot', reward: 0, msg: 'You caught an old boot. Yikes.' },
        { name: '🐟 Small Fish', reward: [50, 150], msg: 'A small catch but better than nothing!' },
        { name: '🐠 Tropical Fish', reward: [100, 300], msg: 'Pretty fish! Sold it.' },
        { name: '🐡 Pufferfish', reward: [200, 400], msg: 'Careful with that one!' },
        { name: '🦈 Baby Shark', reward: [500, 900], msg: 'Doo doo doo!' },
        { name: '🐙 Octopus', reward: [400, 800], msg: 'Ink everywhere but worth it!' },
        { name: '🦞 Lobster', reward: [300, 700], msg: 'Fancy dinner tonight!' },
        { name: '💎 Treasure Chest', reward: [1000, 3000], msg: 'JACKPOT! Ancient treasure!' },
    ];

    const weights = [5, 30, 25, 15, 8, 8, 7, 2]; // rare = treasure, common = small fish
    let rand = Math.random() * 100;
    let catchItem = catches[1];
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (rand < cumulative) { catchItem = catches[i]; break; }
    }

    if (catchItem.reward === 0) {
        saveEconomy();
        return Shefzyreply('🎣 *Fishing Result*\n\n' + catchItem.name + '\n' + catchItem.msg + '\n\n💵 Earned: $0\n😅 Try again in 20 mins');
    }

    const reward = Math.floor(Math.random() * (catchItem.reward[1] - catchItem.reward[0])) + catchItem.reward[0];
    const levelBonus = Math.floor(fw.level * 5);
    const total = reward + levelBonus;
    fw.cash += total;
    fw.totalEarned = (fw.totalEarned || 0) + total;
    const lu = addXp(fw, 20);
    saveEconomy();

    let msg = '🎣 *Fishing Result*\n\n' +
        catchItem.name + '\n' +
        catchItem.msg + '\n' +
        '💵 Value: $' + reward.toLocaleString() + '\n' +
        '⭐ Level Bonus: $' + levelBonus.toLocaleString() + '\n' +
        '━━━━━━━━━\n' +
        '💰 Total: *$' + total.toLocaleString() + '*\n' +
        '💵 Balance: $' + fw.cash.toLocaleString() + '\n' +
        '✨ +20 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*! +$' + lu.bonus.toLocaleString();
    await Shefzyreply(msg);
    break;
}

case 'mine': {
    const mw = getWallet(sender);
    const now = Date.now();
    const MINE_CD = 2400000; // 40 min

    if (mw.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(mw.jailUntil - now) + '*');
    if (now - (mw.lastMine || 0) < MINE_CD) {
        return Shefzyreply('⏰ *Mine cooldown!*\n\nReady in: *' + formatCooldown(MINE_CD - (now - mw.lastMine)) + '*');
    }

    mw.lastMine = now;
    const hasPickaxe = mw.inventory.includes('Pickaxe');

    const ores = [
        { name: '🪨 Stone', reward: [30, 80], weight: 40 },
        { name: '⛏️ Coal', reward: [80, 200], weight: 25 },
        { name: '🔩 Iron', reward: [150, 350], weight: 15 },
        { name: '🥇 Gold', reward: [300, 700], weight: 10 },
        { name: '💎 Diamond', reward: [700, 1500], weight: 7 },
        { name: '🌟 Ancient Gem', reward: [2000, 5000], weight: 3 },
    ];

    let rand2 = Math.random() * 100;
    let ore = ores[0];
    let cum2 = 0;
    for (const o of ores) {
        cum2 += o.weight;
        if (rand2 < cum2) { ore = o; break; }
    }

    let reward = Math.floor(Math.random() * (ore.reward[1] - ore.reward[0])) + ore.reward[0];
    const levelBonus = Math.floor(mw.level * 10);
    if (hasPickaxe) reward = Math.floor(reward * 2);
    const total = reward + levelBonus;
    mw.cash += total;
    mw.totalEarned = (mw.totalEarned || 0) + total;
    const lu = addXp(mw, 35);
    saveEconomy();

    let msg = '⛏️ *Mining Result*\n\n' +
        'You mined ' + ore.name + '\n' +
        '💵 Value: $' + reward.toLocaleString() + (hasPickaxe ? ' (2x Pickaxe!)' : '') + '\n' +
        '⭐ Level Bonus: $' + levelBonus.toLocaleString() + '\n' +
        '━━━━━━━━━\n' +
        '💰 Total: *$' + total.toLocaleString() + '*\n' +
        '💵 Balance: $' + mw.cash.toLocaleString() + '\n' +
        '✨ +35 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*! +$' + lu.bonus.toLocaleString();
    await Shefzyreply(msg);
    break;
}

case 'deposit': {
    const depW = getWallet(sender);
    const depAmt = args[0]?.toLowerCase() === 'all' ? depW.cash : parseInt(args[0]);
    if (!depAmt || depAmt <= 0) return Shefzyreply('❌ Usage: deposit <amount/all>');
    if (depAmt > depW.cash) return Shefzyreply('❌ Not enough cash!\n💵 You have: $' + depW.cash.toLocaleString());
    depW.cash -= depAmt;
    depW.bank += depAmt;
    saveEconomy();
    await Shefzyreply(
        '🏦 *Deposited!*\n\n' +
        '💵 Deposited: *$' + depAmt.toLocaleString() + '*\n' +
        '━━━━━━━━━\n' +
        '💵 Cash: $' + depW.cash.toLocaleString() + '\n' +
        '🏦 Bank: $' + depW.bank.toLocaleString() + '\n\n' +
        '💡 Bank gives 2% interest every 24hrs!'
    );
    break;
}

case 'withdraw': {
    const witW = getWallet(sender);
    const witAmt = args[0]?.toLowerCase() === 'all' ? witW.bank : parseInt(args[0]);
    if (!witAmt || witAmt <= 0) return Shefzyreply('❌ Usage: withdraw <amount/all>');
    if (witAmt > witW.bank) return Shefzyreply('❌ Not enough in bank!\n🏦 Bank: $' + witW.bank.toLocaleString());
    witW.bank -= witAmt;
    witW.cash += witAmt;
    saveEconomy();
    await Shefzyreply(
        '💸 *Withdrawn!*\n\n' +
        '💵 Withdrawn: *$' + witAmt.toLocaleString() + '*\n' +
        '━━━━━━━━━\n' +
        '💵 Cash: $' + witW.cash.toLocaleString() + '\n' +
        '🏦 Bank: $' + witW.bank.toLocaleString()
    );
    break;
}

case 'give':
case 'pay': {
    const giveTarget = resolveTarget(args[0]);
    const giveAmt = parseInt(args[1] || args[0]);
    if (!giveTarget || !giveAmt || giveAmt <= 0) return Shefzyreply('❌ Usage: give @user <amount>');
    if (giveAmt < 10) return Shefzyreply('❌ Minimum transfer is $10!');
    const giveW = getWallet(sender);
    if (giveAmt > giveW.cash) return Shefzyreply('❌ Not enough cash!\n💵 You have: $' + giveW.cash.toLocaleString());

    // Tax on large transfers
    let tax = 0;
    if (giveAmt >= 5000) {
        tax = Math.floor(giveAmt * 0.10);
    }
    const received = giveAmt - tax;
    const recvW = getWallet(giveTarget);
    giveW.cash -= giveAmt;
    recvW.cash += received;
    saveEconomy();

    await sock.sendMessage(from, {
        text: '💸 *Transfer Complete!*\n\n' +
            '👤 From: ' + pushname + '\n' +
            '👤 To: @' + giveTarget.split('@')[0] + '\n' +
            '💵 Sent: $' + giveAmt.toLocaleString() + '\n' +
            (tax > 0 ? '💸 Tax (10%): -$' + tax.toLocaleString() + '\n' : '') +
            '✅ Received: *$' + received.toLocaleString() + '*\n\n' +
            (tax > 0 ? '⚠️ Transfers over $5,000 are taxed 10%' : ''),
        mentions: [giveTarget]
    }, { quoted: m });
    break;
}

case 'rob': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    const robTarget = resolveTarget(args[0]);
    if (!robTarget) return Shefzyreply('❌ Usage: rob @user or reply to someone');
    if (robTarget === sender) return Shefzyreply('❌ Cannot rob yourself!');

    const robberW = getWallet(sender);
    const victimW = getWallet(robTarget);
    const now = Date.now();
    const ROB_CD = 3600000; // 1hr rob cooldown

    if (robberW.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(robberW.jailUntil - now) + '*');

    // Rob cooldown
    if (now - (robberW.lastRob || 0) < ROB_CD) {
        return Shefzyreply('⏰ *Rob cooldown!*\n\nLay low for: *' + formatCooldown(ROB_CD - (now - robberW.lastRob)) + '*');
    }

    if (victimW.cash < 100) return Shefzyreply('❌ Target is too broke to rob! (need $100+)');

    // Shield protection
    if (victimW.inventory.includes('Shield')) {
        victimW.inventory = victimW.inventory.filter(i => i !== 'Shield');
        const fine = Math.floor(Math.random() * 300) + 200;
        robberW.cash = Math.max(0, robberW.cash - fine);
        robberW.jailUntil = now + 1800000; // 30 min jail
        robberW.lastRob = now;
        saveEconomy();
        return await sock.sendMessage(from, {
            text: '🛡️ *Shield Activated!*\n\n' +
                '@' + robTarget.split('@')[0] + ' was protected by a Shield!\n' +
                '👮 You got caught and jailed!\n' +
                '💸 Fine: $' + fine.toLocaleString() + '\n' +
                '🔒 Jailed for: 30 minutes',
            mentions: [robTarget]
        }, { quoted: m });
    }

    robberW.lastRob = now;

    // 45% success rate
    if (Math.random() < 0.55) {
        const fine = Math.floor(Math.random() * 400) + 200;
        robberW.cash = Math.max(0, robberW.cash - fine);
        robberW.jailUntil = now + 1800000; // 30 min jail
        saveEconomy();
        return await Shefzyreply(
            '👮 *CAUGHT!*\n\n' +
            'You failed the robbery!\n' +
            '💸 Fine: *$' + fine.toLocaleString() + '*\n' +
            '🔒 Jailed for: *30 minutes*'
        );
    }

    const maxSteal = Math.min(victimW.cash * 0.35, 5000); // max 35% or $5000
    const stolen = Math.floor(Math.random() * maxSteal) + Math.floor(maxSteal * 0.1);
    victimW.cash -= stolen;
    robberW.cash += stolen;
    robberW.totalEarned = (robberW.totalEarned || 0) + stolen;
    const lu = addXp(robberW, 40);
    saveEconomy();

    let msg = '🔫 *Rob Successful!*\n\n';
    msg += 'You robbed @' + robTarget.split('@')[0] + '\n';
    msg += '💵 Stolen: *$' + stolen.toLocaleString() + '*\n';
    msg += '💵 Balance: $' + robberW.cash.toLocaleString() + '\n';
    msg += '✨ +40 XP';
    if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*!';

    await sock.sendMessage(from, { text: msg, mentions: [robTarget] }, { quoted: m });
    break;
}

case 'gamble':
case 'bet': {
    const gambW = getWallet(sender);
    const now = Date.now();
    const GAMBLE_CD = 300000; // 5 min between gambles

    if (gambW.jailUntil > now) return Shefzyreply('🔒 *You are in jail!*\nRelease in: *' + formatCooldown(gambW.jailUntil - now) + '*');

    // Reset daily gamble limit
    if (now - (gambW.gamblesReset || 0) >= 86400000) {
        gambW.gamblesLeft = 5;
        gambW.gamblesReset = now;
    }
    if ((gambW.gamblesLeft || 0) <= 0) {
        return Shefzyreply('🎰 *Daily gamble limit reached!*\n\nYou have used all 5 daily gambles.\nResets in: *' + formatCooldown(86400000 - (now - gambW.gamblesReset)) + '*');
    }
    if (now - (gambW.lastGamble || 0) < GAMBLE_CD) {
        return Shefzyreply('⏰ *Gamble cooldown!*\n\nWait: *' + formatCooldown(GAMBLE_CD - (now - gambW.lastGamble)) + '*\n🎰 Gambles left today: *' + gambW.gamblesLeft + '/5*');
    }

    const gambAmt = args[0]?.toLowerCase() === 'all' ? gambW.cash : parseInt(args[0]);
    if (!gambAmt || gambAmt <= 0) return Shefzyreply('❌ Usage: gamble <amount/all>\n🎰 Gambles left today: *' + gambW.gamblesLeft + '/5*');
    if (gambAmt < 50) return Shefzyreply('❌ Minimum bet is $50!');
    if (gambAmt > gambW.cash) return Shefzyreply('❌ Not enough cash!\n💵 You have: $' + gambW.cash.toLocaleString());
    if (gambAmt > 50000) return Shefzyreply('❌ Maximum bet is $50,000!');

    gambW.lastGamble = now;
    gambW.gamblesLeft = (gambW.gamblesLeft || 5) - 1;

    const hasLuckyCoin = gambW.inventory.includes('Lucky Coin');
    const winChance = hasLuckyCoin ? 0.50 : 0.45; // 45% or 50% with lucky coin
    const roll = Math.random();

    if (roll < 0.05) {
        // JACKPOT — 5% chance
        const jackpot = gambAmt * 5;
        gambW.cash += jackpot - gambAmt;
        gambW.totalEarned = (gambW.totalEarned || 0) + jackpot;
        const lu = addXp(gambW, 100);
        saveEconomy();
        let msg = '🎰 *🎉 JACKPOT! 🎉*\n\n💰 You hit the jackpot!\n💵 Won: *$' + jackpot.toLocaleString() + '* (5x)\n💵 Balance: $' + gambW.cash.toLocaleString() + '\n✨ +100 XP\n🎰 Gambles left: *' + gambW.gamblesLeft + '/5*';
        if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*!';
        return await Shefzyreply(msg);
    } else if (roll < winChance + 0.05) {
        // Win
        const mult = Math.random() < 0.3 ? 3 : 2;
        const winnings = gambAmt * (mult - 1);
        gambW.cash += winnings;
        gambW.totalEarned = (gambW.totalEarned || 0) + winnings;
        const lu = addXp(gambW, 25);
        saveEconomy();
        let msg = '🎰 *You Won!*\n\n💵 Profit: *+$' + winnings.toLocaleString() + '* (' + mult + 'x)\n💵 Balance: $' + gambW.cash.toLocaleString() + '\n✨ +25 XP\n🎰 Gambles left: *' + gambW.gamblesLeft + '/5*';
        if (lu) msg += '\n\n🎊 *LEVEL UP!* Level *' + lu.level + '*!';
        return await Shefzyreply(msg);
    } else {
        // Loss
        gambW.cash -= gambAmt;
        saveEconomy();
        return await Shefzyreply(
            '🎰 *You Lost!*\n\n' +
            '💸 Lost: *-$' + gambAmt.toLocaleString() + '*\n' +
            '💵 Balance: $' + gambW.cash.toLocaleString() + '\n' +
            '🎰 Gambles left: *' + gambW.gamblesLeft + '/5*\n\n' +
            (gambW.gamblesLeft === 0 ? '⚠️ No more gambles today!' : '💡 ' + gambW.gamblesLeft + ' gamble(s) remaining today')
        );
    }
}

case 'lb':
case 'top':
case 'leaderboard': {
    const lbLimit = Math.min(parseInt(args[0]) || 10, 20);
    const lbEntries = Object.entries(economyData)
        .map(([id, d]) => ({ id, total: (d.cash || 0) + (d.bank || 0), level: d.level || 1 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, lbLimit);
    const medals = ['🥇', '🥈', '🥉'];
    const lbText = lbEntries.map((e, i) =>
        (medals[i] || (i + 1) + '.') + ' +' + e.id +
        '\n   💰 $' + e.total.toLocaleString() +
        ' | ⭐ Lv.' + e.level + ' ' + getLevelTitle(e.level)
    ).join('\n\n');
    await Shefzyreply('🏆 *Top ' + lbLimit + ' Richest*\n\n' + lbText);
    break;
}

case 'shop': {
    const shopList = SHOP_ITEMS.map(it =>
        it.id + '. ' + it.emoji + ' *' + it.name + '* — $' + it.price.toLocaleString() + '\n   📝 ' + it.desc
    ).join('\n\n');
    await Shefzyreply(
        '🏪 *Shop*\n\n' + shopList + '\n\n' +
        '💡 *Item Effects:*\n' +
        '🪙 Lucky Coin — +5% gamble win chance\n' +
        '🛡️ Shield — Blocks one rob attempt\n' +
        '⛏️ Pickaxe — 2x work & mine earnings\n' +
        '⭐ VIP Pass — VIP badge on profile\n' +
        '🎒 Magic Bag — 2x daily reward\n\n' +
        'Buy: ' + prefix + 'buy <name or number>'
    );
    break;
}

case 'buy': {
    if (!text) return Shefzyreply('❌ Usage: buy <item name or number>');
    const buyW = getWallet(sender);
    const buyItem = SHOP_ITEMS.find(it => it.id === parseInt(text) || it.name.toLowerCase() === text.toLowerCase());
    if (!buyItem) return Shefzyreply('❌ Item not found! Use ' + prefix + 'shop');
    if (buyW.cash < buyItem.price) return Shefzyreply('❌ Need $' + buyItem.price.toLocaleString() + ', you have $' + buyW.cash.toLocaleString());
    if (buyW.inventory.includes(buyItem.name)) return Shefzyreply('❌ You already own *' + buyItem.name + '*!');
    buyW.cash -= buyItem.price;
    buyW.inventory.push(buyItem.name);
    saveEconomy();
    await Shefzyreply(
        '✅ *Purchase Successful!*\n\n' +
        buyItem.emoji + ' *' + buyItem.name + '*\n' +
        '📝 ' + buyItem.desc + '\n' +
        '━━━━━━━━━\n' +
        '💸 Cost: $' + buyItem.price.toLocaleString() + '\n' +
        '💵 Remaining: $' + buyW.cash.toLocaleString()
    );
    break;
}

case 'inv':
case 'inventory': {
    const invW = getWallet(sender);
    if (!invW.inventory.length) return Shefzyreply('🎒 *Inventory Empty!*\n\nYou have no items.\nVisit the shop: ' + prefix + 'shop');
    const invList = invW.inventory.map((n, i) => {
        const it = SHOP_ITEMS.find(s => s.name === n);
        return (i + 1) + '. ' + (it?.emoji || '📦') + ' *' + n + '*\n   📝 ' + (it?.desc || 'Unknown item');
    }).join('\n\n');
    await Shefzyreply(
        '🎒 *Inventory — ' + pushname + '*\n\n' +
        invList + '\n\n' +
        '━━━━━━━━━\n' +
        '💵 Cash: $' + invW.cash.toLocaleString() + '\n' +
        '🏦 Bank: $' + invW.bank.toLocaleString()
    );
    break;
}

case 'level':
case 'rank':
case 'xp': {
    const lw = getWallet(sender);
    const xpNeeded = getXpForLevel(lw.level);
    const progress = Math.min(Math.floor((lw.xp / xpNeeded) * 20), 20);
    const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);
    const rank = Object.entries(economyData)
        .sort((a, b) => ((b[1].level || 1) * 10000 + (b[1].xp || 0)) - ((a[1].level || 1) * 10000 + (a[1].xp || 0)))
        .findIndex(([id]) => id === sender.split('@')[0]) + 1;

    await Shefzyreply(
        '⭐ *Level & XP — ' + pushname + '*\n\n' +
        '🏆 Title: *' + getLevelTitle(lw.level) + '*\n' +
        '⭐ Level: *' + lw.level + '*\n' +
        '✨ XP: ' + (lw.xp || 0) + ' / ' + xpNeeded + '\n' +
        '[' + bar + ']\n\n' +
        '📊 Rank: *#' + rank + '*\n' +
        '💰 Net Worth: *$' + ((lw.cash || 0) + (lw.bank || 0)).toLocaleString() + '*\n' +
        '💵 Total Earned: $' + (lw.totalEarned || 0).toLocaleString() + '\n\n' +
        '💡 *XP Sources:*\n' +
        '• Daily: +50 XP\n' +
        '• Work: +30 XP\n' +
        '• Mine: +35 XP\n' +
        '• Hunt: +45 XP\n' +
        '• Fish: +20 XP\n' +
        '• Crime: +60 XP\n' +
        '• Rob: +40 XP\n' +
        '• Gamble win: +25 XP\n' +
        '• Jackpot: +100 XP'
    );
    break;
}

case 'ecoinfo':
case 'econinfo': {
    const ew = getWallet(sender);
    const now = Date.now();
    const cooldowns = [
        { name: '📅 Daily', last: ew.lastDaily, cd: 86400000 },
        { name: '💼 Work', last: ew.lastWork, cd: 3600000 },
        { name: '😈 Crime', last: ew.lastCrime, cd: 1800000 },
        { name: '🏹 Hunt', last: ew.lastHunt, cd: 2700000 },
        { name: '🎣 Fish', last: ew.lastFish, cd: 1200000 },
        { name: '⛏️ Mine', last: ew.lastMine, cd: 2400000 },
        { name: '🔫 Rob', last: ew.lastRob, cd: 3600000 },
        { name: '🎰 Gamble', last: ew.lastGamble, cd: 300000 },
    ];

    const cdText = cooldowns.map(c => {
        const rem = c.cd - (now - (c.last || 0));
        return c.name + ': ' + (rem <= 0 ? '✅ Ready' : '⏰ ' + formatCooldown(rem));
    }).join('\n');

    await Shefzyreply(
        '📊 *Economy Status — ' + pushname + '*\n\n' +
        '💵 Cash: $' + ew.cash.toLocaleString() + '\n' +
        '🏦 Bank: $' + ew.bank.toLocaleString() + '\n' +
        '⭐ Level: ' + ew.level + ' (' + getLevelTitle(ew.level) + ')\n' +
        '🎰 Gambles left: ' + (ew.gamblesLeft || 5) + '/5\n' +
        (ew.jailUntil > now ? '🔒 JAILED: ' + formatCooldown(ew.jailUntil - now) + '\n' : '') +
        '\n⏰ *Cooldowns:*\n' + cdText
    );
    break;
}

case 'bail': {
    const bw = getWallet(sender);
    const now = Date.now();
    if (bw.jailUntil <= now) return Shefzyreply('✅ You are not in jail!');
    const timeLeft = bw.jailUntil - now;
    const bailCost = Math.floor(timeLeft / 60000) * 100; // $100 per minute remaining
    if (bw.cash < bailCost) {
        return Shefzyreply(
            '🔒 *You are in jail!*\n\n' +
            'Time left: *' + formatCooldown(timeLeft) + '*\n' +
            'Bail cost: *$' + bailCost.toLocaleString() + '*\n\n' +
            '❌ Not enough cash! ($' + bw.cash.toLocaleString() + ')\n' +
            'Wait it out or earn more cash (you can still fish while jailed).'
        );
    }
    bw.cash -= bailCost;
    bw.jailUntil = 0;
    saveEconomy();
    await Shefzyreply(
        '🔓 *Bailed Out!*\n\n' +
        '💸 Bail paid: $' + bailCost.toLocaleString() + '\n' +
        '💵 Remaining: $' + bw.cash.toLocaleString() + '\n\n' +
        '✅ You are free! Stay out of trouble.'
    );
    break;
}

            //===================
            // ANIME
            //===================

            case 'animenews': {
                try {
                    const anRes = await axios.get('https://api.jikan.moe/v4/top/anime?filter=airing&limit=5', { timeout: 10000 });
                    const list = anRes.data.data.map((a,i) => (i+1) + '. *' + a.title + '* ⭐' + a.score).join('\n');
                    await Shefzyreply('📰 *Top Airing Anime*\n\n' + list);
                } catch (e) { await Shefzyreply('❌ Failed to fetch anime news!'); }
                break;
            }

            case 'animechar': {
                if (!text) return Shefzyreply('❌ Usage: animechar <name>');
                try {
                    const acRes = await axios.get('https://api.jikan.moe/v4/characters?q=' + encodeURIComponent(text) + '&limit=1', { timeout: 10000 });
                    const ch = acRes.data.data?.[0];
                    if (!ch) return Shefzyreply('❌ Character not found!');
                    const acImg = ch.images?.jpg?.image_url;
                    const acTxt = '🎭 *' + ch.name + '*\n\n' + (ch.about?.slice(0,300)||'No info') + '\n\n🔗 ' + ch.url;
                    if (acImg) { await sock.sendMessage(from, { image: { url: acImg }, caption: acTxt }, { quoted: m }); }
                    else { await Shefzyreply(acTxt); }
                } catch (e) { await Shefzyreply('❌ Character search failed!'); }
                break;
            }

            case 'animerec': {
                if (!text) return Shefzyreply('❌ Usage: animerec <title>');
                try {
                    const arS = await axios.get('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(text) + '&limit=1', { timeout: 10000 });
                    const arId = arS.data.data?.[0]?.mal_id;
                    if (!arId) return Shefzyreply('❌ Anime not found!');
                    const arR = await axios.get('https://api.jikan.moe/v4/anime/' + arId + '/recommendations', { timeout: 10000 });
                    const recs = arR.data.data?.slice(0,5).map((r,i) => (i+1) + '. *' + r.entry.title + '*').join('\n');
                    await Shefzyreply('🎬 *Recs for ' + text + '*\n\n' + (recs||'No recommendations found'));
                } catch (e) { await Shefzyreply('❌ Recommendation failed!'); }
                break;
            }

            case 'animesearch': {
                if (!text) return Shefzyreply('❌ Usage: animesearch <title>');
                try {
                    const asRes = await axios.get('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(text) + '&limit=1', { timeout: 10000 });
                    const a = asRes.data.data?.[0];
                    if (!a) return Shefzyreply('❌ Anime not found!');
                    const asTxt = '🎌 *' + a.title + '*\n\n⭐ ' + (a.score||'N/A') + ' | 📺 ' + (a.episodes||'?') + ' eps\n🎭 ' + (a.genres?.map(g=>g.name).join(', ')||'N/A') + '\n\n📝 ' + (a.synopsis?.slice(0,300)||'No synopsis') + '...';
                    const asImg = a.images?.jpg?.large_image_url;
                    if (asImg) { await sock.sendMessage(from, { image: { url: asImg }, caption: asTxt }, { quoted: m }); }
                    else { await Shefzyreply(asTxt); }
                } catch (e) { await Shefzyreply('❌ Anime search failed!'); }
                break;
            }

            case 'animewlp':
            case 'animewallpaper': {
                try {
                    const wlpRes = await axios.post('https://api.waifu.pics/many/sfw/waifu', { exclude: [] }, { timeout: 10000 });
                    const imgs = wlpRes.data?.files || [];
                    const wlpUrl = imgs[Math.floor(Math.random()*imgs.length)];
                    if (!wlpUrl) throw new Error('No image');
                    await sock.sendMessage(from, { image: { url: wlpUrl }, caption: '🌸 *Anime Wallpaper*' }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed to fetch wallpaper!'); }
                break;
            }
 
//===================
// ANIME GIF REACTIONS (FIXED)
//===================
case 'hug': case 'kiss': case 'kill': case 'slap': case 'pat':
case 'lick': case 'bite': case 'yeet': case 'bully': case 'bonk':
case 'wink': case 'poke': case 'nom': case 'smile': case 'wave':
case 'blush': case 'dance': case 'cry': case 'happy': case 'laugh':
case 'angry': case 'cuddle': case 'highfive': case 'shoot': case 'sleep':
case 'awoo': case 'smug': case 'glomp': case 'cringe': case 'handhold':
case 'shinobu': case 'fox': case 'koala': case 'bird': case 'panda':
case 'dog': case 'cat': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    const gifTarget = resolveTarget(args[0]);
    const gifTgt = gifTarget ? '@' + gifTarget.split('@')[0] : 'everyone';
    const gifMentions = gifTarget ? [gifTarget] : [];
    const gifActions = { hug:'hugged', kiss:'kissed', kill:'killed', slap:'slapped', pat:'patted', lick:'licked', bite:'bit', yeet:'yeeted', bully:'bullied', bonk:'bonked', wink:'winked at', poke:'poked', nom:'nom nom', smile:'smiled at', wave:'waved at', blush:'blushed at', dance:'danced with', cry:'cried because of', happy:'is happy for', laugh:'laughed at', angry:'is angry at', cuddle:'cuddled', highfive:'high-fived', shoot:'shot', sleep:'fell asleep on', awoo:'awed at', smug:'is smug at', glomp:'glomped', cringe:'cringed at', handhold:'held hands with', shinobu:'Shinobu stared at', fox:'🦊 Fox spotted', koala:'🐨 Koala for', bird:'🐦 Bird for', panda:'🐼 Panda for', dog:'🐶 Dog for', cat:'🐱 Cat for' };
    const caption = pushname + ' ' + (gifActions[command]||command) + ' ' + gifTgt;

    // Map command to API endpoint
    const apiMap = {
        hug:'hug', kiss:'kiss', kill:'kill', slap:'slap', pat:'pat', lick:'lick', bite:'bite', yeet:'yeet', bully:'bully',
        bonk:'bonk', wink:'wink', poke:'poke', nom:'nom', smile:'smile', wave:'wave', blush:'blush', dance:'dance',
        cry:'cry', happy:'happy', laugh:'laugh', angry:'angry', cuddle:'cuddle', highfive:'highfive', shoot:'shoot',
        sleep:'sleep', awoo:'awoo', smug:'smug', glomp:'glomp', cringe:'cringe', handhold:'handhold', shinobu:'shinobu',
        fox:'fox', koala:'koala', bird:'bird', panda:'panda', dog:'dog', cat:'cat'
    };
    const apiKey = apiMap[command] || command;

    let mediaUrl = null;
    let isMp4 = true;
    // Tier 1: otakugifs.xyz — no key required, actively maintained
    try {
        const res = await axios.get(`https://api.otakugifs.xyz/gif?reaction=${apiKey}&format=gif`, { timeout: 8000 });
        if (res.data?.url) {
            mediaUrl = res.data.url;
            isMp4 = false;
        }
    } catch {}
    // Tier 2: nekos.best
    if (!mediaUrl) {
        try {
            const res = await axios.get(`https://nekos.best/api/v2/${apiKey}`, { timeout: 8000 });
            if (res.data?.results?.[0]?.url) {
                mediaUrl = res.data.results[0].url;
                isMp4 = mediaUrl.endsWith('.mp4');
            }
        } catch {}
    }
    // Tier 3: waifu.pics
    if (!mediaUrl) {
        const waifuActions = ['hug','kiss','slap','pat','cry','blush','dance','happy','wave','poke','smile','bully','bonk','nom','lick','cuddle'];
        if (waifuActions.includes(apiKey)) {
            try {
                const res = await axios.get(`https://api.waifu.pics/sfw/${apiKey}`, { timeout: 8000 });
                if (res.data?.url) {
                    mediaUrl = res.data.url;
                    isMp4 = false;
                }
            } catch {}
        }
    }

    if (!mediaUrl) {
        return Shefzyreply(`❌ Failed to fetch GIF for *${command}*. Try again later.`);
    }
    const { sendGifFromUrl } = require('./utils/functions');
    if (isMp4 || mediaUrl.endsWith('.mp4') || mediaUrl.includes('mp4')) {
        await sendGifFromUrl(sock, from, mediaUrl, caption, m);
        if (gifMentions.length) {
            await sock.sendMessage(from, { text: caption, mentions: gifMentions }, { quoted: m });
        }
    } else {
        await sock.sendMessage(from, { image: { url: mediaUrl }, caption, mentions: gifMentions }, { quoted: m });
    }
    break;
}

            //===================
            // MISC
            //===================

            case 'creategc': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!text) return Shefzyreply('❌ Usage: creategc <group name>');
                try {
                    const created = await sock.groupCreate(text, [sender]);
                    await Shefzyreply('✅ Group *' + text + '* created!\n🆔 ' + created.id);
                } catch (e) { await Shefzyreply('❌ Failed: ' + e.message); }
                break;
            }

            case 'removebg': {
                if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to an image!');
                const rbgKey = config.removeBgApiKey || '';
                if (!rbgKey) return Shefzyreply('❌ Add removeBgApiKey to config.js\nFree key: remove.bg');
                try {
                    await Shefzyreply('⏳ Removing background...');
                    const imgBuf = await m.quoted.download();
                    const rbgForm = new FormData();
                    rbgForm.append('image_file', imgBuf, { filename: 'image.jpg', contentType: 'image/jpeg' });
                    rbgForm.append('size', 'auto');
                    const rbgRes = await axios.post('https://api.remove.bg/v1.0/removebg', rbgForm, {
                        headers: { ...rbgForm.getHeaders(), 'X-Api-Key': rbgKey },
                        responseType: 'arraybuffer', timeout: 30000
                    });
                    await sock.sendMessage(from, { image: Buffer.from(rbgRes.data), mimetype: 'image/png', caption: '✅ Background removed!' }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Failed! Check API key.'); }
                break;
            }

            case 'take':
case 'wm': 
case 'steal':
case 'mine': {
    if (!m.quoted || !/sticker/.test(m.quoted.mtype)) {
        return Shefzyreply("Please reply to a sticker to change its packname and author.");
    }
    try {
        const packName = args[0] || config.stickerPackname;
        const authorName = args[1] || config.stickerAuthor;
        const mediaBuffer = await m.quoted.download();
        const sticker = new Sticker(mediaBuffer, {
            pack: packName,
            author: authorName,
            type: StickerTypes.FULL,
            quality: 70,
        });     
        await sock.sendMessage(from, await sticker.toMessage(), { quoted: m });

    } catch (e) {
        console.error("Take Command Error:", e);
        Shefzyreply("❌ Failed to modify the sticker. The original sticker might be corrupted.");
    }
    break;
}

            case 'setalive': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                if (!text) return Shefzyreply('❌ Usage: setalive <message>');
                updateUserSettings(botNumberRaw, { aliveMessage: text });
                await Shefzyreply('✅ Alive message set!\n\n' + text);
                break;
            }

            case 'alive': {
                const defaultAlive = '🟢 *' + (userSetting.botName||config.botName) + ' is Alive!*\n\n⏰ Uptime: ' + formatRuntime(process.uptime()) + '\n💾 Memory: ' + (process.memoryUsage().heapUsed/1024/1024).toFixed(2) + ' MB\n📱 Bot: ' + botNumberRaw + '\n\n' + config.productBrand;
                await Shefzyreply(userSetting.aliveMessage || defaultAlive);
                break;
            }
             
             case 'feedback':
            case 'support': {
    const supportText = 
        `🤝 *SUPPORT & CONNECTIONS*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📢 *WhatsApp Channel*\n` +
        `👉 https://whatsapp.com/channel/0029VbCRdBDFi8xeQJcl1o1C\n\n` +
        `📱 *WhatsApp Number*\n` +
        `👉 wa.me/2349028711461\n\n` +
        `💰 *Donations (Support Development)*\n` +
        `👉 *Bank Transfer:* 9028711461 (opay)\n` +
        `👉 *PayPal/Crypto:* Ask via WhatsApp\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🐛 *Report Bugs & Feedback*\n` +
        `👉 https://michikofeedback.vercel.app/\n\n` +
        `✨ *Your support keeps the bot alive!* ✨`;
    
    await sock.sendMessage(from, {
        text: supportText,
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363424622834872@newsletter",
                newsletterName: config.botName,
                serverMessageId: -1
            }
        }
    }, { quoted: m });
    break;
}

            case 'totalcmd': {
                try {
                    // ✅ FIX: use async fs read
                    const fc = await fsPromises.readFile(__filename, 'utf-8');
                    const allCases = fc.match(/case '[^']+'/g) || [];
                    const uniqueCount = new Set(allCases.map(c => c.slice(6,-1))).size;
                    await Shefzyreply('📊 *Total Commands*\n\n✅ ' + uniqueCount + ' unique commands registered!');
                } catch (e) {
                    console.error('totalcmd error:', e);
                    await Shefzyreply('📊 *Total Commands*\n\n✅ 100+ commands!');
                }
                break;
            }

            //===================
            // DEV ONLY
            //===================
            case 'addcase':
            case 'delcase':
            case 'getcase':
            case 'eval':
            case 'exec': {
                const DEV_R = String(config.devNumber || config.botOwner || '').replace(/[^0-9]/g,'');
    const cleanSender = sender.split('@')[0].split(':')[0];
    if (!DEV_R || cleanSender !== DEV_R) return;
                if (command === 'eval') {
                    if (!text) return Shefzyreply('❌ Usage: eval <code>');
                    try {
                        let res = eval('(async()=>{' + text + '})()');
                        if (res instanceof Promise) res = await res;
                        const out = typeof res === 'object' ? JSON.stringify(res,null,2) : String(res);
                        await Shefzyreply('📤 *Eval*\n\n```\n' + out.slice(0,2000) + '\n```');
                    } catch (e) { await Shefzyreply('❌ Error: ' + e.message); }
                } else if (command === 'exec') {
                    if (!text) return Shefzyreply('❌ Usage: exec <command>');
                    const { exec: sx } = require('child_process');
                    const { promisify: sp } = require('util');
                    try {
                        const { stdout, stderr } = await sp(sx)(text, { timeout: 15000 });
                        await Shefzyreply('💻 *Exec*\n\n```\n' + (stdout||stderr||'No output').slice(0,2000) + '\n```');
                    } catch (e) { await Shefzyreply('❌ Error: ' + e.message); }
                } else if (command === 'getcase') {
                    if (!args[0]) return Shefzyreply('❌ Usage: getcase <cmd>');
                    // ✅ FIX: use async fs read
                    const fc2 = await fsPromises.readFile(__filename, 'utf-8');
                    const searchTerm = "case '" + args[0] + "':";
                    const cs = fc2.indexOf(searchTerm);
                    if (cs === -1) return Shefzyreply('❌ Case *' + args[0] + '* not found!');
                    
                    // Find the end of this case block
                    let braceDepth = 0;
                    let gcEnd = cs;
                    let foundBrace = false;
                    for (let ci = cs; ci < Math.min(cs + 100000, fc2.length); ci++) {
                        if (fc2[ci] === '{') { braceDepth++; foundBrace = true; }
                        else if (fc2[ci] === '}') {
                            braceDepth--;
                            if (foundBrace && braceDepth === 0) { gcEnd = ci + 1; break; }
                        }
                    }
                    // Fallback
                    if (gcEnd === cs) {
                        const nc = fc2.indexOf("\n            case '", cs + 10);
                        gcEnd = nc !== -1 ? nc : cs + 50000;
                    }
                    
                    const fullCase = fc2.slice(cs, gcEnd).trim();
                    if (!fullCase || fullCase.length < 5) return Shefzyreply('❌ Could not extract case code!');
                    
                    const CHUNK = 3000;
                    if (fullCase.length <= CHUNK) {
                        await Shefzyreply('📄 *' + args[0] + '* (' + fullCase.length + ' chars)\n\n' + fullCase);
                    } else {
                        const parts2 = Math.ceil(fullCase.length / CHUNK);
                        for (let pi = 0; pi < parts2; pi++) {
                            await sock.sendMessage(from, { 
                                text: '📄 *' + args[0] + '* [' + (pi+1) + '/' + parts2 + ']\n\n' + fullCase.slice(pi*CHUNK, (pi+1)*CHUNK)
                            }, { quoted: m });
                            if (pi < parts2 - 1) await new Promise(r => setTimeout(r, 700));
                        }
                    }
                } else if (command === 'addcase') {
                    // addcase <cmdname>
                    if (!args[0]) return Shefzyreply('❌ Usage: addcase <commandname>\nThen send the handler code in next message');
                    const newCmdName = args[0].toLowerCase();
                    const inlineCode2 = text.slice(args[0].length).trim();
                    const quotedCode2 = m.quoted?.text || '';
                    const newCmdCode = inlineCode2 || quotedCode2;

                    if (!newCmdCode) {
                        global._pendingAddcase = { cmd: newCmdName, waiter: sender };
                        setTimeout(() => { global._pendingAddcase = null; }, 120000);
                        return await Shefzyreply('📝 *AddCase: ' + newCmdName + '*\n\nSend the full handler code as next message OR reply to code with this command. (120s)\n\nExample:\nawait Shefzyreply(\'Hello World\');');
                    }
                    try {
                        // ✅ FIX: use async fs read
                        const fcAdd = await fsPromises.readFile(__filename, 'utf-8');
                        if (fcAdd.includes("case '" + newCmdName + "':")) {
                            return await Shefzyreply('❌ Case *' + newCmdName + '* exists! Use delcase first.');
                        }
                        // Properly indent each line of the code
                        const indentedCode = newCmdCode.split('\n').map(ln => '                ' + ln).join('\n');
                        const injection = "\n            case '" + newCmdName + "': {\n" + indentedCode + "\n                break;\n            }\n";
                        const insertAt = fcAdd.lastIndexOf("            default:");
                        if (insertAt === -1) return await Shefzyreply('❌ Injection point not found!');
                        const newFile = fcAdd.slice(0, insertAt) + injection + fcAdd.slice(insertAt);
                        await fsPromises.writeFile(__filename, newFile);
                        await Shefzyreply('✅ Case *' + newCmdName + '* added (' + newCmdCode.length + ' chars)!\nUse *' + prefix + 'restart* to activate.');
                    } catch (e) { await Shefzyreply('❌ Failed: ' + e.message); }

                } else if (command === 'delcase') {
                    // delcase <commandname>
                    const delCmd = args.join(' ').toLowerCase().trim();
                    if (!delCmd) return Shefzyreply('❌ Usage: delcase <commandname>\nExample: delcase tagall');
                    try {
                        // ✅ FIX: use async fs read
                        const fcDel = await fsPromises.readFile(__filename, 'utf-8');
                        const caseStart = fcDel.indexOf("case '" + delCmd + "':");
                        if (caseStart === -1) return await Shefzyreply('❌ Case *' + delCmd + '* not found!');
                        let searchFrom = caseStart + 20;
                        let blockEnd = fcDel.length;
                        const nextCase = fcDel.indexOf("\n            case '", searchFrom);
                        const nextDefault = fcDel.indexOf("\n            default:", searchFrom);
                        if (nextCase !== -1) blockEnd = Math.min(blockEnd, nextCase);
                        if (nextDefault !== -1) blockEnd = Math.min(blockEnd, nextDefault);
                        const removed = fcDel.slice(caseStart, blockEnd);
                        const newFileDel = fcDel.slice(0, caseStart) + fcDel.slice(blockEnd);
                        await fsPromises.writeFile(__filename, newFileDel);
                        await Shefzyreply('✅ Case *' + delCmd + '* deleted! Restart bot to apply.\n\n🗑️ Removed:\n```\n' + removed.slice(0, 300) + '\n```');
                    } catch (e) { await Shefzyreply('❌ Failed to delete case: ' + e.message); }
                }
                break;
            }


            //===================
            // EPHOTO TEXT EFFECTS
            //===================
            // Usage: .glitchtext MyName  →  sends styled text image

            case 'ephotostyles':
            case 'ephotolist': {
                const styleKeys = Object.keys(ephotoEffects);
                const styleList = styleKeys.map((k, i) => (i+1) + '. ' + prefix + k).join('\n');
                await Shefzyreply('✨ *Ephoto Text Effects (' + styleKeys.length + ')*\n\n' + styleList + '\n\nUsage: ' + prefix + '<style> <your text>');
                break;
            }

            case 'glitchtext': case 'pixelglitch': case 'neonglitch': case 'glitch2':
            case 'cyberpunk': case 'advancedglow': case 'neontext': case 'neonlight':
            case 'neonmetal': case 'writetext': case 'fogtext': case 'sandwriting':
            case 'graffiti': case 'typographytext': case 'flagtext': case 'goldflag':
            case '3dstone': case '3dmetal': case '3dchrome': case '3dgold':
            case 'gaminglogo': case 'cartoontext': case 'flame': case 'smoke':
            case 'ice': case 'rusticwood': case 'goldleaf': case 'chalkboard':
            case 'watercolor': case 'retro80s': case 'horror': case 'galaxy':
            case 'rainbow': case 'matrix': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + command + ' <your text>\nExample: ' + prefix + command + ' Michiko');
                const ephotoUrl = ephotoEffects[command];
                if (!ephotoUrl) return Shefzyreply('❌ Effect not found!');
                try {
                    await Shefzyreply('⏳ Generating *' + command + '* effect...');

                    // Step 1: Load the ephoto page to get the form/token fields
                    const pageRes = await axios.get(ephotoUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Referer': 'https://en.ephoto360.com/'
                        },
                        timeout: 20000
                    });

                    // Extract hidden token from the form
                    const tokenMatch = pageRes.data.match(/name="token"\s+value="([^"]+)"/);
                    const token = tokenMatch?.[1] || '';
                    // Extract the API endpoint from the form action
                    const actionMatch = pageRes.data.match(/action="([^"]+)"/);
                    const formAction = actionMatch?.[1] || ephotoUrl.replace('.html', '/');
                    // Extract style_id or effect id from the page
                    const styleIdMatch = pageRes.data.match(/name="style_id"\s+value="([^"]+)"/i) ||
                                         pageRes.data.match(/name="effect_id"\s+value="([^"]+)"/i);
                    const styleId = styleIdMatch?.[1] || '';

                    // Step 2: Submit the form with the text
                    const submitForm = new FormData();
                    submitForm.append('text[]', text);
                    if (token) submitForm.append('token', token);
                    if (styleId) submitForm.append('style_id', styleId);

                    const submitRes = await axios.post(formAction.startsWith('http') ? formAction : 'https://en.ephoto360.com' + formAction, submitForm, {
                        headers: {
                            ...submitForm.getHeaders(),
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': ephotoUrl,
                            'Origin': 'https://en.ephoto360.com'
                        },
                        timeout: 30000
                    });

                    // Step 3: Extract generated image URL from response
                    let imgUrl = null;
                    const resp = submitRes.data;

                    if (typeof resp === 'object') {
                        // JSON response — check all common fields
                        imgUrl = resp.image || resp.output || resp.url || resp.result || resp.data?.url || resp.data?.image;
                        // Sometimes it's an array
                        if (!imgUrl && Array.isArray(resp.data)) imgUrl = resp.data[0]?.url || resp.data[0];
                        if (!imgUrl && Array.isArray(resp)) imgUrl = resp[0]?.url || resp[0];
                    } else if (typeof resp === 'string') {
                        // HTML or plain string response
                        const patterns = [
                            /"output":\s*"(https:[^"]+)"/,
                            /"image":\s*"(https:[^"]+)"/,
                            /"url":\s*"(https:[^"]+\.(?:png|jpg|jpeg|webp))"/i,
                            /src="(https:\/\/[^"]*ephoto360[^"]*\.(?:png|jpg|jpeg))"/i,
                            /(https:\/\/(?:files|out|images|cdn)\.ephoto360\.com\/[^"'\s<>]+\.(?:png|jpg|jpeg))/i,
                            /"(https:\/\/[^"]+\.(?:png|jpg|jpeg|webp))"/i,
                        ];
                        for (const pat of patterns) {
                            const m2 = resp.match(pat);
                            if (m2?.[1]) { imgUrl = m2[1]; break; }
                        }
                    }

                    // Validate URL
                    if (imgUrl && !imgUrl.startsWith('http')) imgUrl = 'https://en.ephoto360.com' + imgUrl;

                    if (imgUrl) {
                        try {
                            await sock.sendMessage(from, {
                                image: { url: imgUrl },
                                caption: '✨ *' + command.toUpperCase() + ' Effect*\n\n📝 Text: ' + text
                            }, { quoted: m });
                        } catch {
                            // If URL doesn't load, try downloading first
                            const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
                            await sock.sendMessage(from, {
                                image: Buffer.from(imgBuf.data),
                                caption: '✨ *' + command.toUpperCase() + ' Effect*\n\n📝 Text: ' + text
                            }, { quoted: m });
                        }
                    } else {
                        // Fallback: screenshot with thum.io (no adblock issues since it renders server-side)
                        const thumUrl = 'https://image.thum.io/get/width/1000/crop/600/allowJPG/noanimate/' + ephotoUrl;
                        await sock.sendMessage(from, {
                            image: { url: thumUrl },
                            caption: '✨ *' + command + '*\n📝 ' + text + '\n\n⚠️ Screenshot fallback — visit link for full effect:\n' + ephotoUrl
                        }, { quoted: m });
                    }
                } catch (e) {
                    console.log('ephoto error:', e.message);
                    // Provide direct link as fallback
                    await Shefzyreply('🎨 *' + command.toUpperCase() + ' Effect*\n\n👉 Generate here:\n' + ephotoUrl + '\n\nType your text on the site and download the image!');
                }
                break;
            }

// SPORTS SECTION — 12 COMMANDS

case 'livescore':
case 'scores': {
    try {
        const lsRes = await axios.get('https://www.thesportsdb.com/api/v1/json/3/eventslive.php', { timeout: 12000 });
        const events = lsRes.data?.events || [];
        if (!events.length) return Shefzyreply('⚽ No live matches right now!\n\nCheck back during match time.');
        const evText = events.slice(0, 8).map((ev, i) =>
            `${i+1}. 🏟️ *${ev.strHomeTeam}* vs *${ev.strAwayTeam}*\n` +
            `   🏆 ${ev.strLeague}\n` +
            `   📊 ${ev.intHomeScore ?? '?'} - ${ev.intAwayScore ?? '?'}\n` +
            `   🕐 ${ev.strProgress || ev.strStatus || 'Live'}`
        ).join('\n\n');
        await Shefzyreply('🔴 *Live Scores*\n\n' + evText);
    } catch (e) {
        await Shefzyreply('❌ Failed to fetch live scores: ' + e.message);
    }
    break;
}

case 'fixtures':
case 'schedule': {
    const fixLeague = (args[0] || 'epl').toLowerCase();
    const leagueIds = {
        epl: 4328, laliga: 4335, ucl: 4480, bundesliga: 4331,
        seriea: 4332, mls: 4346, ligue1: 4334, eredivisie: 4337,
        liganos: 4344, brasileirao: 4351
    };
    const leagueId = leagueIds[fixLeague] || 4328;
    try {
        const fxRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`, { timeout: 12000 });
        const events = fxRes.data?.events || [];
        if (!events.length) return Shefzyreply('❌ No upcoming fixtures found!');
        const fxText = events.slice(0, 8).map((ev, i) =>
            `${i+1}. *${ev.strHomeTeam}* vs *${ev.strAwayTeam}*\n` +
            `   📅 ${ev.dateEvent} ${ev.strTime || ''}\n` +
            `   🏆 ${ev.strLeague || ''}`
        ).join('\n\n');
        await Shefzyreply(`📅 *Upcoming Fixtures — ${fixLeague.toUpperCase()}*\n\n${fxText}\n\nLeagues: epl, laliga, ucl, bundesliga, seriea, ligue1, mls`);
    } catch (e) {
        await Shefzyreply('❌ Failed to get fixtures: ' + e.message);
    }
    break;
}

case 'sportnews':
case 'sportsnews': {
    const sportQuery = text || 'football';
    try {
        await Shefzyreply('📰 Fetching sport news for: *' + sportQuery + '*...');
        // Use NewsData.io
        const snRes = await axios.get('https://newsdata.io/api/1/news', {
            params: {
                apikey: config.newsdataApiKey || '',
                q: sportQuery,
                category: 'sports',
                language: 'en',
                size: 6
            },
            timeout: 15000
        });
        const articles = snRes.data?.results || [];
        if (!articles.length) return Shefzyreply('❌ No sport news found for: ' + sportQuery);
        const newsText = articles.map((a, i) =>
            `${i+1}. *${a.title}*\n   📰 ${a.source_id || 'News'} | 📅 ${(a.pubDate || '').split(' ')[0]}\n   🔗 ${a.link || ''}`
        ).join('\n\n');
        await Shefzyreply(`📰 *Sport News — ${sportQuery}*\n\n${newsText}`);
    } catch (e) {
        // Fallback: HackerNews sports
        try {
            const hnRes = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 10000 });
            await Shefzyreply('📰 Visit BBC Sport for latest news:\nhttps://www.bbc.com/sport\n\nOr ESPN:\nhttps://www.espn.com/');
        } catch {
            await Shefzyreply('❌ Sport news fetch failed: ' + e.message);
        }
    }
    break;
}

case 'teaminfo':
case 'team': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'team <team name>\nExample: team Arsenal');
    try {
        await Shefzyreply('🔍 Searching for: *' + text + '*...');
        const tRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(text)}`, { timeout: 12000 });
        const team = tRes.data?.teams?.[0];
        if (!team) return Shefzyreply('❌ Team not found: ' + text);
        const info =
            `🏟️ *${team.strTeam}*\n\n` +
            `🌍 Country: ${team.strCountry || 'N/A'}\n` +
            `🏆 League: ${team.strLeague || 'N/A'}\n` +
            `📅 Founded: ${team.intFormedYear || 'N/A'}\n` +
            `🏟️ Stadium: ${team.strStadium || 'N/A'}\n` +
            `👥 Capacity: ${team.intStadiumCapacity ? Number(team.intStadiumCapacity).toLocaleString() : 'N/A'}\n` +
            `📍 Location: ${team.strStadiumLocation || 'N/A'}\n` +
            `🌐 Website: ${team.strWebsite ? 'https://' + team.strWebsite : 'N/A'}\n\n` +
            `📝 ${(team.strDescriptionEN || 'No description available').slice(0, 300)}...`;
        const badge = team.strTeamBadge;
        if (badge) {
            await sock.sendMessage(from, { image: { url: badge }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Team search failed: ' + e.message);
    }
    break;
}

case 'playerinfo':
case 'player': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'player <player name>\nExample: player Ronaldo');
    try {
        await Shefzyreply('🔍 Searching for: *' + text + '*...');
        const pRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(text)}`, { timeout: 12000 });
        const player = pRes.data?.player?.[0];
        if (!player) return Shefzyreply('❌ Player not found: ' + text);
        const info =
            `⚽ *${player.strPlayer}*\n\n` +
            `🏳️ Nationality: ${player.strNationality || 'N/A'}\n` +
            `📅 Born: ${player.dateBorn || 'N/A'}\n` +
            `📍 Birthplace: ${player.strBirthLocation || 'N/A'}\n` +
            `🏟️ Team: ${player.strTeam || 'N/A'}\n` +
            `🎽 Position: ${player.strPosition || 'N/A'}\n` +
            `👟 Number: ${player.strNumber || 'N/A'}\n` +
            `📏 Height: ${player.strHeight || 'N/A'}\n` +
            `⚖️ Weight: ${player.strWeight || 'N/A'}\n\n` +
            `📝 ${(player.strDescriptionEN || 'No description available').slice(0, 300)}...`;
        const thumb = player.strThumb || player.strCutout;
        if (thumb) {
            await sock.sendMessage(from, { image: { url: thumb }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ Player search failed: ' + e.message);
    }
    break;
}

case 'standings':
case 'table': {
    const standLeague = (args[0] || 'epl').toLowerCase();
    const standIds = {
        epl: 4328, laliga: 4335, bundesliga: 4331,
        seriea: 4332, ligue1: 4334, eredivisie: 4337
    };
    const standId = standIds[standLeague];
    if (!standId) return Shefzyreply('❌ Supported leagues: epl, laliga, bundesliga, seriea, ligue1, eredivisie');
    try {
        const stRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${standId}&s=2024-2025`, { timeout: 15000 });
        const table = stRes.data?.table || [];
        if (!table.length) return Shefzyreply('❌ Standings not available right now.');
        const header = `📊 *${standLeague.toUpperCase()} Standings 2024/25*\n\n` +
            `${'Pos'.padEnd(4)}${'Team'.padEnd(22)}${'P'.padEnd(4)}${'W'.padEnd(4)}${'D'.padEnd(4)}${'L'.padEnd(4)}${'Pts'}\n` +
            '─'.repeat(45) + '\n';
        const rows = table.slice(0, 20).map(t =>
            `${String(t.intRank).padEnd(4)}${t.strTeam.slice(0, 18).padEnd(22)}${String(t.intPlayed).padEnd(4)}${String(t.intWin).padEnd(4)}${String(t.intDraw).padEnd(4)}${String(t.intLoss).padEnd(4)}${t.intPoints}`
        ).join('\n');
        await Shefzyreply('```\n' + header + rows + '\n```');
    } catch (e) {
        await Shefzyreply('❌ Failed to fetch standings: ' + e.message);
    }
    break;
}

case 'leagueinfo':
case 'league': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'league <league name>\nExample: league Premier League');
    try {
        const lgRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?c=England`, { timeout: 12000 });
        const allLeagues = lgRes.data?.leagues || [];
        // Search by name
        const lgSearchRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?l=${encodeURIComponent(text)}`, { timeout: 12000 });
        const league = lgSearchRes.data?.leagues?.[0] || allLeagues.find(l => l.strLeague.toLowerCase().includes(text.toLowerCase()));
        if (!league) return Shefzyreply('❌ League not found: ' + text);
        const info =
            `🏆 *${league.strLeague}*\n\n` +
            `🌍 Country: ${league.strCountry || 'N/A'}\n` +
            `⚽ Sport: ${league.strSport || 'N/A'}\n` +
            `📅 Formed: ${league.intFormedYear || 'N/A'}\n` +
            `🌐 Website: ${league.strWebsite ? 'https://' + league.strWebsite : 'N/A'}\n` +
            `📺 TV: ${league.strTvRights || 'N/A'}\n\n` +
            `📝 ${(league.strDescriptionEN || 'No description available').slice(0, 300)}...`;
        const badge = league.strBadge || league.strLogo;
        if (badge) {
            await sock.sendMessage(from, { image: { url: badge }, caption: info }, { quoted: m });
        } else {
            await Shefzyreply(info);
        }
    } catch (e) {
        await Shefzyreply('❌ League info failed: ' + e.message);
    }
    break;
}

case 'h2h':
case 'headtohead': {
    if (args.length < 2) return Shefzyreply('❌ Usage: ' + prefix + 'h2h <team1> vs <team2>\nExample: h2h Arsenal vs Chelsea');
    try {
        // Parse "team1 vs team2"
        const fullText = text.toLowerCase();
        const vsIndex = fullText.indexOf(' vs ');
        if (vsIndex === -1) return Shefzyreply('❌ Format: h2h <team1> vs <team2>');
        const team1 = text.slice(0, vsIndex).trim();
        const team2 = text.slice(vsIndex + 4).trim();

        await Shefzyreply('🔍 Fetching H2H for *' + team1 + '* vs *' + team2 + '*...');

        // Get team IDs
        const t1Res = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(team1)}`, { timeout: 10000 });
        const t2Res = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(team2)}`, { timeout: 10000 });
        const t1 = t1Res.data?.teams?.[0];
        const t2 = t2Res.data?.teams?.[0];

        if (!t1) return Shefzyreply('❌ Team not found: ' + team1);
        if (!t2) return Shefzyreply('❌ Team not found: ' + team2);

        // Get last 5 H2H events
        const h2hRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/eventsh2h.php?idHomeTeam=${t1.idTeam}&idAwayTeam=${t2.idTeam}`, { timeout: 12000 });
        const events = h2hRes.data?.events || [];

        if (!events.length) {
            return Shefzyreply(`⚔️ *${t1.strTeam}* vs *${t2.strTeam}*\n\nNo H2H history found.`);
        }

        let t1Wins = 0, t2Wins = 0, draws = 0;
        const recent = events.slice(-5).reverse().map(ev => {
            const hScore = parseInt(ev.intHomeScore) || 0;
            const aScore = parseInt(ev.intAwayScore) || 0;
            const isT1Home = ev.strHomeTeam.toLowerCase().includes(team1.toLowerCase());
            const t1Score = isT1Home ? hScore : aScore;
            const t2Score = isT1Home ? aScore : hScore;
            if (t1Score > t2Score) t1Wins++;
            else if (t2Score > t1Score) t2Wins++;
            else draws++;
            return `📅 ${ev.dateEvent}\n   ${ev.strHomeTeam} ${hScore} - ${aScore} ${ev.strAwayTeam}`;
        });

        await Shefzyreply(
            `⚔️ *H2H: ${t1.strTeam} vs ${t2.strTeam}*\n\n` +
            `📊 *Last ${recent.length} Meetings:*\n` +
            `🟢 ${t1.strTeam} Wins: *${t1Wins}*\n` +
            `🔴 ${t2.strTeam} Wins: *${t2Wins}*\n` +
            `🟡 Draws: *${draws}*\n\n` +
            `📋 *Recent Results:*\n${recent.join('\n\n')}`
        );
    } catch (e) {
        await Shefzyreply('❌ H2H search failed: ' + e.message);
    }
    break;
}

case 'sporttrivia':
case 'sportquiz': {
    const sqKey = from + '_sportquiz';
    if (gameSessions.has(sqKey)) {
        const sq = gameSessions.get(sqKey);
        if (Date.now() > sq.expires) {
            gameSessions.delete(sqKey);
        } else {
            return Shefzyreply('⚠️ A quiz is still running!\nAnswer: ' + prefix + 'sportanswer <guess>\nSkip: ' + prefix + 'sportanswer skip');
        }
    }
    const questions = [
        { q: 'Which country won the 2022 FIFA World Cup?', a: 'argentina' },
        { q: 'How many players are on a basketball team on the court?', a: '5' },
        { q: 'Which club has won the most UEFA Champions League titles?', a: 'real madrid' },
        { q: 'In tennis, what is a score of zero called?', a: 'love' },
        { q: 'How many holes are in a standard round of golf?', a: '18' },
        { q: 'Which country invented the game of cricket?', a: 'england' },
        { q: 'How many rings are on the Olympic flag?', a: '5' },
        { q: 'What sport is played at Wimbledon?', a: 'tennis' },
        { q: 'How long is a standard football match in minutes?', a: '90' },
        { q: 'Which NBA team has won the most championships?', a: 'boston celtics' },
        { q: 'What sport does Usain Bolt compete in?', a: 'sprinting' },
        { q: 'How many players are on a volleyball team on the court?', a: '6' },
        { q: 'Which country hosted the 2016 Summer Olympics?', a: 'brazil' },
        { q: 'What is the maximum score in a single bowling frame?', a: '30' },
        { q: 'In which sport would you perform a slam dunk?', a: 'basketball' },
    ];
    const quiz = questions[Math.floor(Math.random() * questions.length)];
    gameSessions.set(sqKey, { answer: quiz.a, expires: Date.now() + 40000 });
    await Shefzyreply(
        '🏆 *Sport Trivia!*\n\n' +
        '❓ ' + quiz.q + '\n\n' +
        'Answer: ' + prefix + 'sportanswer <answer> (40s)'
    );
    setTimeout(() => {
        if (gameSessions.has(sqKey)) {
            gameSessions.delete(sqKey);
            sock.sendMessage(from, { text: '⏰ Time\'s up! The answer was: *' + quiz.a + '*' });
        }
    }, 40000);
    break;
}

case 'sportanswer':
case 'sportans': {
    const sqKey2 = from + '_sportquiz';
    if (!gameSessions.has(sqKey2)) return Shefzyreply('❌ No sport quiz running! Start with: ' + prefix + 'sporttrivia');
    const sq = gameSessions.get(sqKey2);
    if (Date.now() > sq.expires) {
        gameSessions.delete(sqKey2);
        return Shefzyreply('⏰ Time\'s up! The answer was: *' + sq.answer + '*');
    }
    const guess = text.toLowerCase().trim();
    gameSessions.delete(sqKey2);
    if (guess === 'skip') return Shefzyreply('⏭️ Skipped! The answer was: *' + sq.answer + '*');
    if (guess === sq.answer || sq.answer.includes(guess) || guess.includes(sq.answer.split(' ')[0])) {
        await Shefzyreply('🎉 *Correct!* The answer was *' + sq.answer + '*!\n\n🏆 Well done @' + senderNumber + '!');
    } else {
        await Shefzyreply('❌ Wrong! The answer was *' + sq.answer + '*\nYou guessed: *' + guess + '*');
    }
    break;
}

case 'transfernews':
case 'transfers': {
    const transferQuery = text || 'transfer football 2025';
    try {
        await Shefzyreply('📰 Fetching transfer news...');
        const trRes = await axios.get('https://newsdata.io/api/1/news', {
            params: {
                apikey: config.newsdataApiKey || '',
                q: transferQuery,
                category: 'sports',
                language: 'en',
                size: 5
            },
            timeout: 15000
        });
        const articles = trRes.data?.results || [];
        if (!articles.length) {
            return Shefzyreply(
                '📰 *Transfer News*\n\n' +
                'No recent articles found.\n\n' +
                '🔗 Check these sources:\n' +
                '• https://www.transfermarkt.com\n' +
                '• https://www.fabrizio-romano.com\n' +
                '• https://www.skysports.com/transfers'
            );
        }
        const tText = articles.map((a, i) =>
            `${i+1}. *${a.title}*\n   📰 ${a.source_id || 'News'}\n   🔗 ${a.link || ''}`
        ).join('\n\n');
        await Shefzyreply('🔄 *Transfer News*\n\n' + tText);
    } catch (e) {
        await Shefzyreply(
            '📰 *Transfer News*\n\n' +
            '🔗 Check latest transfers:\n' +
            '• https://www.transfermarkt.com\n' +
            '• https://www.skysports.com/transfers'
        );
    }
    break;
}

case 'sportstats':
case 'teamstats': {
    if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'sportstats <team name>\nExample: sportstats Manchester City');
    try {
        await Shefzyreply('📊 Fetching stats for: *' + text + '*...');
        const stRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(text)}`, { timeout: 12000 });
        const team = stRes.data?.teams?.[0];
        if (!team) return Shefzyreply('❌ Team not found: ' + text);

        // Get last 5 events
        const evRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${team.idTeam}`, { timeout: 12000 });
        const lastEvents = evRes.data?.results || [];

        // Get next events
        const nextRes = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${team.idTeam}`, { timeout: 12000 });
        const nextEvents = nextRes.data?.events || [];

        let wins = 0, losses = 0, draws = 0, goalsFor = 0, goalsAgainst = 0;
        lastEvents.slice(0, 5).forEach(ev => {
            const isHome = ev.strHomeTeam.toLowerCase().includes(text.toLowerCase());
            const teamScore = isHome ? parseInt(ev.intHomeScore) : parseInt(ev.intAwayScore);
            const oppScore = isHome ? parseInt(ev.intAwayScore) : parseInt(ev.intHomeScore);
            if (!isNaN(teamScore) && !isNaN(oppScore)) {
                goalsFor += teamScore;
                goalsAgainst += oppScore;
                if (teamScore > oppScore) wins++;
                else if (teamScore < oppScore) losses++;
                else draws++;
            }
        });

        const recentForm = lastEvents.slice(0, 5).map(ev => {
            const isHome = ev.strHomeTeam.toLowerCase().includes(text.toLowerCase());
            const teamScore = isHome ? parseInt(ev.intHomeScore) : parseInt(ev.intAwayScore);
            const oppScore = isHome ? parseInt(ev.intAwayScore) : parseInt(ev.intHomeScore);
            if (teamScore > oppScore) return '🟢';
            if (teamScore < oppScore) return '🔴';
            return '🟡';
        }).join(' ');

        const nextMatch = nextEvents[0];

        let msg =
            `📊 *${team.strTeam} — Stats*\n\n` +
            `🏆 League: ${team.strLeague || 'N/A'}\n` +
            `🌍 Country: ${team.strCountry || 'N/A'}\n\n` +
            `📋 *Last 5 Games:*\n` +
            `${recentForm || 'No data'}\n` +
            `✅ Wins: ${wins} | ❌ Loss: ${losses} | 🟡 Draw: ${draws}\n` +
            `⚽ Goals For: ${goalsFor} | Against: ${goalsAgainst}\n`;

        if (nextMatch) {
            msg += `\n📅 *Next Match:*\n${nextMatch.strHomeTeam} vs ${nextMatch.strAwayTeam}\n📆 ${nextMatch.dateEvent} ${nextMatch.strTime || ''}`;
        }

        const badge = team.strTeamBadge;
        if (badge) {
            await sock.sendMessage(from, { image: { url: badge }, caption: msg }, { quoted: m });
        } else {
            await Shefzyreply(msg);
        }
    } catch (e) {
        await Shefzyreply('❌ Stats fetch failed: ' + e.message);
    }
    break;
}

            //===================
            // STABLE FREE API COMMANDS
            //===================
            // (replacing heavstal/kord/omegatech which are offline)

            case 'joke': {
                try {
                    // jokeapi is reliable — try it
                    const jokeRes = await axios.get('https://v2.jokeapi.dev/joke/Programming,Miscellaneous?blacklistFlags=nsfw,racist,sexist,explicit', { timeout: 12000 });
                    const j = jokeRes.data;
                    if (!j || j.error) throw new Error('bad response');
                    const jokeText = j.type === 'twopart' ? j.setup + '\n\n😂 ' + j.delivery : j.joke;
                    await Shefzyreply('😂 *Joke*\n\n' + jokeText);
                } catch {
                    try {
                        // fallback: official joke API
                        const j2 = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 10000 });
                        await Shefzyreply('😂 *Joke*\n\n' + j2.data.setup + '\n\n😂 ' + j2.data.punchline);
                    } catch { await Shefzyreply('❌ Failed to fetch joke!'); }
                }
                break;
            }

            case 'fact':
            case 'randomfact': {
                try {
                    const factRes = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 12000 });
                    if (!factRes.data?.text) throw new Error('no text');
                    await Shefzyreply('🧠 *Random Fact*\n\n' + factRes.data.text);
                } catch {
                    try {
                        const factRes2 = await axios.get('https://api.api-ninjas.com/v1/facts?limit=1', {
                            headers: { 'X-Api-Key': 'Kuo5cZ3ZmMM6uaMGJxxMnA==S8vBDvL3bJbUMnYP' },
                            timeout: 10000
                        });
                        await Shefzyreply('🧠 *Random Fact*\n\n' + (factRes2.data?.[0]?.fact || 'No fact found'));
                    } catch {
                        await Shefzyreply('🧠 *Fun Fact*\n\nA group of flamingos is called a flamboyance!');
                    }
                }
                break;
            }

            case 'quote':
            case 'inspiration': {
                try {
                    const qRes = await axios.get('https://zenquotes.io/api/random', { timeout: 12000 });
                    if (!qRes.data?.[0]?.q) throw new Error('no quote');
                    const q = qRes.data[0];
                    await Shefzyreply('💭 *Quote*\n\n_"' + q.q + '"_\n\n— *' + q.a + '*');
                } catch {
                    try {
                        const q2 = await axios.get('https://api.quotable.io/random', { timeout: 10000 });
                        await Shefzyreply('💭 *Quote*\n\n_"' + q2.data.content + '"_\n\n— *' + q2.data.author + '*');
                    } catch {
                        const localQuotes = [
                            { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
                            { q: 'In the middle of every difficulty lies opportunity.', a: 'Albert Einstein' },
                            { q: 'It does not matter how slowly you go as long as you do not stop.', a: 'Confucius' },
                        ];
                        const lq = localQuotes[Math.floor(Math.random()*localQuotes.length)];
                        await Shefzyreply('💭 *Quote*\n\n_"' + lq.q + '"_\n\n— *' + lq.a + '*');
                    }
                }
                break;
            }

            case 'cat':
            case 'catpic': {
                try {
                    const catRes = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 10000 });
                    const catUrl = catRes.data[0]?.url;
                    if (catUrl) await sock.sendMessage(from, { image: { url: catUrl }, caption: '🐱 *Random Cat!*' }, { quoted: m });
                } catch { await Shefzyreply('❌ Failed to fetch cat!'); }
                break;
            }

            case 'dog':
            case 'dogpic': {
                try {
                    const dogRes = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
                    const dogUrl = dogRes.data.message;
                    if (dogUrl) await sock.sendMessage(from, { image: { url: dogUrl }, caption: '🐶 *Random Dog!*' }, { quoted: m });
                } catch { await Shefzyreply('❌ Failed to fetch dog!'); }
                break;
            }

            case 'meme': {
                try {
                    const memeRes = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
                    const meme = memeRes.data;
                    if (!meme?.url) throw new Error('no meme');
                    await sock.sendMessage(from, { image: { url: meme.url }, caption: '😂 *' + meme.title + '*\n\n👍 ' + meme.ups + ' | r/' + meme.subreddit }, { quoted: m });
                } catch { await Shefzyreply('❌ Failed to fetch meme!'); }
                break;
            }

            case 'nasa':
            case 'apod': {
                try {
                    const nasaRes = await axios.get('https://api.nasa.gov/planetary/apod', {
                        params: { api_key: config.nasaApiKey || 'DEMO_KEY' },
                        timeout: 15000
                    });
                    const apod = nasaRes.data;
                    const nasaText = '🌌 *NASA: Astronomy Picture of the Day*\n\n📌 ' + apod.title + '\n📅 ' + apod.date + '\n\n📝 ' + (apod.explanation?.slice(0,400) || '');
                    if (apod.media_type === 'image') {
                        await sock.sendMessage(from, { image: { url: apod.url }, caption: nasaText }, { quoted: m });
                    } else {
                        await Shefzyreply(nasaText + '\n\n🔗 ' + apod.url);
                    }
                } catch { await Shefzyreply('❌ Failed to fetch NASA APOD!'); }
                break;
            }

            case 'currency':
            case 'convert': {
                // Usage: currency 100 USD NGN
                const [convAmt, convFrom, convTo] = args;
                if (!convAmt || !convFrom || !convTo) return Shefzyreply('❌ Usage: currency <amount> <from> <to>\nExample: currency 100 USD NGN');
                try {
                    const convRes = await axios.get('https://open.er-api.com/v6/latest/' + convFrom.toUpperCase(), { timeout: 10000 });
                    const rate = convRes.data?.rates?.[convTo.toUpperCase()];
                    if (!rate) return Shefzyreply('❌ Invalid currency code!');
                    const result = (parseFloat(convAmt) * rate).toFixed(2);
                    await Shefzyreply('💱 *Currency Conversion*\n\n' + convAmt + ' ' + convFrom.toUpperCase() + ' = *' + result + ' ' + convTo.toUpperCase() + '*\n\nRate: 1 ' + convFrom.toUpperCase() + ' = ' + rate.toFixed(4) + ' ' + convTo.toUpperCase());
                } catch { await Shefzyreply('❌ Currency conversion failed!'); }
                break;
            }

            case 'news': {
                const newsTopic = text || 'technology';
                try {
                    // Use newsdata.io free tier — no key needed for basic
                    const newsRes = await axios.get('https://newsdata.io/api/1/news', {
                        params: { apikey: config.newsdataApiKey || '', q: newsTopic, language: 'en', size: 5 },
                        timeout: 12000
                    });
                    const articles = newsRes.data?.results || [];
                    if (articles.length) {
                        const newsList = articles.map((a, i) => (i+1) + '. *' + a.title + '*\n   🔗 ' + (a.link || '')).join('\n\n');
                        return await Shefzyreply('📰 *News: ' + newsTopic + '*\n\n' + newsList);
                    }
                } catch {}
                // Reliable fallback: HackerNews (no key needed)
                try {
                    const hnRes = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 12000 });
                    const top5 = hnRes.data.slice(0, 5);
                    const stories = await Promise.all(top5.map(id =>
                        axios.get('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', { timeout: 6000 }).then(r => r.data).catch(() => null)
                    ));
                    const hnText = stories.filter(Boolean).map((s, i) =>
                        (i+1) + '. *' + s.title + '*\n   👍 ' + s.score + ' pts | 🔗 ' + (s.url || 'https://news.ycombinator.com/item?id=' + s.id)
                    ).join('\n\n');
                    await Shefzyreply('📰 *Top Tech News*\n\n' + hnText);
                } catch { await Shefzyreply('❌ Failed to fetch news!'); }
                break;
            }

            case 'lyrics':
            case 'lyric2':
            case 'lyric': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'lyrics <song name>\nExample: lyrics Blinding Lights');
                try {
                    await Shefzyreply('🎵 Searching lyrics for: *' + text + '*...');

                    const hvLyRes = await axios.post('https://heavstal.com.ng/api/v1/lyrics', {
                        query: text.trim()
                    }, {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': HEAVSTAL_KEY
                        },
                        timeout: 20000
                    }); 

                    const res = hvLyRes.data;
                    if (res.status === 'success' && res.data) {
                        const { title, artist, image, lyrics: lyricText, url: lyricUrl } = res.data;
                        const full = lyricText || '';
                        const truncated = full.slice(0, 3000) + (full.length > 3000 ? '\n\n_(truncated)_' : '');
                        const lyMsg = '🎧 *Now Playing*\n\n🎵 *' + title + '*\n👤 *' + artist + '*\n\n📝 *Lyrics:*\n' + truncated;

                        await sock.sendMessage(from, {
                            text: lyMsg,
                            contextInfo: {
                                externalAdReply: {
                                    title: title || 'Lyrics',
                                    body: artist || '',
                                    thumbnailUrl: image || undefined,
                                    mediaType: 1,
                                    previewType: 0,
                                    renderLargerThumbnail: true,
                                    sourceUrl: lyricUrl || 'https://open.spotify.com'
                                }
                            }
                        }, { quoted: m });
                    } else {
                        // Fallback: lyrist.vercel.app
                        const lyFb = await axios.get('https://lyrist.vercel.app/api/' + encodeURIComponent(text), { timeout: 15000 });
                        if (lyFb.data?.lyrics) {
                            const ld = lyFb.data;
                            const lyMsg2 = '🎵 *' + (ld.title || text) + '*\n👤 ' + (ld.artist || '') + '\n\n' + ld.lyrics.slice(0, 3000);
                            if (ld.image) {
                                await sock.sendMessage(from, { image: { url: ld.image }, caption: lyMsg2 }, { quoted: m });
                            } else {
                                await Shefzyreply(lyMsg2);
                            }
                        } else {
                            await Shefzyreply('❌ Lyrics not found for: *' + text + '*');
                        }
                    }
                } catch (e) {
                    console.log('lyrics error:', e.message);
                    await Shefzyreply('❌ Lyrics search failed: ' + e.message);
                }
                break;
            }
            case 'colorinfo':
            case 'color': {
                if (!text) return Shefzyreply('❌ Usage: color <hex>\nExample: color FF5733 or color #FF5733');
                try {
                    const colorQuery = text.replace(/^#/, '').trim().toUpperCase();
                    // Validate hex
                    if (!/^[0-9A-F]{3,6}$/.test(colorQuery)) return Shefzyreply('❌ Invalid hex color! Use format: FF5733');
                    const colRes = await axios.get('https://www.thecolorapi.com/id?hex=' + colorQuery, { timeout: 12000 });
                    const col = colRes.data;
                    // Use colorhexa for image (more reliable than singlecolorimage)
                    const imgUrl = 'https://www.colorhexa.com/' + colorQuery + '.png';
                    const colTxt = '🎨 *Color: #' + colorQuery + '*\n\n📌 Name: ' + (col.name?.value || 'Unknown') + '\n#️⃣ HEX: #' + colorQuery + '\n🔴 RGB: ' + (col.rgb?.value || 'N/A') + '\n🟡 HSL: ' + (col.hsl?.value || 'N/A') + '\n🔵 HSV: ' + (col.hsv?.value || 'N/A');
                    await sock.sendMessage(from, { image: { url: imgUrl }, caption: colTxt }, { quoted: m });
                } catch (e) {
                    console.log('color error:', e.message);
                    await Shefzyreply('❌ Failed to get color info! Use hex without # sign.');
                }
                break;
            }

            case 'numberfact': {
                const numArg = args[0] || Math.floor(Math.random() * 1000);
                try {
                    // numbersapi uses http — some servers block it. Use https wrapper
                    const nfRes = await axios.get('https://numbersapi.p.rapidapi.com/' + numArg + '/trivia', {
                        headers: { 'X-RapidAPI-Key': config.rapidApiKey || 'demo', 'X-RapidAPI-Host': 'numbersapi.p.rapidapi.com' },
                        timeout: 10000
                    });
                    await Shefzyreply('🔢 *Number Fact: ' + numArg + '*\n\n' + nfRes.data);
                } catch {
                    try {
                        // Direct HTTP fallback
                        const nf2 = await axios.get('http://numbersapi.com/' + numArg, { timeout: 10000 });
                        await Shefzyreply('🔢 *Number Fact*\n\n' + nf2.data);
                    } catch {
                        const localFacts = [
                            numArg + ' is a number in mathematics.',
                            'The number ' + numArg + ' has interesting properties.',
                            numArg + ' appears in many sequences.',
                        ];
                        await Shefzyreply('🔢 *Number: ' + numArg + '*\n\n' + localFacts[Math.floor(Math.random()*localFacts.length)]);
                    }
                }
                break;
            }


            //===================
            // AI MENU
            //===================

            //===================
            // NEWER COMMANDS — bodies live in utils/extraCommands.js (same parser, permissions and reply helper)
            //===================
            case 'mention':
            case 'grouptag':
            case 'ad':
            case 'campaigns':
            case 'summarize':
            case 'summary':
            case 'tldr':
            case 'rewrite':
            case 'explain':
            case 'botinfo':
            case 'sessioninfo':
            case 'status':
            case 'timezone':
            case 'stats':
            case 'maintenance': {
                await EXTRA.run(command, {
                    sock, m, from, sender, body, args, text, prefix, isGroup, isCreator, isSudo, isAdmin, isBotAdmin,
                    isGlobalOwner, isBotOwner, botNumberRaw, senderNumberRaw, userSetting, updateUserSettings,
                    reply: Shefzyreply, imageToSticker, videoToSticker,
                    stickerPack: config.stickerPackname || config.botName, stickerAuthor: config.stickerAuthor || config.botOwner
                });
                break;
            }

            case 'ai':
            case 'ai':
            case 'ask':
            case 'gpt': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'ask <your question>');
                try {
                    await sock.sendPresenceUpdate('composing', from);
                    const aiRes = await AIP.askAI(text);
                    if (aiRes.ok) {
                        await Shefzyreply(aiRes.text.slice(0, 3500));            // just the answer: no provider/model banner
                    } else {
                        console.log('[ai] every provider failed: ' + AIP.describeFailure(aiRes).replace(/\n+/g, ' | '));   // owner diagnostics: SERVER LOG ONLY
                        // Second chance through the shared Michiko brain (its own keys). This is NOT chatbot mode and stores no history.
                        let fb = null;
                        try { fb = await getMichikoReply(config, [], text, { enableTools: false, rateLimitKey: 'ai|' + botNumberRaw + '|' + sender }); } catch (e2) { /* fall through to the generic message */ }
                        // Michiko's canned "brain is lagging" / hostile lines are not answers for a plain .ai question
                        await Shefzyreply(fb && fb !== AI_FAILURE_REPLY && fb !== HOSTILE_REPLY ? fb : AIP.USER_UNAVAILABLE);
                    }
                } catch (e) {
                    console.log('ask error:', e.message);
                    await Shefzyreply(AIP.USER_UNAVAILABLE);
                }
                break;
            }

            case 'imagine':
            case 'imagine-ai':
            case 'aiimage': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'imagine <description>');
                try {
                    if (!config.togetherApiKey && !config.stabilityApiKey) {
                        return Shefzyreply('❌ Add togetherApiKey or stabilityApiKey to config.js\nGet free key: api.together.xyz');
                    }
                    await Shefzyreply('🎨 Generating image...');
                    let imgUrl = null;

                    if (config.togetherApiKey) {
                        try {
                            const imgRes = await axios.post('https://api.together.xyz/v1/images/generations', {
                                model: 'stabilityai/stable-diffusion-xl-base-1.0',
                                prompt: text, n: 1, width: 512, height: 512
                            }, { headers: { Authorization: 'Bearer ' + config.togetherApiKey }, timeout: 60000, responseType: 'json' });
                            imgUrl = imgRes.data?.data?.[0]?.url;
                        } catch {}
                    }
                    if (imgUrl) {
                        await sock.sendMessage(from, { image: { url: imgUrl }, caption: '🎨 *AI Image*\n\n📝 ' + text }, { quoted: m });
                    } else {
                        await Shefzyreply('❌ Image generation failed!');
                    }
                } catch { await Shefzyreply('❌ Image generation failed!'); }
                break;
            }

            case 'codeai':
            case 'codegen': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'codeai <what to build>\nExample: codeai WhatsApp bot tagall case in Node.js');
                try {
                    const SYSTEM_CODE = `You are an elite software engineer and code generator. Your job is to write complete, production-ready code for any request.

Rules:
- Write FULL working code, not snippets or placeholders
- Include ALL necessary imports, functions, and error handling
- If writing a WhatsApp bot case, follow this exact pattern:
  case 'commandname': {
    // your code here
    break;
  }
- Use async/await properly
- Include brief comments only for non-obvious parts
- Always use code blocks with language tags
- Write code that works on the first run
- Support: JavaScript, Python, Node.js, Bash, HTML/CSS, React, and more`;

                    const codePrompt = SYSTEM_CODE + '\n\nRequest: ' + text + '\n\nWrite the complete, working code now:';
                    let codeReply = null;

                    // Try Gemini first (best for code)
                    if (config.geminiApiKey) {
                        try {
                            const cgRes = await axios.post(
                                'https://generativelanguage.googleapis.com/v1beta/models/' + AIP.model('gemini') + ':generateContent?key=' + config.geminiApiKey,
                                {
                                    contents: [{ parts: [{ text: codePrompt }] }],
                                    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
                                },
                                { timeout: 40000 }
                            );
                            codeReply = cgRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                        } catch (e) { console.log('codeai gemini:', e.message); }
                    }
                    // DeepSeek Coder fallback
                    if (!codeReply && config.deepseekApiKey) {
                        try {
                            const cdRes = await axios.post('https://api.deepseek.com/chat/completions', {
                                model: AIP.model('deepseek'),
                                messages: [
                                    { role: 'system', content: SYSTEM_CODE },
                                    { role: 'user', content: text }
                                ],
                                max_tokens: 4000, temperature: 0.1
                            }, { headers: { Authorization: 'Bearer ' + config.deepseekApiKey, 'Content-Type': 'application/json' }, timeout: 40000 });
                            codeReply = cdRes.data?.choices?.[0]?.message?.content;
                        } catch (e) { console.log('codeai deepseek:', e.message); }
                    }
                    // Groq with Llama3 70B for code
                    if (!codeReply && config.groqApiKey) {
                        try {
                            const crRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                                model: AIP.model('groq'),
                                messages: [
                                    { role: 'system', content: SYSTEM_CODE },
                                    { role: 'user', content: text }
                                ],
                                max_tokens: 4000, temperature: 0.1
                            }, { headers: { Authorization: 'Bearer ' + config.groqApiKey, 'Content-Type': 'application/json' }, timeout: 40000 });
                            codeReply = crRes.data?.choices?.[0]?.message?.content;
                        } catch (e) { console.log('codeai groq:', e.message); }
                    }

                    if (codeReply) {
                        if (codeReply.length <= 3500) {
                            await Shefzyreply('💻 *Code Generator*\n\n' + codeReply);
                        } else {
                            const CCHUNK = 3200;
                            const cParts = Math.ceil(codeReply.length / CCHUNK);
                            for (let ci = 0; ci < cParts; ci++) {
                                await Shefzyreply('💻 *Code* [' + (ci+1) + '/' + cParts + ']\n\n' + codeReply.slice(ci*CCHUNK, (ci+1)*CCHUNK));
                                await new Promise(r => setTimeout(r, 700));
                            }
                        }
                    } else {
                        await Shefzyreply('❌ Code generation failed! Keys: Gemini=' + (config.geminiApiKey?'✅':'❌') + ' DeepSeek=' + (config.deepseekApiKey?'✅':'❌') + ' Groq=' + (config.groqApiKey?'✅':'❌'));
                    }
                } catch (e) { await Shefzyreply('❌ Failed: ' + e.message); }
                break;
            }

            case 'chatbot': {
                if (!isCreator && !isSudo) return Shefzyreply('❌ Only owner/sudo!');
                const cbSub = args[0]?.toLowerCase();
                if (!cbSub) {
                    return Shefzyreply('⚙️ *Chatbot Settings*\n\n🤖 Groups (mention-only): ' + (userSetting.chatbotEnabled ? '✅ ON' : '❌ OFF') + '\n🔒 Private DMs: ' + (userSetting.chatbotPrivate ? '✅ ON' : '❌ OFF') + '\n\n' + prefix + 'chatbot on/off\n' + prefix + 'chatbot private on/off\n' + prefix + 'chatbot clear — clear all history\n\n💡 In groups, mention @bot to trigger it!');
                }
                if (cbSub === 'on' || cbSub === 'off') {
                    updateUserSettings(botNumberRaw, { chatbotEnabled: cbSub === 'on' });
                    await Shefzyreply(cbSub === 'on' ? '✅ Group chatbot enabled.\n\nMention @' + botNumberRaw + ' or reply to my chatbot messages to chat in groups.' : '✅ Group chatbot disabled.');
                } else if (cbSub === 'private') {
                    const prSub = args[1]?.toLowerCase();
                    updateUserSettings(botNumberRaw, { chatbotPrivate: prSub === 'on' });
                    await Shefzyreply(prSub === 'on' ? '✅ Private chatbot enabled.' : '✅ Private chatbot disabled.');
                } else if (cbSub === 'clear') {
                    clearMichikoHistory(botNumberRaw);
                    await Shefzyreply('🧹 All conversation histories cleared!');
                } else {
                    await Shefzyreply('❌ Usage: chatbot on/off | chatbot private on/off | chatbot clear');
                }
                break;
            }

            case 'ytsearch': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'ytsearch <query>');
                try {
                    // Use YouTube Data API if key exists, else scrape
                    let ytResults = [];
                    if (config.youtubeApiKey) {
                        const ytSRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                            params: { part: 'snippet', q: text, maxResults: 5, type: 'video', key: config.youtubeApiKey },
                            timeout: 12000
                        });
                        ytResults = (ytSRes.data?.items || []).map(v => ({
                            title: v.snippet.title,
                            id: v.id.videoId,
                            channel: v.snippet.channelTitle,
                            thumb: v.snippet.thumbnails?.high?.url
                        }));
                    } else {
                        // Scrape YouTube search without key
                        const ytPage = await axios.get('https://www.youtube.com/results?search_query=' + encodeURIComponent(text), {
                            headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000
                        });
                        const matches = [...ytPage.data.matchAll(/"videoId":"([^"]+)"[^}]+"title":\{"runs":\[\{"text":"([^"]+)"\}/g)];
                        ytResults = [...new Map(matches.map(m2 => [m2[1], { id: m2[1], title: m2[2] }])).values()].slice(0, 5);
                    }
                    if (!ytResults.length) return Shefzyreply('❌ No YouTube results found!');
                    const ytList = ytResults.map((v, i) => (i+1) + '. *' + v.title + '*\n   🔗 https://youtu.be/' + v.id + (v.channel ? '\n   📺 ' + v.channel : '')).join('\n\n');
                    const firstThumb = ytResults[0]?.thumb;
                    if (firstThumb) {
                        await sock.sendMessage(from, { image: { url: firstThumb }, caption: '🔍 *YouTube: ' + text + '*\n\n' + ytList }, { quoted: m });
                    } else {
                        await Shefzyreply('🔍 *YouTube: ' + text + '*\n\n' + ytList);
                    }
                } catch (e) { await Shefzyreply('❌ YouTube search failed!'); }
                break;
            }

            //===================
            // MEDIA DOWNLOADER
            //===================

            case 'ytmp3':
            case 'ytaudio': {
                const ytUrl = args[0] || text;
                if (!ytUrl || !ytUrl.includes('youtu')) return Shefzyreply('❌ Usage: .ytmp3 <youtube link>\nExample: .ytmp3 https://youtu.be/xxxxx');
                try {
                    await Shefzyreply('⏳ Downloading audio...');
                    let mp3Url = null;
                    let mp3Title = '';
                    let mp3Thumb = '';

                    //===================
                    // PRIMARY: Heavstal API (docs.heavstal.com.ng/apis/youtube)
                    //===================
                    try {
                        const hvMp3 = await axios.get(HEAVSTAL_BASE + '/downloader/youtube', {
                            params: { url: ytUrl, format: 'mp3' },
                            headers: { 'x-api-key': HEAVSTAL_KEY },
                            timeout: 50000
                        });
                        const d = hvMp3.data;
                        mp3Url   = d?.result?.download || d?.data?.download || d?.download || d?.url;
                        mp3Title = d?.result?.title    || d?.data?.title    || d?.title    || '';
                        mp3Thumb = d?.result?.thumbnail|| d?.data?.thumbnail|| d?.thumbnail|| '';
                        if (mp3Url) console.log('[ytmp3] Heavstal ok');
                    } catch (e) { console.log('[ytmp3] Heavstal err:', e.message); }

                    //===================
                    // FALLBACK: cobalt
                    //===================
                    if (!mp3Url) {
                        try {
                            const cobaltRes = await axios.post('https://cobalt.tools/api/json', {
                                url: ytUrl, aFormat: 'mp3', isAudioOnly: true
                            }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
                            mp3Url = cobaltRes.data?.url;
                            if (mp3Url) console.log('[ytmp3] cobalt ok');
                        } catch {}
                    }

                    if (!mp3Url) return Shefzyreply('❌ Download failed! Both sources unavailable.');

                    const audioMsg = {
                        audio: { url: mp3Url },
                        mimetype: 'audio/mpeg',
                        fileName: (mp3Title || 'audio').replace(/[\/\:*?"<>|]/g, '').slice(0, 100) + '.mp3',
                        ptt: false
                    };
                    if (mp3Thumb) {
                        audioMsg.contextInfo = {
                            externalAdReply: {
                                title: mp3Title || 'YouTube Audio',
                                body: 'Downloaded by ' + (userSetting.botName || config.botName),
                                thumbnailUrl: mp3Thumb,
                                sourceUrl: ytUrl,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        };
                    }
                    await sock.sendMessage(from, audioMsg, { quoted: m });
                } catch (e) { await Shefzyreply('❌ ytmp3 failed: ' + e.message); }
                break;
            }

            case 'ytmp4':
            case 'ytvideo': {
                const ytv = args[0] || text;
                if (!ytv || !ytv.includes('youtu')) return Shefzyreply('❌ Usage: .ytmp4 <youtube link>');
                try {
                    await Shefzyreply('⏳ Downloading video...');
                    let mp4Url = null;
                    let mp4Title = '';
                    let mp4Thumb = '';

                    //===================
                    // PRIMARY: Heavstal API
                    //===================
                    try {
                        const hvMp4 = await axios.get(HEAVSTAL_BASE + '/downloader/youtube', {
                            params: { url: ytv, format: 'mp4' },
                            headers: { 'x-api-key': HEAVSTAL_KEY },
                            timeout: 50000
                        });
                        const d = hvMp4.data;
                        mp4Url   = d?.result?.download || d?.data?.download || d?.download || d?.url;
                        mp4Title = d?.result?.title    || d?.data?.title    || d?.title    || '';
                        mp4Thumb = d?.result?.thumbnail|| d?.data?.thumbnail|| d?.thumbnail|| '';
                        if (mp4Url) console.log('[ytmp4] Heavstal ok');
                    } catch (e) { console.log('[ytmp4] Heavstal err:', e.message); }

                    //===================
                    // FALLBACK: cobalt
                    //===================
                    if (!mp4Url) {
                        try {
                            const cobalt2 = await axios.post('https://cobalt.tools/api/json', {
                                url: ytv, vCodec: 'h264', vQuality: '360', isAudioOnly: false
                            }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
                            mp4Url = cobalt2.data?.url;
                            if (mp4Url) console.log('[ytmp4] cobalt ok');
                        } catch {}
                    }

                    if (!mp4Url) return Shefzyreply('❌ Download failed! Both sources unavailable.');
                    await sock.sendMessage(from, {
                        video: { url: mp4Url },
                        caption: `🎬 *${mp4Title || 'YouTube Video'}*\n\n✅ Downloaded!`,
                        ...(mp4Thumb ? { jpegThumbnail: (await axios.get(mp4Thumb, { responseType: 'arraybuffer' }).then(r => Buffer.from(r.data)).catch(() => null)) } : {})
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ ytmp4 failed: ' + e.message); }
                break;
            }

            case 'play2':
case 'music': {
    const query = text;
    if (!query) return Shefzyreply('🎵 Provide a song name');

    try {
        await sock.sendMessage(from, { react: { text: '🔍', key: m.key } });

        const yts = require('yt-search');
        const search = await yts(query);
        if (!search?.videos?.length) {
            await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
            return Shefzyreply('❌ No results found');
        }

        const video = search.videos[0];

        // Send song info first as a regular text message
        const infoMessage = `🎵 *${video.title}*\n\n👤 *Artist:* ${video.author?.name || 'Unknown'}\n⏱️ *Duration:* ${video.timestamp || 'Unknown'}\n📅 *Uploaded:* ${video.ago || 'Unknown'}\n👁️ *Views:* ${video.views?.toLocaleString() || 'N/A'}\n\n📥 *Downloading audio...*`;
        
        await sock.sendMessage(from, { text: infoMessage }, { quoted: m });

        //===================
        // API 1: hector
        //===================
        const fetchHector = async (videoUrl) => {
            const res = await axios.get(`https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
            const d = res.data;
            if (!d?.status && !d?.audio) throw new Error('API 1: no audio');
            console.log(chalk.green('[YTPLAY] API 1 (hectormanuel) success'));
            return { audioUrl: d.audio, title: d.title || '' };
        };

        //===================
        // API 2: faa.my.id fallback
        //===================
        const fetchFaa = async (videoUrl) => {
            const res = await axios.get(`https://api-faa.my.id/faa/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
            const d = res.data;
            const url = d?.result?.mp3;
            if (!url) throw new Error('faa.my.id: no audio URL');
            console.log(chalk.green('[YTPLAY] API 2 (faa.my.id) success'));
            return { audioUrl: url, title: d?.result?.title || video.title };
        };

        let audioUrl = null, title = video.title;

        try {
            const r = await fetchHector(video.url);
            audioUrl = r.audioUrl;
            title = r.title || title;
        } catch (e) {
            console.log(chalk.yellow('[YTPLAY] hector failed:'), e.message);
            try {
                const r = await fetchFaa(video.url);
                audioUrl = r.audioUrl;
                title = r.title || title;
            } catch (e2) {
                console.log(chalk.red('[YTPLAY] faa.my.id also failed:'), e2.message);
            }
        }

        if (!audioUrl) {
            await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
            return Shefzyreply('❌ All download sources failed. Try again later.');
        }

        // Send the audio separately as a regular audio message
        await sock.sendMessage(from, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `${title.replace(/[\\/:*?"<>|]/g, '').slice(0, 120)}.mp3`,
            ptt: false
        }, { quoted: m });

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (error) {
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
        await Shefzyreply(`❌ Play failed: ${error.message}`);
    }
    break;
}

  case 'video': {
    if (!text) return Shefzyreply(
        `❌ Usage: ${prefix}video <song/video name or URL>\n\n` +
        `Examples:\n${prefix}video blinding lights the weeknd\n${prefix}video https://youtu.be/xxxxx`
    );
    try {
        await Shefzyreply('🔍 Searching YouTube...');

        const axios = require('axios');

        const apiUrl = `https://api-faa.my.id/faa/ytplayvid?q=${encodeURIComponent(text)}`;

        const response = await axios.get(apiUrl, { timeout: 30000 });
        const data = response.data;

        if (!data.status || !data.result) {
            return Shefzyreply('❌ No video found for: ' + text);
        }

        const result = data.result;
        const videoTitle = result.searched_title || text;
        const downloadUrl = result.download_url;
        const format = result.format || 'mp4';

        if (!downloadUrl) {
            return Shefzyreply('❌ Failed to get download URL for: ' + text);
        }

        await Shefzyreply(`✅ Found: *${videoTitle}*\n⏳ Downloading...`);

        await sock.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: `video/${format}`,
            fileName: videoTitle.replace(/[^a-zA-Z0-9 ]/g, '_') + `.${format}`,
            caption: `🎬 *${videoTitle}*\n\n⚡ Michiko MD`
        }, { quoted: m });

    } catch(e) {
        console.log('[video]', e.message);
        await Shefzyreply('❌ YouTube download failed: ' + e.message);
    }
    break;
}

case 'play3': {
    if (!text) return Shefzyreply(
        `❌ Usage: ${prefix}play3 <song name or URL>\n\n` +
        `Examples:\n${prefix}play3 blinding lights\n${prefix}play2 https://youtu.be/xxxxx`
    );
    try {
        await Shefzyreply('🔍 Searching...');
        
        const yt = require('@vreden/youtube_scraper');
        
        let videoUrl = text;
        let videoTitle = text;
        
        if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
            const searchResults = await yts(text);
            if (!searchResults || !searchResults.videos || !searchResults.videos.length) {
                return Shefzyreply('❌ No results found for: ' + text);
            }
            const firstResult = searchResults.videos[0];
            videoUrl = firstResult.url;
            videoTitle = firstResult.title;
        }
        
        await Shefzyreply(`✅ Found: *${videoTitle}*\n⏳ Downloading audio...`);
        
        // Download audio at 128 kbps
        const result = await yt.ytmp3(videoUrl, 128);
        
        if (!result || !result.download || !result.download.url) {
            return Shefzyreply('❌ Download failed');
        }
        
        let urlMp3 = result.download.url;
        const sizeMB = result.size || (result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(1) : 'Unknown');
        
        // Download the audio file
        const response = await axios({
            method: 'get',
            url: urlMp3,
            responseType: 'arraybuffer'
        });
        
        const buffer = Buffer.from(response.data);
        
        await sock.sendMessage(from, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            fileName: videoTitle.replace(/[^a-zA-Z0-9 ]/g, '_') + '.mp3',
            ptt: false
        }, { quoted: m });
        
        await sock.sendMessage(from, {
            text: `🎵 *${videoTitle}*\n📁 ${sizeMB} MB`
        }, { quoted: m });
        
    } catch(e) {
        console.log('[play2]', e.message);
        await Shefzyreply('❌ Audio download failed: ' + e.message);
    }
    break;
}

case 'soundcloud':
case 'song':
case 'play': {
    const query = text;
    if (!query) {
        return Shefzyreply(
            `🎵 *Michiko Player*\n\n` +
            `Usage: *${prefix}play<song name>*\n` +
            `Example: *${prefix}play Lil Tony Official - Count me out*\n\n` +
            `🎶 Searches and plays from SoundCloud`
        );
    }

    try {
        await Shefzyreply(`🔍 Searching  for: *${query}*...`);
        await sock.sendMessage(from, { react: { text: '🔍', key: m.key } });

        //===================
        // API Call
        //===================
        const url = `https://api-faa.my.id/faa/soundcloud-play?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(url, { timeout: 30000 });

        //===================
        // Check Response
        //===================
        if (!data.status || !data.result) {
            throw new Error('No results found for your query.');
        }

        const result = data.result;

        //===================
        // Check if we have a download URL
        //===================
        if (!result.download_url) {
            throw new Error('No download URL found for this track.');
        }

        //===================
        // Format Duration
        //===================
        const formatDuration = (seconds) => {
            if (!seconds || seconds === 0) return 'Unknown';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        const duration = result.duration ? formatDuration(result.duration) : 'Unknown';

        //===================
        // Send Info Message
        //===================
        const infoMsg = `🎵 *${result.title || 'Unknown Title'}*\n\n` +
            `👤 *Artist:* ${result.user || 'Unknown Artist'}\n` +
            `⏱️ *Duration:* ${duration}\n` +
            `📂 *Format:* ${result.format || 'mp3'}\n\n` +
            `📥 Downloading audio...`;

        await sock.sendMessage(from, { text: infoMsg }, { quoted: m });

        //===================
        // Download and Send Audio
        //===================
        const audioResponse = await axios({
            method: 'GET',
            url: result.download_url,
            responseType: 'arraybuffer',
            timeout: 60000
        });

        const audioBuffer = Buffer.from(audioResponse.data);

        await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${result.title || 'soundcloud'}.mp3`,
            ptt: false
        }, { quoted: m });

        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.log(chalk.red('[SOUNDCLOUD] Error:'), error.message);

        if (error.code === 'ECONNABORTED') {
            await Shefzyreply(`⏰ Request timed out. Please try again.`);
        } else if (error.response?.status === 404) {
            await Shefzyreply(`❌ No results found for: *${query}*`);
        } else {
            await Shefzyreply(`❌ Failed to play: ${error.message}`);
        }

        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
    break;
}


            case 'tiktok':
case 'tt': {
    const ttUrl = (args[0] || text || '').split(' ')[0];
    if (!ttUrl || !ttUrl.startsWith('http')) return Shefzyreply('❌ Usage: tiktok <tiktok link>');
    try {
        await Shefzyreply('⏳ Downloading TikTok (no watermark)...');

        let ttData = null;

        // Primary: Heavstal TikTok downloader (v1)
        try {
            const hvTt = await axios.post(HEAVSTAL_BASE.replace('/apis/', '/api/v1/') + 'tiktok', 
                { query: ttUrl },
                {
                    headers: { 'x-api-key': HEAVSTAL_KEY },
                    timeout: 30000
                }
            );
            ttData = hvTt.data?.data || null;
        } catch (e) { console.log('[TT] Heavstal err:', e.message); }

        if (ttData?.video_nowm) {
            const title = ttData.title || 'TikTok';
            const author = ttData.author ? `👤 @${ttData.author}` : '';
            const stats = ttData.stats
                ? `👁️ ${(ttData.stats.views || 0).toLocaleString()} | ❤️ ${(ttData.stats.likes || 0).toLocaleString()}`
                : '';

            // Download buffer first so all users receive it
            const videoBuffer = await axios.get(ttData.video_nowm, {
                responseType: 'arraybuffer',
                timeout: 60000
            });

            await sock.sendMessage(from, {
                video: Buffer.from(videoBuffer.data),
                mimetype: 'video/mp4',
                caption: `✅ *TikTok (No Watermark)*\n📝 ${title.slice(0, 100)}${author ? '\n' + author : ''}${stats ? '\n' + stats : ''}`
            }, { quoted: m });

        } else {
            // Fallback: cobalt
            try {
                const cobTt = await axios.post('https://cobalt.tools/api/json', {
                    url: ttUrl, vCodec: 'h264', vQuality: '720'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 30000
                });
                const cobUrl = cobTt.data?.url;
                if (!cobUrl) return Shefzyreply('❌ TikTok download failed!');

                const cobBuffer = await axios.get(cobUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000
                });
                await sock.sendMessage(from, {
                    video: Buffer.from(cobBuffer.data),
                    mimetype: 'video/mp4',
                    caption: '✅ TikTok downloaded!'
                }, { quoted: m });

            } catch (cobErr) {
                return Shefzyreply('❌ TikTok download failed: ' + cobErr.message);
            }
        }

    } catch (e) {
        console.log('tiktok error:', e.message);
        await Shefzyreply('❌ TikTok download failed: ' + e.message);
    }
    break;
}

            case 'ig':
            case 'instagram-dl': {
                const igDlUrl = args[0] || text;
                if (!igDlUrl || !igDlUrl.includes('instagram')) return Shefzyreply('❌ Usage: ig <instagram post/reel link>');
                try {
                    await Shefzyreply('⏳ Downloading Instagram...');
                    const igRes = await axios.post('https://cobalt.tools/api/json', {
                        url: igDlUrl, vCodec: 'h264', vQuality: '720'
                    }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
                    const igDl = igRes.data?.url;
                    if (igDl) {
                        const isVideo = igDl.includes('.mp4');
                        if (isVideo) {
                            await sock.sendMessage(from, { video: { url: igDl }, caption: '✅ Instagram downloaded!' }, { quoted: m });
                        } else {
                            await sock.sendMessage(from, { image: { url: igDl }, caption: '✅ Instagram downloaded!' }, { quoted: m });
                        }
                    } else {
                        await Shefzyreply('❌ Could not download! Make sure the post is public.');
                    }
                } catch { await Shefzyreply('❌ Instagram download failed!'); }
                break;
            }

            case 'vvideo':
            case 'dl': {
                const dlUrl = args[0] || text;
                if (!dlUrl || !dlUrl.startsWith('http')) return Shefzyreply('❌ Usage: video <url>\nSupports: YouTube, TikTok, Instagram, Twitter, Facebook');
                try {
                    await Shefzyreply('⏳ Downloading...');
                    const dlRes = await axios.post('https://cobalt.tools/api/json', {
                        url: dlUrl, vCodec: 'h264', vQuality: '360'
                    }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
                    const dlFinal = dlRes.data?.url;
                    if (dlFinal) {
                        await sock.sendMessage(from, { video: { url: dlFinal }, caption: '✅ Downloaded!' }, { quoted: m });
                    } else {
                        await Shefzyreply('❌ Download failed! URL may not be supported.\nSupported: YouTube, TikTok, Instagram, Twitter, Facebook');
                    }
                } catch (e) { await Shefzyreply('❌ Download failed: ' + e.message); }
                break;
            }

            case 'movie-dl':
            case 'moviedl': {
                if (!text) return Shefzyreply('❌ Usage: moviedl <movie name>\nThis searches for streaming sources.');
                try {
                    // Search for the movie on TMDB, then provide streaming info
                    const tmdbRes = await axios.get('https://api.themoviedb.org/3/search/movie', {
                        params: { api_key: config.omdbApiKey || '15d2ea6d0dc1d476efbca3eba2b9bbfb', query: text },
                        timeout: 10000
                    });
                    const mov = tmdbRes.data?.results?.[0];
                    if (!mov) return Shefzyreply('❌ Movie not found: ' + text);
                    const mvInfo = '🎬 *' + mov.title + '* (' + (mov.release_date?.split('-')[0]||'N/A') + ')\n\n⭐ Rating: ' + mov.vote_average?.toFixed(1) + '/10\n\n📥 *Download Sources:*\n🔗 YTS: https://yts.mx/movies\n🔗 1337x: https://1337x.to/search/' + encodeURIComponent(mov.title) + '/1/\n🔗 Rarbg (proxy): https://rarbgprx.org/torrents.php?search=' + encodeURIComponent(mov.title);
                    const poster = mov.poster_path ? 'https://image.tmdb.org/t/p/w500' + mov.poster_path : null;
                    if (poster) {
                        await sock.sendMessage(from, { image: { url: poster }, caption: mvInfo }, { quoted: m });
                    } else {
                        await Shefzyreply(mvInfo);
                    }
                } catch { await Shefzyreply('❌ Failed to find movie!'); }
                break;
            }

            case 'subtitle':
            case 'sub': {
                if (!text) return Shefzyreply('❌ Usage: sub <movie/show name>\nExample: sub Avengers Endgame');
                try {
                    const subRes = await axios.get('https://rest.opensubtitles.org/search/query-' + encodeURIComponent(text), {
                        headers: { 'User-Agent': 'TemporaryUserAgent' }, timeout: 12000
                    });
                    const subs = subRes.data?.slice(0, 5) || [];
                    if (!subs.length) return Shefzyreply('❌ No subtitles found for: ' + text + '\n\nTry: https://www.opensubtitles.org/');
                    const subList = subs.map((s, i) => (i+1) + '. *' + s.MovieName + '* (' + s.MovieYear + ')\n   🌐 ' + s.LanguageName + ' | 🔗 ' + (s.SubDownloadLink||'')).join('\n\n');
                    await Shefzyreply('📄 *Subtitles: ' + text + '*\n\n' + subList);
                } catch {
                    await Shefzyreply('❌ Subtitle search failed!\n\n🔗 Get subtitles here:\nhttps://www.opensubtitles.org/en/search/query-' + encodeURIComponent(text));
                }
                break;
            }

            //===================
            // GAMES MENU
            //===================

            case 'games':
            case 'gamelist': {
                const gamesList =
                    '1. 🎮 *tictactoe* @user — Play TicTacToe\n' +
                    '2. 🔢 *numguess* — Guess the number (1-100)\n' +
                    '3. 🔤 *scramble* — Unscramble the word\n' +
                    '4. ✊ *rps* rock/paper/scissors — Play RPS\n' +
                    '5. 🧠 *trivia* — Answer a trivia question\n' +
                    '6. 🔤 *hangman* — Classic hangman\n' +
                    '7. ➕ *mathquiz* — Solve a math problem\n' +
                    '8. 🎲 *dice* [sides] — Roll dice\n' +
                    '9. 🪙 *coinflip* — Heads or tails\n' +
                    '10. 🤔 *wouldyou* — Would you rather...';
                await Shefzyreply('🎮 *Games Menu*\n\n' + gamesList + '\n\nType the command to start!');
                break;
            }

            case 'numguess':
            case 'numbergame': {
                const gameKey = from + '_numguess';
                if (!gameSessions.has(gameKey)) {
                    const target = Math.floor(Math.random() * 100) + 1;
                    gameSessions.set(gameKey, { target, attempts: 0, maxAttempts: 7, players: new Map() });
                    await Shefzyreply('🔢 *Number Guess Game!*\n\nI\'m thinking of a number between *1 and 100*\nYou have *7 attempts*\n\nReply with: ' + prefix + 'guess <number>');
                    break;
                }
                await Shefzyreply('⚠️ A game is already running! Use: ' + prefix + 'guess <number>\nEnd with: ' + prefix + 'endgame');
                break;
            }

            case 'guess': {
                const gKey = from + '_numguess';
                if (!gameSessions.has(gKey)) return Shefzyreply('❌ No game running! Start with: ' + prefix + 'numguess');
                const gs = gameSessions.get(gKey);
                const gNum = parseInt(args[0]);
                if (!gNum || gNum < 1 || gNum > 100) return Shefzyreply('❌ Guess a number between 1 and 100!');
                gs.attempts++;
                if (gNum === gs.target) {
                    gameSessions.delete(gKey);
                    await Shefzyreply('🎉 *Correct!* @' + senderNumber + ' guessed *' + gs.target + '* in ' + gs.attempts + ' attempts!');
                } else if (gs.attempts >= gs.maxAttempts) {
                    gameSessions.delete(gKey);
                    await Shefzyreply('💀 *Game Over!* The number was *' + gs.target + '*\nBetter luck next time!');
                } else {
                    const hint = gNum < gs.target ? '📈 Too low!' : '📉 Too high!';
                    await Shefzyreply(hint + ' Attempts: ' + gs.attempts + '/' + gs.maxAttempts);
                }
                break;
            }

            case 'rps': {
                const rpsChoices = ['rock', 'paper', 'scissors'];
                const playerChoice = args[0]?.toLowerCase();
                if (!rpsChoices.includes(playerChoice)) return Shefzyreply('❌ Usage: rps rock/paper/scissors');
                const botChoice = rpsChoices[Math.floor(Math.random() * 3)];
                const rpsEmoji = { rock: '🪨', paper: '📄', scissors: '✂️' };
                let result;
                if (playerChoice === botChoice) result = '🤝 *Draw!*';
                else if ((playerChoice === 'rock' && botChoice === 'scissors') ||
                         (playerChoice === 'paper' && botChoice === 'rock') ||
                         (playerChoice === 'scissors' && botChoice === 'paper')) result = '🎉 *You Win!*';
                else result = '😈 *Bot Wins!*';
                await Shefzyreply('✊ *Rock Paper Scissors*\n\n' + rpsEmoji[playerChoice] + ' You: *' + playerChoice + '*\n' + rpsEmoji[botChoice] + ' Bot: *' + botChoice + '*\n\n' + result);
                break;
            }

            case 'trivia': {
                try {
                    const trivRes = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 10000 });
                    const q = trivRes.data?.results?.[0];
                    if (!q) throw new Error('no question');
                    const decodeHtml = (str) => str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
                    const question = decodeHtml(q.question);
                    const correct = decodeHtml(q.correct_answer);
                    const allAns = [...q.incorrect_answers.map(a => decodeHtml(a)), correct].sort(() => Math.random()-0.5);
                    const trivKey = from + '_trivia';
                    gameSessions.set(trivKey, { correct, expires: Date.now() + 30000 });
                    const letters = ['A','B','C','D'];
                    const ansText = allAns.map((a,i) => letters[i] + '. ' + a).join('\n');
                    await Shefzyreply('🧠 *Trivia!*\n\n' + question + '\n\n' + ansText + '\n\nReply: ' + prefix + 'answer A/B/C/D (30s)');
                    setTimeout(() => gameSessions.delete(from + '_trivia'), 30000);
                } catch { await Shefzyreply('❌ Failed to get trivia question!'); }
                break;
            }

            case 'answer': {
                const trivKey2 = from + '_trivia';
                if (!gameSessions.has(trivKey2)) return Shefzyreply('❌ No trivia running! Start with: ' + prefix + 'trivia');
                const trivSession = gameSessions.get(trivKey2);
                if (Date.now() > trivSession.expires) {
                    gameSessions.delete(trivKey2);
                    return Shefzyreply('⏰ Time\'s up! The answer was: *' + trivSession.correct + '*');
                }
                const userAns = args[0]?.toUpperCase();
                gameSessions.delete(trivKey2);
                // Just check if the letter matches — simplified
                await Shefzyreply('✅ The correct answer was: *' + trivSession.correct + '*\n\nYou answered: *' + (userAns||'?') + '*');
                break;
            }

            case 'scramble': {
                const words = ['elephant','programming','javascript','whatsapp','beautiful','universe','discovery','challenge','adventure','knowledge'];
                const word = words[Math.floor(Math.random()*words.length)];
                const scrambled = word.split('').sort(()=>Math.random()-0.5).join('');
                const scrKey = from + '_scramble';
                gameSessions.set(scrKey, { word, expires: Date.now() + 60000 });
                await Shefzyreply('🔤 *Word Scramble!*\n\nUnscramble: *' + scrambled.toUpperCase() + '*\n\nReply: ' + prefix + 'unscramble <word> (60s)');
                setTimeout(() => gameSessions.delete(scrKey), 60000);
                break;
            }

            case 'unscramble': {
                const uKey = from + '_scramble';
                if (!gameSessions.has(uKey)) return Shefzyreply('❌ No scramble game! Start with: ' + prefix + 'scramble');
                const uSess = gameSessions.get(uKey);
                if (Date.now() > uSess.expires) { gameSessions.delete(uKey); return Shefzyreply('⏰ Time\'s up! The word was: *' + uSess.word + '*'); }
                const uGuess = args[0]?.toLowerCase().trim();
                gameSessions.delete(uKey);
                if (uGuess === uSess.word) {
                    await Shefzyreply('🎉 *Correct!* The word was *' + uSess.word + '*! Well played!');
                } else {
                    await Shefzyreply('❌ Wrong! The word was *' + uSess.word + '* — you guessed *' + (uGuess||'?') + '*');
                }
                break;
            }

            case 'hangman': {
                const hmWords = ['bot','code','game','chat','group','admin','sticker','message','command','economy'];
                const hmWord = hmWords[Math.floor(Math.random()*hmWords.length)];
                const hmKey = from + '_hangman';
                gameSessions.set(hmKey, { word: hmWord, guessed: [], wrong: 0, maxWrong: 6 });
                const hmDisplay = hmWord.split('').map(()=>'_').join(' ');
                await Shefzyreply('🔤 *Hangman!*\n\nWord: *' + hmDisplay + '* (' + hmWord.length + ' letters)\n\nGuess a letter: ' + prefix + 'hmguess <letter>\n\n❤️ Lives: 6/6');
                break;
            }

            case 'hmguess': {
                const hmKey2 = from + '_hangman';
                if (!gameSessions.has(hmKey2)) return Shefzyreply('❌ No hangman game! Start with: ' + prefix + 'hangman');
                const hmS = gameSessions.get(hmKey2);
                const hmLetter = args[0]?.toLowerCase().trim();
                if (!hmLetter || hmLetter.length !== 1) return Shefzyreply('❌ Guess one letter!');
                if (hmS.guessed.includes(hmLetter)) return Shefzyreply('⚠️ Already guessed *' + hmLetter + '*!');
                hmS.guessed.push(hmLetter);
                if (!hmS.word.includes(hmLetter)) hmS.wrong++;
                const hmDisplay2 = hmS.word.split('').map(l => hmS.guessed.includes(l) ? l : '_').join(' ');
                const lives = '❤️'.repeat(hmS.maxWrong - hmS.wrong) + '🖤'.repeat(hmS.wrong);
                if (!hmDisplay2.includes('_')) {
                    gameSessions.delete(hmKey2);
                    return await Shefzyreply('🎉 *Won!* The word was *' + hmS.word + '*!');
                }
                if (hmS.wrong >= hmS.maxWrong) {
                    gameSessions.delete(hmKey2);
                    return await Shefzyreply('💀 *Game Over!* The word was *' + hmS.word + '*');
                }
                await Shefzyreply('🔤 *Hangman*\n\n' + hmDisplay2 + '\n\n' + lives + '\nWrong: ' + hmS.wrong + '/' + hmS.maxWrong + '\nGuessed: ' + hmS.guessed.join(', '));
                break;
            }

            case 'mathquiz': {
                const nums = [Math.floor(Math.random()*20)+1, Math.floor(Math.random()*20)+1];
                const ops = ['+','-','*'];
                const op = ops[Math.floor(Math.random()*ops.length)];
                const answer = op==='+' ? nums[0]+nums[1] : op==='-' ? nums[0]-nums[1] : nums[0]*nums[1];
                const mqKey = from + '_mathquiz';
                gameSessions.set(mqKey, { answer, expires: Date.now() + 20000 });
                await Shefzyreply('➕ *Math Quiz!*\n\nWhat is: *' + nums[0] + ' ' + op + ' ' + nums[1] + '*?\n\nReply: ' + prefix + 'mathans <number> (20s)');
                setTimeout(() => gameSessions.delete(mqKey), 20000);
                break;
            }

            case 'mathans': {
                const mqKey2 = from + '_mathquiz';
                if (!gameSessions.has(mqKey2)) return Shefzyreply('❌ No math quiz! Start with: ' + prefix + 'mathquiz');
                const mqS = gameSessions.get(mqKey2);
                if (Date.now() > mqS.expires) { gameSessions.delete(mqKey2); return Shefzyreply('⏰ Time\'s up! Answer: *' + mqS.answer + '*'); }
                const mqAns = parseInt(args[0]);
                gameSessions.delete(mqKey2);
                if (mqAns === mqS.answer) await Shefzyreply('🎉 *Correct!* The answer was *' + mqS.answer + '*!');
                else await Shefzyreply('❌ Wrong! The answer was *' + mqS.answer + '*, you said *' + (mqAns||'?') + '*');
                break;
            }

            case 'dice': {
                const sides = parseInt(args[0]) || 6;
                if (sides < 2 || sides > 100) return Shefzyreply('❌ Dice must have 2-100 sides!');
                const roll = Math.floor(Math.random()*sides)+1;
                await Shefzyreply('🎲 *Rolling d' + sides + '...*\n\n🎯 Result: *' + roll + '*');
                break;
            }

            case 'coinflip':
            case 'flip': {
                const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
                await Shefzyreply('🪙 *Coin Flip!*\n\n' + (result === 'Heads' ? '🟡' : '⚫') + ' *' + result + '*!');
                break;
            }

            case 'wouldyou':
            case 'wyr': {
                const wyrOptions = [
                    ['Be able to fly','Be invisible'],['Always be 10 mins early','Always be 20 mins late'],
                    ['Have $1M now','$5000/month forever'],['Speak all languages','Play all instruments'],
                    ['Never use phone again','Never watch movies again'],['Live in past','Live in future'],
                    ['Have no friends','Have no family'],['Be famous but broke','Rich but unknown'],
                    ['Eat the same meal forever','Never eat your favorite food again'],['Always be cold','Always be hot']
                ];
                const pick = wyrOptions[Math.floor(Math.random()*wyrOptions.length)];
                await Shefzyreply('🤔 *Would You Rather...*\n\n🅰️ ' + pick[0] + '\n\n*OR*\n\n🅱️ ' + pick[1] + '\n\nReply A or B!');
                break;
            }

            case 'endgame': {
                // Clean up any active games in this chat
                let removed = 0;
                const gamePrefixes = ['_numguess','_trivia','_scramble','_hangman','_mathquiz'];
                for (const pfx of gamePrefixes) {
                    if (gameSessions.has(from + pfx)) { gameSessions.delete(from + pfx); removed++; }
                }
                await Shefzyreply(removed > 0 ? '✅ Game(s) ended!' : '❌ No active game to end!');
                break;
            }


            //===================
            // AUDIO EFFECTS
            //===================
            // All effects use ffmpeg to process replied audio/video

            case 'bass': case 'blown': case 'deep': case 'robot':
            case 'tiny': case 'chipmunk': case 'slowed': case 'reverb':
            case 'nightcore': case 'earrape': case 'echo': case 'underwater':
            case 'telephone': case 'reverse': case 'vaporwave': {
                const supportedAudioTypes = ['audioMessage', 'videoMessage'];
                if (!m.quoted || !supportedAudioTypes.includes(m.quoted.mtype)) {
                    return Shefzyreply('❌ Reply to an audio or video message with ' + prefix + command);
                }
                const { exec: fxExec } = require('child_process');
                const { promisify: fxProm } = require('util');
                const fxExecP = fxProm(fxExec);
                const fxDir = path.join(__dirname, 'temp');
                if (!fs.existsSync(fxDir)) fs.mkdirSync(fxDir, { recursive: true });
                const fxTs = Date.now();
                const fxIn = path.join(fxDir, 'fx_' + fxTs + '_in.mp3');
                const fxOut = path.join(fxDir, 'fx_' + fxTs + '_out.mp3');
                try {
                    await Shefzyreply('⏳ Applying *' + command + '* effect...');
                    const fxBuf = await m.quoted.download();
                    fs.writeFileSync(fxIn, fxBuf);

                    // Build ffmpeg filter for each effect
                    const fxFilters = {
                        bass: 'equalizer=f=54:width_type=o:width=2:g=20,equalizer=f=100:width_type=o:width=2:g=10',
                        blown: 'acrusher=level_in=8:level_out=8:bits=8:mode=log:aa=1',
                        deep: 'asetrate=44100*0.7,aresample=44100,atempo=1.43',
                        robot: 'afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75',
                        tiny: 'asetrate=44100*1.5,aresample=44100,atempo=0.67',
                        chipmunk: 'asetrate=44100*1.4,aresample=44100',
                        slowed: 'atempo=0.8',
                        reverb: 'aecho=0.8:0.9:1000:0.3',
                        nightcore: 'asetrate=44100*1.25,aresample=44100',
                        earrape: 'acrusher=level_in=64:level_out=64:bits=4:mode=log:aa=1',
                        echo: 'aecho=0.8:0.88:60:0.4',
                        underwater: 'lowpass=f=800,aecho=0.8:0.9:500:0.3',
                        telephone: 'highpass=f=300,lowpass=f=3400,acrusher=level_in=4:level_out=4:bits=8',
                        reverse: 'areverse',
                        vaporwave: 'asetrate=44100*0.8,aresample=44100,atempo=1.0,aecho=0.8:0.88:60:0.3',
                    };

                    const filter = fxFilters[command];
                    if (!filter) return Shefzyreply('❌ Unknown effect!');

                    await fxExecP('"' + ffmpegPath + '" -y -i "' + fxIn + '" -af "' + filter + '" -b:a 128k "' + fxOut + '"');
                    const fxResult = fs.readFileSync(fxOut);
                    await sock.sendMessage(from, {
                        audio: fxResult,
                        mimetype: 'audio/mpeg',
                        ptt: false
                    }, { quoted: m });
                } catch (e) {
                    console.log(command + ' fx error:', e.message);
                    await Shefzyreply('❌ Failed to apply *' + command + '* effect! Make sure ffmpeg is installed.');
                } finally {
                    for (const f of [fxIn, fxOut]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }
                }
                break;
            }


            //===================
            // OMEGATECH API COMMANDS
            //===================

            //===================
            // text2nsfw: AI generates NSFW images from text
            //===================
            case 'text2nsfw':
            case 'nsfwgen': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'text2nsfw <description>');
                try {
                    await Shefzyreply('⏳ Generating image...');
                    const t2nRes = await axios.get('https://omegatech-api.dixonomega.tech/api/ai/text2nsfw', {
                        params: { q: text }, timeout: 30000
                    });
                    const images = t2nRes.data?.images || [];
                    if (!images.length) return Shefzyreply('❌ No images generated!');
                    await sock.sendMessage(from, {
                        image: { url: images[0] },
                        caption: '🖼️ *AI Generated*\n📝 ' + text
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Generation failed: ' + e.message); }
                break;
            }

            //===================
            // nanobananapro: stable diffusion image generation
            //===================
            case 'imagine2':
            case 'nanobananapro':
            case 'sdimage': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'sdimage <prompt>\nExample: sdimage A futuristic city at night');
                try {
                    await Shefzyreply('🎨 Generating with NanoBanana Pro...');
                    const nbRes = await axios.get('https://omegatech-api.dixonomega.tech/api/ai/nano-banana-pro', {
                        params: { prompt: text }, timeout: 60000
                    });
                    const imgUrl = nbRes.data?.image;
                    if (!imgUrl) return Shefzyreply('❌ No image returned!');
                    await sock.sendMessage(from, {
                        image: { url: imgUrl },
                        caption: '🎨 *NanoBanana Pro*\n📝 ' + text
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Image generation failed: ' + e.message); }
                break;
            }

            //===================
            // cinesubz: search movies from cinesubz
            //===================
            case 'movie2':
            case 'moviesearch':
            case 'cinesubz': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'movie2 <title>');
                try {
                    const mv2Res = await axios.get('https://omegatech-api.dixonomega.tech/api/movie/cinesubz-search', {
                        params: { query: text }, timeout: 15000
                    });
                    const results = mv2Res.data?.result || mv2Res.data?.results || [];
                    if (!results.length) return Shefzyreply('❌ No movies found for: ' + text);
                    const top5 = results.slice(0, 5);
                    const list = top5.map((mv, i) =>
                        (i+1) + '. *' + mv.title + '*\n' +
                        '   ⭐ ' + (mv.rating||'N/A') + ' | 🎞️ ' + (mv.quality||'N/A') + '\n' +
                        '   🔗 ' + (mv.link || mv.url || '')
                    ).join('\n\n');
                    const firstThumb = top5[0]?.thumbnail;
                    const caption = '🎬 *Movie Search: ' + text + '*\n\n' + list;
                    if (firstThumb) {
                        await sock.sendMessage(from, { image: { url: firstThumb }, caption }, { quoted: m });
                    } else {
                        await Shefzyreply(caption);
                    }
                } catch (e) { await Shefzyreply('❌ Movie search failed: ' + e.message); }
                break;
            }

            //===================
            // moviebox: search movies/series with IDs
            //===================
            case 'moviebox':
            case 'mbsearch': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'moviebox <title>');
                try {
                    const mbRes = await axios.get('https://omegatech-api.dixonomega.tech/api/movie/moviebox-search', {
                        params: { q: text }, timeout: 15000
                    });
                    const mbResults = mbRes.data?.result || [];
                    if (!mbResults.length) return Shefzyreply('❌ No results for: ' + text);
                    const types = { 1: '🎬 Movie', 2: '📺 Series', 6: '🎵 Video' };
                    const top5 = mbResults.slice(0, 5);
                    const list = top5.map((mv, i) =>
                        (i+1) + '. *' + mv.title + '* ' + (mv.year ? '(' + mv.year.split('-')[0] + ')' : '') + '\n' +
                        '   ⭐ ' + (mv.rating||'N/A') + ' | ' + (types[mv.type]||'Media') + '\n' +
                        '   🆔 ' + mv.id
                    ).join('\n\n');
                    const firstCover = top5[0]?.cover;
                    const caption = '🎬 *MovieBox: ' + text + '* (' + (mbRes.data?.total||'') + ' found)\n\n' + list;
                    if (firstCover) {
                        await sock.sendMessage(from, { image: { url: firstCover }, caption }, { quoted: m });
                    } else {
                        await Shefzyreply(caption);
                    }
                } catch (e) { await Shefzyreply('❌ MovieBox search failed: ' + e.message); }
                break;
            }

            //===================
            // movie2detail: get full details + download links
            //===================
            case 'movie2detail':
            case 'moviedetail': {
                const mvUrl = args[0] || text;
                if (!mvUrl || !mvUrl.startsWith('http')) return Shefzyreply('❌ Usage: ' + prefix + 'moviedetail <url from movie2>');
                try {
                    const mdRes = await axios.get('https://omegatech-api.dixonomega.tech/api/movie/movie2-detail', {
                        params: { url: mvUrl }, timeout: 15000
                    });
                    const mv = mdRes.data;
                    if (!mv?.title) return Shefzyreply('❌ Movie not found!');
                    const downloads = (mv.download || []).slice(0, 6).map(d =>
                        '📥 *' + d.title + '* (' + d.quality + 'p): ' + d.url
                    ).join('\n');
                    const info =
                        '🎬 *' + mv.title.split('Sawsawan')[0].trim() + '*\n\n' +
                        '📝 ' + (mv.description?.slice(0, 200) || 'No description') + '\n\n' +
                        '⭐ Rating: ' + (mv.rating?.value || 'N/A') + '\n' +
                        '🎭 Genres: ' + (mv.metadata?.genres?.join(', ') || 'N/A') + '\n' +
                        '🌍 Country: ' + (mv.metadata?.countries?.join(', ') || 'N/A') + '\n' +
                        '📅 Year: ' + (mv.metadata?.year || 'N/A') + '\n' +
                        '🎬 Director: ' + (mv.metadata?.director || 'N/A') + '\n' +
                        '🎭 Cast: ' + (mv.metadata?.cast?.join(', ') || 'N/A') + '\n\n' +
                        '📥 *Download Links:*\n' + (downloads || 'No direct links found') +
                        (mv.trailer ? '\n\n🎬 Trailer: ' + mv.trailer : '');
                    if (mv.thumbnail) {
                        await sock.sendMessage(from, { image: { url: mv.thumbnail }, caption: info }, { quoted: m });
                    } else {
                        await Shefzyreply(info);
                    }
                } catch (e) { await Shefzyreply('❌ Failed to get movie details: ' + e.message); }
                break;
            }

            //===================
            // spotifysearch: search Spotify tracks
            //===================
            case 'spotifysearch':
            case 'spsearch': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'spotifysearch <song name>');
                try {
                    const spRes = await axios.get('https://omegatech-api.dixonomega.tech/api/Search/Spotify', {
                        params: { q: text }, timeout: 15000
                    });
                    const tracks = spRes.data?.results || [];
                    if (!tracks.length) return Shefzyreply('❌ No Spotify results for: ' + text);
                    const top8 = tracks.slice(0, 8);
                    const list = top8.map(t =>
                        t.no + '. *' + t.title + '* — ' + t.artist + '\n   💿 ' + t.album
                    ).join('\n');
                    const firstCover = top8[0]?.cover;
                    const caption = '🎵 *Spotify: ' + text + '*\n\n' + list + '\n\n💡 Use ' + prefix + 'spotifydl <id> to download';
                    // Send image with list first
                    if (firstCover) {
                        await sock.sendMessage(from, { image: { url: firstCover }, caption }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { text: caption }, { quoted: m });
                    }
                    // Then send IDs as separate copyable message
                    const idList = '📋 *Track IDs (tap to copy):*\n\n' +
                        top8.map(t => t.no + '. ' + t.title + '\n' + t.id).join('\n\n') +
                        '\n\nReply: ' + prefix + 'spotifydl <ID>';
                    await sock.sendMessage(from, { text: idList }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Spotify search failed: ' + e.message); }
                break;
            }

            //===================
            // spotifydl: download Spotify track by ID
            //===================
            case 'spotifydl': {
                const spId = args[0] || text;
                if (!spId) return Shefzyreply('❌ Usage: ' + prefix + 'spotifydl <track ID>\nGet ID from spotifysearch');
                try {
                    await Shefzyreply('⏳ Getting Spotify download link...');
                    const spdlRes = await axios.get('https://omegatech-api.dixonomega.tech/api/download/Spotify-dl', {
                        params: { id: spId }, timeout: 20000
                    });
                    const dlUrl = spdlRes.data?.downloadUrl;
                    if (!dlUrl) return Shefzyreply('❌ No download link found!');
                    await sock.sendMessage(from, {
                        audio: { url: dlUrl },
                        mimetype: 'audio/mpeg',
                        ptt: false
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Spotify download failed: ' + e.message); }
                break;
            }

            //===================
            // downloadall: download media from any social platform
            //===================
            case 'downloadall':
case 'dlall': {
    const dlAllUrl = (args[0] || text || '').split(' ')[0]; // take first URL only
    if (!dlAllUrl || !dlAllUrl.startsWith('http')) return Shefzyreply('❌ Usage: ' + prefix + 'dlall <url>\nSupports: YouTube, TikTok, Instagram, Twitter, Facebook');
    try {
        await Shefzyreply('⏳ Downloading...');
        const daRes = await axios.get('https://omegatech-api.dixonomega.tech/api/download/All-downloader-v2', {
            params: { action: 'download', url: dlAllUrl }, timeout: 45000
        });
        const daData = daRes.data;
        if (!daData?.success) return Shefzyreply('❌ API could not process this URL!');

        const result = daData?.data || {};
        const videos = result.videos || [];
        const audios = result.audios || [];
        const photos = result.photos || [];

        // Pick best video: prefer highest resolution (width*height), fallback to first
        const bestVideo = [...videos].sort((a, b) => {
            const areaA = (a.quality?.split('x').reduce((x, y) => x * (+y || 0), 1)) || 0;
            const areaB = (b.quality?.split('x').reduce((x, y) => x * (+y || 0), 1)) || 0;
            return areaB - areaA;
        })[0];
        const bestAudio = audios[0];
        const bestImage = photos[0];

        const caption = `✅ *${result.title || 'Downloaded'}*\n` +
            (result.author ? `👤 ${result.author}${result.isVerified ? ' ✅' : ''}\n` : '') +
            (bestVideo?.quality ? `📁 Quality: ${bestVideo.quality}` : '');

        if (bestVideo?.url) {
            await sock.sendMessage(from, {
                video: { url: bestVideo.url },
                mimetype: `video/${bestVideo.format || 'mp4'}`,
                caption
            }, { quoted: m });
        } else if (bestImage?.url) {
            await sock.sendMessage(from, { image: { url: bestImage.url }, caption }, { quoted: m });
        } else if (bestAudio?.url) {
            await sock.sendMessage(from, {
                audio: { url: bestAudio.url },
                mimetype: `audio/${bestAudio.format || 'mpeg'}`,
                ptt: false
            }, { quoted: m });
        } else {
            await Shefzyreply('❌ No downloadable media found for this URL.');
        }
    } catch (e) {
        console.log('dlall error:', e.message);
        await Shefzyreply('❌ Download failed: ' + e.message);
    }
    break;
}
            
            case 'autolink':
case 'autodl':
case 'autodownload': {
    const ky = require('ky');
    const fs = require('fs-extra');
    const path = require('path');
    
    const downloadQueue = new Map();
    const userDownloadLimits = new Map();
    
    const supportedPlatforms = {
        youtube: /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu\.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/i,
        facebook: /^(https?:\/\/)?((?:www|m|web)\.)?(facebook|fb)\.(com|watch)\/.*$/i,
        instagram: /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(?:p|reel)\/([A-Za-z0-9\-_]+)/i,
        tiktok: /^(https?:\/\/)?((?:www|m|vm|vt)\.)?tiktok\.com\/\S+$/i,
        twitter: /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/i
    };
    
    const HOURLY_LIMIT = 25;
    const GROUP_SETTINGS_FILE = path.join(__dirname, 'database', 'autolink_settings.json');
    
    function loadGroupSettings() {
        try {
            if (fs.existsSync(GROUP_SETTINGS_FILE)) {
                return JSON.parse(fs.readFileSync(GROUP_SETTINGS_FILE, 'utf8'));
            }
        } catch (e) {}
        return {};
    }
    
    function saveGroupSettings(settings) {
        try {
            fs.ensureDirSync(path.dirname(GROUP_SETTINGS_FILE));
            fs.writeFileSync(GROUP_SETTINGS_FILE, JSON.stringify(settings, null, 2));
        } catch (e) {}
    }
    
    function checkRateLimit(userId) {
        const now = Date.now();
        const userLimit = userDownloadLimits.get(userId) || { count: 0, timestamp: now };
        if (now - userLimit.timestamp > 3600000) {
            userDownloadLimits.set(userId, { count: 1, timestamp: now });
            return true;
        }
        if (userLimit.count >= HOURLY_LIMIT) return false;
        userLimit.count++;
        userDownloadLimits.set(userId, userLimit);
        return true;
    }
    
    function extractValidUrls(textMsg) {
        const urls = [];
        const source = String(textMsg || '');
        for (const [platform, regex] of Object.entries(supportedPlatforms)) {
            const matches = source.matchAll(new RegExp(regex, 'gi'));
            for (const match of matches) urls.push({ url: match[0], platform });
        }
        return urls;
    }
    
    async function getVideoData(videoUrl, platform) {
        // Special handling for TikTok
        if (platform === 'tiktok') {
            try {
                const res = await axios.get('https://omegatech-api.dixonomega.tech/api/download/tiktok', {
                    params: { url: videoUrl },
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 20000
                });
                if (res.data?.success && res.data?.data?.video_no_watermark) {
                    return {
                        title: res.data.data.title || 'TikTok Video',
                        thumbnail: res.data.data.thumbnail,
                        downloadUrl: res.data.data.video_no_watermark,
                        quality: 'HD'
                    };
                }
            } catch (e) { console.log('TikTok API failed:', e.message); }
        }
        
        // General Omegatech API (all platforms)
        try {
            const res = await axios.get('https://omegatech-api.dixonomega.tech/api/download/all', {
                params: { url: videoUrl },
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 25000
            });
            if (res.data?.success && res.data?.result) {
                const result = res.data.result;
                const video = result.video?.find(v => v.quality === 'hd_no_watermark') ||
                              result.video?.find(v => v.quality === 'no_watermark') ||
                              result.video?.[0];
                if (video?.url) {
                    return {
                        title: result.title || videoUrl,
                        thumbnail: result.thumbnail || video.thumbnail,
                        downloadUrl: video.url,
                        quality: video.quality || 'High'
                    };
                }
            }
        } catch (e) {}
        
        // Fallback: dev-priyanshi API
        try {
            const response = await ky
                .get('https://dev-priyanshi.onrender.com/api/alldl', {
                    searchParams: { url: videoUrl },
                    timeout: 30000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                })
                .json();
            if (response?.status && response?.data) {
                const data = response.data;
                const downloadUrl = data.high || data.low;
                if (downloadUrl) {
                    return {
                        title: data.title || 'Video',
                        thumbnail: data.thumbnail,
                        downloadUrl,
                        quality: data.high ? 'High' : 'Low'
                    };
                }
            }
        } catch (e) {}
        
        throw new Error('All APIs failed');
    }
    
    async function downloadVideoToPath(videoData, chatId) {
        const tempDir = path.join(__dirname, 'temp');
        const videoPath = path.join(tempDir, `autodl_${chatId}_${Date.now()}.mp4`);
        fs.ensureDirSync(tempDir);
        const response = await axios.get(videoData.downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
        await fs.writeFile(videoPath, Buffer.from(response.data));
        return videoPath;
    }
    
    async function handleAutoDownload() {
        const settings = loadGroupSettings();
        if (!settings[from]) return false;
        const urls = extractValidUrls(body);
        if (urls.length === 0) return false;
        if (!isGroup) {
            await Shefzyreply('❌ *Auto Download* only works in groups!');
            return true;
        }
        if (!checkRateLimit(sender)) {
            const resetTime = new Date(Date.now() + 3600000).toLocaleTimeString();
            await Shefzyreply(`⚠️ Rate limit (${HOURLY_LIMIT}/hour). Resets at ${resetTime}`);
            return true;
        }
        for (const { url, platform } of urls) {
            const threadQueue = downloadQueue.get(from) || new Set();
            if (threadQueue.has(url)) continue;
            threadQueue.add(url);
            downloadQueue.set(from, threadQueue);
            try {
                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                const videoData = await getVideoData(url, platform);
                const videoPath = await downloadVideoToPath(videoData, from);
                await sock.sendMessage(from, {
                    video: { url: videoPath },
                    caption: `🎥 *Auto-Downloaded*\n📱 ${platform.toUpperCase()}\n📝 ${videoData.title}\n🎚️ ${videoData.quality}\n🔗 ${url}`
                }, { quoted: m });
                await fs.remove(videoPath).catch(() => {});
                await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
            } catch (error) {
                await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                await Shefzyreply(`❌ ${platform.toUpperCase()} download failed: ${error.message}`);
            } finally {
                threadQueue.delete(url);
            }
        }
        return true;
    }
    
    // Trigger auto-download if message has URLs and no command args
    if (!args[0] && extractValidUrls(body).length > 0) {
        await handleAutoDownload();
        break;
    }
    
    // Handle autolink on/off/status
    if (!args[0] || !['on','off','status'].includes(args[0].toLowerCase())) {
        return Shefzyreply(
            `📱 *AutoLink Commands*\n` +
            `• ${prefix}autolink on - Enable\n` +
            `• ${prefix}autolink off - Disable\n` +
            `• ${prefix}autolink status - Check\n\n` +
            `Supported: ${Object.keys(supportedPlatforms).join(', ')}`
        );
    }
    const settings = loadGroupSettings();
    const cmd = args[0].toLowerCase();
    if (cmd === 'status') {
        const status = settings[from] ? '✅ Enabled' : '❌ Disabled';
        const limits = userDownloadLimits.get(sender) || { count: 0 };
        return Shefzyreply(`📊 *Auto Download*\nState: ${status}\nYour downloads: ${limits.count}/${HOURLY_LIMIT}`);
    }
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    settings[from] = cmd === 'on';
    saveGroupSettings(settings);
    await Shefzyreply(`${cmd === 'on' ? '✅ Enabled' : '❌ Disabled'} auto download for this group.`);
    break;
}

            //===================
            // apkdownload: get APK info and download link
            //===================
            
            case 'apk':
            case 'playstore': {
    if (!text) return Shefzyreply(`❌ Usage: ${prefix}playstore <app name>\n\nExample:\n${prefix}playstore WhatsApp`);
    
    try {
        await Shefzyreply('🔍 Searching Play Store...');
        
        const axios = require('axios');
        const url = `${BASE_URL}/api/search/playstore?apikey=${API_KEY}&query=${encodeURIComponent(text)}`;
        
        const response = await axios.get(url);
        const data = response.data;
        
        if (!data.success || !data.results || data.results.length === 0) {
            return Shefzyreply('❌ No results found for: ' + text);
        }
        
        // Get first 5 results
        const results = data.results.slice(0, 5);
        let reply = `📱 *Play Store Results for "${text}"*\n\n`;
        
        for (let i = 0; i < results.length; i++) {
            const app = results[i];
            reply += `┌─❏ *${i + 1}. ${app.name}*\n`;
            reply += `│ 👤 Developer: ${app.developer}\n`;
            reply += `│ ⭐ Rating: ${app.rating} ⭐\n`;
            reply += `│ 💰 Price: ${app.price}\n`;
            reply += `│ 📝 ${app.summary.substring(0, 80)}${app.summary.length > 80 ? '...' : ''}\n`;
            reply += `│ 🔗 ${app.link}\n`;
            reply += `└────────────────\n\n`;
        }
        
        await Shefzyreply(reply);
        
    } catch(e) {
        console.error('[playstore]', e.message);
        await Shefzyreply('❌ Play Store search failed: ' + e.message);
    }
    break;
}

            //===================
            // aigenimage: AI image generator using OmegaTech Ai-gen-image
            //===================
            case 'aigenimage':
            case 'aiimage2': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'aiimage2 <prompt>\nExample: aiimage2 Futuristic city at night');
                try {
                    await Shefzyreply('🎨 Generating AI image...');
                    // Parse optional model from args: aiimage2 [model] <prompt>
                    // Models: photorealistic, anime, cartoon, artistic, digital-art
                    const modelOptions = ['photorealistic','anime','cartoon','artistic','digital-art'];
                    let aiModel = 'photorealistic';
                    let aiPrompt = text;
                    if (modelOptions.includes(args[0]?.toLowerCase())) {
                        aiModel = args[0].toLowerCase();
                        aiPrompt = args.slice(1).join(' ');
                    }
                    const aigRes = await axios.get('https://omegatech-api.dixonomega.tech/api/ai/Ai-gen-image', {
                        params: {
                            prompt: aiPrompt,
                            model: aiModel,
                            ratio: 'square',
                            resolution: '512x512',
                            numImages: 1
                        },
                        timeout: 60000
                    });
                    const imgData = aigRes.data;
                    // API returns imageUrl (primary) and allImages[]
                    const aiImgUrl = imgData?.imageUrl || imgData?.allImages?.[0] || imgData?.image || imgData?.url;
                    if (!aiImgUrl) throw new Error('No image URL in response: ' + JSON.stringify(imgData).slice(0,200));
                    await sock.sendMessage(from, {
                        image: { url: aiImgUrl },
                        caption: '🎨 *AI Image*\n📝 ' + aiPrompt + '\n🎭 Model: ' + aiModel
                    }, { quoted: m });
                } catch (e) {
                    console.log('aiimage2 err:', e.message);
                    await Shefzyreply('❌ Image generation failed: ' + e.message);
                }
                break;
            }

            //===================
            // TICTACTOE GAME
            //===================

            case 'tictactoe':
            case 'ttt': {
                if (!isGroup) return Shefzyreply('❌ TicTacToe is groups only!');
                const tttTarget = resolveTarget(args[0]);
                if (!tttTarget) return Shefzyreply('❌ Usage: ' + prefix + 'tictactoe @user\nChallenge someone to TicTacToe!');
                if (tttTarget === sender) return Shefzyreply('❌ You cannot play against yourself!');

                const tttKey = from + '_ttt';
                if (gameSessions.has(tttKey)) return Shefzyreply('❌ A TicTacToe game is already running!\nUse: ' + prefix + 'endgame to stop it.');

                const tttBoard = [' ',' ',' ',' ',' ',' ',' ',' ',' '];
                gameSessions.set(tttKey, {
                    board: tttBoard,
                    players: { X: sender, O: tttTarget },
                    currentTurn: sender,
                    currentSymbol: 'X',
                    type: 'ttt'
                });

                const renderBoard = (b) =>
                    '```\n ' + b[0] + ' | ' + b[1] + ' | ' + b[2] + '\n---+---+---\n ' + b[3] + ' | ' + b[4] + ' | ' + b[5] + '\n---+---+---\n ' + b[6] + ' | ' + b[7] + ' | ' + b[8] + '\n```\n\nPositions:\n```\n 1 | 2 | 3\n---+---+---\n 4 | 5 | 6\n---+---+---\n 7 | 8 | 9\n```';

                await sock.sendMessage(from, {
                    text: '🎮 *TicTacToe!*\n\n@' + sender.split('@')[0] + ' (❌) vs @' + tttTarget.split('@')[0] + ' (⭕)\n\n' + renderBoard(tttBoard) + '\n\n@' + sender.split('@')[0] + "'s turn! Reply with: " + prefix + 'tttmove <1-9>',
                    mentions: [sender, tttTarget]
                }, { quoted: m });
                break;
            }

            case 'tttmove': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                const tttKey2 = from + '_ttt';
                if (!gameSessions.has(tttKey2)) return Shefzyreply('❌ No TicTacToe game! Start with: ' + prefix + 'tictactoe @user');
                const ttt = gameSessions.get(tttKey2);
                if (ttt.currentTurn !== sender) return Shefzyreply('❌ It\'s not your turn!');
                const pos = parseInt(args[0]) - 1;
                if (isNaN(pos) || pos < 0 || pos > 8) return Shefzyreply('❌ Invalid position! Choose 1-9');
                if (ttt.board[pos] !== ' ') return Shefzyreply('❌ That position is taken!');

                ttt.board[pos] = ttt.currentSymbol;
                const renderBoard2 = (b) =>
                    '```\n ' + b[0] + ' | ' + b[1] + ' | ' + b[2] + '\n---+---+---\n ' + b[3] + ' | ' + b[4] + ' | ' + b[5] + '\n---+---+---\n ' + b[6] + ' | ' + b[7] + ' | ' + b[8] + '\n```';

                // Check win
                const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                const hasWon = wins.some(([a,b2,c]) => ttt.board[a] !== ' ' && ttt.board[a] === ttt.board[b2] && ttt.board[b2] === ttt.board[c]);
                const isDraw = !hasWon && ttt.board.every(c2 => c2 !== ' ');

                if (hasWon) {
                    gameSessions.delete(tttKey2);
                    await sock.sendMessage(from, {
                        text: '🎉 *TicTacToe — ' + ttt.currentSymbol + ' Wins!*\n\n' + renderBoard2(ttt.board) + '\n\n🏆 @' + sender.split('@')[0] + ' won!',
                        mentions: [sender]
                    }, { quoted: m });
                } else if (isDraw) {
                    gameSessions.delete(tttKey2);
                    await sock.sendMessage(from, {
                        text: '🤝 *TicTacToe — Draw!*\n\n' + renderBoard2(ttt.board) + '\n\nIt\'s a draw!',
                        mentions: Object.values(ttt.players)
                    }, { quoted: m });
                } else {
                    // Switch turn
                    const nextPlayer = ttt.currentSymbol === 'X' ? 'O' : 'X';
                    ttt.currentTurn = ttt.players[nextPlayer];
                    ttt.currentSymbol = nextPlayer;
                    await sock.sendMessage(from, {
                        text: '🎮 *TicTacToe*\n\n' + renderBoard2(ttt.board) + '\n\n@' + ttt.currentTurn.split('@')[0] + '\'s turn (' + nextPlayer + ')!\nReply: ' + prefix + 'tttmove <1-9>',
                        mentions: [ttt.currentTurn]
                    }, { quoted: m });
                }
                break;
            }

            //===================
            // restart (dev only)
            //===================
            

case 'restart': {
    const DEV_R = String(config.devNumber || config.botOwner || '').replace(/[^0-9]/g,'');
    const cleanSender = sender.split('@')[0].split(':')[0];
    if (!DEV_R || cleanSender !== DEV_R) return;
    await Shefzyreply('🔄 Restarting bot...');
    setTimeout(() => process.exit(0), 1000);
    break;
}
            //===================
            // couplepp: get random couple profile pictures
            //===================
            case 'couplepp': {
                try {
                    const cpRes = await axios.get('https://omegatech-api.dixonomega.tech/api/random/couple-pp', { timeout: 15000 });
                    const cpData = cpRes.data;
                    // Try various response fields
                    const cpImg1 = cpData?.image1 || cpData?.img1 || cpData?.couple1 || cpData?.result?.image1 || cpData?.images?.[0];
                    const cpImg2 = cpData?.image2 || cpData?.img2 || cpData?.couple2 || cpData?.result?.image2 || cpData?.images?.[1];
                    if (cpImg1) {
                        await sock.sendMessage(from, { image: { url: cpImg1 }, caption: '💑 *Couple PP 1*' }, { quoted: m });
                    }
                    if (cpImg2) {
                        await sock.sendMessage(from, { image: { url: cpImg2 }, caption: '💑 *Couple PP 2*' }, { quoted: m });
                    }
                    if (!cpImg1 && !cpImg2) {
                        // Try to find any image URL in the response
                        const rawStr = JSON.stringify(cpData);
                        const urlMatch = rawStr.match(/(https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp))/i);
                        if (urlMatch) {
                            await sock.sendMessage(from, { image: { url: urlMatch[1] }, caption: '💑 *Couple PP*' }, { quoted: m });
                        } else {
                            await Shefzyreply('❌ No couple images found!\n\nDebug: ' + rawStr.slice(0, 200));
                        }
                    }
                } catch (e) { await Shefzyreply('❌ Failed to get couple PP: ' + e.message); }
                break;
            }

            //===================
            // flux: Flux AI image generator
            //===================
            case 'fluxxmd':
case 'flux':
case 'img':
case 'generate': {
    const prompt = text;
    if (!prompt) {
        return Shefzyreply(`Usage: ${prefix}fluxxmd <image prompt>\n\nExample: ${prefix}fluxxmd a futuristic city at night`);
    }
    
    try {
        // React to user's message
        await sock.sendMessage(from, { react: { text: '🖼️', key: m.key } });
        
        // Send processing message
        const statusMsg = await sock.sendMessage(from, { text: '⏳ Generating image with Flux Pro...' }, { quoted: m });
        
        // API call
        const apiUrl = `https://arychauhann.onrender.com/api/fluxpro?prompt=${encodeURIComponent(prompt)}`;
        const { data } = await axios.get(apiUrl, {
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            responseType: 'arraybuffer'
        });
        
        // Get image buffer
        let imageBuffer;
        if (typeof data === 'object' && data.imageUrl) {
            const imgRes = await axios.get(data.imageUrl, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(imgRes.data);
        } else {
            imageBuffer = Buffer.from(data);
        }
        
        // Send image
        await sock.sendMessage(from, {
            image: imageBuffer,
            caption: `Generated with Flux Pro: "${prompt}"`,
            mimetype: 'image/png'
        }, { quoted: m });
        
        // Edit status to done
        await sock.sendMessage(from, { text: '✅ Image generated!', edit: statusMsg.key }, { quoted: m });
        
        // Success react
        await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
        
    } catch (error) {
        console.error('Flux command error:', error);
        const errorMsg = error.code === 'ECONNABORTED'
            ? 'Generation timeout - Try a simpler prompt'
            : error.response?.status === 429
            ? 'Rate limit exceeded - try again in a moment'
            : error.message || 'Unknown error occurred';
        
        await Shefzyreply(`Failed to generate image\n\nError: ${errorMsg}\nTry again in a moment`);
        await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
    }
    break;
}


            //===================
            // HEAVSTAL API EXTRA COMMANDS
            //===================

            //===================
            // Facebook video downloader
            //===================
            case 'fbdl':
            case 'facebook': {
                const fbUrl = args[0] || text;
                if (!fbUrl || !fbUrl.includes('facebook')) return Shefzyreply('❌ Usage: fbdl <facebook video link>');
                try {
                    await Shefzyreply('⏳ Downloading Facebook video...');
                    const hvFb = await axios.get(HEAVSTAL_BASE + '/downloader/facebook', {
                        params: { url: fbUrl }, headers: { 'x-api-key': HEAVSTAL_KEY }, timeout: 30000
                    });
                    const fbData = hvFb.data?.data || hvFb.data?.result || hvFb.data;
                    const fbVid = fbData?.sd || fbData?.hd || fbData?.video || fbData?.download;
                    if (!fbVid) return Shefzyreply('❌ No video found! Make sure post is public.');
                    await sock.sendMessage(from, { video: { url: fbVid }, caption: '✅ Facebook video!' }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Facebook download failed: ' + e.message); }
                break;
            }

            //===================
            // Soundcloud downloader
            //===================
            case 'soundcloud':
            case 'scdl': {
                const scUrl = args[0] || text;
                if (!scUrl || !scUrl.includes('soundcloud')) return Shefzyreply('❌ Usage: scdl <soundcloud track link>');
                try {
                    await Shefzyreply('⏳ Downloading SoundCloud track...');
                    const hvSc = await axios.get(HEAVSTAL_BASE + '/downloader/soundcloud', {
                        params: { url: scUrl }, headers: { 'x-api-key': HEAVSTAL_KEY }, timeout: 30000
                    });
                    const scData = hvSc.data?.data || hvSc.data?.result || hvSc.data;
                    const scUrl2 = scData?.download || scData?.url || scData?.audio;
                    if (!scUrl2) return Shefzyreply('❌ No audio found!');
                    const scTitle = scData?.title || 'SoundCloud';
                    await sock.sendMessage(from, { audio: { url: scUrl2 }, mimetype: 'audio/mpeg', ptt: false, fileName: scTitle + '.mp3' }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ SoundCloud download failed: ' + e.message); }
                break;
            }

            //===================
            // Instagram downloader via Heavstal
            //===================
            case 'igdl': {
                const igUrl = args[0] || text;
                if (!igUrl || !igUrl.includes('instagram')) return Shefzyreply('❌ Usage: igdl <instagram link>');
                try {
                    await Shefzyreply('⏳ Downloading from Instagram...');
                    const hvIg = await axios.get(HEAVSTAL_BASE + '/downloader/instagram', {
                        params: { url: igUrl }, headers: { 'x-api-key': HEAVSTAL_KEY }, timeout: 30000
                    });
                    const igData = hvIg.data?.data || hvIg.data?.result || hvIg.data;
                    const igMedia = igData?.url || igData?.video || igData?.image || igData?.download;
                    if (!igMedia) return Shefzyreply('❌ No media found! Make sure the post is public.');
                    const isIgVideo = igMedia.includes('.mp4') || igData?.type === 'video';
                    if (isIgVideo) {
                        await sock.sendMessage(from, { video: { url: igMedia }, caption: '✅ Instagram reel!' }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { image: { url: igMedia }, caption: '✅ Instagram photo!' }, { quoted: m });
                    }
                } catch (e) { await Shefzyreply('❌ Instagram download failed: ' + e.message); }
                break;
            }

            //===================
            // Text to speech (Heavstal TTS)
            //===================
            case 'tts':
            case 'speak': {
                if (!text) return Shefzyreply('❌ Usage: tts <text>\nExample: tts Hello World');
                try {
                    const hvTts = await axios.get(HEAVSTAL_BASE + '/tools/tts', {
                        params: { text, lang: args[0]?.length === 2 ? args[0] : 'en' },
                        headers: { 'x-api-key': HEAVSTAL_KEY },
                        responseType: 'arraybuffer', timeout: 20000
                    });
                    const ttsBuf = Buffer.from(hvTts.data);
                    await sock.sendMessage(from, { audio: ttsBuf, mimetype: 'audio/mpeg', ptt: true }, { quoted: m });
                } catch (e) {
                    // Fallback: free TTS
                    try {
                        const ttsUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + encodeURIComponent(text) + '&tl=en&client=tw-ob';
                        await sock.sendMessage(from, { audio: { url: ttsUrl }, mimetype: 'audio/mpeg', ptt: true }, { quoted: m });
                    } catch { await Shefzyreply('❌ TTS failed: ' + e.message); }
                }
                break;
            }

            //===================
            // Image to text (OCR)
            //===================
            case 'ocr':
            case 'imgtext': {
                if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to an image with ' + prefix + 'ocr');
                try {
                    await Shefzyreply('🔍 Reading text from image...');
                    const ocrBuf = await m.quoted.download();
                    const ocrForm = new FormData();
                    ocrForm.append('image', ocrBuf, { filename: 'img.jpg', contentType: 'image/jpeg' });
                    const hvOcr = await axios.post(HEAVSTAL_BASE + '/tools/ocr', ocrForm, {
                        headers: { ...ocrForm.getHeaders(), 'x-api-key': HEAVSTAL_KEY }, timeout: 30000
                    });
                    const ocrText = hvOcr.data?.data?.text || hvOcr.data?.text || hvOcr.data?.result;
                    if (!ocrText) return Shefzyreply('❌ No text found in image!');
                    await Shefzyreply('📄 *Text from Image:*\n\n' + ocrText);
                } catch (e) { await Shefzyreply('❌ OCR failed: ' + e.message); }
                break;
            }

            //===================
            // Weather via Heavstal
            //===================
            case 'wx':
            case 'wth': {
                if (!text) return Shefzyreply('❌ Usage: wth <city name>');
                try {
                    const hvWx = await axios.get(HEAVSTAL_BASE + '/tools/weather', {
                        params: { city: text }, headers: { 'x-api-key': HEAVSTAL_KEY }, timeout: 15000
                    });
                    const wx = hvWx.data?.data || hvWx.data?.result || hvWx.data;
                    if (!wx) return Shefzyreply('❌ City not found!');
                    const wxTxt = '🌤️ *Weather: ' + text + '*\n\n' +
                        '🌡️ Temp: ' + (wx.temp || wx.temperature || 'N/A') + '°C\n' +
                        '💧 Humidity: ' + (wx.humidity || 'N/A') + '%\n' +
                        '💨 Wind: ' + (wx.wind || wx.wind_speed || 'N/A') + '\n' +
                        '☁️ Condition: ' + (wx.condition || wx.description || 'N/A');
                    await Shefzyreply(wxTxt);
                } catch (e) { await Shefzyreply('❌ Weather failed: ' + e.message); }
                break;
            }


            //===================
            // screenshot: Heavstal website screenshot
            //===================
            case 'screenshot': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'screenshot <url> [--phone|--tablet]\nExample: screenshot https://github.com --phone');
                let targetUrl = text.trim();
                let deviceType = 'desktop';
                if (targetUrl.includes('--phone') || targetUrl.includes('--mobile')) {
                    deviceType = 'phone';
                    targetUrl = targetUrl.replace('--phone', '').replace('--mobile', '').trim();
                } else if (targetUrl.includes('--tablet')) {
                    deviceType = 'tablet';
                    targetUrl = targetUrl.replace('--tablet', '').trim();
                }
                if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
                try {
                    await Shefzyreply('📸 Taking screenshot...');
                    const ssRes = await axios.post('https://heavstal.com.ng/apis/screenshot', {
                        url: targetUrl, type: deviceType
                    }, {
                        headers: { 'Content-Type': 'application/json', 'x-api-key': HEAVSTAL_KEY },
                        timeout: 30000
                    });
                    const ssData = ssRes.data;
                    if (ssData.status === 'success' && ssData.data?.link) {
                        await sock.sendMessage(from, {
                            image: { url: ssData.data.link },
                            caption: '📸 *Website Screenshot*\n\n🔗 ' + (ssData.data.url || targetUrl) + '\n📱 Device: ' + deviceType
                        }, { quoted: m });
                    } else {
                        await Shefzyreply('❌ Screenshot failed: ' + (ssData.error || 'Unknown error'));
                    }
                } catch (e) {
                    console.log('screenshot err:', e.message);
                    // Fallback to thum.io
                    await sock.sendMessage(from, {
                        image: { url: 'https://image.thum.io/get/fullpage/' + targetUrl },
                        caption: '📸 Screenshot of: ' + targetUrl
                    }, { quoted: m });
                }
                break;
            }

            //===================
            // imgur: upload image to Imgur
            //===================
            case 'imgur': {
                if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to an image with ' + prefix + 'imgur');
                try {
                    await Shefzyreply('⏳ Uploading to Imgur...');
                    const imgurBuf = await m.quoted.download();
                    const imgurForm = new FormData();
                    imgurForm.append('image', imgurBuf, 'image.jpg');
                    const imgurRes = await axios.post('https://kaiz-apis.gleeze.com/api/imgur?apikey=a0ebe80e-bf1a-4dbf-8d36-6935b1bfa5ea', imgurForm, {
                        headers: imgurForm.getHeaders(), timeout: 30000
                    });
                    const imgurLink = imgurRes.data?.uploaded?.link;
                    if (!imgurLink) return Shefzyreply('❌ Upload failed!');
                    await Shefzyreply('✅ Uploaded to Imgur:\n' + imgurLink);
                    await sock.sendMessage(from, { image: { url: imgurLink }, caption: '🖼️ Uploaded to Imgur' }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Imgur upload failed: ' + e.message); }
                break;
            }

            //===================
            // gimage: Google image search
            //===================
            case 'gimage':
            case 'gsearch': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'gimage <query>\nExample: gimage cute cats');
                try {
                    await Shefzyreply('🔍 Searching images for: *' + text + '*...');
                    // Use Unsplash as a reliable free image search
                    const unRes = await axios.get('https://api.unsplash.com/photos/random', {
                        params: { query: text, count: 1 },
                        headers: { Authorization: 'Client-ID KTl0_BIpXqSB9VJ0RoJzW1QAT5bJ0JXa5qjPqgNz0v4' },
                        timeout: 12000
                    });
                    const unImg = unRes.data?.[0]?.urls?.regular;
                    if (unImg) {
                        await sock.sendMessage(from, { image: { url: unImg }, caption: '🖼️ *' + text + '*' }, { quoted: m });
                    } else {
                        // Fallback: DuckDuckGo image API
                        const ddgRes = await axios.get('https://api.duckduckgo.com/?q=' + encodeURIComponent(text) + '&iax=images&ia=images&format=json', { timeout: 10000 });
                        const ddgImg = ddgRes.data?.RelatedTopics?.[0]?.Icon?.URL;
                        if (ddgImg) {
                            await sock.sendMessage(from, { image: { url: ddgImg }, caption: '🖼️ ' + text }, { quoted: m });
                        } else {
                            await Shefzyreply('❌ No images found for: ' + text);
                        }
                    }
                } catch (e) { await Shefzyreply('❌ Image search failed: ' + e.message); }
                break;
            }

            //===================
            // gen: AI image generation via Pollinations
            //===================
            case 'gen':
            case 'pollinations': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'gen <prompt>\nExample: gen anime girl in space');
                try {
                    await Shefzyreply('🎨 Generating image...');
                    const genUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(text) + '?width=512&height=512&nologo=1';
                    const genRes = await axios.get(genUrl, { responseType: 'arraybuffer', timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                    await sock.sendMessage(from, {
                        image: Buffer.from(genRes.data),
                        caption: '🎨 *AI Generated*\n📝 ' + text,
                        mimetype: 'image/jpeg'
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Image generation failed: ' + e.message); }
                break;
            }

            //===================
            // emojimix: mix two emojis into a sticker
            //===================
            case 'emojimix':
            case 'emix': {
                if (!text || !text.includes('+')) return Shefzyreply('❌ Usage: ' + prefix + 'emojimix 😎+🥰\nSeparate emojis with +');
                try {
                    const [em1, em2] = text.split('+');
                    const TENOR_KEY = process.env.TENOR_API_KEY || '';
                    const emUrl = 'https://tenor.googleapis.com/v2/featured?key=' + TENOR_KEY + '&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=' + encodeURIComponent(em1.trim()) + '_' + encodeURIComponent(em2.trim());
                    const emRes = await axios.get(emUrl, { timeout: 10000 });
                    if (!emRes.data?.results?.length) return Shefzyreply('❌ These emojis cannot be mixed!');
                    const emImgUrl = emRes.data.results[0].media_formats?.png_transparent?.url;
                    if (!emImgUrl) return Shefzyreply('❌ No mix result found!');
                    const emBuf = await axios.get(emImgUrl, { responseType: 'arraybuffer', timeout: 15000 });
                    const emStkBuf = Buffer.from(emBuf.data);
                    const emSticker = await imageToSticker(emStkBuf, config.stickerPackname || config.botName, config.stickerAuthor || config.botOwner);
                    await sock.sendMessage(from, { sticker: emSticker }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Emoji mix failed: ' + e.message); }
                break;
            }

            //===================
            // catfact: random cat fact
            //===================
            case 'catfact': {
                try {
                    const cfRes = await axios.get('https://catfact.ninja/fact', { timeout: 10000 });
                    await Shefzyreply('🐱 *Did You Know?*\n\n' + cfRes.data.fact);
                } catch { await Shefzyreply('❌ Failed to fetch cat fact!'); }
                break;
            }

            //===================
            // simi: AI chatbot via SimSimi
            //===================
            case 'simi': {
                if (!text) return Shefzyreply('❌ Usage: ' + prefix + 'simi <message>\nExample: simi Hello');
                try {
                    const simiRes = await axios.get('https://api.simsimi.net/v2/?text=' + encodeURIComponent(text) + '&lc=en', { timeout: 12000 });
                    const simiReply = simiRes.data?.success;
                    if (simiReply) {
                        await Shefzyreply('🤖 *Simi:* ' + simiReply);
                    } else {
                        // Fallback: Groq chatbot
                        if (config.groqApiKey) {
                            const grSimi = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                                model: AIP.model('groq'),
                                messages: [{ role: 'user', content: text }],
                                max_tokens: 200
                            }, { headers: { Authorization: 'Bearer ' + config.groqApiKey }, timeout: 12000 });
                            await Shefzyreply('🤖 ' + (grSimi.data?.choices?.[0]?.message?.content || 'No response'));
                        } else {
                            await Shefzyreply('😴 Simi is sleeping, try again later!');
                        }
                    }
                } catch (e) { await Shefzyreply('❌ Simi failed: ' + e.message); }
                break;
            }

            //===================
            // riddle: random riddle
            //===================
            case 'riddle': {
                try {
                    const rdRes = await axios.get('https://riddles-api.vercel.app/random', { timeout: 10000 });
                    await Shefzyreply('🧩 *Riddle Time!*\n\n❓ *Riddle:* ' + rdRes.data.riddle + '\n\n🔍 *Answer:* ||' + rdRes.data.answer + '||');
                } catch { await Shefzyreply('❌ Failed to get riddle!'); }
                break;
            }

            //===================
            // ship: love compatibility calculator
            //===================
            case 'ship': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                const shipMentions = m.msg?.contextInfo?.mentionedJid || m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (shipMentions.length < 2) return Shefzyreply('❌ Mention two users!\nExample: ' + prefix + 'ship @user1 @user2');
                try {
                    const [u1, u2] = shipMentions;
                    const score = Math.floor(Math.random() * 101);
                    let verdict = score < 10 ? '💔 Barely a spark. Maybe just friends?' :
                        score < 30 ? '🤔 Something there, but needs work.' :
                        score < 70 ? '😊 A solid match! Looking good!' :
                        score < 90 ? '💖 Incredibly compatible!' : '💍 Soulmates! Get a room!';
                    const shipText = '💞 *Love Compatibility*\n\n👤 @' + u1.split('@')[0] + '\n👤 @' + u2.split('@')[0] + '\n\n💯 Score: *' + score + '%*\n💬 ' + verdict;
                    await sock.sendMessage(from, { text: shipText, mentions: [u1, u2] }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Ship failed: ' + e.message); }
                break;
            }

            //===================
            // whois: user info lookup
            //===================
            case 'whois': {
                try {
                    const target = resolveTarget(args[0]) || sender;
                    const number = target.split('@')[0];
                    let pfp = null;
                    try { pfp = await sock.profilePictureUrl(target, 'image'); } catch {}
                    let bio = 'No bio available';
                    try { const st = await sock.fetchStatus(target); bio = st?.status || bio; } catch {}
                    const info = '✨ *User Information*\n\n👤 *Number:* +' + number + '\n📝 *Bio:* ' + bio + '\n🔗 *Chat:* wa.me/' + number;
                    if (pfp) {
                        await sock.sendMessage(from, { image: { url: pfp }, caption: info, mentions: [target] }, { quoted: m });
                    } else {
                        await sock.sendMessage(from, { text: info, mentions: [target] }, { quoted: m });
                    }
                } catch (e) { await Shefzyreply('❌ Failed to fetch user info: ' + e.message); }
                break;
            }

            //===================
            // truth: truth or dare
            //===================
            case 'truth': {
                try {
                    const trRes = await axios.get('https://api.truthordarebot.xyz/v1/truth', { timeout: 10000 });
                    await Shefzyreply('🤫 *Truth Time!* 😮\n\n' + trRes.data.question);
                } catch {
                    const truths = ['What is your biggest secret?', 'Have you ever lied to a best friend?', 'What is the most embarrassing thing you have done?'];
                    await Shefzyreply('🤫 *Truth:* ' + truths[Math.floor(Math.random()*truths.length)]);
                }
                break;
            }

            //===================
            // dare: dare command
            //===================
            case 'dare': {
                try {
                    const drRes = await axios.get('https://api.truthordarebot.xyz/v1/dare', { timeout: 10000 });
                    await Shefzyreply("🔥 *It's a Dare!* 🔥\n\n" + drRes.data.question);
                } catch {
                    const dares = ['Do 20 pushups right now!', 'Send a voice note singing a song', 'Change your profile picture for 1 hour'];
                    await Shefzyreply('🔥 *Dare:* ' + dares[Math.floor(Math.random()*dares.length)]);
                }
                break;
            }

            //===================
            // pickupline: random pickup line
            //===================
            case 'pickupline': {
                const plines = [
                    'Are you a magician? Because whenever I look at you, everyone else disappears.',
                    'Do you have a map? I keep getting lost in your eyes.',
                    "Are you a keyboard? Because you're just my type.",
                    "Is your name Google? Because you have everything I've been searching for.",
                    'Do you believe in love at first sight, or should I walk by again?',
                ];
                try {
                    const plRes = await axios.get('https://v2.jokeapi.dev/joke/Any?type=single', { timeout: 8000 });
                    await Shefzyreply('💘 ' + (plRes.data?.joke || plines[Math.floor(Math.random()*plines.length)]));
                } catch { await Shefzyreply('💘 ' + plines[Math.floor(Math.random()*plines.length)]); }
                break;
            }

            //===================
            // insult: random insult
            //===================
            case 'insult': {
                try {
                    const inRes = await axios.get('https://evilinsult.com/generate_insult.php?lang=en&type=json', { timeout: 10000 });
                    await Shefzyreply('😈 ' + inRes.data.insult);
                } catch {
                    await Shefzyreply("😈 You're the reason God created the middle finger.");
                }
                break;
            }

            //===================
            // mediafire: download MediaFire files
            //===================
            case 'mediafire':
            case 'mfdl': {
                const mfUrl = args[0] || text;
                if (!mfUrl || !mfUrl.includes('mediafire')) return Shefzyreply('❌ Usage: ' + prefix + 'mediafire <mediafire link>');
                try {
                    await Shefzyreply('⏳ Fetching MediaFire file...');
                    const mfRes = await axios.get('https://api.dreaded.site/api/mediafiredl?url=' + encodeURIComponent(mfUrl), { timeout: 20000 });
                    const file = mfRes.data?.result || mfRes.data?.data || mfRes.data;
                    if (!file) return Shefzyreply('❌ Could not get file info!');
                    const fileName = file.filename || file.name || 'file';
                    const fileSize = file.filesize || file.size || 'Unknown';
                    const dlUrl = file.link || file.url || file.download;
                    if (!dlUrl) return Shefzyreply('❌ No download link found!');
                    await Shefzyreply('📁 *MediaFire File*\n\n🧾 *Name:* ' + fileName + '\n📏 *Size:* ' + fileSize + '\n\n⏳ Sending...');
                    await sock.sendMessage(from, {
                        document: { url: dlUrl },
                        mimetype: 'application/octet-stream',
                        fileName: fileName,
                        caption: '📁 ' + fileName + ' (' + fileSize + ')'
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ MediaFire download failed: ' + e.message); }
                break;
            }

            //===================
            // mediatag: tag all with media
            //===================
            case 'mediatag': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isBotAdmin) return Shefzyreply('❌ Bot must be admin!');
                if (!m.quoted || !['imageMessage','videoMessage'].includes(m.quoted.mtype)) return Shefzyreply('❌ Reply to an image or video!');
                try {
                    const mtMedia = await m.quoted.download();
                    const mtMeta = await sock.groupMetadata(from);
                    const mtMentions = mtMeta.participants.map(p => p.id);
                    const mtType = m.quoted.mtype === 'imageMessage' ? 'image' : 'video';
                    await sock.sendMessage(from, {
                        [mtType]: mtMedia,
                        caption: '📢 Attention everyone! @' + sender.split('@')[0],
                        mentions: mtMentions
                    }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Mediatag failed: ' + e.message); }
                break;
            }

            //===================
            // twitter/tw: Twitter/X video downloader
            //===================
            case 'tw':
            case 'twitter': {
                const twUrl = args[0] || text;
                if (!twUrl || !/twitter\.com|x\.com/.test(twUrl)) return Shefzyreply('❌ Usage: ' + prefix + 'tw <twitter/X link>');
                try {
                    await Shefzyreply('⏳ Downloading Twitter video...');
                    const twRes = await axios.get('https://kaiz-apis.gleeze.com/api/downloader/twitter?url=' + encodeURIComponent(twUrl) + '&apikey=a0ebe80e-bf1a-4dbf-8d36-6935b1bfa5ea', { timeout: 30000 });
                    const twVid = twRes.data?.result?.videos || twRes.data?.result?.url;
                    if (!twVid) return Shefzyreply('❌ No video found! Post may be private or not a video.');
                    await sock.sendMessage(from, { video: { url: twVid }, caption: twRes.data?.result?.description || '✅ Twitter video' }, { quoted: m });
                } catch (e) { await Shefzyreply('❌ Twitter download failed: ' + e.message); }
                break;
            }

            //===================
            // gemini-vision: describe image using Gemini
            //===================
            case 'gemini-vision':
            case 'describe': {
                let imgUrlToDescribe = text;
                if (!imgUrlToDescribe && m.quoted?.mtype === 'imageMessage') {
                    // Upload quoted image first
                    try {
                        const dBuf = await m.quoted.download();
                        const dForm = new FormData();
                        dForm.append('image', dBuf, 'img.jpg');
                        const dUp = await axios.post('https://kaiz-apis.gleeze.com/api/imgur?apikey=a0ebe80e-bf1a-4dbf-8d36-6935b1bfa5ea', dForm, { headers: dForm.getHeaders(), timeout: 20000 });
                        imgUrlToDescribe = dUp.data?.uploaded?.link;
                    } catch {}
                }
                if (!imgUrlToDescribe) return Shefzyreply('❌ Usage: describe <image url> OR reply to an image');
                try {
                    await Shefzyreply('👁️ Analyzing image...');
                    const gvRes = await axios.get('https://kaiz-apis.gleeze.com/api/gemini-vision?q=Describe+this+image+in+detail&uid=1268&imageUrl=' + encodeURIComponent(imgUrlToDescribe) + '&apikey=a0ebe80e-bf1a-4dbf-8d36-6935b1bfa5ea', { timeout: 20000 });
                    const desc = gvRes.data?.response || gvRes.data?.text;
                    if (!desc) return Shefzyreply('❌ Could not describe image!');
                    await Shefzyreply('👁️ *Image Description:*\n\n' + desc);
                } catch (e) { await Shefzyreply('❌ Vision failed: ' + e.message); }
                break;
            }

            //===================
            // antispam: toggle anti-spam in groups
            //===================
            case 'antispam': {
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                const asSub = args[0]?.toLowerCase();
                if (!asSub || !['on','off','warn','warn/delete','kick','delete/kick'].includes(asSub))
                    return Shefzyreply('❌ Usage: antispam on/off/warn/kick');
                const prot = getGroupProtection(sock, from);
                prot.antispam = asSub === 'off' ? false : asSub;
                saveProtection();
                await Shefzyreply(`✅ Antispam set to *${asSub.toUpperCase()}*`);
                break;
            }

            //===================
            // antibadword: toggle word filter
            //===================
            case 'antibadword':
case 'antibadwords': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const bwSub = args[0]?.toLowerCase();
    const prot = getGroupProtection(sock, from);
    if (!prot.badWords) prot.badWords = [];

    if (bwSub === 'on') {
        pendingAntiAction.set(sender + from, { feature: 'antibadword' });
        await sock.sendMessage(from, {
            text: '🚫 *Anti-BadWord Activated!*\n\n' +
                '📋 Using ' + prot.badWords.length + ' default bad word(s).\n' +
                'Add more anytime: ' + prefix + 'antibadword add <word>\n\n' +
                'Choose what happens when a bad word is detected:\n\n' +
                '1️⃣ Delete only\n2️⃣ Warn & Delete\n3️⃣ Delete & Kick\n\n' +
                'Reply with 1, 2, or 3.'
        }, { quoted: m });
        setTimeout(() => pendingAntiAction.delete(sender + from), 30000);
    } else if (bwSub === 'off') {
        prot.antibadword = false; saveProtection();
        await Shefzyreply('❌ Anti-badword OFF.');
    } else if (bwSub === 'add' && args[1]) {
        const wordToAdd = args.slice(1).join(' ').toLowerCase();
        if (!prot.badWords.includes(wordToAdd)) {
            prot.badWords.push(wordToAdd); saveProtection();
            await Shefzyreply('✅ Added "' + wordToAdd + '" to bad words list!\n📋 Total: ' + prot.badWords.length);
        } else await Shefzyreply('⚠️ Already in list!');
    } else if (bwSub === 'remove' && args[1]) {
        const wordToRemove = args.slice(1).join(' ').toLowerCase();
        const before = prot.badWords.length;
        prot.badWords = prot.badWords.filter(w => w !== wordToRemove); saveProtection();
        if (prot.badWords.length < before) {
            await Shefzyreply('✅ Removed "' + wordToRemove + '" from list!\n📋 Total: ' + prot.badWords.length);
        } else {
            await Shefzyreply('⚠️ "' + wordToRemove + '" was not in the list!');
        }
    } else if (bwSub === 'list') {
        await Shefzyreply(
            '📝 *Bad Words List* (' + prot.badWords.length + ')\n\n' +
            (prot.badWords.length ? prot.badWords.join(', ') : 'None — list is empty') +
            '\n\n💡 ' + prefix + 'antibadword add <word>\n💡 ' + prefix + 'antibadword remove <word>\n💡 ' + prefix + 'antibadword reset'
        );
    } else if (bwSub === 'reset') {
        prot.badWords = [
            'fuck', 'fucking', 'fucker', 'motherfucker',
            'bitch', 'bastard', 'asshole', 'cunt',
            'nigger', 'nigga', 'whore', 'slut',
            'dick', 'pussy', 'retard', 'faggot'
        ];
        saveProtection();
        await Shefzyreply('🔄 Bad words list reset to default (' + prot.badWords.length + ' words).');
    } else if (bwSub === 'status') {
        await Shefzyreply(
            '📊 *Anti-BadWord Status*\n\n' +
            'Enabled: ' + (prot.antibadword ? '✅ ' + prot.antibadword : '❌ OFF') + '\n' +
            'Words tracked: ' + prot.badWords.length
        );
    } else {
        await Shefzyreply(
            'Usage:\n' +
            prefix + 'antibadword on/off\n' +
            prefix + 'antibadword add <word>\n' +
            prefix + 'antibadword remove <word>\n' +
            prefix + 'antibadword list\n' +
            prefix + 'antibadword reset\n' +
            prefix + 'antibadword status'
        );
    }
    break;
}

            //===================
            // totalmembers: show member count
            //===================
            case 'totalmembers':
            case 'membercount': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                try {
                    const tmMeta = await sock.groupMetadata(from);
                    const admins = tmMeta.participants.filter(p => p.admin).length;
                    const members = tmMeta.participants.length - admins;
                    await Shefzyreply('👥 *' + tmMeta.subject + '*\n\n' +
                        '👤 Total: *' + tmMeta.participants.length + '*\n' +
                        '⭐ Admins: *' + admins + '*\n' +
                        '👥 Members: *' + members + '*');
                } catch (e) { await Shefzyreply('❌ Failed: ' + e.message); }
                break;
            }

            //===================
            // antipromote / antidemote
            //===================
            case 'antipromote': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const apSub = args[0]?.toLowerCase();
    if (!['on','off'].includes(apSub)) return Shefzyreply('❌ Usage: antipromote on/off');
    const prot = getGroupProtection(sock, from);
    prot.antipromote = apSub === 'on'; saveProtection();
    await Shefzyreply('🛡️ Anti-promote: *' + apSub.toUpperCase() + '*');
    break;
}

case 'antidemote': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const adSub = args[0]?.toLowerCase();
    if (!['on','off'].includes(adSub)) return Shefzyreply('❌ Usage: antidemote on/off');
    const prot = getGroupProtection(sock, from);
    prot.antidemote = adSub === 'on'; saveProtection();
    await Shefzyreply('🛡️ Anti-demote: *' + adSub.toUpperCase() + '*');
    break;
}

            //===================
            // modsettings: show all protection settings
            //===================
            case 'modsettings':
            case 'modstatus': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                const prot = getGroupProtection(sock, from);
                const modMsg = '📋 *Moderation Settings*\n\n' +
                    '🔗 Anti-link: ' + (prot.antilink ? '✅' : '❌') + '\n' +
                    '📨 Anti-fwd: ' + (prot.antifwd ? '✅' : '❌') + '\n' +
                    '🤖 Anti-bot: ' + (prot.antibot ? '✅' : '❌') + '\n' +
                    '💬 Anti-spam: ' + (prot.antispam ? '✅' : '❌') + '\n' +
                    '🏷️ Anti-groupmention: ' + (prot.antigroupmention ? '✅' : '❌') + '\n' +
                    '🚫 Anti-badword: ' + (prot.antibadword ? '✅' : '❌') + '\n' +
                    '📈 Anti-promote: ' + (prot.antipromote ? '✅' : '❌') + '\n' +
                    '📉 Anti-demote: ' + (prot.antidemote ? '✅' : '❌') + '\n' +
                    '🌊 Flood: ' + (prot.flood ? '✅' : '❌');
                await Shefzyreply(modMsg);
                break;
            }

            //===================
            // resetwarns: reset all warns for user
            //===================
            case 'resetwarns': {
                if (!isGroup) return Shefzyreply('❌ Groups only!');
                if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
                const rwTarget = resolveTarget(args[0]);
                if (!rwTarget) return Shefzyreply('❌ Reply to or @mention the user!');
                const prot = getGroupProtection(sock, from);
                prot.warnCount.delete(rwTarget); saveProtection();
                await Shefzyreply('✅ Warns reset for @' + rwTarget.split('@')[0]);
                break;
            }
            
case 'album': {
    if (!isGroup && !isCreator && !isSudo) return Shefzyreply('❌ Groups or owner only!');
    // Use same detection as `sticker` command
    const hasMedia = /image|video/.test(m.mtype) || (m.quoted && /image|video/.test(m.quoted.mtype));
    if (!hasMedia) {
        return Shefzyreply(`Please reply to an image/video or send one with the command *${prefix}album*`);
    }
    try {
        let mediaBuffer;
        let caption = '';
        let isImage = false;
        if (m.quoted && /image|video/.test(m.quoted.mtype)) {
            mediaBuffer = await m.quoted.download();
            caption = m.quoted.caption || '';
            isImage = m.quoted.mtype === 'imageMessage';
        } else {
            mediaBuffer = await m.download();
            caption = m.caption || '';
            isImage = m.mtype === 'imageMessage';
        }
        const albumMessages = [];
        if (isImage) {
            albumMessages.push({ image: mediaBuffer, caption: caption });
        } else {
            albumMessages.push({ video: mediaBuffer, caption: caption });
        }
        await sock.sendMessage(from, { album: albumMessages }, { quoted: m });
    } catch (e) {
        console.error('Album error:', e);
        Shefzyreply('❌ Failed to create album. Make sure the media is valid.');
    }
    break;
}

case 'button': {
    if (!isGroup && !isCreator && !isSudo) return Shefzyreply('❌ Groups or owner only!');
    const question = args.slice(0, -2).join(' ') || 'Choose an option';
    const btns = args.slice(-2);
    if (btns.length !== 2) return Shefzyreply('❌ Usage: .button Question | Button1 | Button2');
    
    await sock.sendMessage(from, {
        text: question,
        buttons: [
            { buttonId: 'btn1', buttonText: { displayText: btns[0] }, type: 1 },
            { buttonId: 'btn2', buttonText: { displayText: btns[1] }, type: 1 }
        ],
        viewOnce: true
    }, { quoted: m });
    break;
}

case 'list': {
    if (!isGroup && !isCreator && !isSudo) return Shefzyreply('❌ Groups or owner only!');
    const title = args[0] || 'Menu';
    const description = args[1] || 'Choose an option';
    const sections = [{ title: 'Options', rows: [] }];
    for (let i = 2; i < args.length; i++) {
        sections[0].rows.push({ title: args[i], rowId: `opt${i-1}` });
    }
    if (sections[0].rows.length === 0) return Shefzyreply('❌ Provide at least one option.');
    
    await sock.sendMessage(from, {
        text: `📋 *${title}*\n${description}`,
        footer: 'Tap an option',
        list: { buttonText: 'Select', sections }
    }, { quoted: m });
    break;
}

case 'edit': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner only!');
    if (!m.quoted || !m.quoted.fromMe) return Shefzyreply('❌ Reply to a message sent by the bot.');
    if (!text) return Shefzyreply('❌ Provide the new text.');
    await sock.sendMessage(from, { text: text, edit: m.quoted.key }, { quoted: m });
    await Shefzyreply('✅ Message edited.');
    break;
}

case 'keep': {
    if (!m.quoted) return Shefzyreply('❌ Reply to a message you want to keep.');
    await sock.sendMessage(from, { keepInChat: true, key: m.quoted.key });
    await Shefzyreply('✅ Message will not disappear.');
    break;
}

case 'fwdviewonce': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner only!');
    if (!m.quoted) return Shefzyreply('❌ Reply to a view‑once message.');
    const isViewOnce = m.quoted.mtype === 'viewOnceMessageV2' || m.quoted.mtype === 'viewOnceMessage' || m.quoted.viewOnce === true;
    if (!isViewOnce) return Shefzyreply('❌ That is not a view‑once message!');
    const target = args[0] || sender;
    const jid = target.includes('@') ? target : target + '@s.whatsapp.net';
    try {
        const buffer = await m.quoted.download();
        const isVideo = m.quoted.mtype === 'videoMessage' || m.quoted?.video;
        if (isVideo) {
            await sock.sendMessage(jid, { video: buffer, caption: '👁️ View‑once forwarded' });
        } else {
            await sock.sendMessage(jid, { image: buffer, caption: '👁️ View‑once forwarded' });
        }
        await Shefzyreply(`✅ View‑once sent to ${jid}`);
    } catch (e) {
        await Shefzyreply(`❌ Failed: ${e.message}`);
    }
    break;
}

case 'reactto': {
    const emoji = args[0];
    if (!emoji) return Shefzyreply('❌ Usage: .reactto <emoji> (reply to a message)');
    if (!m.quoted) return Shefzyreply('❌ Reply to a message you want to react to.');
    await sock.sendMessage(from, { react: { text: emoji, key: m.quoted.key } }, { quoted: m });
    await Shefzyreply(`✅ Reacted with ${emoji}`);
    break;
}

case 'pollresults': {
    if (!m.quoted || m.quoted.mtype !== 'pollCreationMessage') return Shefzyreply('❌ Reply to a poll message.');
    const poll = m.quoted;
    const name = poll.name;
    const options = poll.options || [];
    const votes = poll.voters || [];
    let result = `📊 *Poll Results*\n📌 ${name}\n\n`;
    options.forEach(opt => {
        const count = votes.filter(v => v.selectedOptions?.some(o => o.name === opt.name)).length;
        result += `• ${opt.name}: ${count} vote(s)\n`;
    });
    await Shefzyreply(result);
    break;
}

case 'mute-gc': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const duration = args[0] || '1h';
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return Shefzyreply('❌ Invalid duration. Examples: 1h, 30m, 1d');
    const milliseconds = parseInt(match[1]) * units[match[2]];
    await sock.chatModify({ mute: milliseconds }, from);
    await Shefzyreply(`🔇 Group muted for ${duration}.`);
    break;
}

case 'unmute-gc': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    await sock.chatModify({ mute: null }, from);
    await Shefzyreply('🔊 Group unmuted.');
    break;
}

case 'announcement': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    if (!text) return Shefzyreply('❌ Provide the announcement text.');
    await sock.groupUpdateAnnounce(from, text);
    await Shefzyreply('📌 Announcement updated.');
    break;
}

case 'report': {
    if (!isCreator && !isSudo) return Shefzyreply('❌ Owner only!');
    let target = resolveTarget(args[0]);
    if (!target && m.quoted) target = m.quoted.sender;
    if (!target) return Shefzyreply('❌ Reply to a message or provide a JID/number.');
    try {
        await sock.reportUser(target);
        await Shefzyreply(`🚨 Reported ${target} to WhatsApp.`);
    } catch (e) {
        await Shefzyreply(`❌ Failed: ${e.message}`);
    }
    break;
}


case 'contact': {
    const phone = args[0]?.replace(/[^0-9]/g, '');
    if (!phone) return Shefzyreply('❌ Usage: .contact <number> [name]');
    const name = args.slice(1).join(' ') || phone;
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEND:VCARD`;
    await sock.sendMessage(from, { contacts: { displayName: name, contacts: [{ vcard }] } }, { quoted: m });
    break;
}


case 'event': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    if (!isAdmin && !isSudo && !isCreator) return Shefzyreply('❌ Admin only!');
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 3) return Shefzyreply('❌ Usage: .event <title> | <DD/MM/YYYY> | <HH:MM>');
    const [title, date, time] = parts;
    await sock.sendMessage(from, { event: { title, date, time } }, { quoted: m });
    await Shefzyreply('📅 Event created.');
    break;
}

case 'eventinfo': {
    if (!m.quoted || m.quoted.mtype !== 'eventMessage') return Shefzyreply('❌ Reply to an event message.');
    const ev = m.quoted;
    await Shefzyreply(`📅 *${ev.title}*\n📆 ${ev.date}\n⏰ ${ev.time}\n📍 ${ev.location || 'Not set'}`);
    break;
}           

case 'online': {
    const target = resolveTarget(args[0]) || sender;
    try {
        const presence = await sock.presenceSubscribe(target);
        const status = presence?.lastKnownPresence === 'available' ? '🟢 Online' : '⚫ Offline';
        await Shefzyreply(`📱 *${target.split('@')[0]}*: ${status}`);
    } catch {
        await Shefzyreply('❌ Could not fetch presence.');
    }
    break;
}

case 'stickerinfo': {
    if (!m.quoted || m.quoted.mtype !== 'stickerMessage') return Shefzyreply('❌ Reply to a sticker.');
    const buffer = await m.quoted.download();
    let pack = 'Unknown', author = 'Unknown', emojis = '🤖';
    try {
        // Find EXIF chunk in WebP file
        if (buffer.length > 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF') {
            let pos = 12;
            while (pos + 8 <= buffer.length) {
                const chunkId = buffer.slice(pos, pos + 4).toString('ascii');
                const chunkSize = buffer.readUInt32LE(pos + 4);
                const chunkEnd = pos + 8 + chunkSize + (chunkSize % 2);
                if (chunkId === 'EXIF') {
                    const exifData = buffer.slice(pos + 8, chunkEnd);
                    // EXIF contains TIFF header + JSON string
                    const jsonStart = exifData.indexOf('{');
                    if (jsonStart !== -1) {
                        const jsonStr = exifData.slice(jsonStart).toString('utf-8');
                        const meta = JSON.parse(jsonStr);
                        pack = meta['sticker-pack-name'] || 'Unknown';
                        author = meta['sticker-pack-publisher'] || 'Unknown';
                        emojis = (meta.emojis && meta.emojis[0]) || '🤖';
                    }
                    break;
                }
                pos = chunkEnd;
                if (pos >= buffer.length) break;
            }
        }
    } catch (e) { console.log('EXIF read error:', e); }
    await Shefzyreply(`📦 *Pack:* ${pack}\n✍️ *Author:* ${author}\n😊 *Emojis:* ${emojis}`);
    break;
}

case 'mich-meme': {
    if (!m.quoted || m.quoted.mtype !== 'imageMessage') return Shefzyreply('❌ Reply to an image.');
    if (!text) return Shefzyreply('❌ Usage: .meme <top text> | <bottom text>');
    const [top, bottom] = text.split('|').map(s => s.trim());
    const sharp = require('sharp');
    const imgBuf = await m.quoted.download();
    const { width, height } = await sharp(imgBuf).metadata();
    const fontSize = Math.floor(width / 8);
    const svgOverlay = `
        <svg width="${width}" height="${height}">
            <rect width="${width}" height="80" fill="rgba(0,0,0,0.6)" x="0" y="0"/>
            <text x="50%" y="50" fill="white" font-size="${fontSize}" font-weight="bold" text-anchor="middle" font-family="Impact">${top || ''}</text>
            <rect width="${width}" height="80" fill="rgba(0,0,0,0.6)" x="0" y="${height-80}"/>
            <text x="50%" y="${height-30}" fill="white" font-size="${fontSize}" font-weight="bold" text-anchor="middle" font-family="Impact">${bottom || ''}</text>
        </svg>`;
    const memeBuffer = await sharp(imgBuf)
        .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
        .toBuffer();
    await sock.sendMessage(from, { image: memeBuffer, caption: '🖼️ *Meme created*' }, { quoted: m });
    break;
}


case 'quoteimg': {
    if (!text) return Shefzyreply('❌ Usage: .quoteimg <text> | <author>');
    const [quote, author] = text.split('|').map(s => s.trim());
    const sharp = require('sharp');
    const bgColors = ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560'];
    const bg = bgColors[Math.floor(Math.random() * bgColors.length)];
    const width = 800, height = 400;
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${bg}"/>
        <text x="50%" y="40%" fill="white" font-size="28" text-anchor="middle" font-family="Georgia">“${quote}”</text>
        <text x="50%" y="70%" fill="#ccc" font-size="20" text-anchor="middle" font-style="italic">— ${author || 'Unknown'}</text>
    </svg>`;
    const img = await sharp(Buffer.from(svg)).png().toBuffer();
    await sock.sendMessage(from, { image: img, caption: '✨ Quote Image' }, { quoted: m });
    break;
}

case 'crop': {
    const mediaTypes = ['imageMessage'];
    const hasQuoted = m.quoted && mediaTypes.includes(m.quoted.mtype);
    const hasDirect = mediaTypes.includes(m.mtype);
    if (!hasQuoted && !hasDirect) return Shefzyreply('❌ Reply to or send an image.');
    const dims = args[0]?.split('x').map(Number);
    if (!dims || dims.length !== 2 || dims.some(isNaN)) return Shefzyreply('❌ Usage: .crop <width>x<height>');
    const sharp = require('sharp');
    const imgBuf = hasQuoted ? await m.quoted.download() : await m.download();
    const cropped = await sharp(imgBuf).resize(dims[0], dims[1], { fit: 'cover' }).toBuffer();
    await sock.sendMessage(from, { image: cropped, caption: '✂️ Cropped' }, { quoted: m });
    break;
}

case 'resize': {
    const mediaTypes = ['imageMessage'];
    const hasQuoted = m.quoted && mediaTypes.includes(m.quoted.mtype);
    const hasDirect = mediaTypes.includes(m.mtype);
    if (!hasQuoted && !hasDirect) return Shefzyreply('❌ Reply to or send an image.');
    const arg = args[0];
    if (!arg) return Shefzyreply('❌ Usage: .resize 50% or .resize 200x200');
    const sharp = require('sharp');
    let imgBuf = hasQuoted ? await m.quoted.download() : await m.download();
    let width, height;
    if (arg.includes('x')) {
        [width, height] = arg.split('x').map(Number);
    } else if (arg.endsWith('%')) {
        const percent = parseInt(arg) / 100;
        const meta = await sharp(imgBuf).metadata();
        width = Math.floor(meta.width * percent);
        height = Math.floor(meta.height * percent);
    } else {
        return Shefzyreply('❌ Invalid format. Use: 50% or 200x200');
    }
    const resized = await sharp(imgBuf).resize(width, height).toBuffer();
    await sock.sendMessage(from, { image: resized, caption: '📐 Resized' }, { quoted: m });
    break;
}

case 'filter': {
    const mediaTypes = ['imageMessage'];
    const hasQuoted = m.quoted && mediaTypes.includes(m.quoted.mtype);
    const hasDirect = mediaTypes.includes(m.mtype);
    if (!hasQuoted && !hasDirect) return Shefzyreply('❌ Reply to or send an image.');
    const filter = text.toLowerCase();
    const sharp = require('sharp');
    let imgBuf = hasQuoted ? await m.quoted.download() : await m.download();
    let processed;
    if (filter === 'greyscale' || filter === 'gray') {
        processed = await sharp(imgBuf).greyscale().toBuffer();
    } else if (filter === 'sepia') {
        processed = await sharp(imgBuf).modulate({ saturation: 0, brightness: 1.2 }).toBuffer();
    } else if (filter === 'blur') {
        processed = await sharp(imgBuf).blur(5).toBuffer();
    } else {
        return Shefzyreply('❌ Filters: greyscale, sepia, blur');
    }
    await sock.sendMessage(from, { image: processed, caption: `🎨 *${filter.toUpperCase()} filter*` }, { quoted: m });
    break;
}

case 'txtsticker': {
    if (!text) return Shefzyreply('❌ Provide text for the sticker.\nExample: .txtsticker Hello World');
    const sharp = require('sharp');
    const width = 512, height = 512;
    // Split long text into multiple lines (max 20 chars per line)
    const maxLineLength = 25;
    let words = text.split(' ');
    let lines = [];
    let currentLine = '';
    for (let word of words) {
        if ((currentLine + ' ' + word).length <= maxLineLength) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    const lineHeight = 60;
    const startY = (height - (lines.length * lineHeight)) / 2 + lineHeight / 2;
    
    // Build SVG with proper text positioning
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#2d2d2d" rx="20"/>`;
    lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        svg += `<text x="50%" y="${y}" fill="white" font-size="40" font-weight="bold" text-anchor="middle" font-family="Arial">${escapeXml(line)}</text>`;
    });
    svg += `</svg>`;
    
    // Helper to escape XML special characters
    function escapeXml(str) {
        return str.replace(/[<>&]/g, function(m) {
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '&') return '&amp;';
            return m;
        });
    }
    
    const imgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    // Use your existing sticker creation logic (from `sticker` command)
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const sticker = new Sticker(imgBuffer, {
        pack: config.stickerPackname || userSetting.botName || 'Michiko',
        author: config.stickerAuthor || userSetting.ownerNumber || 'Bot',
        type: StickerTypes.FULL,
        quality: 80
    });
    await sock.sendMessage(from, await sticker.toMessage(), { quoted: m });
    break;
}

case '8ball': {
    const answers = [
        'Yes', 'No', 'Maybe', 'Ask again later', 'Definitely', 'Very doubtful',
        'Outlook good', 'Concentrate and ask again', 'My sources say no', 'Signs point to yes'
    ];
    const reply = answers[Math.floor(Math.random() * answers.length)];
    await Shefzyreply(`🎱 *Magic 8‑Ball:* ${reply}`);
    break;
}

case 'fortune': {
    const fortunes = [
        "You will have a pleasant surprise today.",
        "Your hard work will pay off soon.",
        "A stranger will bring you good news.",
        "Happiness is just around the corner.",
        "You will find what you're looking for."
    ];
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
    await Shefzyreply(`🥠 *Fortune Cookie:* ${fortune}`);
    break;
}

case 'battle': {
    if (!isGroup) return Shefzyreply('❌ Groups only!');
    const target = resolveTarget(args[0]);
    if (!target || target === sender) return Shefzyreply('❌ Mention a different user to battle.');
    if (global._battle && global._battle.from === from) return Shefzyreply('⚠️ A battle is already ongoing in this chat.');
    
    const players = {
        [sender]: { hp: 100, maxHp: 100, turn: true },
        [target]: { hp: 100, maxHp: 100, turn: false }
    };
    let currentTurn = sender;
    
    const battleId = Date.now() + '_' + from;
    global._battle = { from, players, turn: sender, id: battleId };
    
    await sock.sendMessage(from, {
        text: `⚔️ *BATTLE STARTED*\n@${sender.split('@')[0]} vs @${target.split('@')[0]}\n\n${sender.split('@')[0]}'s turn.\nUse *${prefix}attack* or *${prefix}heal* to play.`,
        mentions: [sender, target]
    }, { quoted: m });
    
    // Create a command reader that listens to the next messages in this group for the battle
    const messageHandler = async (msg) => {
        if (msg.key.remoteJid !== from) return;
        if (!global._battle || global._battle.id !== battleId) return;
        const player = msg.sender;
        if (global._battle.turn !== player) return;
        const cmd = msg.body?.toLowerCase();
        if (!['attack', 'heal'].includes(cmd)) return;
        
        const opponent = player === sender ? target : sender;
        let response = '';
        if (cmd === 'attack') {
            const damage = Math.floor(Math.random() * 21) + 10; // 10-30
            global._battle.players[opponent].hp = Math.max(0, global._battle.players[opponent].hp - damage);
            response = `⚔️ @${player.split('@')[0]} attacked @${opponent.split('@')[0]} for ${damage} damage!`;
        } else if (cmd === 'heal') {
            const heal = Math.floor(Math.random() * 21) + 10;
            global._battle.players[player].hp = Math.min(global._battle.players[player].maxHp, global._battle.players[player].hp + heal);
            response = `💚 @${player.split('@')[0]} healed ${heal} HP!`;
        }
        
        if (global._battle.players[opponent].hp <= 0) {
            await sock.sendMessage(from, {
                text: `${response}\n🎉 *${player.split('@')[0]}* wins the battle!`,
                mentions: [player, opponent]
            });
            delete global._battle;
            sock.ev.off('messages.upsert', messageHandler);
            return;
        }
        
        global._battle.turn = opponent;
        const p1hp = global._battle.players[sender].hp;
        const p2hp = global._battle.players[target].hp;
        await sock.sendMessage(from, {
            text: `${response}\n\n❤️ @${sender.split('@')[0]}: ${p1hp}/${global._battle.players[sender].maxHp}  |  @${target.split('@')[0]}: ${p2hp}/${global._battle.players[target].maxHp}\n\n🔁 *@${opponent.split('@')[0]}'s turn* (attack/heal)`,
            mentions: [sender, target]
        });
    };
    
    sock.ev.on('messages.upsert', messageHandler);
    
    // Auto‑cleanup after 10 minutes of inactivity
    setTimeout(() => {
        if (global._battle && global._battle.id === battleId) {
            delete global._battle;
            sock.ev.off('messages.upsert', messageHandler);
            sock.sendMessage(from, { text: '⏰ Battle expired due to inactivity.' }).catch(() => {});
        }
    }, 10 * 60 * 1000);
    break;
}

            default:
                break;
        }
        
    } catch (error) {
        console.log('Command error:', error);
        try {

            const errorChat = m?.key?.remoteJid || m?.from || null;
            if (errorChat) {
                await sock.sendMessage(errorChat, { text: '❌ Error executing command!' });
            }
        } catch (err) {
            console.log('Failed to send error message:', err);
        }
    }
};
handleMessage.registerGroupEvents = registerGroupEvents;
handleMessage.registerAntiDelete = registerAntiDelete;