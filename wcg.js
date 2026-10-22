// MICHIKO MD — WORD CHAIN GAME (wcg.js)


const nspell = require('nspell');
const dictionaryEn = require('dictionary-en');

//===================
// Lazy-load the spell checker once (expensive to init)
//===================
let spellChecker = null;
let spellCheckerLoading = null;

function getSpellChecker() {
    if (spellChecker) return Promise.resolve(spellChecker);
    if (spellCheckerLoading) return spellCheckerLoading;

    spellCheckerLoading = new Promise((resolve, reject) => {
        dictionaryEn((err, dict) => {
            if (err) return reject(err);
            spellChecker = nspell(dict);
            resolve(spellChecker);
        });
    });
    return spellCheckerLoading;
}

async function isRealWord(word) {
    try {
        const spell = await getSpellChecker();
        return spell.correct(word);
    } catch (e) {
        console.log('[wcg] spellcheck error:', e.message);
        // If dictionary fails to load, fall back to permissive (don't block the game)
        return true;
    }
}

//===================
// Difficulty settings
//===================
const DIFFICULTY = {
    easy:   { turnTime: 45000, minLength: 3, label: 'Easy 🟢' },
    medium: { turnTime: 25000, minLength: 4, label: 'Medium 🟡' },
    hard:   { turnTime: 15000, minLength: 5, label: 'Hard 🔴' },
};

const JOIN_WINDOW_MS = 30000;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;

//===================
// Active games: Map<groupJid, gameState>
//===================
// gameState shapes:
//   { phase: 'joining', starter, difficulty, players: [{jid, name}], joinTimer, startedAt }
//   { phase: 'playing', difficulty, players: [...], usedWords: Set, currentIdx, lastWord, turnTimer, alive: Set<jid> }
const activeGames = new Map();

function fmtMention(jid) {
    return '@' + jid.split('@')[0];
}

function pickStartWord() {
    const starters = ['apple', 'orange', 'tiger', 'river', 'house', 'cloud', 'mountain', 'guitar', 'window', 'forest'];
    return starters[Math.floor(Math.random() * starters.length)];
}

//===================
// Build the player list mention string
//===================
function playerListText(players) {
    return players.map((p, i) => (i + 1) + '. ' + fmtMention(p.jid)).join('\n');
}

//===================
// Start the actual playing phase after join window closes
//===================
async function beginPlayingPhase(sock, groupId) {
    const game = activeGames.get(groupId);
    if (!game || game.phase !== 'joining') return;

    if (game.players.length < MIN_PLAYERS) {
        activeGames.delete(groupId);
        await sock.sendMessage(groupId, {
            text: '❌ *Word Chain Game Cancelled*\n\nNot enough players joined (need at least ' + MIN_PLAYERS + ').\n\nStart again anytime with *.wcg start*'
        });
        return;
    }

    const startWord = pickStartWord();
    const diff = DIFFICULTY[game.difficulty];

    const newGame = {
        phase: 'playing',
        difficulty: game.difficulty,
        players: game.players,
        usedWords: new Set([startWord]),
        currentIdx: 0,
        lastWord: startWord,
        alive: new Set(game.players.map(p => p.jid)),
        turnTimer: null,
        roundsPlayed: 0,
    };
    activeGames.set(groupId, newGame);

    await sock.sendMessage(groupId, {
        text:
            '🔤 *Word Chain — Game Started!*\n\n' +
            '👥 Players (' + newGame.players.length + '):\n' + playerListText(newGame.players) + '\n\n' +
            '🎯 Difficulty: ' + diff.label + '\n' +
            '⏱️ Time per turn: ' + (diff.turnTime / 1000) + 's\n' +
            '📏 Min word length: ' + diff.minLength + '\n\n' +
            '🎬 Starting word: *' + startWord.toUpperCase() + '*\n\n' +
            'First turn: ' + fmtMention(newGame.players[0].jid) + '\n' +
            'Type a real word starting with *' + startWord.slice(-1).toUpperCase() + '*',
        mentions: newGame.players.map(p => p.jid)
    });

    startTurnTimer(sock, groupId);
}

//===================
// Advance to the next alive player
//===================
function getNextAliveIndex(game, fromIdx) {
    const n = game.players.length;
    for (let step = 1; step <= n; step++) {
        const idx = (fromIdx + step) % n;
        if (game.alive.has(game.players[idx].jid)) return idx;
    }
    return -1; // nobody left
}

