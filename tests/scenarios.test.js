import test from 'node:test';
import assert from 'node:assert/strict';
import { CampusGame, center, pathfind, blocked, lineOfSight, SPOTS, distance } from '../dist/engine.js';

const advance = (game, seconds, input) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) game.update(1 / 30, input); };

test('every featured location is reachable around buildings and fountain', () => {
  for (const spot of SPOTS) {
    const path = pathfind(center(7, 6), spot);
    assert.ok(path.length > 0, spot.name);
    assert.ok(path.every(p => !blocked(Math.floor(p.x / 48), Math.floor(p.y / 48))), spot.name);
    assert.deepEqual(path.at(-1), { x: spot.x, y: spot.y });
  }
  assert.equal(pathfind(center(7, 6), center(3, 3)).length, 0);
  assert.equal(lineOfSight(center(1, 3), center(8, 3)), false, 'canteen blocks sight');
  assert.equal(lineOfSight(center(2, 5), center(7, 5)), true, 'open walkway is visible');
});

test('a student photographs a placed board once; carrying it stops photography', () => {
  const game = new CampusGame(7); game.start(); game.guards = []; game.interact();
  game.students = [{ ...center(7, 7), id: 1, angle: 0, path: [], color: 1, interest: .1, age: 0, photo: 0, photographed: false, rethink: 0, state: 'walk', bubble: 0, speed: 0 }];
  game.spawnTimer = 100;
  advance(game, 3);
  assert.equal(game.score, 1); assert.equal(game.hearts, 15);
  advance(game, 4); assert.equal(game.score, 1, 'no repeat rewards from the same student');
  game.interact(); game.students[0].photographed = false; game.students[0].photo = 0;
  advance(game, 3); assert.equal(game.score, 1, 'carried board cannot attract check-ins');
});

test('normal foot traffic generates actual check-ins without player babysitting', () => {
  const game = new CampusGame(42); game.start();
  Object.assign(game.player, SPOTS[0]); game.interact(); advance(game, 11);
  assert.ok(game.score >= 3, `expected early check-ins, got ${game.score}`);
  assert.equal(game.lives, 3, 'new player has time to start');
});

test('student photo progress is cancelled when the board is moved', () => {
  const game = new CampusGame(12); game.start(); game.guards = []; game.interact();
  game.students = [{ ...center(7, 7), id: 1, angle: 0, path: [], color: 0, interest: .1, age: 0, photo: 0, photographed: false, rethink: 0, state: 'walk', bubble: 0, speed: 0 }]; game.spawnTimer = 100;
  advance(game, 1); assert.ok(game.students[0].photo > 0);
  game.interact(); advance(game, .1); assert.equal(game.students[0].photo, 0); assert.equal(game.score, 0);
});

test('patrol can find and remove a board, and backup respawn works', () => {
  const game = new CampusGame(8); game.start(); game.elapsed = 20; game.interact();
  const g = game.guards[0]; Object.assign(g, { x: game.board.x - 30, y: game.board.y, angle: 0, state: 'investigate', suspicion: 1, lastSeen: { ...game.board }, search: 5, path: [] });
  game.guards = [g]; advance(game, 3);
  assert.equal(game.lives, 2); assert.equal(game.losses, 1); assert.equal(game.board.held, true);
  assert.equal(game.player.y, center(10, 12).y); assert.ok(game.invincible > 0);
});

test('carrying a board into a guard costs one life, with a grace period after respawn', () => {
  const game = new CampusGame(9); game.start(); game.elapsed = 20;
  Object.assign(game.guards[0], { ...game.player, state: 'chase', suspicion: 1, lastSeen: { ...game.player }, search: 5, path: [] });
  game.guards = [game.guards[0]]; advance(game, .1);
  assert.equal(game.lives, 2); advance(game, 1); assert.equal(game.lives, 2);
});

