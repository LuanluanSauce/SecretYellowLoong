import catalogJson from '../dist/data/schools.json' with { type: 'json' };
import configJson from '../dist/data/league-config.json' with { type: 'json' };
import {
  aggregateRegions,
  calculatePoints,
  rankStandings,
  schoolCountry,
  searchSchools,
  validateLeagueData,
  validateRound,
} from '../dist/league-core.js';

const data = validateLeagueData(catalogJson, {
  ...configJson,
  storageMode: 'remote',
  apiBaseUrl: '/api',
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CLIENT_PATTERN = /^[a-zA-Z0-9_-]{12,100}$/;
const TICKET_LIFETIME_MS = 2 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 8192;

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const fail = (message, status = 400) => { throw new HttpError(message, status); };
const bytesToBase64Url = bytes => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};
const base64UrlToBytes = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) fail('本局提交凭证无效', 403);
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  let decoded;
  try { decoded = atob(normalized); } catch { fail('本局提交凭证无效', 403); }
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
};
const json = (value, status = 200, extraHeaders = {}) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  },
});
const allowedOrigins = (request, env) => {
  const own = new URL(request.url).origin;
  return new Set([own, ...String(env.LEAGUE_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)]);
};
const corsHeaders = request => {
  const origin = request.headers.get('Origin');
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
};
const checkOrigin = (request, env) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins(request, env).has(origin)) fail('此网站暂未连接到共享榜单', 403);
};
const readBody = async request => {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail('请求格式无效', 415);
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) fail('请求过大', 413);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('请求格式无效');
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail('请求格式无效');
  }
};

async function hmacKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) fail('榜单服务尚未配置完成', 503);
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function privateHash(secret, value) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}
async function signTicket(secret, payload) {
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(encodedPayload));
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}
async function verifyTicket(secret, token) {
  if (typeof token !== 'string') fail('本局提交凭证无效', 403);
  const parts = token.split('.');
  if (parts.length !== 2) fail('本局提交凭证无效', 403);
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), base64UrlToBytes(parts[1]), encoder.encode(parts[0]));
  if (!valid) fail('本局提交凭证无效', 403);
  try {
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[0])));
    if (!payload || typeof payload !== 'object') fail('本局提交凭证无效', 403);
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail('本局提交凭证无效', 403);
  }
}
async function clientHash(env, clientId) {
  if (typeof clientId !== 'string' || !CLIENT_PATTERN.test(clientId)) fail('访客标识无效，请刷新页面');
  return privateHash(env.LEAGUE_HASH_SECRET, `client:${clientId}`);
}
const requestIp = request => request.headers.get('CF-Connecting-IP') || 'unknown';

