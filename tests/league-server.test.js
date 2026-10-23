import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLeagueServer } from '../server/server.mjs';
const result = score => ({ mode: 'normal', score, survived: 180, losses: 0, relocations: 4, won: score >= 24 });
async function open(options = {}) {
  let clock = Date.now(); const app = createLeagueServer({ dbPath: ':memory:', now: () => clock, allowedOrigins: ['https://luanluansauce.github.io'], ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, advance: s => { clock += s * 1000; },
    get: async path => { const r = await fetch(base + path); return { status: r.status, data: await r.json() }; },
    post: async (path, body, origin = 'https://luanluansauce.github.io') => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ seasonId: 'campus-live-s1', clientId: 'visitor_alpha_0001', ...body }) }); return { status: r.status, data: await r.json() }; },
  };
}
const start = async (app, clientId) => (await app.post('/api/rounds/start', { mode: 'normal', ...(clientId ? { clientId } : {}) })).data;
async function play(app, schoolId, score, clientId = 'visitor_alpha_0001') {
  const ticket = await start(app, clientId); app.advance(180);
  const response = await app.post('/api/rounds/finish', { ticket, schoolId, result: result(score), clientId });
  assert.equal(response.status, 200, response.data.error); return { ticket, receipt: response.data };
}
test('empty database stays empty until a known directory school submits a completed round', async () => {
  const app = await open();
  try {
    for (const board of ['total', 'best']) assert.deepEqual((await app.get(`/api/leaderboard?board=${board}`)).data.schools, []);
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM league_schools').get().n, 0);
    const catalog = (await app.get('/api/schools?q=北大&countryCode=CN')).data.schools;
    assert.equal(catalog[0].id, 'cn-pku');
    const ticket = await start(app);
    assert.equal((await app.post('/api/rounds/finish', { ticket, schoolId: 'cn-pku', result: result(24) })).status, 400);
    assert.deepEqual((await app.get('/api/leaderboard')).data.schools, []);
    app.advance(180);
    const first = await app.post('/api/rounds/finish', { ticket, schoolId: 'cn-pku', result: result(24) });
    assert.equal(first.status, 200); assert.equal(first.data.firstEntry, true); assert.equal(first.data.newRecord, true);
    for (const board of ['total', 'best']) {
      const rows = (await app.get(`/api/leaderboard?board=${board}`)).data.schools;
      assert.equal(rows.length, 1); assert.equal(rows[0].totalHeat, 24); assert.equal(rows[0].bestHeat, 24); assert.equal(rows[0].recordHolder, '匿名玩家');
      assert.ok(!/token_hash|client_hash|ip_hash|visitor_alpha/.test(JSON.stringify(rows)), 'public boards never expose anonymous visitor identifiers');
    }
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM league_schools').get().n, 1);
  } finally { await app.close(); }
});
test('two visitors accumulate for one school; lower or tied rounds preserve its record owner, higher rounds replace it', async () => {
  const app = await open();
  try {
    const a = await play(app, 'cn-pku', 24);
    await play(app, 'cn-pku', 10, 'visitor_beta_0002');
    assert.equal(app.db.prepare('SELECT best_round_id FROM league_stats').get().best_round_id, a.ticket.roundId);
    await play(app, 'cn-pku', 24, 'visitor_beta_0002');
    assert.equal(app.db.prepare('SELECT best_round_id FROM league_stats').get().best_round_id, a.ticket.roundId);
    const b = await play(app, 'cn-pku', 35, 'visitor_beta_0002');
    assert.equal(b.receipt.newRecord, true);
    assert.equal(app.db.prepare('SELECT best_round_id FROM league_stats').get().best_round_id, b.ticket.roundId);
    await play(app, 'cn-tsinghua', 50);
    const totals = (await app.get('/api/leaderboard?board=total')).data.schools;
    const best = (await app.get('/api/leaderboard?board=best')).data.schools;
    assert.equal(totals[0].id, 'cn-pku'); assert.equal(totals[0].totalHeat, 93); assert.equal(totals[0].rounds, 4);
    assert.equal(best[0].id, 'cn-tsinghua'); assert.equal(best[0].bestHeat, 50);
  } finally { await app.close(); }
});
test('simultaneous retries count once; completed tickets cannot switch school or be stolen by another visitor', async () => {
  const app = await open();
  try {
    const ticket = await start(app); app.advance(180);
    const requests = await Promise.all([1, 2, 3].map(() => app.post('/api/rounds/finish', { ticket, schoolId: 'cn-pku', result: result(24) })));
    assert.ok(requests.every(r => r.status === 200)); assert.equal(requests.filter(r => r.data.duplicate).length, 2);
    assert.equal((await app.get('/api/leaderboard')).data.schools[0].totalHeat, 24);
    assert.equal((await app.post('/api/rounds/finish', { ticket, schoolId: 'cn-tsinghua', result: result(24) })).status, 409);
    assert.equal((await app.post('/api/rounds/finish', { ticket, schoolId: 'cn-pku', result: result(24), clientId: 'visitor_beta_0002' })).status, 403);
  } finally { await app.close(); }
});
test('forged tickets, unknown schools, invalid board types and disallowed origins are rejected', async () => {
  const app = await open();
  try {
    assert.equal((await app.post('/api/rounds/start', { mode: 'normal' }, 'https://unrelated.example')).status, 403);
    const ticket = await start(app); app.advance(180);
    assert.equal((await app.post('/api/rounds/finish', { ticket: { ...ticket, token: 'forged' }, schoolId: 'cn-pku', result: result(24) })).status, 403);
    assert.equal((await app.post('/api/rounds/finish', { ticket, schoolId: 'unknown', result: result(24) })).status, 400);
    assert.equal((await app.get('/api/leaderboard?board=anything')).status, 400);
    assert.equal((await app.get('/data/league-config.json')).data.storageMode, 'remote');
    assert.equal((await app.get('/api/health')).data.ok, true);
    assert.deepEqual((await app.get('/api/map-regions')).data.regions, []);
  } finally { await app.close(); }
});
test('persistent totals and best rounds survive restarts and directory updates; mapped regions use sum versus maximum', async () => {
  const runtime = resolve(new URL('../server/runtime/', import.meta.url).pathname); mkdirSync(runtime, { recursive: true });
  const temp = mkdtempSync(resolve(runtime, 'integration-')), dbPath = resolve(temp, 'league.sqlite'), dataDir = resolve(temp, 'data');
  cpSync(new URL('../dist/data', import.meta.url), dataDir, { recursive: true });
  let app = await open({ dbPath, dataDir });
  try {
    await play(app, 'cn-pku', 24); await play(app, 'cn-pku', 10); await play(app, 'cn-tsinghua', 40);
    await app.close();
    const catalogPath = resolve(dataDir, 'schools.json'), catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    for (const school of catalog.schools.filter(s => ['cn-pku', 'cn-tsinghua'].includes(s.id))) school.mapRegionId = 'CN-11';
    writeFileSync(catalogPath, JSON.stringify(catalog));
    app = await open({ dbPath, dataDir });
    const row = (await app.get('/api/leaderboard')).data.schools.find(s => s.id === 'cn-pku');
    assert.equal(row.totalHeat, 34); assert.equal(row.bestHeat, 24); assert.equal(row.rounds, 2);
    const map = (await app.get('/api/map-regions')).data;
    assert.deepEqual(map.regions, [{ countryCode: 'CN', mapRegionId: 'CN-11', totalHeat: 74, bestHeat: 40, rounds: 3, schools: 2 }]);
    assert.equal(map.unlocatedSchools, 0);
  } finally { await app.close(); rmSync(temp, { recursive: true, force: true }); }
});