test('tree shade and building walls provide real concealment', () => {
  const game = new CampusGame(4), guard = { ...center(7, 7), angle: Math.PI };
  assert.equal(game.guardSees(guard, center(4, 7), true), false, 'distant carried board in shade is hidden');
  assert.equal(game.guardSees({ ...center(4, 7), angle: 0 }, center(4, 7), true), true, 'close inspection still spots it');
  assert.equal(game.guardSees({ ...center(1, 3), angle: 0 }, center(7, 3)), false, 'solid building hides it');
});

test('buying cart consumes favor and measurably improves carrying speed', () => {
  const a = new CampusGame(1), b = new CampusGame(1); a.start(); b.start();
  assert.equal(a.buy('cart'), true); assert.equal(a.hearts, 0); assert.equal(a.buy('cart'), false);
  a.player = { ...center(8, 10), angle: 0, path: [] }; b.player = { ...a.player, path: [] };
  advance(a, .5, { y: -1 }); advance(b, .5, { y: -1 }); assert.ok(a.player.y < b.player.y - 10);
  assert.equal(a.buy('unrecognized'), false);
});

test('pause freezes time, NPCs and economy; sprint never creates negative stamina', () => {
  const game = new CampusGame(3); game.start(); advance(game, 1); game.pause();
  const state = () => JSON.stringify({ time: game.elapsed, player: game.player, students: game.students, guards: game.guards, score: game.score });
  const snapshot = state(); advance(game, 4, { x: 1, run: true }); assert.equal(state(), snapshot);
  game.resume(); advance(game, 8, { x: 1, run: true }); assert.ok(game.stamina >= 0 && game.stamina <= 100);
});

test('surviving the bell with the target wins; exhausted stock ends early; reset clears the round', () => {
  const game = new CampusGame(2); game.start(); game.elapsed = 179.98; game.score = game.target;
  advance(game, .1); assert.equal(game.status, 'finished'); assert.equal(game.result.won, true);
  game.reset('easy'); assert.equal(game.target, 18); assert.equal(game.score, 0); assert.equal(game.lives, 3); assert.equal(game.status, 'ready');
  game.start(); game.confiscated(); game.confiscated(); game.confiscated();
  assert.equal(game.status, 'finished'); assert.equal(game.result.won, false);
});

test('a complete 3-minute round is winnable by relocating and upgrading in both modes', () => {
  for (const mode of ['easy', 'normal']) for (const seed of [1, 42]) {
    const game = new CampusGame(seed); game.reset(mode); game.start();
    let spot = 0, lastPlaced = -50, travelling = true;
    game.buy('cart'); game.moveTo(SPOTS[spot]);
    for (let frame = 0; frame < 180 * 30 + 2 && game.status === 'playing'; frame++) {
      if (game.board.held) {
        if (game.score >= game.target) {
          const quietCorner = { x: 120, y: 432 };
          if (!game.player.path.length && distance(game.player, quietCorner) > 5) game.moveTo(quietCorner);
          travelling = true;
        } else if (distance(game.player, SPOTS[spot]) < 16) {
          game.interact(); lastPlaced = game.elapsed; travelling = false;
        } else if (!game.player.path.length) { game.moveTo(SPOTS[spot]); travelling = true; }
      } else if (game.score >= game.target || game.guards.some(g => g.state !== 'patrol' && distance(g, game.board) < 180) || game.elapsed - lastPlaced > 20) {
        if (distance(game.player, game.board) < 83) { game.interact(); spot = (spot + 1) % 4; game.moveTo(SPOTS[spot]); travelling = true; }
        else if (!game.player.path.length) game.moveTo(game.board);
      }
      if (game.hearts >= 15 && !game.upgrades.decor) game.buy('decor');
      if (game.hearts >= 24 && game.upgrades.cart === 1) game.buy('cart');
      game.update(1 / 30, { run: travelling });
    }
    assert.equal(game.status, 'finished', `${mode} seed ${seed}: round must reach a result`);
    assert.equal(game.result.won, true, `${mode} seed ${seed}: a cautious route must be viable`);
    assert.ok(game.result.relocations > 1, 'winning involves moving the stand');
    assert.ok(game.upgrades.cart > 0 && game.upgrades.decor > 0, 'winning integrates economy');
  }
});