async function contributionMap(env) {
  const result = await env.DB.prepare(`SELECT school_id,total_heat,rounds,best_heat,best_at,best_mode
    FROM league_stats WHERE season_id=?`).bind(data.config.seasonId).all();
  return Object.fromEntries((result.results || []).map(row => [row.school_id, {
    totalHeat: row.total_heat,
    rounds: row.rounds,
    bestHeat: row.best_heat,
    bestAt: row.best_at,
    bestMode: row.best_mode,
  }]));
}
async function standings(env, board = 'total') {
  return rankStandings(data.catalog.schools, await contributionMap(env), board);
}
async function finishedCount(env, column, value, day) {
  if (!['client_hash', 'ip_hash'].includes(column)) throw new Error('Invalid count column');
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM league_rounds WHERE ${column}=? AND finished_at>=?`)
    .bind(value, day).first();
  return Number(row?.n || 0);
}
async function enforceDailyLimits(env, client, ip, now) {
  const day = Math.floor(now / 86400000) * 86400000;
  const [byClient, byIp] = await Promise.all([
    finishedCount(env, 'client_hash', client, day),
    finishedCount(env, 'ip_hash', ip, day),
  ]);
  if (byClient >= data.config.dailyClientRoundLimit || byIp >= data.config.dailyIpRoundLimit) {
    fail('今天已贡献很多快乐，明天继续上分吧', 429);
  }
}
async function approximateStartLimit(env, client, ip) {
  const checks = [];
  if (env.START_CLIENT_RATE_LIMITER?.limit) checks.push(env.START_CLIENT_RATE_LIMITER.limit({ key: client }));
  if (env.START_IP_RATE_LIMITER?.limit) checks.push(env.START_IP_RATE_LIMITER.limit({ key: ip }));
  const results = await Promise.all(checks);
  if (results.some(result => !result.success)) fail('开局太频繁了，歇一会儿再来', 429);
}

function validateTicketPayload(payload, ticket, body, client, now) {
  if (payload.v !== 1 || payload.jti !== ticket.roundId || payload.seasonId !== data.config.seasonId ||
      payload.seasonId !== body.seasonId || payload.clientHash !== client ||
      !['easy', 'normal'].includes(payload.mode) || !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) || payload.exp < now || payload.iat > now + 30000 ||
      payload.exp - payload.iat !== TICKET_LIFETIME_MS) fail('本局提交凭证无效', 403);
}
async function existingReceipt(env, row, schoolId) {
  if (row.school_id !== schoolId) fail('这一局已为其他学校上分', 409);
  if (row.receipt) return { ...JSON.parse(row.receipt), duplicate: true };
  const [totalRows, bestRows] = await Promise.all([standings(env, 'total'), standings(env, 'best')]);
  const total = totalRows.find(entry => entry.id === row.school_id);
  const best = bestRows.find(entry => entry.id === row.school_id);
  const first = await env.DB.prepare(`SELECT id FROM league_rounds WHERE season_id=? AND school_id=?
    ORDER BY finished_at ASC,id ASC LIMIT 1`).bind(row.season_id, row.school_id).first();
  const stats = await env.DB.prepare('SELECT best_round_id FROM league_stats WHERE season_id=? AND school_id=?')
    .bind(row.season_id, row.school_id).first();
  return {
    roundId: row.id,
    schoolId: row.school_id,
    points: row.points,
    totalRank: total?.rank,
    bestRank: best?.rank,
    totalHeat: total?.totalHeat,
    bestHeat: best?.bestHeat,
    firstEntry: first?.id === row.id,
    newRecord: stats?.best_round_id === row.id,
    duplicate: true,
  };
}

async function startRound(request, env, body, now) {
  if (!['easy', 'normal'].includes(body.mode)) fail('对局模式无效');
  const client = await clientHash(env, body.clientId);
  const ip = await privateHash(env.LEAGUE_HASH_SECRET, `ip:${requestIp(request)}`);
  await approximateStartLimit(env, client, ip);
  await enforceDailyLimits(env, client, ip, now);
  const roundId = crypto.randomUUID();
  const payload = {
    v: 1,
    jti: roundId,
    seasonId: data.config.seasonId,
    clientHash: client,
    ipHash: ip,
    mode: body.mode,
    iat: now,
    exp: now + TICKET_LIFETIME_MS,
  };
  return { roundId, token: await signTicket(env.LEAGUE_HASH_SECRET, payload) };
}

async function finishRound(env, body, now, minRoundSeconds) {
  const ticket = body.ticket;
  if (!ticket || typeof ticket.roundId !== 'string' || typeof ticket.token !== 'string') {
    fail('本局没有获得提交凭证，请再玩一局');
  }
  const client = await clientHash(env, body.clientId);
  const payload = await verifyTicket(env.LEAGUE_HASH_SECRET, ticket.token);
  validateTicketPayload(payload, ticket, body, client, now);
  const prior = await env.DB.prepare('SELECT * FROM league_rounds WHERE id=?').bind(payload.jti).first();
  if (prior) return existingReceipt(env, prior, body.schoolId);
  const school = data.catalog.schools.find(entry => entry.id === body.schoolId);
  if (!school) fail('请选择名单中的学校');
  let round;
  try { round = validateRound(body.result, data.config.rules); } catch (error) { fail(error.message); }
  const elapsed = (now - payload.iat) / 1000;
  if (round.mode !== payload.mode || elapsed < Math.max(minRoundSeconds, round.survived - 4) || elapsed > 7200) {
    fail('对局时长不匹配，请完成一局后提交');
  }
  await enforceDailyLimits(env, payload.clientHash, payload.ipHash, now);
  const points = calculatePoints(round, data.config.rules);
  const finishedAt = now;
  const bestAt = new Date(now).toISOString();
  let batch;
  try {
    batch = await env.DB.batch([
      env.DB.prepare(`INSERT INTO league_schools(id,name,country_code,map_region_id) VALUES (?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,country_code=excluded.country_code,map_region_id=excluded.map_region_id`)
        .bind(school.id, school.name, schoolCountry(school), school.mapRegionId || null),
      env.DB.prepare(`INSERT INTO league_stats(
          season_id,school_id,total_heat,rounds,best_heat,best_round_id,best_at,best_mode
        ) VALUES (?,?,?,1,?,?,?,?)
        ON CONFLICT(season_id,school_id) DO UPDATE SET
          total_heat=league_stats.total_heat+excluded.total_heat,
          rounds=league_stats.rounds+1,
          best_heat=CASE WHEN excluded.best_heat>league_stats.best_heat THEN excluded.best_heat ELSE league_stats.best_heat END,
          best_round_id=CASE WHEN excluded.best_heat>league_stats.best_heat THEN excluded.best_round_id ELSE league_stats.best_round_id END,
          best_at=CASE WHEN excluded.best_heat>league_stats.best_heat THEN excluded.best_at ELSE league_stats.best_at END,
          best_mode=CASE WHEN excluded.best_heat>league_stats.best_heat THEN excluded.best_mode ELSE league_stats.best_mode END
        RETURNING total_heat,rounds,best_heat,best_round_id`)
        .bind(body.seasonId, school.id, points, points, payload.jti, bestAt, round.mode),
      env.DB.prepare(`INSERT INTO league_rounds(
          id,season_id,mode,client_hash,ip_hash,started_at,finished_at,school_id,points,receipt
        ) VALUES (?,?,?,?,?,?,?,?,?,NULL)`)
        .bind(payload.jti, body.seasonId, round.mode, payload.clientHash, payload.ipHash, payload.iat, finishedAt, school.id, points),
    ]);
  } catch (error) {
    // A concurrent retry loses the UNIQUE(id) race. D1 rolls the whole batch back.
    const completed = await env.DB.prepare('SELECT * FROM league_rounds WHERE id=?').bind(payload.jti).first();
    if (completed) return existingReceipt(env, completed, body.schoolId);
    throw error;
  }
  const updated = batch[1]?.results?.[0];
  if (!updated) throw new Error('League update did not return its row');
  const [totalRows, bestRows] = await Promise.all([standings(env, 'total'), standings(env, 'best')]);
  const total = totalRows.find(entry => entry.id === school.id);
  const best = bestRows.find(entry => entry.id === school.id);
  const receipt = {
    roundId: payload.jti,
    schoolId: school.id,
    points,
    totalRank: total.rank,
    bestRank: best.rank,
    totalHeat: updated.total_heat,
    bestHeat: updated.best_heat,
    firstEntry: updated.rounds === 1,
    newRecord: updated.best_round_id === payload.jti,
  };
  await env.DB.prepare('UPDATE league_rounds SET receipt=? WHERE id=? AND receipt IS NULL')
    .bind(JSON.stringify(receipt), payload.jti).run();
  return receipt;
}

export function createWorker({ now = Date.now, minRoundSeconds = 10 } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      try {
        checkOrigin(request, env);
        const cors = corsHeaders(request);
        if (request.method === 'OPTIONS') return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
        if (url.pathname === '/data/league-config.json' && request.method === 'GET') {
          return json(data.config, 200, cors);
        }
        if (url.pathname === '/api/health' && request.method === 'GET') {
          return json({ ok: true, seasonId: data.config.seasonId, runtime: 'cloudflare-worker-d1' }, 200, cors);
        }
        if (url.pathname.startsWith('/api/')) {
          if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
            if (url.searchParams.get('seasonId') && url.searchParams.get('seasonId') !== data.config.seasonId) fail('赛季已更新，请刷新游戏');
            const board = url.searchParams.get('board') || 'total';
            if (!['total', 'best'].includes(board)) fail('榜单类型无效');
            return json({ storageMode: 'remote', seasonId: data.config.seasonId, board, schools: await standings(env, board) }, 200, cors);
          }
          if (request.method === 'GET' && url.pathname === '/api/schools') {
            const schools = searchSchools(data.catalog.schools, url.searchParams.get('q') || '', url.searchParams.get('countryCode') || 'ALL', url.searchParams.get('mapRegionId') || '');
            return json({ schools }, 200, cors);
          }
          if (request.method === 'GET' && url.pathname === '/api/map-regions') {
            if (url.searchParams.get('seasonId') && url.searchParams.get('seasonId') !== data.config.seasonId) fail('赛季已更新，请刷新游戏');
            const rows = await standings(env, 'total');
            return json({ seasonId: data.config.seasonId, regions: aggregateRegions(rows), unlocatedSchools: rows.filter(entry => !entry.mapRegionId).length }, 200, cors);
          }
          if (request.method !== 'POST') fail('接口不存在', 404);
          const body = await readBody(request);
          if (body.seasonId !== data.config.seasonId) fail('赛季已更新，请刷新游戏');
          if (url.pathname === '/api/rounds/start') return json(await startRound(request, env, body, now()), 201, cors);
          if (url.pathname === '/api/rounds/finish') return json(await finishRound(env, body, now(), minRoundSeconds), 200, cors);
          fail('接口不存在', 404);
        }
        if (!['GET', 'HEAD'].includes(request.method)) fail('请求方式不支持', 405);
        return env.ASSETS.fetch(request);
      } catch (error) {
        if (!(error instanceof HttpError)) console.error('League worker error', error);
        return json({ error: error instanceof HttpError ? error.message : '榜单服务暂不可用，请稍后重试' }, error instanceof HttpError ? error.status : 500, corsHeaders(request));
      }
    },
  };
}

export default createWorker();
