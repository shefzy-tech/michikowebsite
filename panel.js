const express = require('express');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();

const {
    getPairingCode,
    deleteSession,
    getAllSessions,
    getSessionInfo,
    broadcastToAllSessions,
    getSessionCount,
    getOnlineCount,
    getStats
} = require('./whatsapp');

//===================
// CONFIG
//===================
// Admin login secret comes ONLY from the environment (.env). If it is unset, admin access is disabled
// (an empty value must never authenticate).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// In-memory user token store: token → phoneNumber
const userTokens = new Map();

//===================
// CORS — allow requests from any frontend
//===================
router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-user-token');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

//===================
// HELPERS
//===================
function isAdmin(req) {
    const t = req.headers['x-admin-token'] || req.query.token;
    return !!ADMIN_TOKEN && t === ADMIN_TOKEN;
}

function getUserPhone(req) {
    const t = req.headers['x-user-token'];
    if (!t) return null;
    return userTokens.get(t) || null;
}

function generateToken() {
    return crypto.randomBytes(24).toString('hex');
}

//===================
// SERVE FRONTEND (only used if accessing panel from same server)
//===================
router.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    const fs = require('fs');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ success: true, message: 'Michiko MD API is running. Frontend is hosted separately.' });
    }
});

//===================
// PUBLIC: stats
//===================
router.get('/api/status', (req, res) => {
    try {
        const mem = process.memoryUsage();
        const cfg = require('./config');
        res.json({
            success: true,
            data: {
                total: getSessionCount(),
                online: getOnlineCount(),
                uptime: Math.floor(process.uptime()),
                memory: (mem.heapUsed / 1024 / 1024).toFixed(2),
                rss: (mem.rss / 1024 / 1024).toFixed(1),
                sessions: (() => { const st = getStats(); return { connected: st.connected, connecting: st.connecting, backoff: st.backoff, reconnects: st.reconnects, created: st.created, destroyed: st.destroyed, stores: st.stores }; })(),
                botName: cfg.botName || 'Michiko MD',
                version: cfg.botVersion || '3.0.0',
                brand: cfg.productBrand
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

//===================
// SESSIONS: tiered visibility
//===================
router.get('/api/sessions', (req, res) => {
    try {
        const admin = isAdmin(req);
        const userPhone = getUserPhone(req);
        const all = getAllSessions();

        let sessions = [];

        if (admin) {
            sessions = all.map(s => ({
                phoneNumber: s.phoneNumber,
                isOnline: s.isOnline,
                canDelete: true,
                isOwn: false
            }));
        } else if (userPhone) {
            const own = all.find(s => s.phoneNumber === userPhone);
            if (own) {
                sessions = [{
                    phoneNumber: own.phoneNumber,
                    isOnline: own.isOnline,
                    canDelete: true,
                    isOwn: true
                }];
            }
        }

        res.json({
            success: true,
            data: sessions,
            isAdmin: admin,
            isUser: !!userPhone,
            userPhone: userPhone || null
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

//===================
// ADMIN LOGIN
//===================
router.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (ADMIN_TOKEN && password === ADMIN_TOKEN) {
        res.json({ success: true, token: ADMIN_TOKEN });
    } else {
        res.status(401).json({ success: false, error: 'Wrong password' });
    }
});

//===================
// PAIR: anyone can pair
//===================
router.post('/api/pair', async (req, res) => {
    try {
        let { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, error: 'Phone number required' });

        phoneNumber = String(phoneNumber).replace(/[^0-9]/g, '').trim();
        if (phoneNumber.length < 7 || phoneNumber.length > 15) {
            return res.status(400).json({ success: false, error: 'Invalid phone number' });
        }

        const code = await getPairingCode(phoneNumber);
        if (!code) return res.status(500).json({ success: false, error: 'Failed to generate code. Try again.' });

        const userToken = generateToken();
        userTokens.set(userToken, phoneNumber);

        const formatted = code.length === 8 ? `${code.slice(0,4)}-${code.slice(4)}` : code;

        res.json({
            success: true,
            data: { code: formatted, phoneNumber, userToken }
        });

    } catch (e) {
        const msg = e.message || 'Unknown error';
        if (msg.includes('already connected')) return res.status(409).json({ success: false, error: msg });
        res.status(500).json({ success: false, error: msg });
    }
});

//===================
// DELETE: admin = any session | user = only their own
//===================
router.delete('/api/sessions/:phone', async (req, res) => {
    const admin = isAdmin(req);
    const userPhone = getUserPhone(req);
    const targetPhone = String(req.params.phone).replace(/[^0-9]/g, '');

    if (!targetPhone) return res.status(400).json({ success: false, error: 'Invalid phone number' });

    if (!admin && userPhone !== targetPhone) {
        return res.status(403).json({ success: false, error: 'You can only delete your own session.' });
    }
    if (!admin && !userPhone) {
        return res.status(403).json({ success: false, error: 'Not authorized.' });
    }

    try {
        const ok = await deleteSession(targetPhone);
        if (!ok) return res.status(404).json({ success: false, error: 'Session not found' });

        // Clean up user token
        if (!admin) {
            for (const [token, phone] of userTokens) {
                if (phone === targetPhone) { userTokens.delete(token); break; }
            }
        }

        res.json({ success: true, message: `Session ${targetPhone} deleted` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

//===================
// SELF-SERVICE LOOKUP: find a session by phone number alone — works even
// after a bot restart wipes the in-memory userToken map, since pairedAt
// comes from MongoDB. No token required; anyone who knows the number can
// check/delete it — same trust model as the old token flow, just durable.
//===================
router.get('/api/session/lookup/:phone', async (req, res) => {
    try {
        const phone = String(req.params.phone).replace(/[^0-9]/g, '');
        if (!phone) return res.status(400).json({ success: false, error: 'Invalid phone number' });

        const info = await getSessionInfo(phone);
        if (!info) return res.json({ success: true, paired: false });

        res.json({ success: true, paired: true, data: info });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/api/session/lookup/:phone', async (req, res) => {
    try {
        const phone = String(req.params.phone).replace(/[^0-9]/g, '');
        if (!phone) return res.status(400).json({ success: false, error: 'Invalid phone number' });

        const ok = await deleteSession(phone);
        if (!ok) return res.status(404).json({ success: false, error: 'Session not found' });

        res.json({ success: true, message: `Session ${phone} deleted` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

//===================
// ADMIN: broadcast a message to every connected session
//===================
router.post('/api/admin/broadcast', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Admin only' });

    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message required' });
    }

    try {
        const sent = await broadcastToAllSessions(message.trim());
        res.json({ success: true, sent });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

//===================
// HEALTH
//===================
router.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Michiko MD API running 🟢', brand: require('./config').productBrand });
});

module.exports = router;
