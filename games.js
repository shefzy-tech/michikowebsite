// MICHIKO MD — RICH MESSAGE MINI GAMES (games.js)
//
// Self-contained file: does NOT import from or modify main.js, michiko.js,
// wcg.js, etc. Wire-up is just a require() + 5 switch-cases in main.js.
//
// Sends interactive HTML5 canvas games as WhatsApp "rich response" messages
// (the same botForwardedMessage -> richResponseMessage -> GenAIUnifiedResponse
// schema used by togcstatus/etc. elsewhere in this bot), using the universal
// generateWAMessageFromContent + relayMessage primitive that every Baileys
// fork (including @pasqua-baileys/baileys) preserves. This is an internal
// WhatsApp client message type, not an official/public Baileys feature, so it
// can stop rendering if WhatsApp changes how it handles these payloads.
//
// Every game score/best is stored in the recipient's own browser localStorage
// (per WhatsApp's in-app browser), so "best score" is local to that person's
// device/session, not synced anywhere.

const crypto = require('crypto');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

const BRAND = 'MICHIKO MD';

// Small MICHIKO BOTS INC. logo watermark, embedded once and reused across
// every game's shell (all 4 visual themes) so it never needs re-fetching.
const LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAIAAADajyQQAAAJZElEQVR42u1afUxUVxY/7+GAgigf7ugoEgMDA8hKoQomBkVMjBrDH1JCxI/4sW5iSVei2PoRNBgh1hiNtUEhJi0SlbR+BNKtuAbbLHVZYt0xfDTGYVlDNCiMBMGRmXffe2f/OMzzdZh5ndU3/WMz56/Jy733nN+55/zuOfcOQFCCEpSgBCUoQQlKUIISFA3hOI7juP83vSEhIcqP3w0ex3FqvQFUExYWRr95ng80KkXFFMOUgIAhBfv37+/u7u7r66utrZ0xYwYATJkyJXCoaH/Cw8PPffGFzWbr7OwsLy8ntPrECyk4fvw4qsRqtZrN5sBho2VNJtO9e/fUeo8dO6ZPTJJvjEajw+EQRVEQBEmUXC4XIg4MDKxYvjwQ2GjB9PR0m82GiC6XSxRFQWCiKI6Njc2aNUsx7H2jPCsrCxFlSZIlSZZlWZYZY4jodDq3bNmiL50QqvyV+Xb7S0QUBEFWCSJmZGTokOEhbmCyLEtuVCSiKJKmiooKdSq+PwFu3ryZgoIxpqgj7Yi4aNEi/YBlZiGiBzBSRlt38eJFsumdo5/nebL10KFDpIscp1Im6wmM5n+Y9eHkHVP0CYKAiLdv346Ojn63lCN38DxfW1tLG+VFl/uDPqFI89PT/4iIni5UCWHr6ux6B6qkwdHR0bdu3ZpIKh8eFEURES0Wiw7AKHPCwsIe/PyACEob2/PnA8uWLfMfGw2zJCd3dXVNpgq1uJwuRGxrazMYDPrUBrRKQkKC1WrV1k359ubNm6KiIjJamyoJ1cqV+YODg9ork9c6Ojrmz5+vZ9FDFkRFRf31u+/IAu/5pqLKsrIyjWNAIcBt27aR0WoC9OQngSHi9evXIyIidDs2J3Js4cKq48cBgOPg/PnzlG++sEmiRMlw8uRJr8eAUhNVVlZ6J8C3S4mSJCHi6dOnae6JEyfS09N1I4/k5GRErP+6ntx84MABRFT2x4ebBURsaGgwGAwenQEAhIaG1tfX+yRA2nwmkpZPPvkLFY3ffvMtIlosyXoCczqdiNjS0hITEwMAJSUl4+PjGiGkJMadv92JioqiEKIoMhqNP/7woz9JNTIyUlBQAADx8fHt/2hHRJfTpQ8rKsBEUSRuePjwoTkxEQDy8vKeP3/uj31Wq3XBggW04MKFCx89euTPrN7e3qysLADIycl58p8niMgEJkmS/sAQUXAJiNjf37906VIASE1N7enu8cfK/v7+FStWrFu3zm63k4na49v+3jZv3jwAKCwsHBsbIxWUkAEBJksTnD766hUFidFovNt6VxsbZYsiWpnJGCJevnyZ2tm9e/dOTGGiLMkBBSYphkqi9OdduwAgLCysoaHhN5hAFCW3aAxAxOqqalJ99uxZ8oIoSoQb5QADU9tx9OhRGlldVeWTuyVZW2ijBEHYtWsXAERGRt68edPzwAzIjiUlkW61v5XIuXDhAg3bvXs3odWoKn0l1eDg4OrVq6nEuX//vpfYdq+cnKwf3aekpCirey3tm5qa6BakoKBgdHRU+xiYjKq7qzstLQ0Ali9f/vTpU+8Z61admpqqTxHMcdycOXMmzPXGZkSV7e3tcXFxAJCdnd3f369NJ2pULS0tsbGxALB161ZfZyPKMhVWDofDZDJxHMfznD5VVV5enkapSibabDbqAhMTE63/stLx4IsAKWlra2vV5ZWvaobWf/3aQVSs881fWlqaxtlK+Wa321etWgUAMTExLS0tXgeLooiyjIgHDx70h1QJ1ePHj7OXLAEAXpfLFXKn2WwuLCyk+7Cf2tq0sblcrk2bNqkLQjW5Ka1NycaNABAXF9fme0FJkuhoaW5upnAtKyvTkxXT0tJkSS4tLQWAiPDwa9eu+TJFaVv27dtHK5w6dWpiN0SRfP/02bPc3Fyqlfr6+nwu5T7Wq6qqaKnzNed166BpvtlsJk9XVlbS9y/PfekreJT8UXqNA599ppQdPz94kJiYCADFxcVKreQr/MbGxkpKSiiw6eLA6XSak8x6HtCMMTK3rq6OoryiomKiMZuU7krb0tjYOHXqVADYsWPH8PDwjRs3qFmkxsfXqeCmot4lS5ZQ3dzd3U2DGWNJSUl6Vx7yRBHc3NwcGRlJJ7IWlbkERPzh7l26uzWZTAAwbdq02gsX3B7xstuEqrW1lcavWbNmaGgIEQX3TWMAgCEqijs6OujUKioq0mjMlNsrsiYkJOTIkSNEHl5i2N1619XVUef28e6P6QtjjCoPxhhdhOkPTDH33729GRmLACA/P394eFgb27Nnz3JycogG316z/YoqGAXnp/s/VbPO2+KTgAnMbE4MFDDFXPvQEPFb5gcfKNUGTj4GBEZMsH79ejq4Ll26pOYeWm10dHTDhg0AEGoIvXLlCiKySUWwIAjEPfr3Yx7mjoyMLF68mIrXX3p+0TgGyC9UvwPAyc8/p0yja3qbzZaZmam+D3Y5nR7p5waWEFhgCj10/LODbmyMRmN7e7uvSkrpdA4fPkyL79mzh8KvtbV19uzZlISxsbGO147JnZsCLCEhIMA8lcmy/NJunzlzJo2cPn261xTy6HTOnTtHNc2mTSU1NTVEFeSduXPnjr4anfwG8nsDQ8QXL15M3EOFhNBt1NWrV31W925ebWxsNM2Z86u7dI4DAKWTeE9gOpTJPDexiCTLPM9LkrRx48aamhqDwUDu8Kg+eZ5njBUXF2fn5PA8HxoaynGcMowD4MB3mYt+W+V/KezPsrIskztLS0urq6sNBgOVjuoBHMcZDIbt27c3NTUBAG2ganFOQw8C6vNySjseHx9P7yxew2NwcJBexhT8HMdRWJaXl7svZESFGwXG6NXC45WQQtFkMr3ykWOSJL1xvKGKRIeWjN4a7/10DxHHx8cZY0wQBEFgAnO5XIyxly9fUoWlfn/gOI4o4U87d1LZRXfJDodj7dq1AGCY9NcNmv6HWbMcDgdjzOVyCSqh+ubOnTu6NZq0SkZGxsDAAHqT+vp6AAgJ4X090xR99BGZZbfb6UD39WJC7xV0Rz9Znjx5YrFY/Hzs5vzMMUSMi4vbuXNnSkoKuRYROY7r7Ow8c+aM0+mkL16xiaKYmZmZm5t76/vvbb299EUjmSMiwsvKyiyWFFJBqHp6er766uuhoUE10+j575/3nPueUeT/dO5/TTYPb3EcRxTiz1yiAT//F6Fek3bSH0VBCUpQghKUoAQlKEEJym/KfwGhWZGIDsVRPQAAAABJRU5ErkJggg==';
const LOGO_WATERMARK = '<div style="text-align:center;margin-top:10px;opacity:.55">'
    + '<img src="data:image/png;base64,' + LOGO_B64 + '" style="width:18px;height:18px;vertical-align:middle;border-radius:4px">'
    + '</div>';

//===================
// Low-level payload builder (see htmlGoon-style example)
//===================
function buildRichMessage(jid, html) {
    return generateWAMessageFromContent(jid, {
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    unifiedResponse: {
                        data: Buffer.from(
                            JSON.stringify({
                                __typename: 'GenAIUnifiedResponse',
                                response_id: crypto.randomUUID(),
                                sections: [
                                    {
                                        __typename: 'GenAIUnifiedResponseSection',
                                        view_model: {
                                            __typename: 'GenAISingleLayoutViewModel',
                                            primitive: {
                                                __typename: 'FOAHtmlPrimitiveDemoDONOTUSE',
                                                trusted_sources: [],
                                                payload: html.trim()
                                            }
                                        }
                                    }
                                ]
                            })
                        ).toString('base64')
                    }
                },
                contextInfo: { isForwarded: true, forwardOrigin: 4 }
            }
        }
    }, { userJid: jid });
}

async function relayHtml(sock, jid, html) {
    const msg = buildRichMessage(jid, html);
    return sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

//===================
// Shared visual shell (same dark/neon card style across all 3 games)
//===================
function shell(opts) {
    const stats = opts.stats.map(function (s) {
        return '<div style="text-align:center"><div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.4)">'
            + s.label + '</div><div id="' + s.id + '" style="font-size:17px;font-weight:bold;color:#fff">'
            + (s.init || 0) + '</div></div>';
    }).join('');

    return '<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none}</style>'
        + '<body style="margin:0;background:#0b0b1f;font-family:Arial,sans-serif;touch-action:manipulation">'
        + '<div style="max-width:620px;margin:auto;padding:14px">'
        + '<div style="background:linear-gradient(135deg,#12122a,#1a1a3a);border:1px solid rgba(124,58,237,.45);border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(124,58,237,.3)">'
        + '<div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center">'
        + '<div><div style="font-size:10px;letter-spacing:2.5px;color:#7c3aed;font-weight:700">' + BRAND + '</div>'
        + '<div style="font-size:19px;font-weight:bold;color:#fff">' + opts.title + '</div></div>'
        + '<div style="display:flex;gap:12px">' + stats + '</div>'
        + '</div>'
        + '<div style="padding:8px 18px 0;font-size:11px;color:rgba(255,255,255,.4)">' + opts.subtitle + '</div>'
        + '<div style="padding:14px">'
        + '<canvas id="g" width="' + opts.w + '" height="' + opts.h + '" style="width:100%;height:auto;touch-action:none;border-radius:10px;border:1px solid rgba(124,58,237,.3);display:block;background:#0d0d22"></canvas>'
        + '<div id="st" style="text-align:center;margin-top:8px;font-size:11px;color:rgba(255,255,255,.45)">Tap to start</div>'
        + (opts.controls || '')
        + LOGO_WATERMARK
        + '</div></div></div></div>'
        + '<script>' + opts.script + '</script>';
}

function dpadRow(buttons) {
    const btns = buttons.map(function (b) {
        return '<button id="' + b.id + '" style="flex:1;padding:14px 0;background:rgba(124,58,237,.18);'
            + 'border:1px solid rgba(124,58,237,.4);border-radius:12px;color:#fff;font-size:18px;font-weight:bold">'
            + b.label + '</button>';
    }).join('');
    return '<div style="display:flex;gap:8px;margin-top:10px">' + btns + '</div>';
}

function startButton(label) {
    return '<button id="btnStart" style="width:100%;margin-top:10px;padding:14px 0;'
        + 'background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;border-radius:12px;color:#fff;'
        + 'font-size:14px;font-weight:bold;letter-spacing:1px">' + label + '</button>';
}

//===================================================================
// GAME 1 — TETRIS
//===================================================================
function tetrisHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=10,ROWS=18,CELL=cvs.width/COLS;'
        + 'var board,cur,curX=0,curY=0,score=0,best=0,level=1,lines=0;'
        + 'var dropInterval=800,dropTimer=0,last=0,over=false,started=false;'
        + 'try{best=+localStorage.getItem("mk_tetris_b")||0}catch(e){}'
        + 'function emptyBoard(){var b=[];for(var r=0;r<ROWS;r++)b.push(new Array(COLS).fill(0));return b;}'
        + 'board=emptyBoard();'
        + 'var SHAPES={I:[[1,1,1,1]],J:[[1,0,0],[1,1,1]],L:[[0,0,1],[1,1,1]],O:[[1,1],[1,1]],S:[[0,1,1],[1,1,0]],Z:[[1,1,0],[0,1,1]],T:[[0,1,0],[1,1,1]]};'
        + 'var COLORS={I:"#22d3ee",J:"#3b82f6",L:"#f97316",O:"#facc15",S:"#22c55e",Z:"#ef4444",T:"#a855f7"};'
        + 'var KEYS=Object.keys(SHAPES);'
        + 'function newPiece(){var k=KEYS[Math.floor(Math.random()*KEYS.length)];var m=SHAPES[k].map(function(row){return row.slice();});return{k:k,m:m,color:COLORS[k]};}'
        + 'function rotateM(m){var rows=m.length,cols=m[0].length,res=[];for(var c=0;c<cols;c++){var row=[];for(var r=rows-1;r>=0;r--){row.push(m[r][c]);}res.push(row);}return res;}'
        + 'function collide(m,px,py){for(var r=0;r<m.length;r++){for(var c=0;c<m[r].length;c++){if(!m[r][c])continue;var x=px+c,y=py+r;if(x<0||x>=COLS||y>=ROWS)return true;if(y>=0&&board[y][x])return true;}}return false;}'
        + 'function merge(){for(var r=0;r<cur.m.length;r++){for(var c=0;c<cur.m[r].length;c++){if(cur.m[r][c]){var y=curY+r,x=curX+c;if(y>=0)board[y][x]=cur.color;}}}}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;document.getElementById("lv").textContent=level;if(score>best){best=score;try{localStorage.setItem("mk_tetris_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function clearLines(){var cleared=0;for(var r=ROWS-1;r>=0;r--){var full=true;for(var c=0;c<COLS;c++){if(!board[r][c]){full=false;break;}}if(full){board.splice(r,1);board.unshift(new Array(COLS).fill(0));cleared++;r++;}}'
        + 'if(cleared){var tbl=[0,100,300,500,800];score+=tbl[cleared]*level;lines+=cleared;level=1+Math.floor(lines/10);dropInterval=Math.max(120,800-((level-1)*70));}updateStats();}'
        + 'function spawn(){cur=newPiece();curX=Math.floor(COLS/2)-Math.ceil(cur.m[0].length/2);curY=0;if(collide(cur.m,curX,curY)){over=true;}}'
        + 'function tryMove(dx,dy){if(collide(cur.m,curX+dx,curY+dy))return false;curX+=dx;curY+=dy;return true;}'
        + 'function tryRotate(){var r=rotateM(cur.m),nx=curX;if(collide(r,nx,curY)){if(!collide(r,nx-1,curY))nx-=1;else if(!collide(r,nx+1,curY))nx+=1;else if(!collide(r,nx-2,curY))nx-=2;else if(!collide(r,nx+2,curY))nx+=2;else return;}cur.m=r;curX=nx;}'
        + 'function lockPiece(){merge();clearLines();if(!over)spawn();}'
        + 'function hardDrop(){while(tryMove(0,1)){}lockPiece();}'
        + 'function drawCell(x,y,color){ctx.fillStyle=color;ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2);ctx.fillStyle="rgba(255,255,255,.25)";ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,4);}'
        + 'function draw(){ctx.fillStyle="#0d0d22";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'ctx.strokeStyle="rgba(255,255,255,.05)";for(var c=0;c<=COLS;c++){ctx.beginPath();ctx.moveTo(c*CELL,0);ctx.lineTo(c*CELL,cvs.height);ctx.stroke();}for(var r=0;r<=ROWS;r++){ctx.beginPath();ctx.moveTo(0,r*CELL);ctx.lineTo(cvs.width,r*CELL);ctx.stroke();}'
        + 'for(var r2=0;r2<ROWS;r2++){for(var c2=0;c2<COLS;c2++){if(board[r2][c2])drawCell(c2,r2,board[r2][c2]);}}'
        + 'if(started&&!over&&cur){for(var r3=0;r3<cur.m.length;r3++){for(var c3=0;c3<cur.m[r3].length;c3++){if(cur.m[r3][c3])drawCell(curX+c3,curY+r3,cur.color);}}}'
        + 'if(!started){ctx.fillStyle="rgba(13,13,34,.75)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("TETRIS",cvs.width/2,cvs.height/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Tap START to begin",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(13,13,34,.8)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("GAME OVER",cvs.width/2,cvs.height/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Score "+score+"  Best "+best,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+34);ctx.textAlign="left";}}'
        + 'function startGame(){board=emptyBoard();score=0;level=1;lines=0;dropInterval=800;dropTimer=0;over=false;started=true;spawn();updateStats();}'
        + 'function loop(t){if(!last)last=t;var dt=t-last;last=t;if(started&&!over){dropTimer+=dt;if(dropTimer>dropInterval){dropTimer=0;if(!tryMove(0,1))lockPiece();}}draw();requestAnimationFrame(loop);}'
        + 'document.getElementById("btnL").addEventListener("click",function(){if(started&&!over)tryMove(-1,0);});'
        + 'document.getElementById("btnRot").addEventListener("click",function(){if(started&&!over)tryRotate();});'
        + 'document.getElementById("btnR").addEventListener("click",function(){if(started&&!over)tryMove(1,0);});'
        + 'document.getElementById("btnDown").addEventListener("click",function(){if(started&&!over){if(!tryMove(0,1))lockPiece();}});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){if(!started||over)startGame();});'
        + 'cvs.addEventListener("pointerdown",function(){if(!started||over)startGame();});'
        + 'document.addEventListener("keydown",function(e){if(!started||over)return;if(e.code==="ArrowLeft"){tryMove(-1,0);}else if(e.code==="ArrowRight"){tryMove(1,0);}else if(e.code==="ArrowDown"){if(!tryMove(0,1))lockPiece();}else if(e.code==="ArrowUp"){tryRotate();}else if(e.code==="Space"){e.preventDefault();hardDrop();}});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    return shell({
        title: 'Tetris',
        subtitle: 'CLEAR LINES · DON\u2019T STACK UP',
        w: 300, h: 540,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'lv', label: 'LEVEL', init: 1 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: dpadRow([
            { id: 'btnL', label: '\u25C0' },
            { id: 'btnRot', label: '\u27F3' },
            { id: 'btnR', label: '\u25B6' },
            { id: 'btnDown', label: '\u25BC' }
        ]) + startButton('START GAME'),
        script: script
    });
}

