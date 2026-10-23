import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, createReadStream, statSync } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { calculatePoints, validateRound, validateLeagueData, rankStandings, searchSchools, schoolCountry, aggregateRegions } from '../dist/league-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function createLeagueServer({ dbPath = resolve(ROOT, 'server/runtime/league.sqlite'), dataDir = resolve(ROOT, 'dist/data'), allowedOrigins = [], trustProxy = false, now = Date.now, minRoundSeconds = 10 } = {}) {
  const load = name => JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'));
  const data = validateLeagueData(load('schools.json'), load('league-config.json'));
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS league_schools (id TEXT PRIMARY KEY,name TEXT NOT NULL,country_code TEXT NOT NULL,map_region_id TEXT);
    CREATE TABLE IF NOT EXISTS league_stats (season_id TEXT NOT NULL,school_id TEXT NOT NULL REFERENCES league_schools(id),total_heat INTEGER NOT NULL DEFAULT 0,rounds INTEGER NOT NULL DEFAULT 0,best_heat INTEGER NOT NULL DEFAULT 0,best_round_id TEXT NOT NULL,best_at TEXT NOT NULL,best_mode TEXT NOT NULL,PRIMARY KEY(season_id,school_id));
    CREATE TABLE IF NOT EXISTS league_rounds (id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,season_id TEXT NOT NULL,mode TEXT NOT NULL,client_hash TEXT NOT NULL,ip_hash TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,school_id TEXT,points INTEGER,receipt TEXT);
    CREATE INDEX IF NOT EXISTS league_rounds_client_date ON league_rounds(client_hash,started_at);
    CREATE INDEX IF NOT EXISTS league_rounds_ip_date ON league_rounds(ip_hash,started_at);`);
  let secret = db.prepare('SELECT value FROM metadata WHERE key=?').get('hash-secret')?.value;
  if (!secret) { secret = randomBytes(32).toString('hex'); db.prepare('INSERT INTO metadata VALUES (?,?)').run('hash-secret', secret); }
  const hash = v => createHash('sha256').update(v).digest('hex');
  const privateHash = v => createHmac('sha256', secret).update(v).digest('hex');
  // Only submitted schools are inserted. Loading the directory never populates a leaderboard.
  const contributionMap = () => Object.fromEntries(db.prepare('SELECT * FROM league_stats WHERE season_id=?').all(data.config.seasonId).map(r => [r.school_id, { totalHeat: r.total_heat, bestHeat: r.best_heat, rounds: r.rounds, bestAt: r.best_at, bestMode: r.best_mode }]));
  const standings = (board = 'total') => rankStandings(data.catalog.schools, contributionMap(), board);
  const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
  const checkClient = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(value)) fail('访客标识无效，请刷新页面'); return privateHash(`client:${value}`); };
  const readBody = async request => { let raw = ''; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 8192) fail('请求过大', 413); } try { return JSON.parse(raw); } catch { fail('请求格式无效'); } };
  const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
  const server = http.createServer(async (request, response) => {
    try {
      const host = request.headers.host || 'localhost', url = new URL(request.url, `http://${host}`), origin = request.headers.origin;
      const ownOrigins = [`http://${host}`, `https://${host}`];
      if (origin) {
        if (![...ownOrigins, ...allowedOrigins].includes(origin)) fail('此网站暂未连接到共享榜单', 403);
        response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') { response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type'); response.writeHead(204); response.end(); return; }
      if (url.pathname === '/api/health' && request.method === 'GET') { json(response, 200, { ok: true, seasonId: data.config.seasonId }); return; }
      if (url.pathname.startsWith('/api/')) {
        if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
          if (url.searchParams.get('seasonId') && url.searchParams.get('seasonId') !== data.config.seasonId) fail('赛季已更新，请刷新游戏');
          const board = url.searchParams.get('board') || 'total';
          if (!['total', 'best'].includes(board)) fail('榜单类型无效');
          json(response, 200, { storageMode: 'remote', seasonId: data.config.seasonId, board, schools: standings(board) }); return;
        }
        if (request.method === 'GET' && url.pathname === '/api/schools') {
          const schools = searchSchools(data.catalog.schools, url.searchParams.get('q') || '', url.searchParams.get('countryCode') || 'ALL', url.searchParams.get('mapRegionId') || '');
          json(response, 200, { schools }); return;
        }
        if (request.method === 'GET' && url.pathname === '/api/map-regions') {
          if (url.searchParams.get('seasonId') && url.searchParams.get('seasonId') !== data.config.seasonId) fail('赛季已更新，请刷新游戏');
          const rows = standings();
          json(response, 200, { seasonId: data.config.seasonId, regions: aggregateRegions(rows), unlocatedSchools: rows.filter(s => !s.mapRegionId).length }); return;
        }
        if (request.method !== 'POST') fail('接口不存在', 404);
        if (!request.headers['content-type']?.startsWith('application/json')) fail('请求格式无效', 415);
        const body = await readBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求格式无效');
        const clientHash = checkClient(body.clientId);
        if (body.seasonId !== data.config.seasonId) fail('赛季已更新，请刷新游戏');
        if (url.pathname === '/api/rounds/start') {
          if (!['easy', 'normal'].includes(body.mode)) fail('对局模式无效');
          const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
          const ipHash = privateHash(`ip:${trustProxy && forwarded ? forwarded : request.socket.remoteAddress}`), stamp = now();
          const recent = db.prepare('SELECT count(*) AS count FROM league_rounds WHERE client_hash=? AND started_at>?').get(clientHash, stamp - 60000).count;
          if (recent >= 5) fail('开局太频繁了，歇一会儿再来', 429);
          const day = Math.floor(stamp / 86400000) * 86400000;
          const clientCount = db.prepare('SELECT count(*) AS count FROM league_rounds WHERE client_hash=? AND started_at>=? AND finished_at IS NOT NULL').get(clientHash, day).count;
          const ipCount = db.prepare('SELECT count(*) AS count FROM league_rounds WHERE ip_hash=? AND started_at>=? AND finished_at IS NOT NULL').get(ipHash, day).count;
          if (clientCount >= data.config.dailyClientRoundLimit || ipCount >= data.config.dailyIpRoundLimit) fail('今天已贡献很多快乐，明天继续上分吧', 429);
          const roundId = randomUUID(), token = randomBytes(32).toString('base64url');
          db.prepare('INSERT INTO league_rounds(id,token_hash,season_id,mode,client_hash,ip_hash,started_at) VALUES (?,?,?,?,?,?,?)').run(roundId, hash(token), body.seasonId, body.mode, clientHash, ipHash, stamp);
          json(response, 201, { roundId, token }); return;
        }
        if (url.pathname === '/api/rounds/finish') {
          const t = body.ticket;
          if (!t || typeof t.token !== 'string' || typeof t.roundId !== 'string') fail('本局没有获得提交凭证，请再玩一局');
          const row = db.prepare('SELECT * FROM league_rounds WHERE id=?').get(t.roundId);
          if (!row || row.token_hash !== hash(t.token) || row.client_hash !== clientHash || row.season_id !== body.seasonId) fail('本局提交凭证无效', 403);
          if (row.finished_at !== null) {
            if (row.school_id !== body.schoolId) fail('这一局已为其他学校上分', 409);
            json(response, 200, { ...JSON.parse(row.receipt), duplicate: true }); return;
          }
          if (!data.catalog.schools.some(s => s.id === body.schoolId)) fail('请选择名单中的学校');
          const elapsed = (now() - row.started_at) / 1000;
          let r; try { r = validateRound(body.result, data.config.rules); } catch (e) { fail(e.message); }
          if (r.mode !== row.mode || elapsed < Math.max(minRoundSeconds, r.survived - 4) || elapsed > 7200) fail('对局时长不匹配，请完成一局后提交');
          // Recheck at finish too: pre-opening several tickets cannot bypass the daily cap.
          const day = Math.floor(now() / 86400000) * 86400000;
          const countFor = (column, value) => db.prepare(`SELECT count(*) AS n FROM league_rounds WHERE ${column}=? AND finished_at>=?`).get(value, day).n;
          if (countFor('client_hash', row.client_hash) >= data.config.dailyClientRoundLimit || countFor('ip_hash', row.ip_hash) >= data.config.dailyIpRoundLimit) fail('今天的贡献已达上限，明天继续', 429);
          const points = calculatePoints(r, data.config.rules);
          db.exec('BEGIN IMMEDIATE');
          try {
            // Another process sharing this DB may have completed the same ticket.
            const current = db.prepare('SELECT finished_at,school_id,receipt FROM league_rounds WHERE id=?').get(row.id);
            if (current.finished_at !== null) {
              if (current.school_id !== body.schoolId) fail('这一局已为其他学校上分', 409);
              db.exec('COMMIT'); json(response, 200, { ...JSON.parse(current.receipt), duplicate: true }); return;
            }
            const school = data.catalog.schools.find(s => s.id === body.schoolId);
            db.prepare('INSERT INTO league_schools(id,name,country_code,map_region_id) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,country_code=excluded.country_code,map_region_id=excluded.map_region_id').run(school.id, school.name, schoolCountry(school), school.mapRegionId || null);
            const previous = db.prepare('SELECT * FROM league_stats WHERE season_id=? AND school_id=?').get(body.seasonId, body.schoolId);
            const firstEntry = !previous, newRecord = firstEntry || points > previous.best_heat;
            db.prepare('INSERT INTO league_stats(season_id,school_id,total_heat,rounds,best_heat,best_round_id,best_at,best_mode) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(season_id,school_id) DO UPDATE SET total_heat=excluded.total_heat,rounds=excluded.rounds,best_heat=excluded.best_heat,best_round_id=excluded.best_round_id,best_at=excluded.best_at,best_mode=excluded.best_mode').run(body.seasonId, body.schoolId, (previous?.total_heat || 0) + points, (previous?.rounds || 0) + 1, newRecord ? points : previous.best_heat, newRecord ? row.id : previous.best_round_id, newRecord ? new Date(now()).toISOString() : previous.best_at, newRecord ? r.mode : previous.best_mode);
            const entry = standings('total').find(s => s.id === body.schoolId);
            const bestEntry = standings('best').find(s => s.id === body.schoolId);
            const receipt = { roundId: row.id, schoolId: body.schoolId, points, totalRank: entry.rank, bestRank: bestEntry.rank, totalHeat: entry.totalHeat, bestHeat: entry.bestHeat, firstEntry, newRecord };
            db.prepare('UPDATE league_rounds SET finished_at=?,school_id=?,points=?,receipt=? WHERE id=?').run(now(), body.schoolId, points, JSON.stringify(receipt), row.id);
            db.exec('COMMIT'); json(response, 200, receipt); return;
          } catch (e) { db.exec('ROLLBACK'); throw e; }
        }
        fail('接口不存在', 404);
      }
      // Only dist is served. The database, source code, CSV and environment never become static files.
      if (!['GET', 'HEAD'].includes(request.method)) fail('请求方式不支持', 405);
      if (url.pathname === '/data/league-config.json') { json(response, 200, { ...data.config, storageMode: 'remote', apiBaseUrl: '/api' }); return; }
      const base = resolve(ROOT, 'dist'), file = resolve(base, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(base + sep) || decodeURIComponent(url.pathname).split('/').some(p => p.startsWith('.'))) fail('文件不存在', 404);
      let stat; try { stat = statSync(file); } catch { fail('文件不存在', 404); }
      if (!stat.isFile()) fail('文件不存在', 404);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
      response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
    } catch (e) { json(response, e.status || 500, { error: e.status ? e.message : '榜单服务暂不可用，请稍后重试' }); }
  });
  return { server, db, data, close: async () => { await new Promise(resolve => server.close(resolve)); db.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createLeagueServer({ dbPath: process.env.LEAGUE_DB_PATH || undefined, allowedOrigins: (process.env.LEAGUE_ALLOWED_ORIGINS || '').split(',').filter(Boolean), trustProxy: process.env.LEAGUE_TRUST_PROXY === '1' });
  const port = Number(process.env.PORT || 8787); app.server.listen(port, '0.0.0.0', () => console.log(`School league ready on port ${port}; database persists at LEAGUE_DB_PATH.`));
}
