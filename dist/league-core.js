// Shared anonymous school-league rules. School directory != participating schools.
export function normalizeSearch(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s’'·,，（）()&.-]/g, '');
}
export const schoolCountry = school => school.countryCode || (school.region === 'UK' ? 'GB' : school.region);
export function searchSchools(schools, query = '', country = 'ALL', mapRegionId = '') {
  const key = normalizeSearch(query), code = country === 'UK' ? 'GB' : country;
  return schools.filter(s => (code === 'ALL' || schoolCountry(s) === code) && (!mapRegionId || s.mapRegionId === mapRegionId) && (!key ||
    [s.name, s.englishName, s.id, ...(s.aliases || [])].some(v => normalizeSearch(v).includes(key))));
}
export function validateLeagueData(catalog, config) {
  if (catalog.schemaVersion !== 1 || config.schemaVersion !== 2) throw new Error('学校榜版本已更新，请刷新页面');
  const ids = new Set();
  for (const s of catalog.schools) {
    if (!s.id || !s.name || ids.has(s.id) || !/^[A-Z]{2}$/.test(schoolCountry(s) || '')) throw new Error(`学校记录无效：${s.id}`);
    if (s.mapRegionId != null && (typeof s.mapRegionId !== 'string' || !s.mapRegionId)) throw new Error(`地图地区无效：${s.id}`);
    ids.add(s.id);
  }
  if (!config.seasonId || !['local', 'remote'].includes(config.storageMode)) throw new Error('联赛配置无效');
  for (const k of ['normalPointsPerPhoto', 'easyPointsPerPhoto', 'winBonus', 'maxPhotos']) {
    if (!Number.isSafeInteger(config.rules[k]) || config.rules[k] < 0 || config.rules[k] > 10000) throw new Error(`积分规则无效：${k}`);
  }
  for (const k of ['dailyClientRoundLimit', 'dailyIpRoundLimit']) {
    if (!Number.isSafeInteger(config[k]) || config[k] < 1) throw new Error(`每日次数配置无效：${k}`);
  }
  return { catalog, config };
}
export function validateRound(result, rules) {
  if (!result || !['easy', 'normal'].includes(result.mode)) throw new Error('对局模式无效');
  for (const [field, min, max] of [['score', 0, rules.maxPhotos], ['losses', 0, 3], ['survived', 1, 180], ['relocations', 0, 2000]]) {
    if (!Number.isSafeInteger(result[field]) || result[field] < min || result[field] > max) throw new Error(`对局字段无效：${field}`);
  }
  if (result.survived < 180 && result.losses !== 3) throw new Error('对局尚未结束');
  const won = result.survived === 180 && result.losses < 3 && result.score >= (result.mode === 'easy' ? 18 : 24);
  if (Boolean(result.won) !== won) throw new Error('结算结果不一致');
  return { score: result.score, losses: result.losses, survived: result.survived, relocations: result.relocations, mode: result.mode, won };
}
export function calculatePoints(result, rules) {
  const r = validateRound(result, rules);
  return r.score * (r.mode === 'easy' ? rules.easyPointsPerPhoto : rules.normalPointsPerPhoto) + (r.won ? rules.winBonus : 0);
}
export function rankStandings(schools, contributions = {}, board = 'total') {
  if (!['total', 'best'].includes(board)) throw new Error('榜单类型无效');
  const rows = schools.filter(s => (contributions[s.id]?.rounds || 0) > 0).map(s => ({ ...s,
    countryCode: schoolCountry(s), mapRegionId: s.mapRegionId || null,
    totalHeat: contributions[s.id].totalHeat, bestHeat: contributions[s.id].bestHeat,
    rounds: contributions[s.id].rounds, bestAt: contributions[s.id].bestAt || null,
    bestMode: contributions[s.id].bestMode || null, recordHolder: '匿名玩家',
  }));
  const metric = board === 'best' ? 'bestHeat' : 'totalHeat';
  rows.sort((a, b) => b[metric] - a[metric] || a.id.localeCompare(b.id, 'en'));
  return rows.map((s, i) => ({ ...s, rank: i + 1 }));
}
export function aggregateRegions(rows) {
  const regions = new Map();
  for (const s of rows) {
    if (!s.mapRegionId) continue; // Missing location is not silently assigned to a region.
    const key = `${s.countryCode}:${s.mapRegionId}`;
    const r = regions.get(key) || { countryCode: s.countryCode, mapRegionId: s.mapRegionId, totalHeat: 0, bestHeat: 0, rounds: 0, schools: 0 };
    r.totalHeat += s.totalHeat; r.bestHeat = Math.max(r.bestHeat, s.bestHeat); r.rounds += s.rounds; r.schools++;
    regions.set(key, r);
  }
  return [...regions.values()].sort((a, b) => b.totalHeat - a.totalHeat || a.mapRegionId.localeCompare(b.mapRegionId));
}
export class LocalLeague {
  constructor(data, storage = null) { this.data = data; this.storage = storage; this.key = `nailoong-league:v2:${data.config.seasonId}`; this.sessionTickets = new Map(); }
  read() {
    try { const v = JSON.parse(this.storage?.getItem(this.key) || '{}'); return { contributions: v.contributions || {}, receipts: v.receipts || {} }; }
    catch { return { contributions: {}, receipts: {} }; }
  }
  async getStandings(board = 'total') { return rankStandings(this.data.catalog.schools, this.read().contributions, board); }
  async startRound({ roundId, mode }) {
    const prior = this.sessionTickets.get(roundId);
    if (prior) { if (prior.mode !== mode) throw new Error('对局模式不一致'); return prior; }
    const ticket = { roundId, mode }; this.sessionTickets.set(roundId, ticket); return ticket;
  }
  async submit({ schoolId, result, ticket }) {
    const issued = ticket && this.sessionTickets.get(ticket.roundId);
    if (!issued) throw new Error('这局没有可提交的成绩，请再玩一局');
    if (issued.mode !== result?.mode) throw new Error('对局模式不一致');
    if (!this.data.catalog.schools.some(s => s.id === schoolId)) throw new Error('请先选择学校');
    const state = this.read(), existing = state.receipts[ticket.roundId];
    if (existing) {
      if (existing.schoolId !== schoolId) throw new Error('这一局已经为其他学校上过分了');
      return { ...existing, duplicate: true };
    }
    // Completed tickets stay consumed even after old retry receipts are trimmed.
    if (issued.consumed) throw new Error('这一局已经上过分了');
    const points = calculatePoints(result, this.data.config.rules), firstEntry = !state.contributions[schoolId];
    const value = state.contributions[schoolId] ||= { totalHeat: 0, bestHeat: 0, rounds: 0 };
    const newRecord = firstEntry || points > value.bestHeat;
    value.totalHeat += points; value.rounds++;
    if (newRecord) { value.bestHeat = points; value.bestAt = new Date().toISOString(); value.bestMode = result.mode; }
    const totalRank = rankStandings(this.data.catalog.schools, state.contributions, 'total').find(s => s.id === schoolId).rank;
    const bestRank = rankStandings(this.data.catalog.schools, state.contributions, 'best').find(s => s.id === schoolId).rank;
    const receipt = { schoolId, roundId: ticket.roundId, points, totalRank, bestRank, totalHeat: value.totalHeat, bestHeat: value.bestHeat, firstEntry, newRecord };
    state.receipts[ticket.roundId] = receipt;
    const entries = Object.entries(state.receipts); if (entries.length > 500) state.receipts = Object.fromEntries(entries.slice(-500));
    if (!this.storage) throw new Error('浏览器未允许保存成绩，请开启网站存储后重试');
    this.storage.setItem(this.key, JSON.stringify(state)); issued.consumed = true;
    return receipt;
  }
}
export class RemoteLeague {
  constructor(data, clientId, fetcher = fetch) { this.data = data; this.clientId = clientId; this.fetcher = fetcher; }
  async request(path, payload) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetcher(`${this.data.config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
        method: payload ? 'POST' : 'GET', headers: payload ? { 'Content-Type': 'application/json' } : {},
        body: payload ? JSON.stringify(payload) : undefined, cache: 'no-store', signal: controller.signal,
      });
      let body; try { body = await response.json(); } catch { throw new Error('榜单服务暂不可用，请稍后重试'); }
      if (!response.ok) throw new Error(body.error || '榜单暂时连接不上，请稍后重试');
      return body;
    } catch (e) { if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('网络未连接，成绩暂未提交，请重试'); throw e; }
    finally { clearTimeout(timer); }
  }
  async getStandings(board = 'total') { return (await this.request(`/leaderboard?seasonId=${encodeURIComponent(this.data.config.seasonId)}&board=${board}`)).schools; }
  async startRound({ mode }) { return this.request('/rounds/start', { mode, clientId: this.clientId, seasonId: this.data.config.seasonId }); }
  async submit({ schoolId, result, ticket }) { return this.request('/rounds/finish', { schoolId, result, ticket, clientId: this.clientId, seasonId: this.data.config.seasonId }); }
}