//===================================================================
// GAME 2 — 2048
//===================================================================
function game2048Html() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var SIZE=4,CELL=cvs.width/SIZE;'
        + 'var grid,score=0,best=0,over=false,won=false,started=false;'
        + 'try{best=+localStorage.getItem("mk_2048_b")||0}catch(e){}'
        + 'function emptyGrid(){var g=[];for(var i=0;i<SIZE;i++)g.push(new Array(SIZE).fill(0));return g;}'
        + 'grid=emptyGrid();'
        + 'function addTile(){var empties=[];for(var r=0;r<SIZE;r++){for(var c=0;c<SIZE;c++){if(!grid[r][c])empties.push([r,c]);}}if(!empties.length)return;var p=empties[Math.floor(Math.random()*empties.length)];grid[p[0]][p[1]]=Math.random()<0.9?2:4;}'
        + 'function slideRowLeft(row){var arr=[];for(var i=0;i<row.length;i++){if(row[i]!==0)arr.push(row[i]);}for(var j=0;j<arr.length-1;j++){if(arr[j]===arr[j+1]){arr[j]*=2;score+=arr[j];if(arr[j]===2048)won=true;arr.splice(j+1,1);}}while(arr.length<SIZE)arr.push(0);return arr;}'
        + 'function rowsEqual(a,b){for(var i=0;i<a.length;i++){if(a[i]!==b[i])return false;}return true;}'
        + 'function moveLeft(){var changed=false;for(var r=0;r<SIZE;r++){var before=grid[r].slice();var after=slideRowLeft(before);grid[r]=after;if(!rowsEqual(before,after))changed=true;}return changed;}'
        + 'function reverseRows(){for(var r=0;r<SIZE;r++)grid[r].reverse();}'
        + 'function moveRight(){reverseRows();var c=moveLeft();reverseRows();return c;}'
        + 'function transpose(){var g2=emptyGrid();for(var r=0;r<SIZE;r++){for(var c=0;c<SIZE;c++){g2[c][r]=grid[r][c];}}grid=g2;}'
        + 'function moveUp(){transpose();var c=moveLeft();transpose();return c;}'
        + 'function moveDown(){transpose();var c=moveRight();transpose();return c;}'
        + 'function canMove(){for(var r=0;r<SIZE;r++){for(var c=0;c<SIZE;c++){if(!grid[r][c])return true;if(c<SIZE-1&&grid[r][c]===grid[r][c+1])return true;if(r<SIZE-1&&grid[r][c]===grid[r+1][c])return true;}}return false;}'
        + 'var TILE_COLORS={2:"#3b3b5c",4:"#4b4b7a",8:"#f97316",16:"#fb923c",32:"#ef4444",64:"#dc2626",128:"#facc15",256:"#eab308",512:"#22c55e",1024:"#06b6d4",2048:"#a855f7"};'
        + 'function tileColor(v){return TILE_COLORS[v]||"#7c3aed";}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_2048_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function draw(){ctx.fillStyle="#0d0d22";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var r=0;r<SIZE;r++){for(var c=0;c<SIZE;c++){var v=grid[r][c];var x=c*CELL,y=r*CELL;ctx.fillStyle=v?tileColor(v):"rgba(255,255,255,.04)";ctx.fillRect(x+4,y+4,CELL-8,CELL-8);'
        + 'if(v){ctx.fillStyle=v<=4?"rgba(255,255,255,.7)":"#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold "+(v>512?20:26)+"px Arial";ctx.fillText(String(v),x+CELL/2,y+CELL/2);}}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(13,13,34,.78)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("2048",cvs.width/2,cvs.height/2-10);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Swipe board or tap START",cvs.width/2,cvs.height/2+14);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(13,13,34,.8)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText(won?"YOU MADE 2048!":"GAME OVER",cvs.width/2,cvs.height/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Score "+score+"  Best "+best,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+34);ctx.textAlign="left";}}'
        + 'function startGame(){grid=emptyGrid();score=0;over=false;won=false;started=true;addTile();addTile();updateStats();draw();}'
        + 'function doMove(dir){if(!started||over)return;var changed=false;if(dir==="left")changed=moveLeft();else if(dir==="right")changed=moveRight();else if(dir==="up")changed=moveUp();else if(dir==="down")changed=moveDown();if(changed){addTile();updateStats();if(!canMove())over=true;draw();}}'
        + 'var tX=0,tY=0;'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}tX=e.clientX;tY=e.clientY;});'
        + 'cvs.addEventListener("pointerup",function(e){if(!started||over)return;var dx=e.clientX-tX,dy=e.clientY-tY;if(Math.abs(dx)<20&&Math.abs(dy)<20)return;if(Math.abs(dx)>Math.abs(dy)){doMove(dx>0?"right":"left");}else{doMove(dy>0?"down":"up");}});'
        + 'document.getElementById("btnUp").addEventListener("click",function(){doMove("up");});'
        + 'document.getElementById("btnLeft").addEventListener("click",function(){doMove("left");});'
        + 'document.getElementById("btnDown2").addEventListener("click",function(){doMove("down");});'
        + 'document.getElementById("btnRight").addEventListener("click",function(){doMove("right");});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){if(!started||over)startGame();});'
        + 'document.addEventListener("keydown",function(e){if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].indexOf(e.code)===-1)return;e.preventDefault();if(e.code==="ArrowLeft")doMove("left");else if(e.code==="ArrowRight")doMove("right");else if(e.code==="ArrowUp")doMove("up");else doMove("down");});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();';

    const dpad = '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:10px">'
        + '<button id="btnUp" style="width:64px;padding:12px 0;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.4);border-radius:10px;color:#fff;font-size:18px">\u25B2</button>'
        + '<div style="display:flex;gap:8px">'
        + '<button id="btnLeft" style="width:64px;padding:12px 0;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.4);border-radius:10px;color:#fff;font-size:18px">\u25C0</button>'
        + '<button id="btnDown2" style="width:64px;padding:12px 0;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.4);border-radius:10px;color:#fff;font-size:18px">\u25BC</button>'
        + '<button id="btnRight" style="width:64px;padding:12px 0;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.4);border-radius:10px;color:#fff;font-size:18px">\u25B6</button>'
        + '</div></div>';

    return shell({
        title: '2048',
        subtitle: 'SWIPE TO MERGE · REACH 2048',
        w: 320, h: 320,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: dpad + startButton('START GAME'),
        script: script
    });
}

//===================================================================
// GAME 3 — FLAPPY DASH
//===================================================================
function flappyHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height;'
        + 'var bird,pipes,score=0,best=0,over=false,started=false;'
        + 'var gravity=0.5,flapV=-8,pipeGap=140,pipeW=52,pipeSpeed=2.6,spawnTimer=0,spawnInterval=95;'
        + 'try{best=+localStorage.getItem("mk_flap_b")||0}catch(e){}'
        + 'function reset(){bird={x:70,y:H/2,vy:0,r:14};pipes=[];score=0;over=false;spawnTimer=0;pipeSpeed=2.6;spawnInterval=95;}'
        + 'reset();'
        + 'function flap(){if(!started){started=true;reset();return;}if(over){reset();started=true;return;}bird.vy=flapV;}'
        + 'function spawnPipe(){var gapY=40+Math.random()*(H-80-pipeGap);pipes.push({x:W+20,gapY:gapY,passed:false});}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_flap_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function update(){bird.vy+=gravity;bird.y+=bird.vy;spawnTimer++;if(spawnTimer>spawnInterval){spawnTimer=0;spawnPipe();}'
        + 'for(var i=0;i<pipes.length;i++){pipes[i].x-=pipeSpeed;if(!pipes[i].passed&&pipes[i].x+pipeW<bird.x){pipes[i].passed=true;score++;if(score%5===0)pipeSpeed=Math.min(6,pipeSpeed+0.3);}}'
        + 'var kept=[];for(var j=0;j<pipes.length;j++){if(pipes[j].x>-pipeW-10)kept.push(pipes[j]);}pipes=kept;'
        + 'if(bird.y-bird.r<0||bird.y+bird.r>H)over=true;'
        + 'for(var k=0;k<pipes.length;k++){var p=pipes[k];if(bird.x+bird.r>p.x&&bird.x-bird.r<p.x+pipeW){if(bird.y-bird.r<p.gapY||bird.y+bird.r>p.gapY+pipeGap)over=true;}}'
        + 'updateStats();}'
        + 'function draw(){ctx.fillStyle="#0d0d22";ctx.fillRect(0,0,W,H);'
        + 'for(var i=0;i<pipes.length;i++){var p=pipes[i];ctx.save();ctx.shadowColor="rgba(6,214,160,.5)";ctx.shadowBlur=10;ctx.fillStyle="#06d6a0";ctx.fillRect(p.x,0,pipeW,p.gapY);ctx.fillRect(p.x,p.gapY+pipeGap,pipeW,H-(p.gapY+pipeGap));ctx.restore();}'
        + 'ctx.save();ctx.translate(bird.x,bird.y);var ang=Math.max(-0.5,Math.min(1,bird.vy/10));ctx.rotate(ang);ctx.fillStyle="#c4b5fd";ctx.beginPath();ctx.arc(0,0,bird.r,0,Math.PI*2);ctx.fill();ctx.fillStyle="#7c3aed";ctx.beginPath();ctx.arc(6,-3,3,0,Math.PI*2);ctx.fill();ctx.restore();'
        + 'if(!started){ctx.fillStyle="rgba(13,13,34,.75)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("FLAPPY DASH",W/2,H/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Tap or Space to flap",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(13,13,34,.72)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("GAME OVER",W/2,H/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Score "+score+"  Best "+best,W/2,H/2+14);ctx.fillText("Tap to try again",W/2,H/2+34);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'document.addEventListener("pointerdown",function(e){e.preventDefault();flap();});'
        + 'document.addEventListener("keydown",function(e){if(e.code==="Space"){e.preventDefault();flap();}});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    return shell({
        title: 'Flappy Dash',
        subtitle: 'TAP TO FLAP · DODGE THE GAPS',
        w: 320, h: 480,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: '',
        script: script
    });
}