//===================
// Eliminate current player, check win condition
//===================
async function eliminateCurrentPlayer(sock, groupId, reason) {
    const game = activeGames.get(groupId);
    if (!game || game.phase !== 'playing') return;

    const current = game.players[game.currentIdx];
    game.alive.delete(current.jid);

    await sock.sendMessage(groupId, {
        text: '💀 ' + fmtMention(current.jid) + ' is eliminated! (' + reason + ')\n👥 Players left: ' + game.alive.size,
        mentions: [current.jid]
    });

    if (game.alive.size <= 1) {
        return endGame(sock, groupId);
    }

    const nextIdx = getNextAliveIndex(game, game.currentIdx);
    if (nextIdx === -1) return endGame(sock, groupId);

    game.currentIdx = nextIdx;
    await promptNextTurn(sock, groupId);
}

//===================
// End the game and announce winner
//===================
async function endGame(sock, groupId) {
    const game = activeGames.get(groupId);
    if (!game) return;
    clearTimeout(game.turnTimer);

    const winnerJid = [...game.alive][0];
    activeGames.delete(groupId);

    if (winnerJid) {
        await sock.sendMessage(groupId, {
            text: '🏆 *Word Chain Over!*\n\n👑 Winner: ' + fmtMention(winnerJid) + '!\n📊 Total words played: ' + game.usedWords.size + '\n\nGG! Start a new game with *.wcg start*',
            mentions: [winnerJid]
        });
    } else {
        await sock.sendMessage(groupId, {
            text: '🤝 *Word Chain Over!*\n\nNo winner — everyone got eliminated.\n\nStart a new game with *.wcg start*'
        });
    }
}

//===================
// Prompt whoever's turn it is now
//===================
async function promptNextTurn(sock, groupId) {
    const game = activeGames.get(groupId);
    if (!game || game.phase !== 'playing') return;

    const diff = DIFFICULTY[game.difficulty];
    const current = game.players[game.currentIdx];
    const lastChar = game.lastWord.slice(-1).toUpperCase();

    await sock.sendMessage(groupId, {
        text:
            '🔤 Your turn, ' + fmtMention(current.jid) + '!\n\n' +
            'Word must start with: *' + lastChar + '*\n' +
            '📏 Min length: ' + diff.minLength + '\n' +
            '⏱️ Time: ' + (diff.turnTime / 1000) + 's',
        mentions: [current.jid]
    });

    startTurnTimer(sock, groupId);
}

function startTurnTimer(sock, groupId) {
    const game = activeGames.get(groupId);
    if (!game) return;
    clearTimeout(game.turnTimer);
    const diff = DIFFICULTY[game.difficulty];
    game.turnTimer = setTimeout(() => {
        eliminateCurrentPlayer(sock, groupId, 'ran out of time');
    }, diff.turnTime);
}

