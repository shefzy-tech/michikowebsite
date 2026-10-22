const express = require('express');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { connectAllSessions, getStats } = require('./whatsapp');
const config = require('./config');
const diagnostics = require('./utils/diagnostics');

const app = express();
const PORT = process.env.PORT || 1917;

//===================
// MIDDLEWARE
//===================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

//===================
// PANEL ROUTES
//===================
const panel = require('./panel');
app.use('/', panel);

//===================
// 404 FALLBACK
//===================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

//===================
// GLOBAL ERROR HANDLER
//===================
app.use((err, req, res, next) => {
    config.logger('error', 'Express error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

//===================
// GRACEFUL SHUTDOWN
//===================
// SIGINT/SIGTERM shutdown logging, uncaughtException / unhandledRejection (full type,
// message, stack, session counts, memory) and abrupt-exit detection live in
// utils/diagnostics.js. Behaviour is unchanged: errors are logged, the process keeps serving.
diagnostics.install({ getStats });

//===================
// START
//===================
async function start() {
    try {
        console.log(chalk.cyan(`
╔════════════════════════════════════════╗
║     ⚡ ${(config.botName || 'Michiko MD').padEnd(30)}║
║     🌐 Web Panel + WhatsApp Bot        ║
║     👨‍💻 Developer: Mr Shefzy            ║
╚════════════════════════════════════════╝
        ${config.productBrand}
`));

 //===================
 // Bank interest: 2% every 24hrs
 //===================
setInterval(() => {
     const ECONOMY_FILE = path.join(__dirname, 'database', 'economy.json');
    if (!fs.existsSync(ECONOMY_FILE)) return;
    try {
         const data = JSON.parse(fs.readFileSync(ECONOMY_FILE, 'utf-8'));
        const now = Date.now();
         let updated = false;
      for (const id of Object.keys(data)) {
           const w = data[id];
            if (!w.bank || w.bank <= 0) continue;
            if (now - (w.lastInterest || 0) >= 86400000) {
               const interest = Math.floor(w.bank * 0.02);
               w.bank += interest;
                w.lastInterest = now;
                updated = true;
           }
       }
       if (updated) fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2));
        console.log('[Economy] Bank interest applied');
     } catch (e) {
        console.log('[Economy] Interest error:', e.message);
    }
 }, 3600000); // check every hour

        // Start Express server FIRST. Restoring 100+ sessions takes ~8+ minutes (by design,
        // it is paced); previously the server did not even start listening until that was
        // finished, so a host/health-check that expects the port to be up shortly after boot
        // could restart the process before it ever got there — and then the cycle repeated.
        app.listen(PORT, () => {
            config.logger('success', `Web panel running at http://localhost:${PORT}`);
            console.log(chalk.green(`\n  🌐 Open your browser → http://localhost:${PORT}\n`));
        });

        // Restore saved WhatsApp sessions gradually, in the background.
        // Advertisement scheduler: ONE tick loop, started now but it only runs cycles after the session restore has settled.
        let adScheduler = null;
        try { adScheduler = require('./utils/adCommands').getScheduler(); adScheduler.start(); } catch (e) { config.logger('error', 'Ad scheduler not started:', { message: e?.message }); }

        connectAllSessions()
            .then(() => config.logger('success', 'All saved WhatsApp sessions started'))
            .catch((e) => config.logger('error', 'Session restore crashed:', { message: e?.message, stack: e?.stack }))
            .finally(() => { if (adScheduler) adScheduler.setReady(); });

        config.logger('success', 'All systems operational!');

        // Heartbeat log every hour
        setInterval(() => {
            const mem = process.memoryUsage();
            config.logger('debug', 'Heartbeat', {
                uptime: process.uptime(),
                memory: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
                sessions: getStats()
            });
        }, 3600000);

    } catch (error) {
        config.logger('error', 'Failed to start:', error);
        process.exit(1);
    }
}

start();
