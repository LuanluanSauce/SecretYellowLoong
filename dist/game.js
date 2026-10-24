import { CampusGame, TILE, WIDTH, HEIGHT, BUILDINGS, GROVES, SPOTS, PATROLS, UPGRADES, blocked, center, distance, inGrove, spotAt, pathfind } from './engine.js';
import './school-league.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const game = new CampusGame();
const dragon = new Image(); dragon.src = './assets/nailoong.svg';
const map = document.createElement('canvas'); map.width = WIDTH; map.height = HEIGHT;
const ground = map.getContext('2d');
const keys = new Set(), touches = new Set();
let last = 0, uiTimer = 0, feedId = -1, renderedStatus = '', muted = true, audio = null, runToggle = false, resultReported = false, helpWasPlaying = false, previousScore = 0, previousLosses = 0, mode = 'normal';
let leagueGameRoundId = '';
let leagueGameStarting = false;
let best = 0;
try { best = Number(localStorage.getItem('nailoong-campus-best') || 0) || 0; } catch {}
$('best').textContent = best;

function rounded(c, x, y, w, h, radius, fill, stroke, lineWidth = 1) {
  c.beginPath(); c.roundRect(x, y, w, h, radius);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.stroke(); }
}
function ellipse(c, x, y, rx, ry, color) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
function line(c, x, y, xx, yy, color, width = 1) { c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
function text(c, value, x, y, size = 12, color = '#708566', weight = '500', align = 'center') {
  c.font = `${weight} ${size}px "PingFang SC","Microsoft YaHei",sans-serif`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
}
function polygon(c, points, fill, stroke) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function tree(c, x, y, r = 29, tone = 0) {
  const colors = [['#93b179', '#a7bf8e', '#b7cb9f'], ['#7fa477', '#95b58a', '#aac49a']][tone % 2];
  ellipse(c, x + 4, y + 7, r * .9, r * .4, '#66865a15');
  rounded(c, x - 3, y - 15, 7, 25, 2, '#b3986a');
  ellipse(c, x - r * .3, y - 21, r * .65, r * .65, colors[0]);
  ellipse(c, x + r * .35, y - 23, r * .67, r * .7, colors[0]);
  ellipse(c, x, y - 34, r * .76, r * .73, colors[1]);
  ellipse(c, x - 6, y - 43, r * .42, r * .35, colors[2]);
  c.globalAlpha = .5; line(c, x - 9, y - 29, x - 4, y - 34, colors[0], 2); line(c, x + 8, y - 35, x + 12, y - 31, colors[0], 2); c.globalAlpha = 1;
}
function flower(c, x, y) { ellipse(c, x, y, 2.4, 2.4, '#efdd9a'); ellipse(c, x + 3, y - 2, 2, 2, '#f9ecbb'); }
function drawBuilding(b) {
  const c = ground, x = b.col * TILE + 2, y = b.row * TILE + 1, w = b.w * TILE - 4, h = b.h * TILE - 2;
  rounded(c, x + 6, y + 8, w, h - 2, 7, '#63725022');
  rounded(c, x, y + 9, w, h - 8, 6, '#f2e8cd', '#bcbda0');
  rounded(c, x + 3, y + 4, w - 6, h - 30, 5, b.color, '#a69778');
  rounded(c, x - 4, y - 2, w + 8, h - 35, 5, b.roof, '#baa780');
  rounded(c, x + 3, y + 3, w - 6, h - 45, 3, null, '#ffffff55');
  for (let i = x + 15; i < x + w - 8; i += 25) line(c, i, y + 6, i, y + h - 42, '#fff9de30');
  rounded(c, x + w / 2 - 44, y + h * .35 - 14, 88, 28, 4, '#fff9dfed', '#ffffff66');
  text(c, b.name, x + w / 2, y + h * .35, 17, '#696d54', '700');
  text(c, b.sub, x + w / 2, y + h * .35 + 25, 8, '#766f54', '400');
  for (let wx = x + 18; wx < x + w - 12; wx += 34) {
    rounded(c, wx, y + h - 23, 19, 15, 2, '#8ba99d', '#c4c3a5');
    line(c, wx + 10, y + h - 22, wx + 10, y + h - 9, '#d5ded0');
  }
  rounded(c, x + w / 2 - 14, y + h - 28, 28, 28, [3, 3, 0, 0], '#819486', '#a2b09a');
  line(c, x + w / 2, y + h - 24, x + w / 2, y + h, '#d7deca');
  rounded(c, x + w / 2 - 24, y + h - 1, 48, 7, 2, '#d5cfb4');
  if (b.icon === 'food') {
    for (let i = 0; i < 10; i++) rounded(c, x + 5 + i * ((w - 10) / 10), y + h - 38, (w - 10) / 10, 14, [0, 0, 4, 4], i % 2 ? '#fff0ca' : '#d98c65');
    text(c, '☀', x + 23, y + 21, 20, '#fff1c6');
    rounded(c, x + w - 43, y + 15, 25, 14, 3, '#e9c5a1', '#d4ab85');
    line(c, x + w - 39, y + 20, x + w - 22, y + 20, '#bf9f7d'); line(c, x + w - 39, y + 24, x + w - 22, y + 24, '#bf9f7d');
  } else if (b.icon === 'book') {
    rounded(c, x + w - 46, y + 13, 27, 17, 3, '#c5d4be', '#9fb59e');
    line(c, x + w - 32, y + 16, x + w - 32, y + 27, '#91a68e');
    for (let i = 0; i < 3; i++) line(c, x + w - 42, y + 18 + i * 3, x + w - 35, y + 18 + i * 3, '#9bb297');
  } else {
    rounded(c, x + 11, y + 10, 22, 13, 2, '#fffae455');
    line(c, x + 22, y + 10, x + 22, y + 23, '#a8a387');
  }
}
function drawMap() {
  const c = ground;
  c.fillStyle = '#dce6cb'; c.fillRect(0, 0, WIDTH, HEIGHT);
  let seed = 443;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < HEIGHT; y += TILE) for (let x = 0; x < WIDTH; x += TILE) {
    c.fillStyle = (x / TILE + y / TILE) % 2 === 0 ? '#e0e8d0' : '#dce6cb'; c.fillRect(x, y, TILE, TILE);
  }
  const paths = [[48, 48, 912, 48], [48, 240, 912, 48], [48, 448, 912, 32], [48, 576, 912, 48], [336, 48, 96, 576], [576, 48, 96, 576], [48, 48, 48, 576], [912, 48, 48, 576], [264, 288, 72, 160], [672, 288, 72, 160], [432, 336, 144, 144]];
  for (const p of paths) rounded(c, ...p, 1, '#edead8');
  c.strokeStyle = '#d6d9c44a'; c.lineWidth = .7;
  for (let x = 48; x < WIDTH; x += TILE) line(c, x, 48, x, 624, '#bdc9ae24');
  for (let y = 48; y < HEIGHT; y += TILE) line(c, 48, y, 960, y, '#bdc9ae24');
  for (let i = 0; i < 145; i++) {
    const x = 50 + rand() * 900, y = 55 + rand() * 555;
    const inPath = paths.some(([px, py, pw, ph]) => x >= px && x < px + pw && y >= py && y < py + ph);
    if (inPath || blocked(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
    if (i % 8 === 0) flower(c, x, y);
    else { line(c, x, y + 3, x - 2, y - 1, '#9bb28544'); line(c, x, y + 3, x + 3, y - 2, '#9bb28544'); }
  }
  // An enclosing planted border leaves all playable paths inside the campus.
  rounded(c, 20, 37, 968, 600, 20, null, '#b5c69e', 2);
  for (let x = 25; x < WIDTH; x += 40) {
    ellipse(c, x, 12, 25, 22, '#b5c69e'); ellipse(c, x + 4, 5, 22, 17, '#c3d1ac');
    if (x < 435 || x > 570) { ellipse(c, x, 662, 24, 20, '#b8cba5'); ellipse(c, x + 3, 657, 17, 13, '#c5d5b4'); }
  }
  for (let y = 46; y < HEIGHT - 25; y += 35) { ellipse(c, 11, y, 19, 24, '#bdd0aa'); ellipse(c, 998, y, 18, 25, '#b6cba2'); }
  BUILDINGS.forEach(drawBuilding);
  for (const g of GROVES) {
    rounded(c, g.x, g.y, g.w, g.h, 27, '#a6c28b55');
    c.setLineDash([3, 5]); rounded(c, g.x + 6, g.y + 6, g.w - 12, g.h - 12, 23, null, '#8bab6e66'); c.setLineDash([]);
  }
  // Trees frame accessible, shaded hiding areas; their canopy is not a solid wall.
  [[86, 345, 32, 0], [147, 342, 31, 1], [211, 347, 28, 0], [84, 414, 29, 1], [231, 418, 27, 1], [800, 409, 28, 1], [859, 405, 30, 0], [921, 413, 28, 1]].forEach(a => tree(c, ...a));
  rounded(c, 117, 383, 85, 21, 3, '#f5f1d9', '#b9be99'); text(c, '✳ 树荫藏身处', 159, 393, 9, '#7e946c');
  text(c, '树荫藏身处', 858, 438, 8, '#81976e');
  // Central fountain is a solid island; routes go around it.
  rounded(c, 434, 242, 140, 92, 15, '#c2cfa9', '#a8bc93');
  rounded(c, 442, 249, 124, 77, 11, '#dddcc0', '#f2edce');
  ellipse(c, 504, 291, 43, 26, '#a6b8a3'); ellipse(c, 504, 287, 43, 26, '#e8e3c8');
  ellipse(c, 504, 285, 35, 20, '#abcac3'); ellipse(c, 504, 280, 28, 13, '#bed9cf');
  ellipse(c, 504, 280, 13, 7, '#8eb4a7'); rounded(c, 499, 260, 10, 22, 3, '#d9dac1');
  ellipse(c, 504, 259, 18, 8, '#e9e5cc'); ellipse(c, 504, 256, 14, 5, '#b4cdbf');
  text(c, '中央广场', 504, 354, 9, '#a3a78b');
  for (const s of SPOTS) {
    c.globalAlpha = .7; ellipse(c, s.x, s.y, 27, 13, '#fffcdf'); c.globalAlpha = 1;
    c.setLineDash([3, 3]); c.beginPath(); c.ellipse(s.x, s.y, 30, 17, 0, 0, Math.PI * 2); c.strokeStyle = s.color + '66'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    rounded(c, s.x - 8, s.y - 6, 16, 11, 3, null, s.color + '88', 1.3); ellipse(c, s.x, s.y - 1, 3, 3, s.color + '66');
    rounded(c, s.x - 40, s.y + 22, 80, 19, 4, '#faf8e7dd', '#d2d8bc');
    text(c, `${s.name} ×${s.multiplier}`, s.x, s.y + 32, 8, s.color);
  }
  // Little campus details, kept out of the movement routes.
  for (const [x, y] of [[306, 114], [704, 116], [709, 509], [301, 530]]) {
    rounded(c, x - 9, y - 4, 18, 9, 2, '#b7a17b'); line(c, x - 6, y + 5, x - 6, y + 9, '#938d69', 2); line(c, x + 6, y + 5, x + 6, y + 9, '#938d69', 2);
  }
  for (const [x, y] of [[381, 134], [625, 169], [383, 518], [626, 524]]) {
    ellipse(c, x + 3, y + 2, 10, 4, '#899f7222'); rounded(c, x - 2, y - 28, 4, 31, 1, '#9ba98b'); ellipse(c, x, y - 28, 6, 5, '#f8f0c7');
  }
  rounded(c, 459, 618, 90, 19, 3, '#faf6dd', '#c2c8aa'); text(c, '南门 · 社团据点', 504, 628, 8, '#8e9a78');
  rounded(c, 441, 45, 126, 22, 4, '#f7f4df', '#c4cdb1'); text(c, '龙潭大学 · 快乐分校', 504, 56, 9, '#8f9b7c');
}
drawMap();

function drawVision(g) {
  const active = g.state !== 'patrol', radius = (game.mode === 'easy' ? 160 : 190) + game.heat * .35;
  const gradient = ctx.createRadialGradient(g.x, g.y, 10, g.x, g.y, radius);
  gradient.addColorStop(0, active ? '#da835632' : '#e4c77932'); gradient.addColorStop(1, active ? '#e391630a' : '#e4c7790a');
  ctx.beginPath(); ctx.moveTo(g.x, g.y);
  for (let i = 0; i <= 28; i++) {
    const a = g.angle - .7 + i / 28 * 1.4; let d = 0;
    for (d = 8; d <= radius; d += 8) if (blocked(Math.floor((g.x + Math.cos(a) * d) / TILE), Math.floor((g.y + Math.sin(a) * d) / TILE))) break;
    d = Math.min(d - 5, radius); ctx.lineTo(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d);
  }
  ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.strokeStyle = active ? '#c87e4825' : '#bdab5425'; ctx.lineWidth = 1; ctx.stroke();
}
function drawRoutes() {
  if (!game.upgrades.map) return;
  for (const g of game.guards) {
    ctx.beginPath(); ctx.moveTo(g.x, g.y);
    const points = g.state !== 'patrol' ? g.path : pathfind(g, center(...PATROLS[g.index][g.routeIndex]));
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.setLineDash([4, 6]); ctx.strokeStyle = '#6e8e9a77'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    if (points.length) { const p = points[points.length - 1]; ellipse(ctx, p.x, p.y, 4, 4, '#7d9daa66'); }
  }
}
function drawBoard(x, y, held = false, time = 0) {
  const scale = held ? .72 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (!held) ellipse(ctx, 1, 5, 24, 8, '#68754a24');
  const wiggle = held ? Math.sin(time * 11) * .03 : Math.sin(time * 2) * .012;
  ctx.rotate(wiggle);
  line(ctx, -14, -5, -20, 7, '#a98c5b', 3); line(ctx, 14, -5, 20, 7, '#a98c5b', 3);
  rounded(ctx, -25, -68, 50, 66, 5, '#fffdf0', '#d3bc83', 1.5);
  if (dragon.complete && dragon.naturalWidth) ctx.drawImage(dragon, -24, -69, 48, 57);
  else { ellipse(ctx, 0, -39, 16, 23, '#ffcf49'); ellipse(ctx, -5, -47, 2, 3, '#536840'); ellipse(ctx, 5, -47, 2, 3, '#536840'); }
  rounded(ctx, -24, -14, 48, 12, [0, 0, 4, 4], '#f6dc87'); text(ctx, '奶龙在此', 0, -8, 7, '#a48748', '700');
  if (!held && game.upgrades.decor) {
    ctx.shadowColor = '#f6df8a'; ctx.shadowBlur = 8;
    for (let i = 0; i < 4; i++) ellipse(ctx, -22 + i * 15, -67, 2, 2, i % 2 ? '#fbdf82' : '#f8eee0');
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
const shirts = ['#b8a0bc', '#c99c86', '#97aba8', '#c9b479', '#a4ae85', '#b7b7ca'];
function drawPerson(p, kind, time) {
  const player = kind === 'player', guard = kind === 'guard';
  const bob = p.moving ? Math.sin(time * (player && game.running ? 18 : 11) + (p.id || 0)) * 1.3 : Math.sin(time * 2 + (p.id || 0)) * .4;
  ctx.save(); ctx.translate(p.x, p.y);
  if (player && game.invincible > 0) ctx.globalAlpha = Math.sin(time * 18) > 0 ? .5 : 1;
  ellipse(ctx, 1, 3, player ? 12 : 10, 4.5, '#526d4d25');
  ctx.translate(0, bob);
  const stride = p.moving ? Math.sin(time * 11 + (p.id || 0)) * 2.7 : 0;
  rounded(ctx, -7, -4 + stride, 5, 7, 2, guard ? '#53616a' : '#6c7964');
  rounded(ctx, 2, -4 - stride, 5, 7, 2, guard ? '#53616a' : '#6c7964');
  if (player) { rounded(ctx, -11, -20, 22, 21, 7, '#fffdf2'); rounded(ctx, -9, -20, 18, 19, 6, '#e49a68', '#c68055'); }
  else rounded(ctx, -8, -20, 16, 19, 5, guard ? '#708c9a' : shirts[p.color], guard ? '#5e7886' : '#667f6f33');
  rounded(ctx, -11, -18, 4, 12, 2, player ? '#df9c6b' : guard ? '#6b8491' : shirts[p.color]);
  rounded(ctx, 7, -18, 4, 12, 2, player ? '#df9c6b' : guard ? '#6b8491' : shirts[p.color]);
  if (player) { rounded(ctx, -6, -13, 12, 9, 3, '#eac28c'); line(ctx, -6, -9, 6, -9, '#ceab7b'); }
  ellipse(ctx, 0, -25, player ? 10 : 8.7, player ? 10 : 9, '#f2caa1');
  if (guard) {
    rounded(ctx, -10, -35, 20, 10, [7, 7, 2, 2], '#547387', '#456575');
    rounded(ctx, -10, -28, 24, 4, 2, '#456577'); rounded(ctx, -2, -34, 4, 4, 1, '#dfcc83');
    line(ctx, -7, -15, 7, -15, '#c6c69a', 1.5); ellipse(ctx, 3, -12, 1.4, 1.4, '#e4d79e');
    if (gAlert(p)) {
      ellipse(ctx, 12, -43, 8, 8, p.state === 'patrol' ? '#efcf8c' : '#e5a07d');
      text(ctx, p.state === 'patrol' ? '?' : '!', 12, -43, 11, '#fff9e4', '800');
    }
  } else {
    ellipse(ctx, 0, -30, player ? 10 : 9, 6.5, player ? '#6c6652' : '#6c6958');
    rounded(ctx, -9, -29, 5, 7, 2, player ? '#6c6652' : '#6c6958');
    if (player) { rounded(ctx, -8, -35, 16, 7, [5, 5, 0, 0], '#f5eed3', '#cabe94'); line(ctx, -7, -29, 11, -29, '#d9ca9d', 3); }
  }
  // Faces follow horizontal movement, with a small, readable expression.
  const faceOffset = Math.cos(p.angle) * 1.8;
  ellipse(ctx, -2 + faceOffset, -24, 1, 1.3, '#5c6451'); ellipse(ctx, 4 + faceOffset, -24, 1, 1.3, '#5c6451');
  if (!guard) line(ctx, .5 + faceOffset, -20, 2.5 + faceOffset, -20, '#c38f74');
  if (player) {
    polygon(ctx, [[-4, -46], [4, -46], [0, -41]], '#e18b53');
    text(ctx, '你', 0, -53, 9, '#c98250', '700');
    if (game.board.held) drawBoard(22, -5, true, time);
    if (game.upgrades.cart && game.board.held) { line(ctx, 12, 6, 38, 6, '#9d9d72', 2); ellipse(ctx, 16, 9, 3, 3, '#7f8f72'); ellipse(ctx, 33, 9, 3, 3, '#7f8f72'); }
    if (game.running) { ctx.globalAlpha *= .5; line(ctx, -18, -11, -24, -11, '#aa9c6c', 1.5); line(ctx, -16, -3, -23, -3, '#aa9c6c', 1.5); }
  }
  if (!player && !guard && (p.state === 'interested' || p.state === 'happy')) {
    rounded(ctx, 8, -19, 6, 9, 1, '#718577'); rounded(ctx, 9, -18, 4, 5, 1, '#e9ead3');
    if (p.state === 'happy') {
      rounded(ctx, -16, -53, 32, 16, 5, '#fffdf0', '#d8dcc4'); text(ctx, '♥ 咔嚓', 0, -45, 7, '#cd8b86');
    } else if (p.photo > 0) {
      ctx.beginPath(); ctx.arc(0, -42, 5, -.5 * Math.PI, -.5 * Math.PI + Math.PI * 2 * Math.min(1, p.photo / 2.2)); ctx.strokeStyle = '#c49a67'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  ctx.restore();
}
function gAlert(g) { return g.suspicion > .15 || g.state !== 'patrol'; }
function draw(time) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(map, 0, 0);
  // Animated water and pad rings add life without obscuring the playing field.
  ctx.strokeStyle = '#ecf6e366'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(504, 286, 23 + Math.sin(time * 1.7) * 3, 11, 0, 0, Math.PI * 2); ctx.stroke();
  if (game.status === 'playing') {
    drawRoutes(); game.guards.forEach(drawVision);
    if (game.player.path.length) {
      ctx.beginPath(); ctx.moveTo(game.player.x, game.player.y); for (const p of game.player.path) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#c58f5a88'; ctx.lineWidth = 2; ctx.setLineDash([3, 7]); ctx.stroke(); ctx.setLineDash([]);
      const p = game.player.path[game.player.path.length - 1]; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.strokeStyle = '#c58f5a99'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  if (!game.board.held) {
    const radius = 92 + Math.sin(time * 2) * 3;
    ctx.beginPath(); ctx.ellipse(game.board.x, game.board.y, radius, radius * .55, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#edcf6b09'; ctx.fill(); ctx.strokeStyle = '#c8ae6c33'; ctx.lineWidth = 1; ctx.setLineDash([4, 8]); ctx.stroke(); ctx.setLineDash([]);
  }
  const actors = [...game.students.map(p => ({ p, kind: 'student' })), ...game.guards.map(p => ({ p, kind: 'guard' })), { p: game.player, kind: 'player' }];
  if (!game.board.held) actors.push({ p: game.board, kind: 'board' });
  actors.sort((a, b) => a.p.y - b.p.y);
  for (const { p, kind } of actors) kind === 'board' ? drawBoard(p.x, p.y, false, time) : drawPerson(p, kind, time);
  if (game.board.confiscate > 0 && !game.board.held) {
    rounded(ctx, game.board.x - 28, game.board.y - 86, 56, 7, 3, '#fff2d8', '#d9a278');
    rounded(ctx, game.board.x - 27, game.board.y - 85, 54 * Math.min(1, game.board.confiscate / 2), 5, 2, '#d98866');
    text(ctx, '正在撤走！', game.board.x, game.board.y - 96, 10, '#bc7259', '700');
  }
  for (const e of game.effects) {
    const progress = 1 - e.life / e.total;
    ctx.globalAlpha = Math.min(1, e.life * 2);
    const y = e.y - progress * 28;
    ctx.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#fffdf0'; ctx.lineWidth = 3; ctx.strokeText(e.text, e.x, y); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, y); ctx.globalAlpha = 1;
  }
  if (game.invincible > 0 && game.status === 'playing') { text(ctx, '备用立牌补给中 · 暂时安全', game.player.x, game.player.y + 26, 10, '#6a9362', '600'); }
}

function setText(id, value) { const el = $(id); if (el.textContent !== String(value)) el.textContent = value; }
function formatTime(time) { const seconds = Math.max(0, Math.ceil(time)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function renderFeed() {
  if (feedId === game.events[0]?.id) return;
  feedId = game.events[0]?.id;
  $('event-feed').replaceChildren();
  for (const e of game.events.slice(0, 6)) {
    const row = document.createElement('div'); row.className = `event-item ${e.type}`;
    const dot = document.createElement('span'); dot.className = 'event-dot';
    const p = document.createElement('p'), who = document.createElement('b'); who.textContent = e.who;
    p.append(who, document.createTextNode(e.message));
    const time = document.createElement('time'); time.textContent = formatTime(e.time);
    row.append(dot, p, time); $('event-feed').append(row);
  }
}
function renderUI() {
  const playing = game.status === 'playing', finished = game.status === 'finished';
  setText('time', formatTime(game.duration - game.elapsed)); setText('score', game.score); setText('target', game.target); setText('lives', game.lives); setText('hearts', game.hearts); setText('ready-target', game.target);
  $('time').closest('.timer').classList.toggle('urgent', game.duration - game.elapsed < 30);
  $('goal-progress').style.width = `${Math.min(100, game.score / game.target * 100)}%`;
  $('heat-progress').style.width = `${game.heat}%`;
  $('stamina').style.width = `${game.stamina}%`;
  setText('heat-label', game.heat < 15 ? '悄悄开摆' : game.heat < 38 ? '小有名气' : game.heat < 65 ? '全校围观' : '校园热搜第一');
  setText('heat-hint', game.heat > 55 ? '人气爆棚！安保会增加巡逻。' : '越热闹，越容易引来安保。');
  setText('goal-stamp', game.score >= game.target ? '目标达成 ✓' : game.score ? `还差 ${Math.max(0, game.target - game.score)} 人` : '等你开摆');
  const near = distance(game.player, game.board) < 83;
  setText('interact-label', game.board.held ? '放下奶龙' : near ? '抱起奶龙' : '靠近奶龙');
  setText('action-hint', game.board.held ? '找个好地方，开摆！' : near ? '安保来了就抱龙跑路' : '点击地图，走到奶龙旁边');
  $('interact-button').disabled = !playing; $('pause-button').disabled = game.status === 'ready' || finished;
  $('pause-button').setAttribute('aria-label', game.status === 'paused' ? '继续游戏' : '暂停游戏');
  $('pause-use').setAttribute('href', game.status === 'paused' ? '#i-play' : '#i-pause');
  const location = spotAt(game.board);
  setText('board-location', game.board.held ? '奶龙在怀里 · 暂停营业' : `${location.name} · 打卡速度 ×${location.multiplier}`);
  $('board-status-dot').classList.toggle('placed', !game.board.held);
  const detected = game.alarm > .15 || game.guards.some(g => g.state !== 'patrol');
  $('alert-banner').hidden = !detected || !playing;
  $('alert-banner').classList.toggle('danger', game.alarm > .65 || game.board.confiscate > 0);
  setText('alert-text', game.board.confiscate > 0 ? '要被收走了！快抱起奶龙！' : game.board.held && game.guards.some(g => g.state === 'chase') ? '安保追来了！冲刺或躲进树荫' : game.alarm > .65 ? '安保正在赶来，准备搬家！' : '有人注意到奶龙了…');
  $('grove-badge').hidden = !(playing && game.board.held && inGrove(game.player));
  for (const [type, item] of Object.entries(UPGRADES)) {
    const level = game.upgrades[type], maxed = level >= item.prices.length;
    const btn = document.querySelector(`[data-upgrade="${type}"]`);
    btn.disabled = !playing || maxed || game.hearts < item.prices[level];
    btn.classList.toggle('affordable', !btn.disabled); btn.classList.toggle('maxed', maxed);
    setText(`${type}-level`, level ? `Lv.${level}` : '');
    setText(`${type}-detail`, maxed ? '升级已到位，快乐再加倍' : item.detail[level]);
    const price = $(`${type}-price`);
    const priceText = maxed ? '已满级' : String(item.prices[level]);
    if (price.dataset.price !== priceText) {
      price.dataset.price = priceText; price.replaceChildren(document.createTextNode(priceText));
      if (!maxed) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('icon'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-heart'); svg.append(use); price.append(svg); }
    }
  }
  renderFeed();
  if (game.score > previousScore) sound('photo');
  if (game.losses > previousLosses) sound('loss');
  previousScore = game.score; previousLosses = game.losses;
  if (renderedStatus !== game.status) {
    renderedStatus = game.status;
    $('stage-overlay').hidden = playing;
    $('start-card').hidden = game.status !== 'ready'; $('pause-card').hidden = game.status !== 'paused'; $('result-card').hidden = !finished;
  }
  if (finished && !resultReported) {
    resultReported = true;
    const r = game.result, record = r.score > best;
    if (record) { best = r.score; try { localStorage.setItem('nailoong-campus-best', String(best)); } catch {} }
    setText('best', best); setText('result-score', r.score); setText('result-earned', r.earned); setText('result-moves', r.relocations);
    setText('result-eyebrow', r.won ? 'CAMPUS SUPERSTAR' : 'THE DRAGON WILL RETURN');
    setText('result-title', r.won ? '今天的校园顶流！' : r.losses >= 3 ? '龙红了，纸板没了。' : '离顶流，只差一点点。');
    setText('result-copy', r.won ? `下课铃响，${r.score} 位同学的相册里都有奶龙。` : r.losses >= 3 ? '后勤库存告急！换个点位，下次一定。' : `已经让 ${r.score} 位同学开心了，下次冲到 ${game.target} 人！`);
    $('new-record').hidden = !record; sound(r.won ? 'win' : 'loss');
    window.dispatchEvent(new CustomEvent('nailoong:round-end', { detail: { roundId: leagueGameRoundId, result: { ...r } } }));
  }
}
function getAudio() { if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) audio = new Audio(); } if (audio?.state === 'suspended') audio.resume().catch(() => {}); }
function sound(kind) {
  if (muted || !audio) return;
  const notes = kind === 'photo' ? [660, 880] : kind === 'upgrade' ? [440, 660, 880] : kind === 'win' ? [523, 659, 784, 1046] : kind === 'loss' ? [330, 220] : [390];
  for (let i = 0; i < notes.length; i++) {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + i * .08;
    oscillator.type = 'sine'; oscillator.frequency.value = notes[i]; gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.045, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + .15);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(t); oscillator.stop(t + .16);
  }
}
function clearInput() { keys.clear(); touches.clear(); runToggle = false; $('run-button').setAttribute('aria-pressed', 'false'); document.querySelectorAll('[data-dir]').forEach(b => b.classList.remove('pressed')); }
async function start() {
  if (game.status !== 'ready' || leagueGameStarting) return;
  getAudio(); leagueGameStarting = true;
  const button = $('start-button');
  button.dataset.readyLabel ||= button.innerHTML;
  const label = button.dataset.readyLabel;
  let started = false;
  button.disabled = true; button.textContent = '正在进入校园…';
  document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = true; });
  try {
    leagueGameRoundId = crypto.randomUUID?.() || `round_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const detail = { roundId: leagueGameRoundId, mode: game.mode, ticketReady: null };
    window.dispatchEvent(new CustomEvent('nailoong:round-start', { detail }));
    // Start the game clock after the shared service issues the ticket, so a slow
    // connection cannot make a legitimate completed round look too short.
    if (detail.ticketReady) await detail.ticketReady;
    game.start(); clearInput();
    started = true;
    if (document.hidden || document.querySelector('dialog[open]')) game.pause();
    renderUI();
  } catch (error) {
    button.textContent = error?.message || '榜单连接失败，点这里重试';
  } finally {
    if (started) button.innerHTML = label;
    button.disabled = false; leagueGameStarting = false;
    document.querySelectorAll('[data-mode]').forEach(b => { b.disabled = false; });
  }
}
function newRound() { game.reset(mode); clearInput(); feedId = -1; resultReported = false; previousScore = 0; previousLosses = 0; renderUI(); }
function pauseToggle() { if (game.status === 'playing') game.pause(); else if (game.status === 'paused') game.resume(); clearInput(); renderUI(); }
function interact() { getAudio(); if (game.interact()) sound('place'); renderUI(); }
$('start-button').addEventListener('click', start);
$('pause-button').addEventListener('click', pauseToggle); $('resume-button').addEventListener('click', pauseToggle);
$('restart-button').addEventListener('click', newRound); $('again-button').addEventListener('click', newRound);
$('interact-button').addEventListener('click', interact);
$('run-button').addEventListener('click', () => { if (game.status !== 'playing') return; runToggle = !runToggle; $('run-button').setAttribute('aria-pressed', String(runToggle)); });
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('selected', b === button)); newRound();
}));
document.querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click', () => { if (game.buy(button.dataset.upgrade)) sound('upgrade'); renderUI(); }));
$('sound-button').addEventListener('click', () => {
  muted = !muted; if (!muted) getAudio(); $('sound-use').setAttribute('href', muted ? '#i-mute' : '#i-sound');
  $('sound-button').setAttribute('aria-label', muted ? '开启音效' : '关闭音效'); $('sound-button').title = muted ? '开启音效' : '关闭音效'; if (!muted) sound('photo');
});
function showHelp() { helpWasPlaying = game.status === 'playing'; game.pause(); clearInput(); renderUI(); $('help-dialog').showModal(); }
function hideHelp() { $('help-dialog').close(); }
$('help-button').addEventListener('click', showHelp); $('credits-button').addEventListener('click', showHelp);
$('close-help').addEventListener('click', hideHelp); $('help-ok').addEventListener('click', hideHelp);
$('help-dialog').addEventListener('close', () => { if (helpWasPlaying) game.resume(); helpWasPlaying = false; renderUI(); });
$('help-dialog').addEventListener('click', e => { if (e.target === $('help-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) hideHelp(); } });
window.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
  const key = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(key)) e.preventDefault();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) keys.add(key);
  if (!e.repeat && (key === 'e' || key === ' ')) interact();
  if (!e.repeat && (key === 'escape' || key === 'p')) pauseToggle();
  if (!e.repeat && key === 'enter' && game.status === 'ready') start();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('nailoong:league-open', () => { game.pause(); clearInput(); renderUI(); });
window.addEventListener('blur', () => { clearInput(); game.pause(); renderUI(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); game.pause(); renderUI(); } });
canvas.addEventListener('pointerdown', e => {
  if (game.status !== 'playing') return;
  const rect = canvas.getBoundingClientRect(); game.moveTo({ x: (e.clientX - rect.left) / rect.width * WIDTH, y: (e.clientY - rect.top) / rect.height * HEIGHT });
});
document.querySelectorAll('[data-dir]').forEach(button => {
  const direction = button.dataset.dir;
  button.addEventListener('pointerdown', e => { e.preventDefault(); if (game.status !== 'playing') return; button.setPointerCapture(e.pointerId); touches.add(direction); button.classList.add('pressed'); });
  const release = e => { e.preventDefault(); touches.delete(direction); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
function frame(timestamp) {
  const dt = last ? Math.min(.05, (timestamp - last) / 1000) : 0; last = timestamp;
  const input = { x: Number(keys.has('d') || keys.has('arrowright') || touches.has('right')) - Number(keys.has('a') || keys.has('arrowleft') || touches.has('left')), y: Number(keys.has('s') || keys.has('arrowdown') || touches.has('down')) - Number(keys.has('w') || keys.has('arrowup') || touches.has('up')), run: keys.has('shift') || runToggle };
  game.update(dt, input); draw(timestamp / 1000); uiTimer += dt;
  if (uiTimer >= .12 || game.status !== renderedStatus) { renderUI(); uiTimer = 0; }
  requestAnimationFrame(frame);
}
renderUI(); requestAnimationFrame(frame);