// MAIN ENTRY POINT — called from main.js on every message
// Returns true if it handled the message (caller should `return`)
async function handleWCG(sock, m, body, command, args, isCmd, from, sender, pushname, prefix, Shefzyreply) {
    // Only operate in groups
    if (!from || !from.endsWith('@g.us')) return false;

    const lowerBody = (body || '').trim().toLowerCase();

    //===================
    // "join" trigger — silent no-op unless a join window is open
    //===================
    if (!isCmd && lowerBody === 'join') {
        const game = activeGames.get(from);
        if (!game || game.phase !== 'joining') return false; // silent — let other handlers process normally

        if (game.players.some(p => p.jid === sender)) {
            // Already joined — stay silent, don't spam
            return true;
        }

        if (game.players.length >= MAX_PLAYERS) {
            await sock.sendMessage(from, { text: '⚠️ Player list is full (' + MAX_PLAYERS + ' max)!' }, { quoted: m });
            return true;
        }

        game.players.push({ jid: sender, name: pushname });
        await sock.sendMessage(from, {
            text: '✅ ' + fmtMention(sender) + ' joined! (' + game.players.length + '/' + MAX_PLAYERS + ')',
            mentions: [sender]
        }, { quoted: m });
        return true;
    }

    //===================
    // Word submission during an active game
    //===================
    if (!isCmd) {
        const game = activeGames.get(from);
        if (game && game.phase === 'playing') {
            const current = game.players[game.currentIdx];
            if (sender !== current.jid) return false; // not their turn — ignore, let other handlers run

            const word = lowerBody.replace(/[^a-z]/g, '');
            if (!word) return false;

            const diff = DIFFICULTY[game.difficulty];
            const lastChar = game.lastWord.slice(-1);

            if (word[0] !== lastChar) {
                await sock.sendMessage(from, {
                    text: '❌ Word must start with *' + lastChar.toUpperCase() + '*! Try again.'
                }, { quoted: m });
                return true;
            }
            if (word.length < diff.minLength) {
                await sock.sendMessage(from, {
                    text: '❌ Word too short! Minimum ' + diff.minLength + ' letters.'
                }, { quoted: m });
                return true;
            }
            if (game.usedWords.has(word)) {
                await sock.sendMessage(from, {
                    text: '❌ *' + word + '* was already used! Try a different word.'
                }, { quoted: m });
                return true;
            }

            const valid = await isRealWord(word);
            if (!valid) {
                await sock.sendMessage(from, {
                    text: '❌ *' + word + '* is not a recognized English word! Try again.'
                }, { quoted: m });
                return true;
            }

            // Valid word — accept it
            clearTimeout(game.turnTimer);
            game.usedWords.add(word);
            game.lastWord = word;
            game.roundsPlayed++;

            await sock.sendMessage(from, {
                text: '✅ *' + word.toUpperCase() + '* accepted!'
            }, { quoted: m });

            const nextIdx = getNextAliveIndex(game, game.currentIdx);
            if (nextIdx === -1) {
                await endGame(sock, from);
                return true;
            }
            game.currentIdx = nextIdx;
            await promptNextTurn(sock, from);
            return true;
        }
        return false;
    }

    //===================
    // Command: .wcg / .wordchain
    //===================
    if (command !== 'wcg' && command !== 'wordchain') return false;

    const sub = (args[0] || '').toLowerCase();
    const existingGame = activeGames.get(from);

    //===================
    // .wcg stop — force end a running game
    //===================
    if (sub === 'stop' || sub === 'end') {
        if (!existingGame) {
            await Shefzyreply('❌ No word chain game running!');
            return true;
        }
        clearTimeout(existingGame.turnTimer);
        clearTimeout(existingGame.joinTimer);
        activeGames.delete(from);
        await Shefzyreply('🛑 Word chain game stopped.');
        return true;
    }

    //===================
    // .wcg start [difficulty]
    //===================
    if (sub === 'start' || sub === '') {
        if (existingGame) {
            await Shefzyreply(
                '⚠️ A word chain game is already ' +
                (existingGame.phase === 'joining' ? 'open for joining' : 'in progress') +
                ' in this group!\n\nWait for it to end, or an admin can run *.wcg stop*'
            );
            return true;
        }

        // Accept: ".wcg start hard"  OR  ".wcg hard"  OR  ".wcg" (defaults medium)
        const diffArg = (sub === 'start' ? args[1] : args[0])?.toLowerCase();
        const difficulty = ['easy', 'medium', 'hard'].includes(diffArg) ? diffArg : 'medium';
        const diff = DIFFICULTY[difficulty];

        const newGame = {
            phase: 'joining',
            starter: sender,
            difficulty,
            players: [{ jid: sender, name: pushname }],
            joinTimer: null,
            startedAt: Date.now(),
        };
        activeGames.set(from, newGame);

        await sock.sendMessage(from, {
            text:
                '🔤 *Word Chain Game — Lobby Open!*\n\n' +
                '👤 Started by: ' + fmtMention(sender) + '\n' +
                '🎯 Difficulty: ' + diff.label + '\n' +
                '👥 Players: ' + MIN_PLAYERS + '-' + MAX_PLAYERS + '\n' +
                '⏳ Join window: ' + (JOIN_WINDOW_MS / 1000) + 's\n\n' +
                '💬 Type *join* (no prefix) to enter!\n\n' +
                '📋 Joined (1):\n' + fmtMention(sender),
            mentions: [sender]
        }, { quoted: m });

        newGame.joinTimer = setTimeout(() => {
            beginPlayingPhase(sock, from);
        }, JOIN_WINDOW_MS);

        return true;
    }

    //===================
    // .wcg with unknown subcommand → show help
    //===================
    await Shefzyreply(
        '🔤 *Word Chain Game*\n\n' +
        prefix + 'wcg start — start a lobby (default: medium)\n' +
        prefix + 'wcg start easy/medium/hard — choose difficulty\n' +
        prefix + 'wcg stop — force end current game\n\n' +
        '📌 How to play:\n' +
        '• Type *join* (no prefix) during the lobby to enter\n' +
        '• Min ' + MIN_PLAYERS + ', max ' + MAX_PLAYERS + ' players\n' +
        '• Each word must start with the last letter of the previous word\n' +
        '• Words must be real English words\n' +
        '• Miss your turn or send an invalid word = eliminated\n' +
        '• Last player standing wins!'
    );
    return true;
}

module.exports = { handleWCG };