//===================================================================
// GAME 4 — TIC-TAC-TOE (vs unbeatable AI)
//===================================================================
function ticTacToeHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var board,over=false,started=false,wins=0,losses=0,draws=0;'
        + 'try{wins=+localStorage.getItem("mk_ttt_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_ttt_l")||0}catch(e){}'
        + 'try{draws=+localStorage.getItem("mk_ttt_d")||0}catch(e){}'
        + 'var LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];'
        + 'function checkWinner(b){for(var i=0;i<LINES.length;i++){var l=LINES[i];if(b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[1]]===b[l[2]])return b[l[0]];}if(b.indexOf(0)===-1)return 3;return 0;}'
        + 'function minimax(b,player){var winner=checkWinner(b);if(winner===1)return{score:-10};if(winner===2)return{score:10};if(winner===3)return{score:0};'
        + 'var moves=[];for(var i=0;i<9;i++){if(!b[i]){var nb=b.slice();nb[i]=player;var res=minimax(nb,player===2?1:2);moves.push({index:i,score:res.score});}}'
        + 'var bestMove=null;if(player===2){var bestScore=-Infinity;for(var j=0;j<moves.length;j++){if(moves[j].score>bestScore){bestScore=moves[j].score;bestMove=moves[j];}}}'
        + 'else{var bestScore2=Infinity;for(var k=0;k<moves.length;k++){if(moves[k].score<bestScore2){bestScore2=moves[k].score;bestMove=moves[k];}}}'
        + 'return bestMove;}'
        + 'function updateStats(){document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;document.getElementById("dr").textContent=draws;'
        + 'try{localStorage.setItem("mk_ttt_w",wins);localStorage.setItem("mk_ttt_l",losses);localStorage.setItem("mk_ttt_d",draws);}catch(e){}}'
        + 'function drawX(x,y){ctx.strokeStyle="#22d3ee";ctx.lineWidth=7;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x-28,y-28);ctx.lineTo(x+28,y+28);ctx.stroke();ctx.beginPath();ctx.moveTo(x+28,y-28);ctx.lineTo(x-28,y+28);ctx.stroke();}'
        + 'function drawO(x,y){ctx.strokeStyle="#f97316";ctx.lineWidth=7;ctx.beginPath();ctx.arc(x,y,26,0,Math.PI*2);ctx.stroke();}'
        + 'var resultText="";'
        + 'function draw(){ctx.fillStyle="#0d0d22";ctx.fillRect(0,0,300,300);'
        + 'ctx.strokeStyle="rgba(124,58,237,.4)";ctx.lineWidth=3;'
        + 'for(var i=1;i<3;i++){ctx.beginPath();ctx.moveTo(i*100,10);ctx.lineTo(i*100,290);ctx.stroke();ctx.beginPath();ctx.moveTo(10,i*100);ctx.lineTo(290,i*100);ctx.stroke();}'
        + 'if(board){for(var c=0;c<9;c++){var cx=(c%3)*100+50,cy=Math.floor(c/3)*100+50;if(board[c]===1)drawX(cx,cy);else if(board[c]===2)drawO(cx,cy);}}'
        + 'if(!started){ctx.fillStyle="rgba(13,13,34,.75)";ctx.fillRect(0,0,300,300);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText("TIC TAC TOE",150,136);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("You are X. Tap START, then a cell",150,160);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(13,13,34,.78)";ctx.fillRect(0,0,300,300);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText(resultText,150,140);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("Tap to play again",150,164);ctx.textAlign="left";}}'
        + 'function startGame(){board=[0,0,0,0,0,0,0,0,0];over=false;started=true;resultText="";draw();}'
        + 'function handleTap(idx){if(idx<0||idx>8||board[idx])return;board[idx]=1;var w=checkWinner(board);'
        + 'if(w===0){var mv=minimax(board.slice(),2);if(mv&&typeof mv.index==="number")board[mv.index]=2;w=checkWinner(board);}'
        + 'if(w!==0){over=true;if(w===1){wins++;resultText="YOU WIN!";}else if(w===2){losses++;resultText="AI WINS";}else{draws++;resultText="DRAW";}updateStats();}'
        + 'draw();}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;var col=Math.floor(x/100),row=Math.floor(y/100);'
        + 'handleTap(row*3+col);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();';

    return shell({
        title: 'Tic-Tac-Toe',
        subtitle: 'YOU (X) VS MICHIKO AI (O) · UNBEATABLE',
        w: 300, h: 300,
        stats: [
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 },
            { id: 'dr', label: 'DRAWS', init: 0 }
        ],
        controls: startButton('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 5 — SIMON SAYS (memory sequence)
//===================================================================
function simonHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLORS=["#22c55e","#ef4444","#facc15","#3b82f6"];'
        + 'var PAD=[[0,0],[150,0],[0,150],[150,150]];'
        + 'var sequence=[],round=0,playerIndex=0,best=0,over=false,started=false,accepting=false,flashPad=-1,flashUntil=0;'
        + 'try{best=+localStorage.getItem("mk_simon_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("rd").textContent=round;if(round>best){best=round;try{localStorage.setItem("mk_simon_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function draw(){ctx.fillStyle="#0d0d22";ctx.fillRect(0,0,300,300);'
        + 'for(var i=0;i<4;i++){var x=PAD[i][0],y=PAD[i][1];var lit=(flashPad===i&&Date.now()<flashUntil);'
        + 'ctx.globalAlpha=lit?1:0.82;ctx.fillStyle=lit?"#ffffff":COLORS[i];ctx.fillRect(x+4,y+4,150-8,150-8);ctx.globalAlpha=1;}'
        + 'if(!started){ctx.fillStyle="rgba(13,13,34,.72)";ctx.fillRect(0,0,300,300);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText("SIMON SAYS",150,136);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.6)";ctx.fillText("Tap START, watch, then repeat",150,160);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(13,13,34,.78)";ctx.fillRect(0,0,300,300);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("GAME OVER",150,132);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.6)";ctx.fillText("Reached round "+round+"  Best "+best,150,156);ctx.fillText("Tap to play again",150,176);ctx.textAlign="left";}}'
        + 'function playSequence(){accepting=false;playerIndex=0;var i=0;'
        + 'function step(){if(i>=sequence.length){accepting=true;return;}flashPad=sequence[i];flashUntil=Date.now()+450;'
        + 'setTimeout(function(){flashPad=-1;setTimeout(function(){i++;step();},200);},450);}'
        + 'step();}'
        + 'function nextRound(){sequence.push(Math.floor(Math.random()*4));round=sequence.length;updateStats();setTimeout(playSequence,500);}'
        + 'function startGame(){sequence=[];round=0;over=false;started=true;accepting=false;flashPad=-1;updateStats();nextRound();}'
        + 'function padTap(idx){if(!started||over||!accepting)return;flashPad=idx;flashUntil=Date.now()+200;'
        + 'if(sequence[playerIndex]===idx){playerIndex++;if(playerIndex>=sequence.length){accepting=false;setTimeout(nextRound,600);}}'
        + 'else{over=true;accepting=false;}}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;var col=x<150?0:1,row=y<150?0:1;padTap(row*2+col);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'document.getElementById("bs").textContent=best;'
        + 'loop();';

    return shell({
        title: 'Simon Says',
        subtitle: 'WATCH THE PATTERN · REPEAT IT BACK',
        w: 300, h: 300,
        stats: [
            { id: 'rd', label: 'ROUND', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: startButton('NEW GAME'),
        script: script
    });
}

//===================================================================
// ============ BATCH 2 — "SUNSET ARCADE" VISUAL THEME ==============
// A deliberately different look from the neon-purple set above: warm
// gradient glass cards (coral -> amber -> violet) with pill buttons,
// vs. the dark cyberpunk theme of Tetris/2048/Flappy/XO/Simon.
//===================================================================
function shellV2(opts) {
    const stats = opts.stats.map(function (s) {
        return '<div style="text-align:center"><div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.8);text-shadow:0 1px 2px rgba(0,0,0,.3)">'
            + s.label + '</div><div id="' + s.id + '" style="font-size:16px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4)">'
            + (s.init != null ? s.init : 0) + '</div></div>';
    }).join('');

    return '<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;font-family:\'Segoe UI\',Arial,sans-serif}</style>'
        + '<body style="margin:0;background:linear-gradient(135deg,#ff6b6b 0%,#f7b733 45%,#6a3df5 100%);touch-action:manipulation">'
        + '<div style="max-width:620px;margin:auto;padding:14px">'
        + '<div style="background:rgba(255,255,255,.14);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.35);border-radius:26px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.25)">'
        + '<div style="padding:16px 18px 8px;display:flex;justify-content:space-between;align-items:center">'
        + '<div><div style="font-size:9px;letter-spacing:3px;color:rgba(255,255,255,.85);font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.3)">' + BRAND + '</div>'
        + '<div style="font-size:19px;font-weight:800;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.35)">' + opts.title + '</div></div>'
        + '<div style="display:flex;gap:12px">' + stats + '</div>'
        + '</div>'
        + '<div style="padding:0 18px 8px;font-size:11px;color:rgba(255,255,255,.8);text-shadow:0 1px 2px rgba(0,0,0,.3)">' + opts.subtitle + '</div>'
        + '<div style="padding:0 14px 14px">'
        + '<canvas id="g" width="' + opts.w + '" height="' + opts.h + '" style="width:100%;height:auto;touch-action:none;border-radius:16px;border:1px solid rgba(255,255,255,.3);display:block;background:#161326;box-shadow:inset 0 2px 14px rgba(0,0,0,.4)"></canvas>'
        + '<div id="st" style="text-align:center;margin-top:8px;font-size:11px;color:rgba(255,255,255,.85);text-shadow:0 1px 2px rgba(0,0,0,.3)">Tap to start</div>'
        + (opts.controls || '')
        + LOGO_WATERMARK
        + '</div></div></div>'
        + '<script>' + opts.script + '</script>';
}

function pillRow(buttons) {
    const btns = buttons.map(function (b) {
        return '<button id="' + b.id + '" style="flex:1;padding:14px 0;background:rgba(255,255,255,.22);'
            + 'border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;font-size:17px;font-weight:700;'
            + 'text-shadow:0 1px 2px rgba(0,0,0,.3)">'
            + b.label + '</button>';
    }).join('');
    return '<div style="display:flex;gap:8px;margin-top:10px">' + btns + '</div>';
}

function startPill(label) {
    return '<button id="btnStart" style="width:100%;margin-top:10px;padding:14px 0;'
        + 'background:linear-gradient(135deg,#ffffff,#ffe8d6);border:none;border-radius:999px;color:#7a3d00;'
        + 'font-size:14px;font-weight:800;letter-spacing:1px;box-shadow:0 4px 14px rgba(0,0,0,.25)">' + label + '</button>';
}

//===================================================================
// GAME 6 — SNAKE
//===================================================================
function snakeHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=15,CELL=cvs.width/COLS;'
        + 'var snake,dir,nextDir,food,score=0,best=0,over=false,started=false,tickInterval=140,tickTimer=0,last=0;'
        + 'try{best=+localStorage.getItem("mk_snake_b")||0}catch(e){}'
        + 'function placeFood(){var ok=false;while(!ok){food={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*COLS)};ok=true;for(var i=0;i<snake.length;i++){if(snake[i].x===food.x&&snake[i].y===food.y){ok=false;break;}}}}'
        + 'function reset(){snake=[{x:7,y:7},{x:6,y:7},{x:5,y:7}];dir={x:1,y:0};nextDir={x:1,y:0};placeFood();score=0;over=false;tickTimer=0;tickInterval=140;}'
        + 'reset();'
        + 'function updateStats(){document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_snake_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function setDir(dx,dy){if(dir.x===-dx&&dir.y===-dy)return;nextDir={x:dx,y:dy};}'
        + 'function tick(){dir=nextDir;var head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};'
        + 'if(head.x<0||head.x>=COLS||head.y<0||head.y>=COLS){over=true;updateStats();return;}'
        + 'for(var i=0;i<snake.length;i++){if(snake[i].x===head.x&&snake[i].y===head.y){over=true;updateStats();return;}}'
        + 'snake.unshift(head);if(head.x===food.x&&head.y===food.y){score++;tickInterval=Math.max(70,140-score*3);placeFood();updateStats();}else{snake.pop();}}'
        + 'function draw(){ctx.fillStyle="#161326";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'ctx.fillStyle="#ff8a5c";ctx.fillRect(food.x*CELL+3,food.y*CELL+3,CELL-6,CELL-6);'
        + 'for(var i=0;i<snake.length;i++){ctx.fillStyle=i===0?"#ffe08a":"#7bdc9e";ctx.fillRect(snake[i].x*CELL+1,snake[i].y*CELL+1,CELL-2,CELL-2);}'
        + 'if(!started){ctx.fillStyle="rgba(22,19,38,.75)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("SNAKE",cvs.width/2,cvs.height/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Swipe or tap START",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(22,19,38,.8)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("GAME OVER",cvs.width/2,cvs.height/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Score "+score+"  Best "+best,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+34);ctx.textAlign="left";}}'
        + 'function startGame(){reset();started=true;updateStats();}'
        + 'function loop(t){if(!last)last=t;var dt=t-last;last=t;if(started&&!over){tickTimer+=dt;if(tickTimer>tickInterval){tickTimer=0;tick();}}draw();requestAnimationFrame(loop);}'
        + 'var tX=0,tY=0;'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}tX=e.clientX;tY=e.clientY;});'
        + 'cvs.addEventListener("pointerup",function(e){if(!started||over)return;var dx=e.clientX-tX,dy=e.clientY-tY;if(Math.abs(dx)<15&&Math.abs(dy)<15)return;if(Math.abs(dx)>Math.abs(dy)){setDir(dx>0?1:-1,0);}else{setDir(0,dy>0?1:-1);}});'
        + 'document.getElementById("btnUp").addEventListener("click",function(){setDir(0,-1);});'
        + 'document.getElementById("btnDown2").addEventListener("click",function(){setDir(0,1);});'
        + 'document.getElementById("btnLeft").addEventListener("click",function(){setDir(-1,0);});'
        + 'document.getElementById("btnRight").addEventListener("click",function(){setDir(1,0);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'document.addEventListener("keydown",function(e){if(!started||over)return;if(e.code==="ArrowUp")setDir(0,-1);else if(e.code==="ArrowDown")setDir(0,1);else if(e.code==="ArrowLeft")setDir(-1,0);else if(e.code==="ArrowRight")setDir(1,0);});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    const dpad = '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:10px">'
        + '<button id="btnUp" style="width:60px;padding:12px 0;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;font-size:17px">\u25B2</button>'
        + '<div style="display:flex;gap:8px">'
        + '<button id="btnLeft" style="width:60px;padding:12px 0;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;font-size:17px">\u25C0</button>'
        + '<button id="btnDown2" style="width:60px;padding:12px 0;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;font-size:17px">\u25BC</button>'
        + '<button id="btnRight" style="width:60px;padding:12px 0;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;font-size:17px">\u25B6</button>'
        + '</div></div>';

    return shellV2({
        title: 'Snake',
        subtitle: 'EAT · GROW · DON\u2019T BITE YOURSELF',
        w: 300, h: 300,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: dpad + startPill('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 7 — BREAKOUT
//===================================================================
function breakoutHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height;'
        + 'var paddle,ball,bricks,rows=4,cols=6,brickW=W/6,brickH=16,score=0,best=0,lives=3,over=false,started=false,won=false;'
        + 'try{best=+localStorage.getItem("mk_breakout_b")||0}catch(e){}'
        + 'function resetBricks(){bricks=[];var colors=["#ff6b6b","#ffb703","#8ecae6","#95d5b2"];for(var r=0;r<rows;r++){for(var c=0;c<cols;c++){bricks.push({x:c*brickW,y:r*brickH+30,w:brickW-2,h:brickH-2,alive:true,color:colors[r%4]});}}}'
        + 'function resetBall(){ball={x:W/2,y:250,vx:(Math.random()<0.5?-1:1)*3,vy:-3,r:6};}'
        + 'function startGame(){paddle={x:W/2-30,w:60,h:10,y:H-20};resetBricks();resetBall();score=0;lives=3;over=false;won=false;started=true;updateStats();}'
        + 'paddle={x:W/2-30,w:60,h:10,y:H-20};resetBricks();resetBall();'
        + 'function updateStats(){document.getElementById("sc").textContent=score;document.getElementById("lv").textContent=lives;if(score>best){best=score;try{localStorage.setItem("mk_breakout_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function update(){ball.x+=ball.vx;ball.y+=ball.vy;'
        + 'if(ball.x-ball.r<0||ball.x+ball.r>W)ball.vx*=-1;'
        + 'if(ball.y-ball.r<0)ball.vy*=-1;'
        + 'if(ball.y+ball.r>H){lives--;updateStats();if(lives<=0){over=true;}else{resetBall();}return;}'
        + 'if(ball.vy>0&&ball.y+ball.r>=paddle.y&&ball.y+ball.r<=paddle.y+paddle.h&&ball.x>paddle.x&&ball.x<paddle.x+paddle.w){'
        + 'var hp=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2);ball.vx=hp*4;ball.vy=-Math.abs(ball.vy);}'
        + 'var aliveCount=0;for(var i=0;i<bricks.length;i++){var b=bricks[i];if(!b.alive)continue;aliveCount++;'
        + 'if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){b.alive=false;ball.vy*=-1;score+=10;updateStats();aliveCount--;break;}}'
        + 'if(aliveCount===0){over=true;won=true;}}'
        + 'function draw(){ctx.fillStyle="#161326";ctx.fillRect(0,0,W,H);'
        + 'for(var i=0;i<bricks.length;i++){var b=bricks[i];if(b.alive){ctx.fillStyle=b.color;ctx.fillRect(b.x,b.y,b.w,b.h);}}'
        + 'ctx.fillStyle="#fff";ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);'
        + 'ctx.beginPath();ctx.fillStyle="#ffe08a";ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();'
        + 'if(!started){ctx.fillStyle="rgba(22,19,38,.75)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("BREAKOUT",W/2,H/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Drag to move, tap START",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(22,19,38,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText(won?"ALL CLEARED!":"GAME OVER",W/2,H/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Score "+score+"  Best "+best,W/2,H/2+14);ctx.fillText("Tap to play again",W/2,H/2+34);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointermove",function(e){if(!started||over)return;var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width;var x=(e.clientX-rect.left)*sx;paddle.x=Math.max(0,Math.min(W-paddle.w,x-paddle.w/2));});'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    return shellV2({
        title: 'Breakout',
        subtitle: 'DRAG THE PADDLE · CLEAR THE BRICKS',
        w: 300, h: 400,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'lv', label: 'LIVES', init: 3 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: startPill('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 8 — PONG (vs AI)
//===================================================================
function pongHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height;'
        + 'var playerP,aiP,ball,scorePlayer=0,scoreAI=0,best=0,over=false,started=false;'
        + 'try{best=+localStorage.getItem("mk_pong_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("sc").textContent=scorePlayer+" - "+scoreAI;if(scorePlayer>best){best=scorePlayer;try{localStorage.setItem("mk_pong_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function resetBall(dir){ball={x:W/2,y:H/2,vx:(Math.random()<0.5?-1:1)*3,vy:dir*3,r:6};}'
        + 'function startGame(){playerP={x:W/2-30,w:60,h:10,y:H-20};aiP={x:W/2-30,w:60,h:10,y:10};scorePlayer=0;scoreAI=0;resetBall(1);over=false;started=true;updateStats();}'
        + 'playerP={x:W/2-30,w:60,h:10,y:H-20};aiP={x:W/2-30,w:60,h:10,y:10};resetBall(1);'
        + 'function update(){ball.x+=ball.vx;ball.y+=ball.vy;'
        + 'if(ball.x-ball.r<0||ball.x+ball.r>W)ball.vx*=-1;'
        + 'var aiCenter=aiP.x+aiP.w/2;var aiSpeed=2.3;'
        + 'if(aiCenter<ball.x-4)aiP.x+=aiSpeed;else if(aiCenter>ball.x+4)aiP.x-=aiSpeed;'
        + 'aiP.x=Math.max(0,Math.min(W-aiP.w,aiP.x));'
        + 'if(ball.vy>0&&ball.y+ball.r>=playerP.y&&ball.y+ball.r<=playerP.y+playerP.h&&ball.x>playerP.x&&ball.x<playerP.x+playerP.w){'
        + 'var hp=(ball.x-(playerP.x+playerP.w/2))/(playerP.w/2);ball.vx=hp*4;ball.vy=-Math.abs(ball.vy)*1.03;}'
        + 'if(ball.vy<0&&ball.y-ball.r<=aiP.y+aiP.h&&ball.y-ball.r>=aiP.y&&ball.x>aiP.x&&ball.x<aiP.x+aiP.w){'
        + 'var hp2=(ball.x-(aiP.x+aiP.w/2))/(aiP.w/2);ball.vx=hp2*4;ball.vy=Math.abs(ball.vy)*1.03;}'
        + 'if(ball.y-ball.r>H){scoreAI++;updateStats();resetBall(-1);}'
        + 'if(ball.y+ball.r<0){scorePlayer++;updateStats();resetBall(1);}'
        + 'if(scorePlayer>=7||scoreAI>=7){over=true;}}'
        + 'function draw(){ctx.fillStyle="#161326";ctx.fillRect(0,0,W,H);'
        + 'ctx.strokeStyle="rgba(255,255,255,.2)";ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();ctx.setLineDash([]);'
        + 'ctx.fillStyle="#fff";ctx.fillRect(playerP.x,playerP.y,playerP.w,playerP.h);'
        + 'ctx.fillStyle="#ff8a5c";ctx.fillRect(aiP.x,aiP.y,aiP.w,aiP.h);'
        + 'ctx.beginPath();ctx.fillStyle="#ffe08a";ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();'
        + 'if(!started){ctx.fillStyle="rgba(22,19,38,.75)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("PONG",W/2,H/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Drag to move, tap START",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(22,19,38,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText(scorePlayer>scoreAI?"YOU WIN!":"AI WINS",W/2,H/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText(scorePlayer+" - "+scoreAI,W/2,H/2+14);ctx.fillText("Tap to play again",W/2,H/2+34);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointermove",function(e){if(!started||over)return;var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width;var x=(e.clientX-rect.left)*sx;playerP.x=Math.max(0,Math.min(W-playerP.w,x-playerP.w/2));});'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    return shellV2({
        title: 'Pong',
        subtitle: 'DRAG TO PLAY · FIRST TO 7',
        w: 300, h: 400,
        stats: [
            { id: 'sc', label: 'YOU - AI', init: '0 - 0' },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: startPill('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 9 — WHACK-A-MOLE
//===================================================================
function whackHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,CELL=W/3;'
        + 'var activeIdx=-1,activeUntil=0,score=0,best=0,timeLeft=30,over=false,started=false,spawnTimer=0,spawnInterval=750,last=0;'
        + 'try{best=+localStorage.getItem("mk_whack_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;document.getElementById("tm").textContent=Math.max(0,Math.ceil(timeLeft));if(score>best){best=score;try{localStorage.setItem("mk_whack_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function startGame(){score=0;timeLeft=30;over=false;started=true;activeIdx=-1;spawnTimer=0;updateStats();}'
        + 'function spawnMole(){activeIdx=Math.floor(Math.random()*9);activeUntil=Date.now()+(650+Math.random()*400);}'
        + 'function update(dt){timeLeft-=dt/1000;if(timeLeft<=0){timeLeft=0;over=true;updateStats();return;}'
        + 'spawnTimer+=dt;if(activeIdx!==-1&&Date.now()>activeUntil)activeIdx=-1;'
        + 'if(activeIdx===-1&&spawnTimer>spawnInterval){spawnTimer=0;spawnMole();}'
        + 'updateStats();}'
        + 'function whack(idx){if(!started||over)return;if(idx===activeIdx){score++;activeIdx=-1;updateStats();}}'
        + 'function draw(){ctx.fillStyle="#161326";ctx.fillRect(0,0,W,W);'
        + 'for(var r=0;r<3;r++){for(var c=0;c<3;c++){var cx=c*CELL+CELL/2,cy=r*CELL+CELL/2;'
        + 'ctx.beginPath();ctx.fillStyle="#2a2440";ctx.ellipse(cx,cy+CELL*0.22,CELL*0.32,CELL*0.14,0,0,Math.PI*2);ctx.fill();'
        + 'var idx=r*3+c;if(idx===activeIdx){ctx.beginPath();ctx.fillStyle="#7bdc9e";ctx.arc(cx,cy,CELL*0.28,0,Math.PI*2);ctx.fill();'
        + 'ctx.fillStyle="#161326";ctx.beginPath();ctx.arc(cx-8,cy-4,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(cx+8,cy-4,3,0,Math.PI*2);ctx.fill();}}}'
        + 'if(!started){ctx.fillStyle="rgba(22,19,38,.75)";ctx.fillRect(0,0,W,W);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("WHACK-A-MOLE",W/2,W/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Tap START, then tap the moles",W/2,W/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(22,19,38,.8)";ctx.fillRect(0,0,W,W);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("TIME UP!",W/2,W/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Score "+score+"  Best "+best,W/2,W/2+14);ctx.fillText("Tap to play again",W/2,W/2+34);ctx.textAlign="left";}}'
        + 'function loop(t){if(!last)last=t;var dt=t-last;last=t;if(started&&!over)update(dt);draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;var col=Math.floor(x/CELL),row=Math.floor(y/CELL);whack(row*3+col);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    return shellV2({
        title: 'Whack-a-Mole',
        subtitle: '30 SECONDS · TAP FAST',
        w: 300, h: 300,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'tm', label: 'TIME', init: 30 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: startPill('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 10 — SPACE INVADERS
//===================================================================
function invadersHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height;'
        + 'var player,bullets,enemies,enemyDir=1,enemySpeed=0.6,score=0,best=0,wave=1,over=false,started=false,shootCooldown=0;'
        + 'try{best=+localStorage.getItem("mk_invaders_b")||0}catch(e){}'
        + 'function spawnWave(){enemies=[];var cols=6,rows=3,spacing=40;for(var r=0;r<rows;r++){for(var c=0;c<cols;c++){enemies.push({x:20+c*spacing,y:30+r*30,alive:true});}}enemyDir=1;enemySpeed=0.6+(wave-1)*0.25;}'
        + 'function startGame(){player={x:W/2-12,y:H-30,w:24,h:14};bullets=[];score=0;wave=1;over=false;started=true;shootCooldown=0;spawnWave();updateStats();}'
        + 'player={x:W/2-12,y:H-30,w:24,h:14};bullets=[];spawnWave();'
        + 'function updateStats(){document.getElementById("sc").textContent=score;document.getElementById("wv").textContent=wave;if(score>best){best=score;try{localStorage.setItem("mk_invaders_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function shoot(){if(shootCooldown>0)return;bullets.push({x:player.x+player.w/2,y:player.y});shootCooldown=16;}'
        + 'function update(){if(shootCooldown>0)shootCooldown--;'
        + 'for(var i=0;i<bullets.length;i++){bullets[i].y-=6;}'
        + 'var kept=[];for(var i2=0;i2<bullets.length;i2++){if(bullets[i2].y>-10)kept.push(bullets[i2]);}bullets=kept;'
        + 'var alive=[];for(var j=0;j<enemies.length;j++){if(enemies[j].alive)alive.push(enemies[j]);}'
        + 'if(alive.length){var minX=alive[0].x,maxX=alive[0].x+16;for(var k=1;k<alive.length;k++){if(alive[k].x<minX)minX=alive[k].x;if(alive[k].x+16>maxX)maxX=alive[k].x+16;}'
        + 'var hitEdge=(minX+enemyDir*enemySpeed<=0)||(maxX+enemyDir*enemySpeed>=W);'
        + 'for(var e2=0;e2<alive.length;e2++){alive[e2].x+=enemyDir*enemySpeed;}'
        + 'if(hitEdge){enemyDir*=-1;for(var e3=0;e3<alive.length;e3++){alive[e3].y+=14;}}}'
        + 'for(var bi=0;bi<bullets.length;bi++){for(var ei=0;ei<enemies.length;ei++){var en=enemies[ei];if(!en.alive)continue;'
        + 'if(bullets[bi].x>en.x&&bullets[bi].x<en.x+16&&bullets[bi].y>en.y&&bullets[bi].y<en.y+12){en.alive=false;bullets[bi].y=-999;score+=10;updateStats();}}}'
        + 'var kept2=[];for(var bj=0;bj<bullets.length;bj++){if(bullets[bj].y>-100)kept2.push(bullets[bj]);}bullets=kept2;'
        + 'var anyReached=false,anyAlive=false;for(var ci=0;ci<enemies.length;ci++){if(enemies[ci].alive){anyAlive=true;if(enemies[ci].y+12>=player.y)anyReached=true;}}'
        + 'if(anyReached){over=true;}'
        + 'if(!anyAlive){wave++;spawnWave();updateStats();}}'
        + 'function draw(){ctx.fillStyle="#161326";ctx.fillRect(0,0,W,H);'
        + 'ctx.fillStyle="#7bdc9e";for(var i3=0;i3<enemies.length;i3++){if(enemies[i3].alive)ctx.fillRect(enemies[i3].x,enemies[i3].y,16,12);}'
        + 'ctx.fillStyle="#ffe08a";for(var bi2=0;bi2<bullets.length;bi2++){ctx.fillRect(bullets[bi2].x-1,bullets[bi2].y-6,2,8);}'
        + 'ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(player.x+player.w/2,player.y);ctx.lineTo(player.x,player.y+player.h);ctx.lineTo(player.x+player.w,player.y+player.h);ctx.closePath();ctx.fill();'
        + 'if(!started){ctx.fillStyle="rgba(22,19,38,.75)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("SPACE INVADERS",W/2,H/2-14);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Tap to move + fire",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(22,19,38,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("GAME OVER",W/2,H/2-10);ctx.font="13px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Score "+score+"  Wave "+wave+"  Best "+best,W/2,H/2+14);ctx.fillText("Tap to play again",W/2,H/2+34);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width;var x=(e.clientX-rect.left)*sx;'
        + 'player.x=Math.max(0,Math.min(W-player.w,x-player.w/2));shoot();});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'document.getElementById("bs").textContent=best;'
        + 'draw();requestAnimationFrame(loop);';

    return shellV2({
        title: 'Space Invaders',
        subtitle: 'TAP TO MOVE & FIRE · CLEAR EVERY WAVE',
        w: 300, h: 400,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'wv', label: 'WAVE', init: 1 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: startPill('NEW GAME'),
        script: script
    });
}

//===================================================================
// ============ BATCH 3 — "PUZZLE BOOK" VISUAL THEME =================
// A third distinct look: light cream/pastel paper background (mint to
// lavender), dark navy text, soft rounded cards — vs. the dark neon
// (batch 1) and sunset-glass (batch 2) themes above.
//===================================================================
function shellV3(opts) {
    const stats = opts.stats.map(function (s) {
        return '<div style="text-align:center"><div style="font-size:9px;letter-spacing:1.5px;color:#6b6690">'
            + s.label + '</div><div id="' + s.id + '" style="font-size:16px;font-weight:800;color:#2f2b52">'
            + (s.init != null ? s.init : 0) + '</div></div>';
    }).join('');

    return '<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;font-family:\'Segoe UI\',Arial,sans-serif}</style>'
        + '<body style="margin:0;background:linear-gradient(135deg,#d9f2e6 0%,#eef0fb 50%,#f7e6f5 100%);touch-action:manipulation">'
        + '<div style="max-width:620px;margin:auto;padding:14px">'
        + '<div style="background:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.9);border-radius:26px;overflow:hidden;box-shadow:0 10px 34px rgba(90,80,140,.18)">'
        + '<div style="padding:16px 18px 8px;display:flex;justify-content:space-between;align-items:center">'
        + '<div><div style="font-size:9px;letter-spacing:3px;color:#9b8fd6;font-weight:700">' + BRAND + '</div>'
        + '<div style="font-size:19px;font-weight:800;color:#2f2b52">' + opts.title + '</div></div>'
        + '<div style="display:flex;gap:12px">' + stats + '</div>'
        + '</div>'
        + '<div style="padding:0 18px 8px;font-size:11px;color:#6b6690">' + opts.subtitle + '</div>'
        + '<div style="padding:0 14px 14px">'
        + '<canvas id="g" width="' + opts.w + '" height="' + opts.h + '" style="width:100%;height:auto;touch-action:none;border-radius:16px;border:1px solid rgba(90,80,140,.15);display:block;background:#fbfaff;box-shadow:inset 0 1px 6px rgba(90,80,140,.1)"></canvas>'
        + '<div id="st" style="text-align:center;margin-top:8px;font-size:11px;color:#6b6690">Tap to start</div>'
        + (opts.controls || '')
        + LOGO_WATERMARK
        + '</div></div></div>'
        + '<script>' + opts.script + '</script>';
}

function chipRow(buttons) {
    const btns = buttons.map(function (b) {
        return '<button id="' + b.id + '" style="flex:1;padding:12px 4px;background:#f1eefc;'
            + 'border:1px solid rgba(90,80,140,.2);border-radius:14px;color:#2f2b52;font-size:15px;font-weight:700">'
            + b.label + '</button>';
    }).join('');
    return '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' + btns + '</div>';
}

function startChip(label) {
    return '<button id="btnStart" style="width:100%;margin-top:10px;padding:14px 0;'
        + 'background:linear-gradient(135deg,#a78bfa,#f472b6);border:none;border-radius:16px;color:#fff;'
        + 'font-size:14px;font-weight:800;letter-spacing:1px;box-shadow:0 4px 14px rgba(150,120,220,.35)">' + label + '</button>';
}

//===================================================================
// GAME 11 — MEMORY MATCH
//===================================================================
function memoryHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=4,ROWS=4,CELL=cvs.width/COLS;'
        + 'var SYMBOLS=["\\uD83C\\uDF4E","\\uD83C\\uDF89","\\u26BD","\\uD83C\\uDFB8","\\uD83D\\uDE00","\\uD83D\\uDE80","\\uD83C\\uDF3B","\\uD83D\\uDC31"];'
        + 'var cards,flipped,moves=0,best=0,matchedCount=0,over=false,started=false,busy=false;'
        + 'try{best=+localStorage.getItem("mk_memory_b")||0}catch(e){}'
        + 'function shuffle(arr){for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t;}return arr;}'
        + 'function updateStats(){document.getElementById("mv").textContent=moves;document.getElementById("bs").textContent=best||"-";}'
        + 'function startGame(){var deck=SYMBOLS.concat(SYMBOLS);shuffle(deck);'
        + 'cards=deck.map(function(s){return{symbol:s,revealed:false,matched:false};});'
        + 'flipped=[];moves=0;matchedCount=0;over=false;started=true;busy=false;updateStats();}'
        + 'function tapCard(idx){if(!started||over||busy)return;var c=cards[idx];if(c.revealed||c.matched)return;'
        + 'c.revealed=true;flipped.push(idx);'
        + 'if(flipped.length===2){moves++;updateStats();busy=true;'
        + 'var a=cards[flipped[0]],b=cards[flipped[1]];'
        + 'if(a.symbol===b.symbol){a.matched=true;b.matched=true;matchedCount+=2;flipped=[];busy=false;'
        + 'if(matchedCount===cards.length){over=true;if(!best||moves<best){best=moves;try{localStorage.setItem("mk_memory_b",best);}catch(e){}}updateStats();}}'
        + 'else{setTimeout(function(){a.revealed=false;b.revealed=false;flipped=[];busy=false;},700);}}}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'if(cards){for(var i=0;i<cards.length;i++){var c=cards[i];var col=i%COLS,row=Math.floor(i/COLS);var x=col*CELL,y=row*CELL;'
        + 'ctx.fillStyle=c.matched?"#d7f5e3":(c.revealed?"#fff3d6":"#e7e2fb");'
        + 'ctx.fillRect(x+4,y+4,CELL-8,CELL-8);'
        + 'if(c.revealed||c.matched){ctx.font=(CELL*0.5)+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(c.symbol,x+CELL/2,y+CELL/2+2);}'
        + 'else{ctx.fillStyle="#a78bfa";ctx.font="bold "+(CELL*0.35)+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("?",x+CELL/2,y+CELL/2+2);}}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("MEMORY MATCH",cvs.width/2,cvs.height/2-14);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap START, then flip pairs",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText("SOLVED!",cvs.width/2,cvs.height/2-10);ctx.font="13px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Moves "+moves+"  Best "+best,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+34);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;var col=Math.floor(x/CELL),row=Math.floor(y/CELL);tapCard(row*COLS+col);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV3({
        title: 'Memory Match',
        subtitle: 'FLIP PAIRS · FEWEST MOVES WINS',
        w: 300, h: 300,
        stats: [
            { id: 'mv', label: 'MOVES', init: 0 },
            { id: 'bs', label: 'BEST', init: '-' }
        ],
        controls: startChip('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 12 — MINESWEEPER
//===================================================================
function minesweeperHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=6,ROWS=6,CELL=cvs.width/COLS,MINES=6;'
        + 'var grid,revealedCount=0,flagMode=false,over=false,won=false,started=false,best=0;'
        + 'try{best=+localStorage.getItem("mk_mines_b")||0}catch(e){}'
        + 'function emptyGrid(){var g=[];for(var r=0;r<ROWS;r++){var row=[];for(var c=0;c<COLS;c++){row.push({mine:false,revealed:false,flagged:false,count:0});}g.push(row);}return g;}'
        + 'function neighbors(r,c){var n=[];for(var dr=-1;dr<=1;dr++){for(var dc=-1;dc<=1;dc++){if(dr===0&&dc===0)continue;var nr=r+dr,nc=c+dc;if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS)n.push([nr,nc]);}}return n;}'
        + 'function placeMines(safeR,safeC){var placed=0;while(placed<MINES){var r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);'
        + 'if(grid[r][c].mine||(r===safeR&&c===safeC))continue;grid[r][c].mine=true;placed++;}'
        + 'for(var r2=0;r2<ROWS;r2++){for(var c2=0;c2<COLS;c2++){if(grid[r2][c2].mine)continue;var n=neighbors(r2,c2);var cnt=0;for(var i=0;i<n.length;i++){if(grid[n[i][0]][n[i][1]].mine)cnt++;}grid[r2][c2].count=cnt;}}}'
        + 'function startGame(){grid=emptyGrid();revealedCount=0;over=false;won=false;started=true;document.getElementById("st").textContent="Tap to reveal";}'
        + 'grid=emptyGrid();'
        + 'var firstClick=true;'
        + 'function floodReveal(r,c){var stack=[[r,c]];while(stack.length){var cur=stack.pop();var cr=cur[0],cc=cur[1];var cell=grid[cr][cc];'
        + 'if(cell.revealed||cell.flagged)continue;cell.revealed=true;revealedCount++;'
        + 'if(cell.count===0&&!cell.mine){var n=neighbors(cr,cc);for(var i=0;i<n.length;i++){var nc2=grid[n[i][0]][n[i][1]];if(!nc2.revealed&&!nc2.mine)stack.push(n[i]);}}}}'
        + 'function tapCell(r,c){if(!started||over)return;var cell=grid[r][c];'
        + 'if(flagMode){if(!cell.revealed){cell.flagged=!cell.flagged;}return;}'
        + 'if(cell.flagged||cell.revealed)return;'
        + 'if(firstClick){placeMines(r,c);firstClick=false;}'
        + 'if(cell.mine){cell.revealed=true;over=true;'
        + 'for(var r2=0;r2<ROWS;r2++){for(var c2=0;c2<COLS;c2++){if(grid[r2][c2].mine)grid[r2][c2].revealed=true;}}return;}'
        + 'floodReveal(r,c);'
        + 'if(revealedCount===ROWS*COLS-MINES){over=true;won=true;best=best?Math.min(best,revealedCount):revealedCount;try{localStorage.setItem("mk_mines_b",best);}catch(e){}}}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'var numColors=["","#4a90d9","#3aa76d","#e08a2b","#c94f4f","#8a4fc9","#c9834f","#333","#777"];'
        + 'for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){var cell=grid[r][c];var x=c*CELL,y=r*CELL;'
        + 'ctx.fillStyle=cell.revealed?(cell.mine?"#f7b3b3":"#eef0fb"):"#c9c3f0";'
        + 'ctx.fillRect(x+2,y+2,CELL-4,CELL-4);'
        + 'ctx.font="bold "+(CELL*0.4)+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";'
        + 'if(cell.revealed){if(cell.mine){ctx.fillText("\\uD83D\\uDCA3",x+CELL/2,y+CELL/2+2);}else if(cell.count>0){ctx.fillStyle=numColors[cell.count]||"#333";ctx.fillText(String(cell.count),x+CELL/2,y+CELL/2+2);}}'
        + 'else if(cell.flagged){ctx.fillText("\\uD83D\\uDEA9",x+CELL/2,y+CELL/2+2);}}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("MINESWEEPER",cvs.width/2,cvs.height/2-14);ctx.font="11px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap START, clear the board",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText(won?"CLEARED!":"BOOM!",cvs.width/2,cvs.height/2-6);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+16);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;var col=Math.floor(x/CELL),row=Math.floor(y/CELL);tapCell(row,col);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){firstClick=true;startGame();});'
        + 'document.getElementById("btnFlag").addEventListener("click",function(){flagMode=!flagMode;document.getElementById("btnFlag").textContent=flagMode?"\\uD83D\\uDEA9 FLAG: ON":"\\uD83D\\uDEA9 FLAG: OFF";});'
        + 'draw();loop();';

    return shellV3({
        title: 'Minesweeper',
        subtitle: 'CLEAR THE BOARD · AVOID THE MINES',
        w: 300, h: 300,
        stats: [
            { id: 'bs', label: 'BEST', init: '-' }
        ],
        controls: chipRow([{ id: 'btnFlag', label: '\u{1F6A9} FLAG: OFF' }]) + startChip('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 13 — HANGMAN
//===================================================================
function hangmanHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var WORDS=["JAVASCRIPT","PYTHON","BAILEYS","WHATSAPP","KEYBOARD","ELEPHANT","GUITAR","RAINBOW","PLANET","DIAMOND","PUZZLE","MICHIKO"];'
        + 'var word,guessed,wrong=0,maxWrong=6,over=false,won=false,started=false,wins=0,losses=0;'
        + 'try{wins=+localStorage.getItem("mk_hang_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_hang_l")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;}'
        + 'function startGame(){word=WORDS[Math.floor(Math.random()*WORDS.length)];guessed=[];wrong=0;over=false;won=false;started=true;'
        + 'var kb=document.getElementById("kb");if(kb){var btns=kb.querySelectorAll("button");for(var i=0;i<btns.length;i++){btns[i].disabled=false;btns[i].style.opacity=1;}}}'
        + 'function guess(letter){if(!started||over)return;if(guessed.indexOf(letter)!==-1)return;guessed.push(letter);'
        + 'if(word.indexOf(letter)===-1){wrong++;if(wrong>=maxWrong){over=true;losses++;try{localStorage.setItem("mk_hang_l",losses);}catch(e){}updateStats();}}'
        + 'else{var allFound=true;for(var i=0;i<word.length;i++){if(guessed.indexOf(word[i])===-1){allFound=false;break;}}'
        + 'if(allFound){over=true;won=true;wins++;try{localStorage.setItem("mk_hang_w",wins);}catch(e){}updateStats();}}}'
        + 'function drawFigure(){var parts=wrong;ctx.strokeStyle="#2f2b52";ctx.lineWidth=3;ctx.lineCap="round";'
        + 'ctx.beginPath();ctx.moveTo(30,220);ctx.lineTo(120,220);ctx.moveTo(60,220);ctx.lineTo(60,30);ctx.lineTo(160,30);ctx.lineTo(160,55);ctx.stroke();'
        + 'if(parts>0){ctx.beginPath();ctx.arc(160,75,20,0,Math.PI*2);ctx.stroke();}'
        + 'if(parts>1){ctx.beginPath();ctx.moveTo(160,95);ctx.lineTo(160,150);ctx.stroke();}'
        + 'if(parts>2){ctx.beginPath();ctx.moveTo(160,105);ctx.lineTo(135,130);ctx.stroke();}'
        + 'if(parts>3){ctx.beginPath();ctx.moveTo(160,105);ctx.lineTo(185,130);ctx.stroke();}'
        + 'if(parts>4){ctx.beginPath();ctx.moveTo(160,150);ctx.lineTo(138,185);ctx.stroke();}'
        + 'if(parts>5){ctx.beginPath();ctx.moveTo(160,150);ctx.lineTo(182,185);ctx.stroke();}}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'if(started){drawFigure();'
        + 'var display="";for(var i=0;i<word.length;i++){display+=(guessed.indexOf(word[i])!==-1?word[i]:"_")+" ";}'
        + 'ctx.fillStyle="#2f2b52";ctx.font="bold 22px monospace";ctx.textAlign="center";ctx.fillText(display,cvs.width/2,260);ctx.textAlign="left";}'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("HANGMAN",cvs.width/2,cvs.height/2-14);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap START, guess letters below",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText(won?"YOU GOT IT!":"OUT OF TRIES",cvs.width/2,cvs.height/2-10);ctx.font="13px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Word: "+word,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap START for a new word",cvs.width/2,cvs.height/2+34);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(){if(!started||over)startGame();});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'var kbDiv=document.getElementById("kb");'
        + 'var letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");'
        + 'for(var li=0;li<letters.length;li++){(function(letter){'
        + 'var b=document.createElement("button");b.textContent=letter;'
        + 'b.style.cssText="width:24px;height:28px;margin:1px;background:#f1eefc;border:1px solid rgba(90,80,140,.2);border-radius:6px;color:#2f2b52;font-size:11px;font-weight:700";'
        + 'b.addEventListener("click",function(){guess(letter);b.style.opacity=0.35;b.disabled=true;});'
        + 'kbDiv.appendChild(b);})(letters[li]);}'
        + 'updateStats();draw();loop();';

    const keyboard = '<div id="kb" style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:10px"></div>';

    return shellV3({
        title: 'Hangman',
        subtitle: 'GUESS THE WORD · 6 TRIES',
        w: 300, h: 280,
        stats: [
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 }
        ],
        controls: keyboard + startChip('NEW WORD'),
        script: script
    });
}

//===================================================================
// GAME 14 — CONNECT FOUR (vs AI)
//===================================================================
function connectFourHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=7,ROWS=6,CELL=cvs.width/COLS;'
        + 'var board,over=false,started=false,resultText="",wins=0,losses=0,draws=0;'
        + 'try{wins=+localStorage.getItem("mk_c4_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_c4_l")||0}catch(e){}'
        + 'try{draws=+localStorage.getItem("mk_c4_d")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;document.getElementById("dr").textContent=draws;'
        + 'try{localStorage.setItem("mk_c4_w",wins);localStorage.setItem("mk_c4_l",losses);localStorage.setItem("mk_c4_d",draws);}catch(e){}}'
        + 'function emptyBoard(){var b=[];for(var r=0;r<ROWS;r++)b.push(new Array(COLS).fill(0));return b;}'
        + 'function startGame(){board=emptyBoard();over=false;started=true;resultText="";}'
        + 'board=emptyBoard();'
        + 'function lowestEmptyRow(c){for(var r=ROWS-1;r>=0;r--){if(board[r][c]===0)return r;}return -1;}'
        + 'function checkWin(b,player){var dirs=[[0,1],[1,0],[1,1],[1,-1]];'
        + 'for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){if(b[r][c]!==player)continue;'
        + 'for(var d=0;d<dirs.length;d++){var dr=dirs[d][0],dc=dirs[d][1],cnt=1;'
        + 'for(var k=1;k<4;k++){var nr=r+dr*k,nc=c+dc*k;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}'
        + 'if(cnt>=4)return true;}}}return false;}'
        + 'function boardFull(b){for(var c=0;c<COLS;c++){if(b[0][c]===0)return false;}return true;}'
        + 'function aiMove(){'
        + 'for(var c=0;c<COLS;c++){var r=lowestEmptyRow(c);if(r===-1)continue;board[r][c]=2;if(checkWin(board,2))return;board[r][c]=0;}'
        + 'for(var c2=0;c2<COLS;c2++){var r2=lowestEmptyRow(c2);if(r2===-1)continue;board[r2][c2]=1;if(checkWin(board,1)){board[r2][c2]=2;return;}board[r2][c2]=0;}'
        + 'var order=[3,2,4,1,5,0,6];for(var i=0;i<order.length;i++){var c3=order[i];var r3=lowestEmptyRow(c3);if(r3!==-1){board[r3][c3]=2;return;}}}'
        + 'function dropDisc(c){if(!started||over)return;var r=lowestEmptyRow(c);if(r===-1)return;'
        + 'board[r][c]=1;'
        + 'if(checkWin(board,1)){over=true;resultText="YOU WIN!";wins++;updateStats();return;}'
        + 'if(boardFull(board)){over=true;resultText="DRAW";draws++;updateStats();return;}'
        + 'aiMove();'
        + 'if(checkWin(board,2)){over=true;resultText="AI WINS";losses++;updateStats();return;}'
        + 'if(boardFull(board)){over=true;resultText="DRAW";draws++;updateStats();return;}}'
        + 'function draw(){ctx.fillStyle="#dfe6fb";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){var x=c*CELL+CELL/2,y=r*CELL+CELL/2;'
        + 'ctx.beginPath();ctx.arc(x,y,CELL*0.38,0,Math.PI*2);'
        + 'ctx.fillStyle=board[r][c]===1?"#f472b6":(board[r][c]===2?"#facc15":"#fbfaff");ctx.fill();}}'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText("CONNECT FOUR",cvs.width/2,cvs.height/2-14);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap a column to drop",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 20px Arial";ctx.fillText(resultText,cvs.width/2,cvs.height/2-6);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+18);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width;var x=(e.clientX-rect.left)*sx;'
        + 'dropDisc(Math.floor(x/CELL));});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV3({
        title: 'Connect Four',
        subtitle: 'YOU (PINK) VS MICHIKO AI (YELLOW)',
        w: 294, h: 252,
        stats: [
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 },
            { id: 'dr', label: 'DRAWS', init: 0 }
        ],
        controls: startChip('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 15 — REACTION TIME TESTER
//===================================================================
function reactionHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var state="idle",waitStart=0,goTime=0,best=0,lastMs=null,timeoutId=null;'
        + 'try{best=+localStorage.getItem("mk_reaction_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("ms").textContent=lastMs!=null?lastMs+"ms":"-";document.getElementById("bs").textContent=best?best+"ms":"-";}'
        + 'function startRound(){state="waiting";var delay=1000+Math.random()*3000;'
        + 'timeoutId=setTimeout(function(){state="go";goTime=Date.now();},delay);}'
        + 'function tap(){'
        + 'if(state==="idle"){startRound();return;}'
        + 'if(state==="waiting"){clearTimeout(timeoutId);state="tooSoon";return;}'
        + 'if(state==="go"){lastMs=Date.now()-goTime;if(!best||lastMs<best){best=lastMs;try{localStorage.setItem("mk_reaction_b",best);}catch(e){}}state="result";updateStats();return;}'
        + 'if(state==="tooSoon"||state==="result"){startRound();return;}}'
        + 'function draw(){var bg="#fbfaff",msg="",sub="";'
        + 'if(state==="idle"){bg="#eef0fb";msg="TAP TO START";sub="Wait for green, then tap fast";}'
        + 'else if(state==="waiting"){bg="#f7b3b3";msg="WAIT...";sub="Don\\u2019t tap yet";}'
        + 'else if(state==="go"){bg="#b7f0c9";msg="TAP NOW!";sub="";}'
        + 'else if(state==="tooSoon"){bg="#f7b3b3";msg="TOO SOON!";sub="Tap to try again";}'
        + 'else if(state==="result"){bg="#eef0fb";msg=lastMs+" ms";sub="Tap to try again";}'
        + 'ctx.fillStyle=bg;ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 24px Arial";ctx.fillText(msg,cvs.width/2,cvs.height/2);'
        + 'ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText(sub,cvs.width/2,cvs.height/2+28);ctx.textAlign="left";}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(){tap();});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){if(state==="idle"||state==="tooSoon"||state==="result")startRound();});'
        + 'updateStats();draw();loop();';

    return shellV3({
        title: 'Reaction Test',
        subtitle: 'HOW FAST ARE YOUR REFLEXES?',
        w: 300, h: 220,
        stats: [
            { id: 'ms', label: 'LAST', init: '-' },
            { id: 'bs', label: 'BEST', init: '-' }
        ],
        controls: startChip('START ROUND'),
        script: script
    });
}


//===================================================================
// GAME 16 — BUBBLE POP (same-color flood-fill popper)
//===================================================================
function bubblePopHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=8,ROWS=8,CELL=cvs.width/COLS;'
        + 'var COLORS=["#f472b6","#60a5fa","#34d399","#fbbf24","#a78bfa"];'
        + 'var grid,score=0,best=0,over=false,started=false;'
        + 'try{best=+localStorage.getItem("mk_bubble_b")||0}catch(e){}'
        + 'function randomGrid(){var g=[];for(var r=0;r<ROWS;r++){var row=[];for(var c=0;c<COLS;c++){row.push(Math.floor(Math.random()*COLORS.length));}g.push(row);}return g;}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_bubble_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function startGame(){grid=randomGrid();score=0;over=false;started=true;updateStats();}'
        + 'grid=randomGrid();'
        + 'function floodFind(r,c){var color=grid[r][c];if(color===-1)return[];var visited={};var stack=[[r,c]];var group=[];'
        + 'while(stack.length){var cur=stack.pop();var cr=cur[0],cc=cur[1];var key=cr+","+cc;if(visited[key])continue;visited[key]=true;'
        + 'if(cr<0||cr>=ROWS||cc<0||cc>=COLS)continue;if(grid[cr][cc]!==color)continue;group.push([cr,cc]);'
        + 'stack.push([cr-1,cc],[cr+1,cc],[cr,cc-1],[cr,cc+1]);}return group;}'
        + 'function applyGravity(){for(var c=0;c<COLS;c++){var col=[];for(var r=0;r<ROWS;r++){if(grid[r][c]!==-1)col.push(grid[r][c]);}'
        + 'var newCol=[];for(var i=0;i<ROWS-col.length;i++)newCol.push(-1);for(var i2=0;i2<col.length;i2++)newCol.push(col[i2]);'
        + 'for(var r2=0;r2<ROWS;r2++){grid[r2][c]=newCol[r2];}}'
        + 'var nonEmptyCols=[];for(var c2=0;c2<COLS;c2++){var hasAny=false;for(var r3=0;r3<ROWS;r3++){if(grid[r3][c2]!==-1){hasAny=true;break;}}if(hasAny)nonEmptyCols.push(c2);}'
        + 'var newGrid=[];for(var r4=0;r4<ROWS;r4++)newGrid.push(new Array(COLS).fill(-1));'
        + 'for(var ni=0;ni<nonEmptyCols.length;ni++){for(var r5=0;r5<ROWS;r5++){newGrid[r5][ni]=grid[r5][nonEmptyCols[ni]];}}grid=newGrid;}'
        + 'function hasMoves(){for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){if(grid[r][c]===-1)continue;if(floodFind(r,c).length>=2)return true;}}return false;}'
        + 'function tapCell(r,c){if(!started||over)return;if(grid[r][c]===-1)return;var group=floodFind(r,c);if(group.length<2)return;'
        + 'for(var i=0;i<group.length;i++){grid[group[i][0]][group[i][1]]=-1;}score+=group.length*(group.length-1);applyGravity();updateStats();'
        + 'if(!hasMoves()){over=true;}}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){var v=grid[r][c];var x=c*CELL+CELL/2,y=r*CELL+CELL/2;'
        + 'if(v!==-1){ctx.beginPath();ctx.fillStyle=COLORS[v];ctx.arc(x,y,CELL*0.42,0,Math.PI*2);ctx.fill();}}}'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("BUBBLE POP",cvs.width/2,cvs.height/2-14);ctx.font="11px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap groups of 2+ matching bubbles",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText("NO MORE MOVES",cvs.width/2,cvs.height/2-8);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Score "+score+"  Best "+best,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+32);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;tapCell(Math.floor(y/CELL),Math.floor(x/CELL));});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV3({
        title: 'Bubble Pop',
        subtitle: 'POP GROUPS OF 2+ MATCHING COLORS',
        w: 296, h: 296,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: startChip('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 17 — WORDLE-STYLE
//===================================================================
function wordleHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var WORDS=["APPLE","BRAVE","CHART","DANCE","EAGLE","FLAME","GRAPE","HOUSE","IMAGE","JOKER","KOALA","LEMON","MANGO","NOBLE","OCEAN","PRIDE","QUEEN","RIVER","SOLAR","TIGER"];'
        + 'var target,guesses,currentGuess="",over=false,won=false,started=false,wins=0,losses=0;'
        + 'try{wins=+localStorage.getItem("mk_wordle_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_wordle_l")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;}'
        + 'function startGame(){target=WORDS[Math.floor(Math.random()*WORDS.length)];guesses=[];currentGuess="";over=false;won=false;started=true;}'
        + 'function evalGuess(guess){var result=new Array(5).fill("absent");var targetArr=target.split("");var used=new Array(5).fill(false);'
        + 'for(var i=0;i<5;i++){if(guess[i]===targetArr[i]){result[i]="correct";used[i]=true;}}'
        + 'for(var i2=0;i2<5;i2++){if(result[i2]==="correct")continue;for(var j=0;j<5;j++){if(!used[j]&&targetArr[j]===guess[i2]){result[i2]="present";used[j]=true;break;}}}'
        + 'return result;}'
        + 'function submitGuess(){if(!started||over)return;if(currentGuess.length!==5)return;'
        + 'var evalResult=evalGuess(currentGuess);guesses.push({word:currentGuess,result:evalResult});'
        + 'if(currentGuess===target){over=true;won=true;wins++;try{localStorage.setItem("mk_wordle_w",wins);}catch(e){}updateStats();}'
        + 'else if(guesses.length>=6){over=true;losses++;try{localStorage.setItem("mk_wordle_l",losses);}catch(e){}updateStats();}'
        + 'currentGuess="";}'
        + 'function pressLetter(l){if(!started||over)return;if(currentGuess.length<5)currentGuess+=l;}'
        + 'function pressBackspace(){if(!started||over)return;currentGuess=currentGuess.slice(0,-1);}'
        + 'var COLORMAP={correct:"#34d399",present:"#fbbf24",absent:"#c9c3d9"};'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'var cellW=cvs.width/5,cellH=36;'
        + 'for(var row=0;row<6;row++){for(var col=0;col<5;col++){var x=col*cellW,y=row*cellH+4;'
        + 'var letter="",bg="#eef0fb";'
        + 'if(guesses&&row<guesses.length){letter=guesses[row].word[col];bg=COLORMAP[guesses[row].result[col]];}'
        + 'else if(started&&row===((guesses?guesses.length:0))){letter=currentGuess[col]||"";}'
        + 'ctx.fillStyle=bg;ctx.fillRect(x+3,y,cellW-6,cellH-6);'
        + 'if(letter){ctx.fillStyle=(bg==="#eef0fb")?"#2f2b52":"#fff";ctx.font="bold 18px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(letter,x+cellW/2,y+(cellH-6)/2+1);}}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("WORDLE",cvs.width/2,cvs.height/2-10);ctx.font="11px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap START, guess the 5-letter word",cvs.width/2,cvs.height/2+12);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 17px Arial";ctx.fillText(won?"SOLVED!":"OUT OF TRIES",cvs.width/2,cvs.height/2-8);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Word: "+target,cvs.width/2,cvs.height/2+14);ctx.fillText("Tap START for a new word",cvs.width/2,cvs.height/2+32);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(){if(!started||over)startGame();});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'var kbDiv=document.getElementById("kb");var rows=["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"];'
        + 'for(var ri=0;ri<rows.length;ri++){var rowDiv=document.createElement("div");rowDiv.style.cssText="display:flex;justify-content:center;margin:2px 0";'
        + 'for(var li=0;li<rows[ri].length;li++){(function(letter){var b=document.createElement("button");b.textContent=letter;'
        + 'b.style.cssText="width:24px;height:30px;margin:1px;background:#f1eefc;border:1px solid rgba(90,80,140,.2);border-radius:5px;color:#2f2b52;font-size:11px;font-weight:700";'
        + 'b.addEventListener("click",function(){pressLetter(letter);});rowDiv.appendChild(b);})(rows[ri][li]);}'
        + 'kbDiv.appendChild(rowDiv);}'
        + 'var actionRow=document.createElement("div");actionRow.style.cssText="display:flex;justify-content:center;margin:2px 0";'
        + 'var enterBtn=document.createElement("button");enterBtn.textContent="ENTER";enterBtn.style.cssText="padding:8px 10px;margin:1px;background:#a78bfa;border:none;border-radius:5px;color:#fff;font-size:10px;font-weight:700";'
        + 'enterBtn.addEventListener("click",function(){submitGuess();});actionRow.appendChild(enterBtn);'
        + 'var backBtn=document.createElement("button");backBtn.textContent="\\u232B";backBtn.style.cssText="padding:8px 12px;margin:1px;background:#f1eefc;border:1px solid rgba(90,80,140,.2);border-radius:5px;color:#2f2b52;font-size:12px;font-weight:700";'
        + 'backBtn.addEventListener("click",function(){pressBackspace();});actionRow.appendChild(backBtn);'
        + 'kbDiv.appendChild(actionRow);'
        + 'updateStats();draw();loop();';

    const keyboard = '<div id="kb" style="margin-top:8px"></div>';

    return shellV3({
        title: 'Wordle',
        subtitle: 'GUESS THE WORD · 6 TRIES',
        w: 260, h: 240,
        stats: [
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 }
        ],
        controls: keyboard + startChip('NEW WORD'),
        script: script
    });
}

//===================================================================
// GAME 18 — WORD SEARCH
//===================================================================
function wordSearchHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var COLS=8,ROWS=8,CELL=cvs.width/COLS;'
        + 'var WORDLIST=["CAT","DOG","SUN","STAR","MOON","FISH","BIRD","TREE"];'
        + 'var grid,placedWords,foundWords=0,over=false,started=false,selStart=null,selEnd=null;'
        + 'function emptyGrid(){var g=[];for(var r=0;r<ROWS;r++)g.push(new Array(COLS).fill(""));return g;}'
        + 'function tryPlace(word,gr){var dirs=[[0,1],[1,0]];'
        + 'for(var attempt=0;attempt<80;attempt++){var dir=dirs[Math.floor(Math.random()*dirs.length)];'
        + 'var maxR=dir[0]===1?ROWS-word.length:ROWS-1;var maxC=dir[1]===1?COLS-word.length:COLS-1;'
        + 'if(maxR<0||maxC<0)continue;var r=Math.floor(Math.random()*(maxR+1));var c=Math.floor(Math.random()*(maxC+1));'
        + 'var fits=true;var cells=[];'
        + 'for(var i=0;i<word.length;i++){var rr=r+dir[0]*i,cc=c+dir[1]*i;'
        + 'if(gr[rr][cc]!==""&&gr[rr][cc]!==word[i]){fits=false;break;}cells.push([rr,cc]);}'
        + 'if(fits){for(var j=0;j<cells.length;j++){gr[cells[j][0]][cells[j][1]]=word[j];}return cells;}}return null;}'
        + 'function startGame(){grid=emptyGrid();'
        + 'var shuffled=WORDLIST.slice();for(var i=shuffled.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=shuffled[i];shuffled[i]=shuffled[j];shuffled[j]=t;}'
        + 'var chosen=shuffled.slice(0,4);placedWords=[];'
        + 'for(var k=0;k<chosen.length;k++){var cells=tryPlace(chosen[k],grid);if(cells)placedWords.push({word:chosen[k],cells:cells,found:false});}'
        + 'var LETTERS="ABCDEFGHIJKLMNOPQRSTUVWXYZ";'
        + 'for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){if(grid[r][c]==="")grid[r][c]=LETTERS[Math.floor(Math.random()*26)];}}'
        + 'foundWords=0;over=false;started=true;selStart=null;selEnd=null;updateStats();}'
        + 'grid=emptyGrid();placedWords=[];'
        + 'function updateStats(){document.getElementById("fw").textContent=foundWords+"/"+(placedWords?placedWords.length:0);'
        + 'document.getElementById("st").textContent=placedWords?("Find: "+placedWords.filter(function(w){return!w.found;}).map(function(w){return w.word;}).join(", ")):"";}'
        + 'function cellsInLine(r1,c1,r2,c2){if(r1===r2){var cells=[];var lo=Math.min(c1,c2),hi=Math.max(c1,c2);for(var c=lo;c<=hi;c++)cells.push([r1,c]);return cells;}'
        + 'else if(c1===c2){var cells2=[];var lo2=Math.min(r1,r2),hi2=Math.max(r1,r2);for(var r=lo2;r<=hi2;r++)cells2.push([r,c1]);return cells2;}return null;}'
        + 'function trySelect(r1,c1,r2,c2){var cells=cellsInLine(r1,c1,r2,c2);if(!cells)return;'
        + 'var str1="";for(var i=0;i<cells.length;i++){str1+=grid[cells[i][0]][cells[i][1]];}var str2=str1.split("").reverse().join("");'
        + 'for(var w=0;w<placedWords.length;w++){var pw=placedWords[w];if(pw.found)continue;'
        + 'if(pw.word===str1||pw.word===str2){pw.found=true;foundWords++;updateStats();if(foundWords===placedWords.length){over=true;}return;}}}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var r=0;r<ROWS;r++){for(var c=0;c<COLS;c++){ctx.strokeStyle="rgba(90,80,140,.08)";ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);'
        + 'var isFound=false;for(var w=0;w<placedWords.length;w++){if(placedWords[w].found){for(var ci=0;ci<placedWords[w].cells.length;ci++){if(placedWords[w].cells[ci][0]===r&&placedWords[w].cells[ci][1]===c){isFound=true;}}}}'
        + 'if(isFound){ctx.fillStyle="#d7f5e3";ctx.fillRect(c*CELL+1,r*CELL+1,CELL-2,CELL-2);}'
        + 'ctx.fillStyle="#2f2b52";ctx.font="bold "+(CELL*0.45)+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(grid[r][c],c*CELL+CELL/2,r*CELL+CELL/2+1);}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("WORD SEARCH",cvs.width/2,cvs.height/2-14);ctx.font="11px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap START, drag across words",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText("ALL FOUND!",cvs.width/2,cvs.height/2-6);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+16);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'function cellFromEvent(e){var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;return[Math.floor(y/CELL),Math.floor(x/CELL)];}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}var cell=cellFromEvent(e);selStart=cell;});'
        + 'cvs.addEventListener("pointerup",function(e){if(!started||over||!selStart)return;var cell=cellFromEvent(e);'
        + 'trySelect(selStart[0],selStart[1],cell[0],cell[1]);selStart=null;});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'draw();loop();';

    return shellV3({
        title: 'Word Search',
        subtitle: 'DRAG ACROSS EACH HIDDEN WORD',
        w: 296, h: 296,
        stats: [
            { id: 'fw', label: 'FOUND', init: '0/4' }
        ],
        controls: startChip('NEW PUZZLE'),
        script: script
    });
}

//===================================================================
// GAME 19 — ROCK PAPER SCISSORS (animated)
//===================================================================
function rpsHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var CHOICES=["rock","paper","scissors"];'
        + 'var EMOJI={rock:"\\u270A",paper:"\\u270B",scissors:"\\u270C\\uFE0F"};'
        + 'var playerChoice=null,aiChoice=null,resultText="",wins=0,losses=0,draws=0,revealed=false;'
        + 'try{wins=+localStorage.getItem("mk_rps_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_rps_l")||0}catch(e){}'
        + 'try{draws=+localStorage.getItem("mk_rps_d")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;document.getElementById("dr").textContent=draws;'
        + 'try{localStorage.setItem("mk_rps_w",wins);localStorage.setItem("mk_rps_l",losses);localStorage.setItem("mk_rps_d",draws);}catch(e){}}'
        + 'function decide(p,a){if(p===a)return"draw";'
        + 'if((p==="rock"&&a==="scissors")||(p==="paper"&&a==="rock")||(p==="scissors"&&a==="paper"))return"win";return"lose";}'
        + 'function play(choice){playerChoice=choice;aiChoice=CHOICES[Math.floor(Math.random()*3)];'
        + 'var r=decide(choice,aiChoice);if(r==="win"){wins++;resultText="YOU WIN!";}else if(r==="lose"){losses++;resultText="AI WINS";}else{draws++;resultText="DRAW";}'
        + 'updateStats();revealed=true;}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'if(!revealed){ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("ROCK · PAPER · SCISSORS",cvs.width/2,cvs.height/2-6);'
        + 'ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Pick a move below",cvs.width/2,cvs.height/2+16);ctx.textAlign="left";}'
        + 'else{ctx.font="46px Arial";ctx.textAlign="center";'
        + 'ctx.fillText(EMOJI[playerChoice],cvs.width/2-50,cvs.height/2);'
        + 'ctx.fillText(EMOJI[aiChoice],cvs.width/2+50,cvs.height/2);'
        + 'ctx.font="11px Arial";ctx.fillStyle="#6b6690";ctx.fillText("YOU",cvs.width/2-50,cvs.height/2+34);ctx.fillText("MICHIKO",cvs.width/2+50,cvs.height/2+34);'
        + 'ctx.font="bold 18px Arial";ctx.fillStyle="#2f2b52";ctx.fillText(resultText,cvs.width/2,cvs.height/2-40);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'document.getElementById("btnRock").addEventListener("click",function(){play("rock");});'
        + 'document.getElementById("btnPaper").addEventListener("click",function(){play("paper");});'
        + 'document.getElementById("btnScissors").addEventListener("click",function(){play("scissors");});'
        + 'updateStats();draw();loop();';

    return shellV3({
        title: 'Rock Paper Scissors',
        subtitle: 'BEST REFLEXES, BEST STRATEGY',
        w: 300, h: 200,
        stats: [
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 },
            { id: 'dr', label: 'DRAWS', init: 0 }
        ],
        controls: chipRow([
            { id: 'btnRock', label: '\u270A Rock' },
            { id: 'btnPaper', label: '\u270B Paper' },
            { id: 'btnScissors', label: '\u270C\uFE0F Scissors' }
        ]),
        script: script
    });
}

//===================================================================
// GAME 20 — CHECKERS (vs AI)
// Simplified ruleset: captures are forced when available, but multi-jump
// chains in a single turn are not required (one capture ends the turn).
//===================================================================
function checkersHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var CELL=cvs.width/8;'
        + 'var board,selected=null,over=false,started=false,resultText="",wins=0,losses=0;'
        + 'try{wins=+localStorage.getItem("mk_checkers_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_checkers_l")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;}'
        + 'function initBoard(){var b=[];for(var r=0;r<8;r++)b.push(new Array(8).fill(0));'
        + 'for(var r2=0;r2<3;r2++){for(var c=0;c<8;c++){if((r2+c)%2===1)b[r2][c]=3;}}'
        + 'for(var r3=5;r3<8;r3++){for(var c2=0;c2<8;c2++){if((r3+c2)%2===1)b[r3][c2]=1;}}return b;}'
        + 'function startGame(){board=initBoard();selected=null;over=false;started=true;resultText="";updateStats();}'
        + 'board=initBoard();'
        + 'function isPlayer(v){return v===1||v===2;}function isAI(v){return v===3||v===4;}'
        + 'function pieceDirs(v){if(v===1)return[[-1,-1],[-1,1]];if(v===3)return[[1,-1],[1,1]];if(v===2||v===4)return[[-1,-1],[-1,1],[1,-1],[1,1]];return[];}'
        + 'function getMovesForPiece(b,r,c){var v=b[r][c];if(v===0)return{moves:[],captures:[]};var dirs=pieceDirs(v);var moves=[],captures=[];'
        + 'for(var i=0;i<dirs.length;i++){var dr=dirs[i][0],dc=dirs[i][1];var nr=r+dr,nc=c+dc;if(nr<0||nr>=8||nc<0||nc>=8)continue;'
        + 'if(b[nr][nc]===0){moves.push({from:[r,c],to:[nr,nc],capture:null});}'
        + 'else if((isPlayer(v)&&isAI(b[nr][nc]))||(isAI(v)&&isPlayer(b[nr][nc]))){var jr=nr+dr,jc=nc+dc;'
        + 'if(jr>=0&&jr<8&&jc>=0&&jc<8&&b[jr][jc]===0){captures.push({from:[r,c],to:[jr,jc],capture:[nr,nc]});}}}'
        + 'return{moves:moves,captures:captures};}'
        + 'function getAllMoves(b,side){var allMoves=[],allCaptures=[];'
        + 'for(var r=0;r<8;r++){for(var c=0;c<8;c++){var v=b[r][c];'
        + 'if(side==="player"&&!isPlayer(v))continue;if(side==="ai"&&!isAI(v))continue;'
        + 'var res=getMovesForPiece(b,r,c);allMoves=allMoves.concat(res.moves);allCaptures=allCaptures.concat(res.captures);}}'
        + 'return allCaptures.length?allCaptures:allMoves;}'
        + 'function applyMove(b,move){var v=b[move.from[0]][move.from[1]];b[move.from[0]][move.from[1]]=0;'
        + 'if(move.capture)b[move.capture[0]][move.capture[1]]=0;'
        + 'if(v===1&&move.to[0]===0)v=2;if(v===3&&move.to[0]===7)v=4;b[move.to[0]][move.to[1]]=v;}'
        + 'function countPieces(b,side){var n=0;for(var r=0;r<8;r++){for(var c=0;c<8;c++){if(side==="player"&&isPlayer(b[r][c]))n++;if(side==="ai"&&isAI(b[r][c]))n++;}}return n;}'
        + 'function checkGameOver(){var playerMoves=getAllMoves(board,"player");var aiMoves=getAllMoves(board,"ai");'
        + 'if(countPieces(board,"ai")===0||aiMoves.length===0){over=true;resultText="YOU WIN!";wins++;try{localStorage.setItem("mk_checkers_w",wins);}catch(e){}updateStats();return true;}'
        + 'if(countPieces(board,"player")===0||playerMoves.length===0){over=true;resultText="AI WINS";losses++;try{localStorage.setItem("mk_checkers_l",losses);}catch(e){}updateStats();return true;}'
        + 'return false;}'
        + 'function aiTurn(){var moves=getAllMoves(board,"ai");if(!moves.length)return;'
        + 'var pick=moves[Math.floor(Math.random()*moves.length)];applyMove(board,pick);}'
        + 'function tapCell(r,c){if(!started||over)return;var v=board[r][c];'
        + 'if(selected){var legal=getAllMoves(board,"player").filter(function(m){return m.from[0]===selected[0]&&m.from[1]===selected[1];});'
        + 'var chosen=null;for(var i=0;i<legal.length;i++){if(legal[i].to[0]===r&&legal[i].to[1]===c){chosen=legal[i];break;}}'
        + 'if(chosen){applyMove(board,chosen);selected=null;if(checkGameOver())return;aiTurn();checkGameOver();return;}'
        + 'if(isPlayer(v)){selected=[r,c];return;}selected=null;return;}'
        + 'if(isPlayer(v))selected=[r,c];}'
        + 'function draw(){ctx.fillStyle="#fbfaff";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var r=0;r<8;r++){for(var c=0;c<8;c++){var x=c*CELL,y=r*CELL;'
        + 'ctx.fillStyle=(r+c)%2===0?"#f3f1fc":"#c9c3f0";ctx.fillRect(x,y,CELL,CELL);'
        + 'if(selected&&selected[0]===r&&selected[1]===c){ctx.fillStyle="rgba(244,114,182,.45)";ctx.fillRect(x,y,CELL,CELL);}'
        + 'var v=board[r][c];if(v!==0){var cx=x+CELL/2,cy=y+CELL/2;'
        + 'ctx.beginPath();ctx.fillStyle=isPlayer(v)?"#f472b6":"#2f2b52";ctx.arc(cx,cy,CELL*0.36,0,Math.PI*2);ctx.fill();'
        + 'if(v===2||v===4){ctx.fillStyle="#fbbf24";ctx.font="bold "+(CELL*0.3)+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("\\u2605",cx,cy+1);}}}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("CHECKERS",cvs.width/2,cvs.height/2-14);ctx.font="11px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap START, tap a piece then a move",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2f2b52";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText(resultText,cvs.width/2,cvs.height/2-6);ctx.font="12px Arial";ctx.fillStyle="#6b6690";ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+16);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;tapCell(Math.floor(y/CELL),Math.floor(x/CELL));});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV3({
        title: 'Checkers',
        subtitle: 'YOU (PINK) VS MICHIKO AI (DARK)',
        w: 296, h: 296,
        stats: [
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 }
        ],
        controls: startChip('NEW GAME'),
        script: script
    });
}


//===================================================================
// ============ BATCH 4 — "RETRO ARCADE" VISUAL THEME ================
// A fourth distinct look for the finale: black/CRT-green terminal
// aesthetic with monospace font and chunky bordered buttons — vs. the
// neon-purple, sunset-glass, and pastel-paper themes above.
//===================================================================
function shellV4(opts) {
    const stats = opts.stats.map(function (s) {
        return '<div style="text-align:center"><div style="font-size:9px;letter-spacing:1.5px;color:#4ade80;font-family:monospace">'
            + s.label + '</div><div id="' + s.id + '" style="font-size:16px;font-weight:800;color:#a3f7bf;font-family:monospace;text-shadow:0 0 6px rgba(74,222,128,.6)">'
            + (s.init != null ? s.init : 0) + '</div></div>';
    }).join('');

    return '<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;font-family:monospace}</style>'
        + '<body style="margin:0;background:#04140a;touch-action:manipulation">'
        + '<div style="max-width:620px;margin:auto;padding:14px">'
        + '<div style="background:#08200f;border:1px solid #1f6b3a;border-radius:14px;overflow:hidden;box-shadow:0 0 30px rgba(74,222,128,.15)">'
        + '<div style="padding:14px 18px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1f6b3a">'
        + '<div><div style="font-size:9px;letter-spacing:3px;color:#4ade80;font-weight:700">' + BRAND + '</div>'
        + '<div style="font-size:18px;font-weight:800;color:#a3f7bf;text-shadow:0 0 8px rgba(74,222,128,.6)">' + opts.title + '</div></div>'
        + '<div style="display:flex;gap:12px">' + stats + '</div>'
        + '</div>'
        + '<div style="padding:8px 18px 0;font-size:11px;color:#4ade80">' + opts.subtitle + '</div>'
        + '<div style="padding:0 14px 14px">'
        + '<canvas id="g" width="' + opts.w + '" height="' + opts.h + '" style="width:100%;height:auto;touch-action:none;border-radius:8px;border:1px solid #1f6b3a;display:block;background:#020d06;margin-top:10px"></canvas>'
        + '<div id="st" style="text-align:center;margin-top:8px;font-size:11px;color:#4ade80">Tap to start</div>'
        + (opts.controls || '')
        + LOGO_WATERMARK
        + '</div></div></div>'
        + '<script>' + opts.script + '</script>';
}

function retroRow(buttons) {
    const btns = buttons.map(function (b) {
        return '<button id="' + b.id + '" style="flex:1;padding:12px 4px;background:#0d3018;'
            + 'border:1px solid #4ade80;border-radius:6px;color:#a3f7bf;font-size:14px;font-weight:700;font-family:monospace">'
            + b.label + '</button>';
    }).join('');
    return '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' + btns + '</div>';
}

function retroStart(label) {
    return '<button id="btnStart" style="width:100%;margin-top:10px;padding:13px 0;'
        + 'background:#4ade80;border:none;border-radius:8px;color:#04140a;'
        + 'font-size:13px;font-weight:800;letter-spacing:1px;font-family:monospace">' + label + '</button>';
}

//===================================================================
// GAME 21 — STACK TOWER
//===================================================================
function stackTowerHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height,BLOCK_H=25,MAX_LEVELS=14;'
        + 'var blocks,movingBlock,score=0,best=0,over=false,started=false,won=false,dir=1,speed=2;'
        + 'try{best=+localStorage.getItem("mk_stack_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_stack_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function spawnMoving(){var last=blocks[blocks.length-1];movingBlock={x:0,width:last.width,y:last.y-BLOCK_H};dir=1;}'
        + 'function startGame(){blocks=[{x:0,width:W,y:H-BLOCK_H}];score=0;over=false;won=false;started=true;speed=2;spawnMoving();updateStats();}'
        + 'blocks=[{x:0,width:W,y:H-BLOCK_H}];spawnMoving();'
        + 'function update(){if(!started||over)return;movingBlock.x+=dir*speed;'
        + 'if(movingBlock.x<=0||movingBlock.x+movingBlock.width>=W){dir*=-1;movingBlock.x=Math.max(0,Math.min(W-movingBlock.width,movingBlock.x));}}'
        + 'function drop(){if(!started||over)return;var last=blocks[blocks.length-1];'
        + 'var left=Math.max(movingBlock.x,last.x);var right=Math.min(movingBlock.x+movingBlock.width,last.x+last.width);var overlap=right-left;'
        + 'if(overlap<=0){over=true;return;}'
        + 'blocks.push({x:left,width:overlap,y:movingBlock.y});score++;speed=Math.min(6,speed+0.15);updateStats();'
        + 'if(blocks.length>=MAX_LEVELS){over=true;won=true;return;}spawnMoving();}'
        + 'function draw(){ctx.fillStyle="#020d06";ctx.fillRect(0,0,W,H);'
        + 'for(var i=0;i<blocks.length;i++){var b=blocks[i];ctx.fillStyle="#4ade80";ctx.fillRect(b.x+1,b.y+1,b.width-2,BLOCK_H-2);ctx.strokeStyle="#04140a";ctx.strokeRect(b.x+1,b.y+1,b.width-2,BLOCK_H-2);}'
        + 'if(started&&!over){ctx.fillStyle="#a3f7bf";ctx.fillRect(movingBlock.x+1,movingBlock.y+1,movingBlock.width-2,BLOCK_H-2);}'
        + 'if(!started){ctx.fillStyle="rgba(2,13,6,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 16px monospace";ctx.fillText("STACK TOWER",W/2,H/2-14);ctx.font="11px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Tap to drop each block",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(2,13,6,.85)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 18px monospace";ctx.fillText(won?"TOWER COMPLETE!":"TOPPLED!",W/2,H/2-8);ctx.font="12px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Height "+score+"  Best "+best,W/2,H/2+14);ctx.fillText("Tap to try again",W/2,H/2+32);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(){if(!started||over){startGame();return;}drop();});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV4({
        title: 'Stack Tower',
        subtitle: 'TAP TO DROP · STACK AS HIGH AS YOU CAN',
        w: 300, h: 400,
        stats: [
            { id: 'sc', label: 'HEIGHT', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: retroStart('NEW TOWER'),
        script: script
    });
}

