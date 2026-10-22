/* Grid + requestAnimationFrame architecture inspired by Straker's CC0
 * Basic Bomberman: https://gist.github.com/straker/769fb461e066147ea16ac2cb9463beae
 * Campus simulation, movement, vision and economy implemented for this game. */
export const TILE = 48, COLS = 21, ROWS = 14, WIDTH = COLS * TILE, HEIGHT = ROWS * TILE;
export const BUILDINGS = [
  { col: 2, row: 2, w: 5, h: 3, name: '第一食堂', sub: '干饭人的快乐老家', color: '#e89869', roof: '#efb78b', icon: 'food' },
  { col: 14, row: 2, w: 5, h: 3, name: '图书馆', sub: '轻声打卡，请勿大笑', color: '#7ba6a0', roof: '#b0c6b5', icon: 'book' },
  { col: 2, row: 10, w: 4, h: 2, name: '教学楼', sub: '这节课先不摆龙', color: '#b3a1bd', roof: '#d1bed6', icon: 'school' },
  { col: 15, row: 10, w: 4, h: 2, name: '学生宿舍', sub: '全宿舍都来围观', color: '#d4b166', roof: '#ead59d', icon: 'home' },
];
export const GROVES = [{ x: 54, y: 304, w: 210, h: 142 }, { x: 761, y: 363, w: 190, h: 91 }];
export const SPOTS = [
  { x: 264, y: 264, name: '食堂门口', label: '人来人往', multiplier: 1.5, color: '#dd864f' },
  { x: 744, y: 264, name: '图书馆前', label: '低调营业', multiplier: 1.15, color: '#4f9186' },
  { x: 216, y: 408, name: '小树林', label: '隐蔽躲藏', multiplier: .7, color: '#6c9463' },
  { x: 744, y: 600, name: '宿舍路口', label: '潜力股', multiplier: 1.3, color: '#b49553' },
];
export const PATROLS = [
  [[19, 1], [12, 1], [12, 8], [19, 8]],
  [[1, 7], [7, 7], [7, 12], [1, 12]],
  [[12, 12], [12, 5], [19, 5], [19, 12]],
];
export const UPGRADES = {
  cart: { name: '小推车', prices: [12, 24], detail: ['抱龙移速 +22%', '抱龙移速再 +22%'] },
  decor: { name: '发光灯牌', prices: [15, 30], detail: ['吸引范围 +30%', '打卡好感 +1'] },
  map: { name: '校园情报', prices: [18], detail: ['看见安保巡逻路线'] },
};
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const center = (col, row) => ({ x: (col + .5) * TILE, y: (row + .5) * TILE });
export function blocked(col, row) {
  if (col < 1 || row < 1 || col >= COLS - 1 || row >= ROWS - 1) return true;
  if (BUILDINGS.some(b => col >= b.col && col < b.col + b.w && row >= b.row && row < b.row + b.h)) return true;
  return col >= 9 && col <= 11 && row >= 5 && row <= 6;
}
export function pathfind(from, to) {
  const sc = Math.floor(from.x / TILE), sr = Math.floor(from.y / TILE);
  const tc = Math.floor(to.x / TILE), tr = Math.floor(to.y / TILE);
  if (blocked(tc, tr) || blocked(sc, sr)) return [];
  const start = sr * COLS + sc, end = tr * COLS + tc;
  if (start === end) return [{ x: to.x, y: to.y }];
  const queue = [start], prev = new Map([[start, -1]]);
  for (let i = 0; i < queue.length && !prev.has(end); i++) {
    const n = queue[i], c = n % COLS, r = Math.floor(n / COLS);
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nc = c + dc, nr = r + dr, next = nr * COLS + nc;
      if (!blocked(nc, nr) && !prev.has(next)) { prev.set(next, n); queue.push(next); }
    }
  }
  if (!prev.has(end)) return [];
  const result = [];
  for (let n = end; n !== start; n = prev.get(n)) result.push(center(n % COLS, Math.floor(n / COLS)));
  result.reverse();
  // Align perpendicular to the first step. Replanning never sends a walking
  // actor backwards to the previous tile center, but still respects corners.
  const initial = center(sc, sr), first = result[0];
  const alignment = first.x !== initial.x ? { x: from.x, y: initial.y } : { x: initial.x, y: from.y };
  if (distance(alignment, from) > 2) result.unshift(alignment);
  result[result.length - 1] = { x: to.x, y: to.y };
  return result;
}
export function lineOfSight(from, to) {
  const length = distance(from, to), steps = Math.max(1, Math.ceil(length / 10));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(Math.floor((from.x + (to.x - from.x) * t) / TILE), Math.floor((from.y + (to.y - from.y) * t) / TILE))) return false;
  }
  return true;
}
export const inGrove = p => GROVES.some(g => p.x > g.x && p.x < g.x + g.w && p.y > g.y && p.y < g.y + g.h);
export const spotAt = p => SPOTS.find(s => distance(s, p) < 73) || { name: '校园步道', multiplier: 1, color: '#758c7c' };

