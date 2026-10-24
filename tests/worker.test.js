import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createWorker } from '../worker/index.js';

class TestD1Statement {
  constructor(owner, sql, values = []) { this.owner = owner; this.sql = sql; this.values = values; }
  bind(...values) { return new TestD1Statement(this.owner, this.sql, values); }
  _execute() {
    const statement = this.owner.sqlite.prepare(this.sql);
    if (/\bRETURNING\b/i.test(this.sql)) {
      const results = statement.all(...this.values);
      return { success: true, results, meta: { changes: results.length } };
    }
    const result = statement.run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes || 0) } };
  }
  async run() { return this._execute(); }
  async all() {
    const results = this.owner.sqlite.prepare(this.sql).all(...this.values);
    return { success: true, results, meta: { changes: 0 } };
  }
  async first(column) {
    const row = this.owner.sqlite.prepare(this.sql).get(...this.values) || null;
    return column && row ? row[column] : row;
  }
}

class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) { return new TestD1Statement(this, sql); }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement._execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}

const roundResult = score => ({ mode: 'normal', score, survived: 180, losses: 0, relocations: 4, won: score >= 24 });
const makeApp = () => {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const DB = new TestD1();
  const worker = createWorker({ now: () => clock });
  const limiter = { limit: async () => ({ success: true }) };
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    LEAGUE_HASH_SECRET: 'worker-test-secret-that-is-longer-than-thirty-two-characters',
    START_CLIENT_RATE_LIMITER: limiter,
    START_IP_RATE_LIMITER: limiter,
  };
  const call = async (path, { method = 'GET', body, clientId = 'visitor_alpha_0001', origin = 'https://game.example.com' } = {}) => {
    const payload = body ? { seasonId: 'campus-live-s1', clientId, ...body } : undefined;
    const request = new Request(`https://game.example.com${path}`, {
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        Origin: origin,
        'CF-Connecting-IP': clientId.endsWith('0002') ? '203.0.113.2' : '203.0.113.1',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const response = await worker.fetch(request, env);
    return { status: response.status, data: await response.json() };
  };
  return { DB, call, advance: seconds => { clock += seconds * 1000; } };
};
const start = async (app, clientId) => {
  const response = await app.call('/api/rounds/start', { method: 'POST', body: { mode: 'normal' }, clientId });
  assert.equal(response.status, 201, response.data.error);
  return response.data;
};
const finish = async (app, ticket, schoolId, score, clientId) => app.call('/api/rounds/finish', {
  method: 'POST',
  clientId,
  body: { ticket, schoolId, result: roundResult(score) },
});

test('Worker start tickets are stateless and a completed ticket is consumed exactly once', async () => {
  const app = makeApp();
  try {
    const ticket = await start(app);
    assert.equal(app.DB.sqlite.prepare('SELECT count(*) AS n FROM league_rounds').get().n, 0, 'start performs no D1 write');
    app.advance(180);
    const attempts = await Promise.all([1, 2, 3].map(() => finish(app, ticket, 'cn-pku', 24)));
    assert.ok(attempts.every(response => response.status === 200));
    assert.equal(attempts.filter(response => response.data.duplicate).length, 2);
    assert.equal(app.DB.sqlite.prepare('SELECT total_heat FROM league_stats').get().total_heat, 24);
    assert.equal(app.DB.sqlite.prepare('SELECT count(*) AS n FROM league_rounds').get().n, 1);
  } finally { app.DB.close(); }
});

test('Worker D1 upsert atomically accumulates totals while only a higher round replaces the record', async () => {
  const app = makeApp();
  try {
    const play = async (score, clientId = 'visitor_alpha_0001') => {
      const ticket = await start(app, clientId); app.advance(180);
      const response = await finish(app, ticket, 'cn-pku', score, clientId);
      assert.equal(response.status, 200, response.data.error);
      return response.data;
    };
    const first = await play(24);
    const lower = await play(10, 'visitor_beta_0002');
    const tied = await play(24);
    const higher = await play(35, 'visitor_beta_0002');
    assert.equal(first.firstEntry, true); assert.equal(first.newRecord, true);
    assert.equal(lower.newRecord, false); assert.equal(tied.newRecord, false); assert.equal(higher.newRecord, true);
    const row = app.DB.sqlite.prepare('SELECT * FROM league_stats').get();
    assert.equal(row.total_heat, 93); assert.equal(row.rounds, 4); assert.equal(row.best_heat, 35);
    assert.equal(row.best_round_id, higher.roundId);
    const board = await app.call('/api/leaderboard?board=total');
    assert.equal(board.data.schools[0].totalHeat, 93);
  } finally { app.DB.close(); }
});

test('Worker rejects forged, stolen and switched-school stateless tickets', async () => {
  const app = makeApp();
  try {
    const ticket = await start(app); app.advance(180);
    const [payload, signature] = ticket.token.split('.');
    const forged = { ...ticket, token: `${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}` };
    assert.equal((await finish(app, forged, 'cn-pku', 24)).status, 403);
    assert.equal((await finish(app, ticket, 'cn-pku', 24, 'visitor_beta_0002')).status, 403);
    assert.equal((await finish(app, ticket, 'cn-pku', 24)).status, 200);
    assert.equal((await finish(app, ticket, 'cn-tsinghua', 24)).status, 409);
  } finally { app.DB.close(); }
});

test('Worker exposes remote config and keeps API same-origin by default', async () => {
  const app = makeApp();
  try {
    const config = await app.call('/data/league-config.json');
    assert.equal(config.data.storageMode, 'remote'); assert.equal(config.data.apiBaseUrl, '/api');
    assert.equal((await app.call('/api/health')).data.runtime, 'cloudflare-worker-d1');
    assert.equal((await app.call('/api/health', { origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await app.call('/api/schools?q=北大&countryCode=CN')).data.schools[0].id, 'cn-pku');
  } finally { app.DB.close(); }
});