//===================================================================
// GAME 22 — MINI SUDOKU (4x4)
//===================================================================
function sudokuHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var CELL=cvs.width/4;'
        + 'var solution,puzzle,fixed,selected=null,over=false,won=false,started=false;'
        + 'function isValid(grid,r,c,val){for(var i=0;i<4;i++){if(grid[r][i]===val)return false;if(grid[i][c]===val)return false;}'
        + 'var br=Math.floor(r/2)*2,bc=Math.floor(c/2)*2;for(var dr=0;dr<2;dr++){for(var dc=0;dc<2;dc++){if(grid[br+dr][bc+dc]===val)return false;}}return true;}'
        + 'function generateSolved(){var grid=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];'
        + 'function fill(pos){if(pos===16)return true;var r=Math.floor(pos/4),c=pos%4;'
        + 'var nums=[1,2,3,4];for(var i=nums.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=nums[i];nums[i]=nums[j];nums[j]=t;}'
        + 'for(var k=0;k<4;k++){if(isValid(grid,r,c,nums[k])){grid[r][c]=nums[k];if(fill(pos+1))return true;grid[r][c]=0;}}return false;}'
        + 'fill(0);return grid;}'
        + 'function startGame(){solution=generateSolved();puzzle=solution.map(function(row){return row.slice();});'
        + 'fixed=[[false,false,false,false],[false,false,false,false],[false,false,false,false],[false,false,false,false]];'
        + 'var removed=0;while(removed<8){var r=Math.floor(Math.random()*4),c=Math.floor(Math.random()*4);if(puzzle[r][c]!==0){puzzle[r][c]=0;removed++;}}'
        + 'for(var r2=0;r2<4;r2++){for(var c2=0;c2<4;c2++){fixed[r2][c2]=puzzle[r2][c2]!==0;}}'
        + 'selected=null;over=false;won=false;started=true;}'
        + 'function selectCell(r,c){if(!started||over)return;if(fixed[r][c])return;selected=[r,c];}'
        + 'function inputNumber(n){if(!started||over||!selected)return;var r=selected[0],c=selected[1];if(fixed[r][c])return;'
        + 'puzzle[r][c]=n;var complete=true;for(var i=0;i<4;i++){for(var j=0;j<4;j++){if(puzzle[i][j]===0)complete=false;}}'
        + 'if(complete){var correct=true;for(var i2=0;i2<4;i2++){for(var j2=0;j2<4;j2++){if(puzzle[i2][j2]!==solution[i2][j2])correct=false;}}'
        + 'if(correct){over=true;won=true;}}}'
        + 'function draw(){ctx.fillStyle="#020d06";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'if(puzzle){for(var r=0;r<4;r++){for(var c=0;c<4;c++){var x=c*CELL,y=r*CELL;'
        + 'ctx.fillStyle=fixed[r][c]?"#0d3018":(selected&&selected[0]===r&&selected[1]===c?"#1f6b3a":"#08200f");'
        + 'ctx.fillRect(x+1,y+1,CELL-2,CELL-2);'
        + 'if(puzzle[r][c]!==0){ctx.fillStyle=fixed[r][c]?"#4ade80":"#a3f7bf";ctx.font="bold "+(CELL*0.5)+"px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(puzzle[r][c]),x+CELL/2,y+CELL/2+1);}}}'
        + 'ctx.strokeStyle="#4ade80";ctx.lineWidth=2;ctx.strokeRect(CELL*2,0,1,cvs.height);ctx.strokeRect(0,CELL*2,cvs.width,1);}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(2,13,6,.8)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 15px monospace";ctx.fillText("MINI SUDOKU",cvs.width/2,cvs.height/2-14);ctx.font="10px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Fill 1-4, no repeats per row/col/box",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(2,13,6,.85)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 17px monospace";ctx.fillText("SOLVED!",cvs.width/2,cvs.height/2-6);ctx.font="11px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+16);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;selectCell(Math.floor(y/CELL),Math.floor(x/CELL));});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'document.getElementById("n1").addEventListener("click",function(){inputNumber(1);});'
        + 'document.getElementById("n2").addEventListener("click",function(){inputNumber(2);});'
        + 'document.getElementById("n3").addEventListener("click",function(){inputNumber(3);});'
        + 'document.getElementById("n4").addEventListener("click",function(){inputNumber(4);});'
        + 'draw();loop();';

    return shellV4({
        title: 'Mini Sudoku',
        subtitle: '4x4 · NUMBERS 1-4 · NO REPEATS',
        w: 240, h: 240,
        stats: [],
        controls: retroRow([
            { id: 'n1', label: '1' }, { id: 'n2', label: '2' },
            { id: 'n3', label: '3' }, { id: 'n4', label: '4' }
        ]) + retroStart('NEW PUZZLE'),
        script: script
    });
}

//===================================================================
// GAME 23 — FRUIT SLICER
//===================================================================
function fruitSlicerHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height;'
        + 'var FRUITS=["\\uD83C\\uDF4E","\\uD83C\\uDF4A","\\uD83C\\uDF47","\\uD83C\\uDF49","\\uD83C\\uDF53"];'
        + 'var fruits,score=0,best=0,over=false,started=false,spawnTimer=0,spawnInterval=60,dragging=false;'
        + 'try{best=+localStorage.getItem("mk_slicer_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_slicer_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function startGame(){fruits=[];score=0;over=false;started=true;spawnTimer=0;spawnInterval=60;updateStats();}'
        + 'fruits=[];'
        + 'function spawnFruit(){var isBomb=Math.random()<0.15;var x=40+Math.random()*(W-80);var vx=(Math.random()-0.5)*2;var vy=-(9+Math.random()*3);'
        + 'var emoji=FRUITS[Math.floor(Math.random()*FRUITS.length)];fruits.push({x:x,y:H,vx:vx,vy:vy,emoji:emoji,sliced:false,isBomb:isBomb,radius:18});}'
        + 'function update(){spawnTimer++;if(spawnTimer>spawnInterval){spawnTimer=0;spawnFruit();spawnInterval=Math.max(32,spawnInterval-1);}'
        + 'for(var i=0;i<fruits.length;i++){var f=fruits[i];f.vy+=0.22;f.x+=f.vx;f.y+=f.vy;}'
        + 'var kept=[];for(var j=0;j<fruits.length;j++){if(fruits[j].y<H+40&&!fruits[j].sliced)kept.push(fruits[j]);}fruits=kept;}'
        + 'function checkSlice(x,y){if(!started||over)return;for(var i=0;i<fruits.length;i++){var f=fruits[i];if(f.sliced)continue;'
        + 'var dx=x-f.x,dy=y-f.y;if(Math.sqrt(dx*dx+dy*dy)<f.radius+12){f.sliced=true;if(f.isBomb){over=true;}else{score++;updateStats();}}}}'
        + 'function cellPoint(e){var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'return{x:(e.clientX-rect.left)*sx,y:(e.clientY-rect.top)*sy};}'
        + 'function draw(){ctx.fillStyle="#020d06";ctx.fillRect(0,0,W,H);'
        + 'for(var i=0;i<fruits.length;i++){var f=fruits[i];if(f.sliced)continue;'
        + 'ctx.font="28px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(f.isBomb?"\\uD83D\\uDCA3":f.emoji,f.x,f.y);}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(2,13,6,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 16px monospace";ctx.fillText("FRUIT SLICER",W/2,H/2-14);ctx.font="11px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Swipe fruits, avoid bombs",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(2,13,6,.85)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 18px monospace";ctx.fillText("BOOM!",W/2,H/2-8);ctx.font="12px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Score "+score+"  Best "+best,W/2,H/2+14);ctx.fillText("Tap to try again",W/2,H/2+32);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}dragging=true;var p=cellPoint(e);checkSlice(p.x,p.y);});'
        + 'cvs.addEventListener("pointermove",function(e){if(!dragging||!started||over)return;var p=cellPoint(e);checkSlice(p.x,p.y);});'
        + 'cvs.addEventListener("pointerup",function(){dragging=false;});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV4({
        title: 'Fruit Slicer',
        subtitle: 'SWIPE TO SLICE · AVOID BOMBS',
        w: 300, h: 400,
        stats: [
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: retroStart('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 24 — ARCHERY
//===================================================================
function archeryHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height,LAUNCH_X=W/2,LAUNCH_Y=H-20;'
        + 'var target,arrowsLeft=5,score=0,best=0,over=false,started=false,aiming=false,aimStart=null,aimCurrent=null,lastShot=null;'
        + 'try{best=+localStorage.getItem("mk_archery_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("ar").textContent=arrowsLeft;document.getElementById("sc").textContent=score;if(score>best){best=score;try{localStorage.setItem("mk_archery_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function newTarget(){target={x:50+Math.random()*(W-100),ringRadii:[14,28,42]};}'
        + 'function startGame(){arrowsLeft=5;score=0;over=false;started=true;lastShot=null;newTarget();updateStats();}'
        + 'newTarget();'
        + 'function fireShot(dx,dy){var power=Math.min(120,Math.sqrt(dx*dx+dy*dy));'
        + 'var angleFactor=Math.max(-1,Math.min(1,-dx/120));'
        + 'var landingX=LAUNCH_X+angleFactor*power*1.8;landingX=Math.max(0,Math.min(W,landingX));'
        + 'var dist=Math.abs(landingX-target.x);var points=0;'
        + 'if(dist<=target.ringRadii[0])points=10;else if(dist<=target.ringRadii[1])points=5;else if(dist<=target.ringRadii[2])points=2;else points=0;'
        + 'score+=points;lastShot={x:landingX,points:points};arrowsLeft--;updateStats();'
        + 'if(arrowsLeft<=0){over=true;}else{newTarget();}}'
        + 'function cellPoint(e){var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'return{x:(e.clientX-rect.left)*sx,y:(e.clientY-rect.top)*sy};}'
        + 'function draw(){ctx.fillStyle="#020d06";ctx.fillRect(0,0,W,H);'
        + 'ctx.strokeStyle="#4ade80";for(var i=2;i>=0;i--){ctx.beginPath();ctx.arc(target.x,60,target.ringRadii[i],0,Math.PI*2);ctx.stroke();}'
        + 'ctx.fillStyle="#a3f7bf";ctx.beginPath();ctx.arc(LAUNCH_X,LAUNCH_Y,8,0,Math.PI*2);ctx.fill();'
        + 'if(aiming&&aimCurrent){ctx.strokeStyle="#4ade80";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(LAUNCH_X,LAUNCH_Y);ctx.lineTo(aimCurrent.x,aimCurrent.y);ctx.stroke();}'
        + 'if(lastShot){ctx.fillStyle="#f87171";ctx.beginPath();ctx.arc(lastShot.x,60,4,0,Math.PI*2);ctx.fill();'
        + 'ctx.fillStyle="#a3f7bf";ctx.font="11px monospace";ctx.textAlign="center";ctx.fillText("+"+lastShot.points,lastShot.x,90);ctx.textAlign="left";}'
        + 'if(!started){ctx.fillStyle="rgba(2,13,6,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 16px monospace";ctx.fillText("ARCHERY",W/2,H/2-14);ctx.font="11px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Drag back from the dot, release to fire",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(2,13,6,.85)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 18px monospace";ctx.fillText("OUT OF ARROWS",W/2,H/2-8);ctx.font="12px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Score "+score+"  Best "+best,W/2,H/2+14);ctx.fillText("Tap to try again",W/2,H/2+32);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}aiming=true;aimStart=cellPoint(e);aimCurrent=aimStart;});'
        + 'cvs.addEventListener("pointermove",function(e){if(aiming)aimCurrent=cellPoint(e);});'
        + 'cvs.addEventListener("pointerup",function(e){if(!aiming)return;aiming=false;var end=cellPoint(e);'
        + 'fireShot(end.x-aimStart.x,end.y-aimStart.y);});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV4({
        title: 'Archery',
        subtitle: 'DRAG BACK, RELEASE TO FIRE · 5 ARROWS',
        w: 300, h: 300,
        stats: [
            { id: 'ar', label: 'ARROWS', init: 5 },
            { id: 'sc', label: 'SCORE', init: 0 },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: retroStart('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 25 — AIR HOCKEY (vs AI)
//===================================================================
function airHockeyHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var W=cvs.width,H=cvs.height;'
        + 'var playerPaddle,aiPaddle,puck,scorePlayer=0,scoreAI=0,best=0,over=false,started=false;'
        + 'try{best=+localStorage.getItem("mk_hockey_b")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("sc").textContent=scorePlayer+" - "+scoreAI;if(scorePlayer>best){best=scorePlayer;try{localStorage.setItem("mk_hockey_b",best);}catch(e){}}document.getElementById("bs").textContent=best;}'
        + 'function resetPuck(dir){puck={x:W/2,y:H/2,vx:(Math.random()-0.5)*4,vy:dir*3,r:10};}'
        + 'function startGame(){playerPaddle={x:W/2,y:H-40,r:20};aiPaddle={x:W/2,y:40,r:20};scorePlayer=0;scoreAI=0;resetPuck(1);over=false;started=true;updateStats();}'
        + 'playerPaddle={x:W/2,y:H-40,r:20};aiPaddle={x:W/2,y:40,r:20};resetPuck(1);'
        + 'function collidePaddle(p){var dx=puck.x-p.x,dy=puck.y-p.y;var dist=Math.sqrt(dx*dx+dy*dy);var minDist=puck.r+p.r;'
        + 'if(dist<minDist&&dist>0){var nx=dx/dist,ny=dy/dist;puck.x=p.x+nx*minDist;puck.y=p.y+ny*minDist;'
        + 'var speed=Math.max(4,Math.sqrt(puck.vx*puck.vx+puck.vy*puck.vy));puck.vx=nx*speed*1.05;puck.vy=ny*speed*1.05;}}'
        + 'function update(){puck.x+=puck.vx;puck.y+=puck.vy;puck.vx*=0.997;puck.vy*=0.997;'
        + 'if(puck.x-puck.r<0||puck.x+puck.r>W){puck.vx*=-1;puck.x=Math.max(puck.r,Math.min(W-puck.r,puck.x));}'
        + 'var targetX=puck.y<H/2?puck.x:W/2;var targetY=puck.y<H/2?Math.max(30,puck.y-10):40;'
        + 'aiPaddle.x+=(targetX-aiPaddle.x)*0.08;aiPaddle.y+=(targetY-aiPaddle.y)*0.08;aiPaddle.y=Math.min(aiPaddle.y,H/2-30);'
        + 'collidePaddle(playerPaddle);collidePaddle(aiPaddle);'
        + 'if(puck.y-puck.r<0){scorePlayer++;updateStats();resetPuck(-1);}'
        + 'if(puck.y+puck.r>H){scoreAI++;updateStats();resetPuck(1);}'
        + 'if(scorePlayer>=7||scoreAI>=7){over=true;}}'
        + 'function draw(){ctx.fillStyle="#020d06";ctx.fillRect(0,0,W,H);'
        + 'ctx.strokeStyle="#1f6b3a";ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();ctx.setLineDash([]);'
        + 'ctx.beginPath();ctx.fillStyle="#a3f7bf";ctx.arc(playerPaddle.x,playerPaddle.y,playerPaddle.r,0,Math.PI*2);ctx.fill();'
        + 'ctx.beginPath();ctx.fillStyle="#f87171";ctx.arc(aiPaddle.x,aiPaddle.y,aiPaddle.r,0,Math.PI*2);ctx.fill();'
        + 'ctx.beginPath();ctx.fillStyle="#4ade80";ctx.arc(puck.x,puck.y,puck.r,0,Math.PI*2);ctx.fill();'
        + 'if(!started){ctx.fillStyle="rgba(2,13,6,.8)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 16px monospace";ctx.fillText("AIR HOCKEY",W/2,H/2-14);ctx.font="11px monospace";ctx.fillStyle="#4ade80";ctx.fillText("Drag your paddle · first to 7",W/2,H/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(2,13,6,.85)";ctx.fillRect(0,0,W,H);ctx.fillStyle="#a3f7bf";ctx.textAlign="center";ctx.font="bold 18px monospace";ctx.fillText(scorePlayer>scoreAI?"YOU WIN!":"AI WINS",W/2,H/2-8);ctx.font="12px monospace";ctx.fillStyle="#4ade80";ctx.fillText(scorePlayer+" - "+scoreAI,W/2,H/2+14);ctx.fillText("Tap to play again",W/2,H/2+32);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over)update();draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointermove",function(e){if(!started||over)return;var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;'
        + 'playerPaddle.x=Math.max(playerPaddle.r,Math.min(W-playerPaddle.r,x));playerPaddle.y=Math.max(H/2+playerPaddle.r,Math.min(H-playerPaddle.r,y));});'
        + 'cvs.addEventListener("pointerdown",function(){if(!started||over)startGame();});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV4({
        title: 'Air Hockey',
        subtitle: 'DRAG TO PLAY · FIRST TO 7',
        w: 300, h: 400,
        stats: [
            { id: 'sc', label: 'YOU - AI', init: '0 - 0' },
            { id: 'bs', label: 'BEST', init: 0 }
        ],
        controls: retroStart('NEW GAME'),
        script: script
    });
}


//===================================================================
// GAME 26 — CHESS (vs AI)
// Full legal-move chess: all 6 piece types, check/checkmate/stalemate
// detection, no-self-check rule, auto-queen promotion. Simplified: no
// castling and no en passant (disclosed simplification for reliability).
// AI is a 1-ply capture-preference heuristic, not a full engine — it is
// beatable, same honesty as the Connect Four / Checkers AI.
//===================================================================
function chessHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var CELL=cvs.width/8;'
        + 'var SYMBOLS={wK:"\\u2654",wQ:"\\u2655",wR:"\\u2656",wB:"\\u2657",wN:"\\u2658",wP:"\\u2659",bK:"\\u265A",bQ:"\\u265B",bR:"\\u265C",bB:"\\u265D",bN:"\\u265E",bP:"\\u265F"};'
        + 'var PIECE_VALUES={P:1,N:3,B:3,R:5,Q:9,K:100};'
        + 'var board,selected=null,legalForSelected=[],turn="w",over=false,started=false,resultText="",thinking=false,wins=0,losses=0;'
        + 'try{wins=+localStorage.getItem("mk_chess_w")||0}catch(e){}'
        + 'try{losses=+localStorage.getItem("mk_chess_l")||0}catch(e){}'
        + 'function updateStats(){document.getElementById("tn").textContent=over?"-":(turn==="w"?"YOU":"AI");document.getElementById("wn").textContent=wins;document.getElementById("ls").textContent=losses;}'
        + 'function pieceColor(p){return p?p[0]:null;}function pieceType(p){return p?p[1]:null;}'
        + 'function initBoard(){var b=[];for(var i=0;i<8;i++)b.push(new Array(8).fill(null));'
        + 'var back=["R","N","B","Q","K","B","N","R"];'
        + 'for(var c=0;c<8;c++){b[0][c]="b"+back[c];b[1][c]="bP";b[6][c]="wP";b[7][c]="w"+back[c];}return b;}'
        + 'function addIfValid(b,color,moves,nr,nc){if(nr<0||nr>=8||nc<0||nc>=8)return;var target=b[nr][nc];if(!target||pieceColor(target)!==color)moves.push([nr,nc]);}'
        + 'function getPseudoMoves(b,r,c){var p=b[r][c];if(!p)return[];var color=pieceColor(p),type=pieceType(p);var moves=[];'
        + 'if(type==="P"){var dir=color==="w"?-1:1;var startRow=color==="w"?6:1;'
        + 'if(r+dir>=0&&r+dir<8&&b[r+dir][c]===null){moves.push([r+dir,c]);'
        + 'if(r===startRow&&b[r+2*dir]&&b[r+2*dir][c]===null){moves.push([r+2*dir,c]);}}'
        + 'var caps=[[dir,-1],[dir,1]];for(var i=0;i<2;i++){var nr=r+caps[i][0],nc=c+caps[i][1];'
        + 'if(nr>=0&&nr<8&&nc>=0&&nc<8&&b[nr][nc]&&pieceColor(b[nr][nc])!==color){moves.push([nr,nc]);}}}'
        + 'else if(type==="N"){var deltas=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];'
        + 'for(var d=0;d<8;d++){addIfValid(b,color,moves,r+deltas[d][0],c+deltas[d][1]);}}'
        + 'else if(type==="K"){for(var dr=-1;dr<=1;dr++){for(var dc=-1;dc<=1;dc++){if(dr||dc)addIfValid(b,color,moves,r+dr,c+dc);}}}'
        + 'else{var dirs=[];if(type==="B"||type==="Q")dirs=dirs.concat([[-1,-1],[-1,1],[1,-1],[1,1]]);'
        + 'if(type==="R"||type==="Q")dirs=dirs.concat([[-1,0],[1,0],[0,-1],[0,1]]);'
        + 'for(var k=0;k<dirs.length;k++){var nr2=r+dirs[k][0],nc2=c+dirs[k][1];'
        + 'while(nr2>=0&&nr2<8&&nc2>=0&&nc2<8){var target=b[nr2][nc2];'
        + 'if(!target){moves.push([nr2,nc2]);}else{if(pieceColor(target)!==color)moves.push([nr2,nc2]);break;}'
        + 'nr2+=dirs[k][0];nc2+=dirs[k][1];}}}'
        + 'return moves;}'
        + 'function findKing(b,color){for(var r=0;r<8;r++){for(var c=0;c<8;c++){if(b[r][c]===color+"K")return[r,c];}}return null;}'
        + 'function isSquareAttacked(b,r,c,byColor){for(var rr=0;rr<8;rr++){for(var cc=0;cc<8;cc++){var p=b[rr][cc];'
        + 'if(p&&pieceColor(p)===byColor){var moves=getPseudoMoves(b,rr,cc);'
        + 'for(var i=0;i<moves.length;i++){if(moves[i][0]===r&&moves[i][1]===c)return true;}}}}return false;}'
        + 'function isInCheck(b,color){var king=findKing(b,color);if(!king)return false;'
        + 'var enemy=color==="w"?"b":"w";return isSquareAttacked(b,king[0],king[1],enemy);}'
        + 'function getLegalMoves(b,r,c){var p=b[r][c];if(!p)return[];var color=pieceColor(p);'
        + 'var pseudo=getPseudoMoves(b,r,c);var legal=[];'
        + 'for(var i=0;i<pseudo.length;i++){var nr=pseudo[i][0],nc=pseudo[i][1];'
        + 'var captured=b[nr][nc];var movedPiece=b[r][c];'
        + 'b[r][c]=null;b[nr][nc]=movedPiece;var stillInCheck=isInCheck(b,color);'
        + 'b[r][c]=movedPiece;b[nr][nc]=captured;'
        + 'if(!stillInCheck)legal.push([nr,nc]);}return legal;}'
        + 'function getAllLegalMoves(b,color){var all=[];for(var r=0;r<8;r++){for(var c=0;c<8;c++){var p=b[r][c];'
        + 'if(p&&pieceColor(p)===color){var legal=getLegalMoves(b,r,c);'
        + 'for(var i=0;i<legal.length;i++){all.push({from:[r,c],to:legal[i]});}}}}return all;}'
        + 'function applyMove(b,move){var p=b[move.from[0]][move.from[1]];b[move.from[0]][move.from[1]]=null;'
        + 'if(pieceType(p)==="P"){if((pieceColor(p)==="w"&&move.to[0]===0)||(pieceColor(p)==="b"&&move.to[0]===7)){p=pieceColor(p)+"Q";}}'
        + 'b[move.to[0]][move.to[1]]=p;}'
        + 'function checkGameState(b,color){var moves=getAllLegalMoves(b,color);'
        + 'if(moves.length===0){if(isInCheck(b,color))return"checkmate";return"stalemate";}return"ongoing";}'
        + 'function aiPickMove(b){var moves=getAllLegalMoves(b,"b");if(!moves.length)return null;'
        + 'var best=null,bestScore=-Infinity;for(var i=0;i<moves.length;i++){var mv=moves[i];'
        + 'var target=b[mv.to[0]][mv.to[1]];var score=target?PIECE_VALUES[pieceType(target)]:0;score+=Math.random()*0.5;'
        + 'if(score>bestScore){bestScore=score;best=mv;}}return best;}'
        + 'function startGame(){board=initBoard();selected=null;legalForSelected=[];turn="w";over=false;started=true;resultText="";thinking=false;updateStats();}'
        + 'board=initBoard();'
        + 'function aiTurn(){thinking=true;var mv=aiPickMove(board);'
        + 'if(mv){applyMove(board,mv);}'
        + 'var state=checkGameState(board,"w");'
        + 'if(state==="checkmate"){over=true;resultText="AI WINS";losses++;try{localStorage.setItem("mk_chess_l",losses);}catch(e){}}'
        + 'else if(state==="stalemate"){over=true;resultText="STALEMATE";}'
        + 'else{turn="w";}thinking=false;updateStats();}'
        + 'function tapCell(r,c){if(!started||over||turn!=="w"||thinking)return;'
        + 'if(selected){var isLegal=false;for(var i=0;i<legalForSelected.length;i++){if(legalForSelected[i][0]===r&&legalForSelected[i][1]===c){isLegal=true;break;}}'
        + 'if(isLegal){applyMove(board,{from:selected,to:[r,c]});selected=null;legalForSelected=[];'
        + 'var state=checkGameState(board,"b");'
        + 'if(state==="checkmate"){over=true;resultText="YOU WIN!";wins++;try{localStorage.setItem("mk_chess_w",wins);}catch(e){}updateStats();return;}'
        + 'if(state==="stalemate"){over=true;resultText="STALEMATE";updateStats();return;}'
        + 'turn="b";updateStats();setTimeout(aiTurn,350);return;}'
        + 'var p=board[r][c];if(p&&pieceColor(p)==="w"){selected=[r,c];legalForSelected=getLegalMoves(board,r,c);}'
        + 'else{selected=null;legalForSelected=[];}return;}'
        + 'var p2=board[r][c];if(p2&&pieceColor(p2)==="w"){selected=[r,c];legalForSelected=getLegalMoves(board,r,c);}}'
        + 'function draw(){ctx.fillStyle="#161326";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var r=0;r<8;r++){for(var c=0;c<8;c++){var x=c*CELL,y=r*CELL;'
        + 'ctx.fillStyle=(r+c)%2===0?"#3a3560":"#242040";ctx.fillRect(x,y,CELL,CELL);'
        + 'if(selected&&selected[0]===r&&selected[1]===c){ctx.fillStyle="rgba(255,224,138,.5)";ctx.fillRect(x,y,CELL,CELL);}'
        + 'for(var i=0;i<legalForSelected.length;i++){if(legalForSelected[i][0]===r&&legalForSelected[i][1]===c){ctx.beginPath();ctx.fillStyle="rgba(123,220,158,.55)";ctx.arc(x+CELL/2,y+CELL/2,CELL*0.16,0,Math.PI*2);ctx.fill();}}'
        + 'var p=board?board[r][c]:null;if(p){ctx.font=(CELL*0.7)+"px Arial";ctx.textAlign="center";ctx.textBaseline="middle";'
        + 'ctx.fillStyle=pieceColor(p)==="w"?"#fff":"#0d0d1a";ctx.fillText(SYMBOLS[p],x+CELL/2,y+CELL/2+2);}}}'
        + 'ctx.textAlign="left";ctx.textBaseline="alphabetic";'
        + 'if(!started){ctx.fillStyle="rgba(13,13,26,.75)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 16px Arial";ctx.fillText("CHESS",cvs.width/2,cvs.height/2-14);ctx.font="11px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("You are White. Tap START to begin",cvs.width/2,cvs.height/2+10);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(13,13,26,.8)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 18px Arial";ctx.fillText(resultText,cvs.width/2,cvs.height/2-6);ctx.font="12px Arial";ctx.fillStyle="rgba(255,255,255,.7)";ctx.fillText("Tap to play again",cvs.width/2,cvs.height/2+18);ctx.textAlign="left";}}'
        + 'function loop(){draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over){startGame();return;}'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;tapCell(Math.floor(y/CELL),Math.floor(x/CELL));});'
        + 'document.getElementById("btnStart").addEventListener("click",function(){startGame();});'
        + 'updateStats();draw();loop();';

    return shellV2({
        title: 'Chess',
        subtitle: 'YOU (WHITE) VS MICHIKO AI (BLACK)',
        w: 296, h: 296,
        stats: [
            { id: 'tn', label: 'TURN', init: '-' },
            { id: 'wn', label: 'WINS', init: 0 },
            { id: 'ls', label: 'LOSSES', init: 0 }
        ],
        controls: startPill('NEW GAME'),
        script: script
    });
}