function canOccupy(x, y, radius = 11) {
  return [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]]
    .every(([dx, dy]) => !blocked(Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE)));
}
function walk(actor, dx, dy) {
  const oldX = actor.x, oldY = actor.y;
  if (canOccupy(actor.x + dx, actor.y)) actor.x += dx;
  if (canOccupy(actor.x, actor.y + dy)) actor.y += dy;
  if (distance(actor, { x: oldX, y: oldY }) > .02) {
    actor.angle = Math.atan2(actor.y - oldY, actor.x - oldX);
    actor.moving = true;
  } else actor.moving = false;
}
function follow(actor, dt, speed) {
  actor.moving = false;
  let budget = dt * speed;
  while (budget > .001 && actor.path.length) {
    const dest = actor.path[0], d = distance(actor, dest);
    if (d < 1) { actor.path.shift(); continue; }
    const move = Math.min(budget, d);
    walk(actor, (dest.x - actor.x) / d * move, (dest.y - actor.y) / d * move);
    budget -= move;
    if (d <= move + 1) actor.path.shift();
    else break;
  }
}
function guardActor(index) {
  const [c, r] = PATROLS[index][0];
  return { ...center(c, r), index, angle: Math.PI, moving: false, path: [], routeIndex: 1, state: 'patrol', suspicion: 0, search: 0, repath: 0, lastSeen: null };
}