//===================================================================
// GAME 27 — LUDO (vs AI, 2-player or 4-player mode)
// Authentic classic cross-shaped board (15x15 grid). In 2-player mode, each
// side controls TWO diagonal colors (you: RED+BLUE, AI: GREEN+YELLOW) —
// matching real 2-player Ludo, where a single turn lets you choose which of
// your two colors to move. In 4-player mode each of the 4 colors is its own
// independent side (you: RED only). Full rules either way: 4 tokens per
// color, roll a 6 to leave base, captures send tokens home, each color's
// own entry square is safe, rolling a 6 grants an extra turn. A side wins
// as soon as ONE of its colors gets all 4 tokens home (disclosed casual
// simplification — some variants require both colors to finish). The
// 56-square shared ring (instead of the traditional 52) is a deliberate
// adaptation to keep the math clean on this board's proportions — every
// other rule is the real thing. Two dice sit in the board's center — tap
// them to roll (bounce animation), no separate button. Tokens sharing a
// square are visually clustered instead of hiding each other, and a brief
// flash marks the exact square where a capture just happened.
//===================================================================
function ludoHtml() {
    const script = '\n'
        + 'var cvs=document.getElementById("g"),ctx=cvs.getContext("2d");'
        + 'var CELL=cvs.width/15;'
        + 'var NAMES=["RED","GREEN","YELLOW","BLUE"];'
        + 'var COLORS=["#e74c3c","#2ecc71","#f1c40f","#3498db"];'
        + 'var COLORS_LIGHT=["#fadbd8","#d5f5e3","#fdebd0","#d6eaf8"];'
        + 'var YARD_CENTERS=[[2.5,2.5],[2.5,12.5],[12.5,2.5],[12.5,12.5]];'
        + 'var TEAM_CONFIGS={"2p":[[0,3],[1,2]],"4p":[[0],[1],[2],[3]]};'
        + 'function buildPath(){var path=[];function range(from,to,fixed,fixedIsRow){var out=[];var step=from<=to?1:-1;'
        + 'for(var v=from; step>0? v<=to : v>=to; v+=step){out.push(fixedIsRow?[fixed,v]:[v,fixed]);}return out;}'
        + 'path=path.concat(range(0,6,8,true));path=path.concat(range(9,14,6,false));path.push([14,7]);'
        + 'path=path.concat(range(14,8,8,false));path=path.concat(range(9,14,8,true));path.push([7,14]);'
        + 'path=path.concat(range(14,8,6,true));path=path.concat(range(5,0,8,false));path.push([0,7]);'
        + 'path=path.concat(range(0,6,6,false));path=path.concat(range(5,0,6,true));path.push([7,0]);'
        + 'return path;}'
        + 'var RING=buildPath();var RING_SIZE=RING.length;'
        + 'var OFFSETS=[42,28,0,14];'
        + 'var HOME_STRETCHES=[[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]];'
        + 'var FINISH=RING_SIZE+HOME_STRETCHES[0].length;'
        + 'var tokens,teams,currentTeamIdx=0,mode="4p",die=1,dieDisplay=1,die2Display=1,dieRolling=false,over=false,started=false,winner=-1,awaitingMove=false,turnTimer=0;'
        + 'var captureFlash=null;'
        + 'function teamLabel(idx){if(idx===0)return"YOU";var colors=teams[idx].map(function(c){return NAMES[c];});return colors.join("/");}'
        + 'function updateStats(){document.getElementById("tn").textContent=over?"-":teamLabel(currentTeamIdx);document.getElementById("dc").textContent=dieDisplay;}'
        + 'function initTokens(){tokens=[];for(var p=0;p<4;p++){var arr=[];for(var t=0;t<4;t++){arr.push({steps:-1});}tokens.push(arr);}}'
        + 'initTokens();teams=TEAM_CONFIGS["4p"];'
        + 'function startGame(selMode){mode=selMode||mode;teams=TEAM_CONFIGS[mode];'
        + 'initTokens();currentTeamIdx=0;over=false;started=true;winner=-1;die=1;dieDisplay=1;die2Display=1;dieRolling=false;awaitingMove=false;captureFlash=null;updateStats();}'
        + 'function nextTeam(){currentTeamIdx=(currentTeamIdx+1)%teams.length;}'
        + 'function getValidTokenMoves(p,d){var valid=[];for(var t=0;t<4;t++){var s=tokens[p][t].steps;'
        + 'if(s===FINISH)continue;if(s===-1){if(d===6)valid.push(t);continue;}if(s+d<=FINISH)valid.push(t);}return valid;}'
        + 'function getTeamOptions(teamIdx,d){var options=[];teams[teamIdx].forEach(function(p){'
        + 'getValidTokenMoves(p,d).forEach(function(t){options.push({color:p,token:t});});});return options;}'
        + 'function absoluteSquare(p,steps){return(OFFSETS[p]+steps)%RING_SIZE;}'
        + 'function moveToken(p,t,d){var tok=tokens[p][t];if(tok.steps===-1){tok.steps=0;}else{tok.steps+=d;}'
        + 'if(tok.steps>=0&&tok.steps<RING_SIZE){var absSq=absoluteSquare(p,tok.steps);var isSafe=OFFSETS.indexOf(absSq)!==-1;'
        + 'if(!isSafe){for(var op=0;op<4;op++){if(op===p)continue;for(var ot=0;ot<4;ot++){var otok=tokens[op][ot];'
        + 'if(otok.steps>=0&&otok.steps<RING_SIZE&&absoluteSquare(op,otok.steps)===absSq){otok.steps=-1;'
        + 'var cell=RING[absSq];captureFlash={x:(cell[1]+0.5)*CELL,y:(cell[0]+0.5)*CELL,until:Date.now()+500};}}}}}}'
        + 'function checkWin(p){for(var t=0;t<4;t++){if(tokens[p][t].steps!==FINISH)return false;}return true;}'
        + 'function pickAIOption(options){for(var i=0;i<options.length;i++){if(tokens[options[i].color][options[i].token].steps===-1)return options[i];}'
        + 'var sorted=options.slice().sort(function(a,b){return tokens[b.color][b.token].steps-tokens[a.color][a.token].steps;});return sorted[0];}'
        + 'function doRoll(){if(!started||over||awaitingMove||dieRolling||currentTeamIdx!==0)return;'
        + 'die=1+Math.floor(Math.random()*6);dieRolling=true;'
        + 'var rollEnd=Date.now()+450;'
        + 'var iv=setInterval(function(){dieDisplay=1+Math.floor(Math.random()*6);die2Display=1+Math.floor(Math.random()*6);'
        + 'if(Date.now()>=rollEnd){clearInterval(iv);dieRolling=false;dieDisplay=die;die2Display=die;'
        + 'var options=getTeamOptions(0,die);'
        + 'if(!options.length){if(die!==6){nextTeam();turnTimer=0;}updateStats();return;}'
        + 'awaitingMove=true;updateStats();}},70);}'
        + 'function tapPiece(color,tokenIdx){if(!started||over||currentTeamIdx!==0||!awaitingMove)return;'
        + 'if(teams[0].indexOf(color)===-1)return;'
        + 'var valid=getValidTokenMoves(color,die);if(valid.indexOf(tokenIdx)===-1)return;'
        + 'moveToken(color,tokenIdx,die);awaitingMove=false;'
        + 'if(checkWin(color)){over=true;winner=0;updateStats();return;}'
        + 'if(die!==6){nextTeam();turnTimer=0;}updateStats();}'
        + 'function aiStep(){if(!started||over||currentTeamIdx===0)return;'
        + 'var d=1+Math.floor(Math.random()*6);die=d;dieDisplay=d;die2Display=d;var options=getTeamOptions(currentTeamIdx,d);'
        + 'if(!options.length){if(d!==6){nextTeam();}updateStats();return;}'
        + 'var choice=pickAIOption(options);moveToken(choice.color,choice.token,d);'
        + 'if(checkWin(choice.color)){over=true;winner=currentTeamIdx;updateStats();return;}'
        + 'if(d!==6){nextTeam();}updateStats();}'
        + 'function tokenScreenPos(p,t){var s=tokens[p][t].steps;'
        + 'if(s===-1){var yc=YARD_CENTERS[p];var ox=(t%2)*1.4-0.7,oy=Math.floor(t/2)*1.4-0.7;return{x:(yc[1]+ox)*CELL,y:(yc[0]+oy)*CELL};}'
        + 'if(s<RING_SIZE){var pt=RING[absoluteSquare(p,s)];return{x:(pt[1]+0.5)*CELL,y:(pt[0]+0.5)*CELL};}'
        + 'var hs=HOME_STRETCHES[p];var idx=Math.min(s-RING_SIZE,hs.length-1);var cell=hs[idx];return{x:(cell[1]+0.5)*CELL,y:(cell[0]+0.5)*CELL};}'
        + 'function collectRenderTokens(){var list=[];'
        + 'for(var pp=0;pp<4;pp++){for(var tt=0;tt<4;tt++){'
        + 'if(tokens[pp][tt].steps===FINISH)continue;var pos=tokenScreenPos(pp,tt);'
        + 'list.push({p:pp,t:tt,x:pos.x,y:pos.y});}}'
        + 'var groups={};list.forEach(function(item){var k=Math.round(item.x)+","+Math.round(item.y);'
        + '(groups[k]=groups[k]||[]).push(item);});'
        + 'var out=[];Object.keys(groups).forEach(function(k){var g=groups[k];'
        + 'if(g.length===1){out.push({p:g[0].p,t:g[0].t,x:g[0].x,y:g[0].y,r:CELL*0.32});return;}'
        + 'var n=g.length;var spread=CELL*0.24;'
        + 'for(var i=0;i<n;i++){var angle=(Math.PI*2*i)/n - Math.PI/2;'
        + 'out.push({p:g[i].p,t:g[i].t,x:g[i].x+Math.cos(angle)*spread,y:g[i].y+Math.sin(angle)*spread,r:CELL*0.22});}});'
        + 'return out;}'
        + 'function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);'
        + 'ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}'
        + 'var PIP_LAYOUTS={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[-1,1],[1,-1],[1,1]],'
        + '5:[[-1,-1],[-1,1],[0,0],[1,-1],[1,1]],6:[[-1,-1],[-1,1],[0,-1],[0,1],[1,-1],[1,1]]};'
        + 'function drawDie(cx,cy,size,value){ctx.save();ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=6;'
        + 'ctx.fillStyle="#fff";ctx.strokeStyle="#333";ctx.lineWidth=2;roundRect(cx-size/2,cy-size/2,size,size,7);ctx.fill();ctx.stroke();ctx.restore();'
        + 'var pips=PIP_LAYOUTS[value]||[];ctx.fillStyle="#222";'
        + 'for(var i=0;i<pips.length;i++){ctx.beginPath();ctx.arc(cx+pips[i][1]*size*0.24,cy+pips[i][0]*size*0.24,size*0.09,0,Math.PI*2);ctx.fill();}}'
        + 'function drawDicePair(){var cx=cvs.width/2,cy=cvs.height/2;'
        + 'var bounce=0;if(dieRolling){var t=Date.now()%300/300;bounce=-Math.abs(Math.sin(t*Math.PI))*10;}'
        + 'var sz=CELL*0.85;var gap=sz*0.75;'
        + 'drawDie(cx-gap,cy+bounce,sz,dieDisplay);drawDie(cx+gap,cy+bounce,sz,die2Display);'
        + 'if(!dieRolling&&!awaitingMove&&started&&!over&&currentTeamIdx===0){'
        + 'ctx.fillStyle="rgba(255,255,255,.85)";ctx.font="bold 9px Arial";ctx.textAlign="center";'
        + 'ctx.fillText("TAP TO ROLL",cx,cy+sz*0.9+12);ctx.textAlign="left";}}'
        + 'function drawBoard(){ctx.fillStyle="#fdfdfa";ctx.fillRect(0,0,cvs.width,cvs.height);'
        + 'for(var p=0;p<4;p++){var yc=YARD_CENTERS[p];var yx=(yc[1]-3)*CELL,yy=(yc[0]-3)*CELL,ys=6*CELL;'
        + 'ctx.fillStyle=COLORS[p];ctx.fillRect(yx,yy,ys,ys);'
        + 'ctx.fillStyle="#fff";var inset=ys*0.16;ctx.fillRect(yx+inset,yy+inset,ys-inset*2,ys-inset*2);}'
        + 'for(var i=0;i<RING.length;i++){var cell=RING[i];var x=cell[1]*CELL,y=cell[0]*CELL;'
        + 'ctx.fillStyle=OFFSETS.indexOf(i)!==-1?COLORS[OFFSETS.indexOf(i)]:"#fff";ctx.fillRect(x,y,CELL,CELL);'
        + 'ctx.strokeStyle="#ccc";ctx.strokeRect(x,y,CELL,CELL);}'
        + 'for(var p2=0;p2<4;p2++){var hs=HOME_STRETCHES[p2];for(var h=0;h<hs.length;h++){var hx=hs[h][1]*CELL,hy=hs[h][0]*CELL;'
        + 'ctx.fillStyle=COLORS_LIGHT[p2];ctx.fillRect(hx,hy,CELL,CELL);ctx.strokeStyle="#ccc";ctx.strokeRect(hx,hy,CELL,CELL);}}'
        + 'var ccx=7.5*CELL,ccy=7.5*CELL,r=1.5*CELL;'
        + 'ctx.save();ctx.beginPath();ctx.moveTo(ccx,ccy);ctx.lineTo(ccx-r,ccy-r);ctx.lineTo(ccx+r,ccy-r);ctx.closePath();ctx.fillStyle=COLORS[0];ctx.fill();'
        + 'ctx.beginPath();ctx.moveTo(ccx,ccy);ctx.lineTo(ccx+r,ccy-r);ctx.lineTo(ccx+r,ccy+r);ctx.closePath();ctx.fillStyle=COLORS[1];ctx.fill();'
        + 'ctx.beginPath();ctx.moveTo(ccx,ccy);ctx.lineTo(ccx-r,ccy+r);ctx.lineTo(ccx-r,ccy-r);ctx.closePath();ctx.fillStyle=COLORS[2];ctx.fill();'
        + 'ctx.beginPath();ctx.moveTo(ccx,ccy);ctx.lineTo(ccx+r,ccy+r);ctx.lineTo(ccx-r,ccy+r);ctx.closePath();ctx.fillStyle=COLORS[3];ctx.fill();ctx.restore();'
        + 'if(captureFlash&&Date.now()<captureFlash.until){var frac=1-(captureFlash.until-Date.now())/500;'
        + 'ctx.save();ctx.globalAlpha=1-frac;ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();'
        + 'ctx.arc(captureFlash.x,captureFlash.y,CELL*0.4+frac*CELL*0.8,0,Math.PI*2);ctx.stroke();ctx.restore();}'
        + 'if(tokens){var rendered=collectRenderTokens();'
        + 'for(var ri=0;ri<rendered.length;ri++){var rt=rendered[ri];'
        + 'var isYours=started&&teams[0].indexOf(rt.p)!==-1;'
        + 'ctx.beginPath();ctx.fillStyle=COLORS[rt.p];ctx.arc(rt.x,rt.y,rt.r,0,Math.PI*2);ctx.fill();'
        + 'ctx.strokeStyle=isYours?"#222":"#fff";ctx.lineWidth=isYours?2.5:1.5;ctx.stroke();}}'
        + 'drawDicePair();}'
        + 'function draw(){drawBoard();'
        + 'if(!started){ctx.fillStyle="rgba(255,255,255,.9)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2c3e50";ctx.textAlign="center";'
        + 'ctx.font="bold 16px Arial";ctx.fillText("LUDO",cvs.width/2,cvs.height/2-70);'
        + 'ctx.font="11px Arial";ctx.fillText("Choose a mode below to begin",cvs.width/2,cvs.height/2-50);ctx.textAlign="left";}'
        + 'else if(over){ctx.fillStyle="rgba(255,255,255,.92)";ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle="#2c3e50";ctx.textAlign="center";'
        + 'ctx.font="bold 18px Arial";ctx.fillText(winner===0?"YOU WIN!":teamLabel(winner)+" WINS",cvs.width/2,cvs.height/2-6);'
        + 'ctx.font="12px Arial";ctx.fillText("Tap a mode below to play again",cvs.width/2,cvs.height/2+18);ctx.textAlign="left";}}'
        + 'function loop(){if(started&&!over&&currentTeamIdx!==0){turnTimer++;if(turnTimer>35){turnTimer=0;aiStep();}}draw();requestAnimationFrame(loop);}'
        + 'cvs.addEventListener("pointerdown",function(e){if(!started||over)return;'
        + 'var rect=cvs.getBoundingClientRect();var sx=cvs.width/rect.width,sy=cvs.height/rect.height;'
        + 'var x=(e.clientX-rect.left)*sx,y=(e.clientY-rect.top)*sy;'
        + 'var dcx=cvs.width/2,dcy=cvs.height/2,sz=CELL*0.85,gap=sz*0.75;'
        + 'var onDie1=Math.abs(x-(dcx-gap))<sz*0.7&&Math.abs(y-dcy)<sz*0.7;'
        + 'var onDie2=Math.abs(x-(dcx+gap))<sz*0.7&&Math.abs(y-dcy)<sz*0.7;'
        + 'if(onDie1||onDie2){doRoll();return;}'
        + 'if(currentTeamIdx!==0||!awaitingMove)return;'
        + 'var best=null,bestDist=99999;'
        + 'teams[0].forEach(function(color){for(var t=0;t<4;t++){var pos=tokenScreenPos(color,t);var dx=x-pos.x,dy=y-pos.y;var dist=Math.sqrt(dx*dx+dy*dy);'
        + 'if(dist<CELL*0.6&&dist<bestDist){bestDist=dist;best={color:color,token:t};}}});'
        + 'if(best)tapPiece(best.color,best.token);});'
        + 'document.getElementById("btn2p").addEventListener("click",function(){startGame("2p");});'
        + 'document.getElementById("btn4p").addEventListener("click",function(){startGame("4p");});'
        + 'updateStats();draw();loop();';

    return shellV2({
        title: 'Ludo',
        subtitle: 'CHOOSE 2P OR 4P · TAP THE DICE TO ROLL',
        w: 330, h: 330,
        stats: [
            { id: 'tn', label: 'TURN', init: 'YOU' },
            { id: 'dc', label: 'DIE', init: 1 }
        ],
        controls: pillRow([
            { id: 'btn2p', label: '2 PLAYER' },
            { id: 'btn4p', label: '4 PLAYER' }
        ]),
        script: script
    });
}