export class CampusGame {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.reset('normal');
  }
  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  reset(mode = this.mode) {
    this.mode = mode || 'normal';
    this.status = 'ready'; this.elapsed = 0; this.duration = 180;
    this.target = this.mode === 'easy' ? 18 : 24;
    this.score = 0; this.hearts = 12; this.earned = 0; this.heat = 0; this.lives = 3;
    this.relocations = 0; this.losses = 0; this.stamina = 100; this.invincible = 0;
    this.upgrades = { cart: 0, decor: 0, map: 0 };
    this.player = { ...center(7, 6), angle: Math.PI / 2, moving: false, path: [] };
    this.board = { ...this.player, held: true, confiscate: 0, placedFor: 0 };
    this.guards = [guardActor(0), guardActor(1)];
    this.students = []; this.effects = []; this.events = []; this.spawnTimer = 3;
    this.alarm = 0; this.flash = 0; this.nextId = 0; this.result = null;
    this.log('社团群', '奶龙已就位，今天也要偷偷当顶流。', 'welcome');
    for (let i = 0; i < 12; i++) this.spawnStudent(true);
  }
  start() {
    if (this.status === 'ready') { this.status = 'playing'; this.log('摆龙日记', '先找个好位置，按 E 放下奶龙！', 'start'); }
  }
  pause() { if (this.status === 'playing') { this.status = 'paused'; this.player.path = []; } }
  resume() { if (this.status === 'paused') this.status = 'playing'; }
  log(who, message, type = 'info') {
    this.events.unshift({ who, message, type, time: this.elapsed, id: ++this.nextId });
    if (this.events.length > 25) this.events.pop();
  }
  effect(x, y, text, color = '#338473') { this.effects.push({ x, y, text, color, life: 1.8, total: 1.8 }); }
  moveTo(point) {
    if (this.status !== 'playing') return;
    const dest = center(Math.floor(point.x / TILE), Math.floor(point.y / TILE));
    if (!blocked(Math.floor(dest.x / TILE), Math.floor(dest.y / TILE))) this.player.path = pathfind(this.player, dest);
  }
  interact() {
    if (this.status !== 'playing') return false;
    if (this.board.held) {
      const dest = center(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE));
      if (blocked(Math.floor(dest.x / TILE), Math.floor(dest.y / TILE))) return false;
      Object.assign(this.board, dest, { held: false, confiscate: 0, placedFor: 0 });
      this.relocations++;
      const place = spotAt(this.board).name;
      this.effect(this.board.x, this.board.y - 52, '开摆！', '#dd864f');
      this.log('摆龙日记', `已在${place}营业，等同学来打卡。`, 'place');
    } else if (distance(this.player, this.board) < 83) {
      this.board.held = true; this.board.confiscate = 0;
      this.effect(this.player.x, this.player.y - 45, '抱龙跑路！', '#dd864f');
      this.log('摆龙日记', '奶龙已抱起，换个地方继续营业。', 'pickup');
    } else { this.effect(this.player.x, this.player.y - 36, '再靠近奶龙一点', '#5a776c'); return false; }
    return true;
  }
  buy(type) {
    const item = UPGRADES[type], level = this.upgrades[type];
    if (this.status !== 'playing' || !item || level >= item.prices.length || this.hearts < item.prices[level]) return false;
    this.hearts -= item.prices[level]; this.upgrades[type]++;
    this.log('后勤补给', `${item.name}升级成功！${item.detail[level]}。`, 'upgrade');
    this.effect(this.player.x, this.player.y - 45, `${item.name} +1`, '#338473');
    return true;
  }
  randomDestination() {
    const edge = this.random();
    if (edge < .25) return center(1, 5 + Math.floor(this.random() * 4));
    if (edge < .5) return center(19, 5 + Math.floor(this.random() * 4));
    if (edge < .75) return center(7 + Math.floor(this.random() * 6), 1);
    return center(7 + Math.floor(this.random() * 6), 12);
  }
  spawnStudent(initial = false) {
    let point = this.randomDestination();
    if (initial) {
      const options = [[5, 5], [8, 4], [13, 5], [15, 5], [8, 8], [5, 8], [12, 9], [13, 11], [7, 2], [1, 9], [19, 7], [9, 11]];
      point = center(...options[this.students.length % options.length]);
    }
    const student = { ...point, id: ++this.nextId, angle: 0, moving: false, path: [], color: Math.floor(this.random() * 6), interest: this.random(), age: 0, photo: 0, photographed: false, rethink: this.random() * 2, state: 'walk', bubble: 0, speed: 39 + this.random() * 15 };
    student.path = pathfind(student, this.randomDestination());
    this.students.push(student);
  }
  photograph(student) {
    student.photographed = true; student.state = 'happy'; student.bubble = 2;
    this.score++; const earned = 3 + (this.upgrades.decor >= 2 ? 1 : 0);
    this.hearts += earned; this.earned += earned; this.heat = Math.min(100, this.heat + 5.5);
    this.flash = .16;
    this.effect(student.x, student.y - 28, `♥ +${earned}`, '#d97c7f');
    const lines = ['谁把奶龙摆这儿了哈哈哈', '拍完了，已经发宿舍群！', '这个点位，包出片的。', '等一下，我把室友摇过来。', '不许撤！我还没拍！', '今日份电子小宠物 ✓'];
    if (this.score <= 2 || this.score % 3 === 0) this.log('路过同学', lines[Math.floor(this.random() * lines.length)], 'photo');
    if (this.score === this.target) this.log('校园热搜', '目标达成！继续保住立牌，撑到下课就赢了！', 'goal');
  }
  updateStudents(dt) {
    const attraction = 242 * (1 + this.upgrades.decor * .3) + this.heat;
    for (const s of this.students) {
      s.age += dt; s.rethink -= dt; s.bubble = Math.max(0, s.bubble - dt);
      if (s.state === 'happy') {
        if (s.bubble <= 0) { s.state = 'walk'; s.path = pathfind(s, this.randomDestination()); }
        continue;
      }
      if (!s.photographed && !this.board.held && distance(s, this.board) < attraction && lineOfSight(s, this.board) && s.interest < .84) {
        s.state = 'interested';
        if (distance(s, this.board) < 89) {
          s.path = []; s.moving = false;
          s.photo += dt * spotAt(this.board).multiplier;
          s.angle = Math.atan2(this.board.y - s.y, this.board.x - s.x);
          if (s.photo >= 2.2) this.photograph(s);
          continue;
        }
        if (s.rethink <= 0) {
          const options = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]];
          const offset = options[s.id % options.length];
          let dest = center(Math.floor(this.board.x / TILE) + offset[0], Math.floor(this.board.y / TILE) + offset[1]);
          if (blocked(Math.floor(dest.x / TILE), Math.floor(dest.y / TILE))) dest = { ...this.board };
          s.path = pathfind(s, dest); s.rethink = 1;
        }
      } else if (s.state === 'interested') { s.state = 'walk'; s.photo = 0; s.path = pathfind(s, this.randomDestination()); }
      if (!s.path.length && s.rethink <= 0) { s.path = pathfind(s, this.randomDestination()); s.rethink = 4; }
      follow(s, dt, s.speed);
    }
    this.students = this.students.filter(s => s.age < (s.photographed ? 36 : 66));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.students.length < 28) {
      this.spawnStudent(); this.spawnTimer = Math.max(1.3, 3.5 - this.heat * .022);
    }
  }
  guardSees(guard, point, held = false) {
    const d = distance(guard, point);
    if (held && inGrove(point) && d > 62) return false;
    if (!held && inGrove(point) && d > 110) return false;
    if (d > (this.mode === 'easy' ? 160 : 190) + this.heat * .35) return false;
    if (d < 43) return lineOfSight(guard, point);
    const angle = Math.atan2(point.y - guard.y, point.x - guard.x);
    const delta = Math.atan2(Math.sin(angle - guard.angle), Math.cos(angle - guard.angle));
    return Math.abs(delta) < .7 && lineOfSight(guard, point);
  }
  updateGuards(dt) {
    if (this.guards.length < 3 && (this.heat >= 58 || this.elapsed > 112) && this.mode !== 'easy') {
      this.guards.push(guardActor(2));
      this.log('校园广播', '围观热度上来了，安保增加了一条巡逻线。', 'alert');
    }
    let maxSuspicion = 0, removing = false;
    const point = this.board.held ? this.player : this.board;
    for (const g of this.guards) {
      g.repath -= dt;
      const sees = this.elapsed > 11 && this.invincible <= 0 && this.guardSees(g, point, this.board.held);
      const noise = !this.board.held && this.heat > 35 && distance(g, this.board) < 230 && this.elapsed > 11;
      if (sees || noise) {
        g.suspicion = Math.min(1, g.suspicion + dt * (sees ? .85 : .35));
        g.lastSeen = { x: point.x, y: point.y }; g.search = 5.5;
        if (g.suspicion >= .65 && g.state === 'patrol') {
          g.state = this.board.held ? 'chase' : 'investigate'; g.repath = 0;
          this.log('安保动态', this.board.held ? '同学，那个黄色的先放一下！' : '这边怎么围了这么多人？过去看看。', 'alert');
        }
      } else {
        g.suspicion = Math.max(0, g.suspicion - dt * .24); g.search -= dt;
      }
      if (g.state !== 'patrol' && g.search <= 0) { g.state = 'patrol'; g.path = []; g.repath = 0; }
      if (g.state !== 'patrol' && sees) g.state = this.board.held ? 'chase' : 'investigate';
      if (g.repath <= 0) {
        if (g.state === 'patrol') {
          const dest = center(...PATROLS[g.index][g.routeIndex]);
          if (distance(g, dest) < 12) g.routeIndex = (g.routeIndex + 1) % PATROLS[g.index].length;
          g.path = pathfind(g, center(...PATROLS[g.index][g.routeIndex]));
        } else if (g.lastSeen) g.path = pathfind(g, g.lastSeen);
        g.repath = g.state === 'patrol' ? 1.6 : .75;
      }
      const speed = (g.state === 'patrol' ? 55 : 95 + this.heat * .22) * (this.mode === 'easy' ? .75 : 1);
      follow(g, dt, speed);
      if (this.invincible <= 0 && this.elapsed > 11 && g.state !== 'patrol') {
        if (this.board.held && distance(g, this.player) < 27) { this.confiscated(); break; }
        if (!this.board.held && distance(g, this.board) < 34) { removing = true; g.state = 'remove'; }
      }
      maxSuspicion = Math.max(maxSuspicion, g.suspicion);
    }
    this.alarm = maxSuspicion;
    if (!this.board.held) {
      this.board.confiscate = removing ? this.board.confiscate + dt : Math.max(0, this.board.confiscate - dt * .7);
      if (this.board.confiscate >= 2) this.confiscated();
    }
  }
  confiscated() {
    this.lives--; this.losses++; this.heat = Math.max(0, this.heat - 18);
    this.effect(this.board.held ? this.player.x : this.board.x, this.board.held ? this.player.y - 40 : this.board.y - 45, '立牌被撤走了！', '#d77061');
    this.log('社团后勤', this.lives > 0 ? `纸板被收走一张！还有 ${this.lives} 张备用，南门重新出发。` : '备用立牌用完了，今日摆龙提前收摊。', 'loss');
    Object.assign(this.player, center(10, 12), { path: [], moving: false });
    this.board.held = true; this.board.confiscate = 0; this.invincible = 5; this.alarm = 0;
    for (const g of this.guards) { g.state = 'patrol'; g.suspicion = 0; g.repath = 0; }
    if (this.lives <= 0) this.finish();
  }
  finish() {
    this.status = 'finished'; this.player.moving = false;
    this.result = { won: this.score >= this.target && this.lives > 0, score: this.score, earned: this.earned, relocations: this.relocations, losses: this.losses, survived: Math.floor(this.elapsed), mode: this.mode };
  }
  update(dt, input = {}) {
    if (this.status !== 'playing') return;
    dt = Math.max(0, Math.min(dt, .05));
    this.elapsed += dt; this.invincible = Math.max(0, this.invincible - dt);
    this.heat = Math.max(0, this.heat - dt * .48); this.flash = Math.max(0, this.flash - dt);
    this.effects = this.effects.filter(e => (e.life -= dt) > 0);
    let dx = input.x || 0, dy = input.y || 0;
    const moving = !!(dx || dy || this.player.path.length);
    const running = !!input.run && this.stamina > 4 && moving;
    this.running = running;
    this.stamina = Math.max(0, Math.min(100, this.stamina + dt * (running ? -34 : 23)));
    const carrySpeed = 118 * (1 + this.upgrades.cart * .22);
    const speed = (this.board.held ? carrySpeed : 148) * (running ? 1.55 : 1);
    if (dx || dy) {
      this.player.path = [];
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      walk(this.player, dx * dt * speed, dy * dt * speed);
    } else follow(this.player, dt, speed);
    if (this.board.held) { this.board.x = this.player.x; this.board.y = this.player.y; }
    else this.board.placedFor += dt;
    this.updateStudents(dt);
    this.updateGuards(dt);
    if (this.elapsed >= this.duration && this.status === 'playing') { this.elapsed = this.duration; this.finish(); }
  }
}