//===================
// Public senders (call these from main.js)
//===================
async function sendTetris(sock, jid) {
    return relayHtml(sock, jid, tetrisHtml());
}
async function send2048(sock, jid) {
    return relayHtml(sock, jid, game2048Html());
}
async function sendFlappy(sock, jid) {
    return relayHtml(sock, jid, flappyHtml());
}
async function sendTicTacToe(sock, jid) {
    return relayHtml(sock, jid, ticTacToeHtml());
}
async function sendSimon(sock, jid) {
    return relayHtml(sock, jid, simonHtml());
}
async function sendSnake(sock, jid) {
    return relayHtml(sock, jid, snakeHtml());
}
async function sendBreakout(sock, jid) {
    return relayHtml(sock, jid, breakoutHtml());
}
async function sendPong(sock, jid) {
    return relayHtml(sock, jid, pongHtml());
}
async function sendWhack(sock, jid) {
    return relayHtml(sock, jid, whackHtml());
}
async function sendInvaders(sock, jid) {
    return relayHtml(sock, jid, invadersHtml());
}
async function sendMemory(sock, jid) {
    return relayHtml(sock, jid, memoryHtml());
}
async function sendMinesweeper(sock, jid) {
    return relayHtml(sock, jid, minesweeperHtml());
}
async function sendHangman(sock, jid) {
    return relayHtml(sock, jid, hangmanHtml());
}
async function sendConnectFour(sock, jid) {
    return relayHtml(sock, jid, connectFourHtml());
}
async function sendReaction(sock, jid) {
    return relayHtml(sock, jid, reactionHtml());
}
async function sendBubblePop(sock, jid) {
    return relayHtml(sock, jid, bubblePopHtml());
}
async function sendWordle(sock, jid) {
    return relayHtml(sock, jid, wordleHtml());
}
async function sendWordSearch(sock, jid) {
    return relayHtml(sock, jid, wordSearchHtml());
}
async function sendRPS(sock, jid) {
    return relayHtml(sock, jid, rpsHtml());
}
async function sendCheckers(sock, jid) {
    return relayHtml(sock, jid, checkersHtml());
}
async function sendStackTower(sock, jid) {
    return relayHtml(sock, jid, stackTowerHtml());
}
async function sendSudoku(sock, jid) {
    return relayHtml(sock, jid, sudokuHtml());
}
async function sendFruitSlicer(sock, jid) {
    return relayHtml(sock, jid, fruitSlicerHtml());
}
async function sendArchery(sock, jid) {
    return relayHtml(sock, jid, archeryHtml());
}
async function sendAirHockey(sock, jid) {
    return relayHtml(sock, jid, airHockeyHtml());
}
async function sendChess(sock, jid) {
    return relayHtml(sock, jid, chessHtml());
}
async function sendLudo(sock, jid) {
    return relayHtml(sock, jid, ludoHtml());
}

module.exports = {
    sendTetris, send2048, sendFlappy, sendTicTacToe, sendSimon,
    sendSnake, sendBreakout, sendPong, sendWhack, sendInvaders,
    sendMemory, sendMinesweeper, sendHangman, sendConnectFour, sendReaction,
    sendBubblePop, sendWordle, sendWordSearch, sendRPS, sendCheckers,
    sendStackTower, sendSudoku, sendFruitSlicer, sendArchery, sendAirHockey,
    sendChess, sendLudo
};
