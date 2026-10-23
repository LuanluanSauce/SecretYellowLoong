import { validateLeagueData, calculatePoints, searchSchools, schoolCountry, LocalLeague, RemoteLeague } from './league-core.js';

const LEAGUE_STORAGE = (() => { try { return window.localStorage; } catch { return null; } })();
const leagueElement = (tag, className, value) => { const e = document.createElement(tag); if (className) e.className = className; if (value !== undefined) e.textContent = value; return e; };
const leagueUID = () => crypto.randomUUID?.() || `round_${Date.now()}_${Math.random().toString(36).slice(2)}`;
let leagueClientId;
try { leagueClientId = LEAGUE_STORAGE?.getItem('nailoong-league-client'); if (!leagueClientId) { leagueClientId = leagueUID(); LEAGUE_STORAGE?.setItem('nailoong-league-client', leagueClientId); } } catch { leagueClientId = leagueUID(); }
let leagueData, leagueAdapter, leagueBoards = { total: [], best: [] }, leagueBoard = 'total', leagueSchool = '', leagueResult = null, leagueTicketPromise = null, leagueReceipt = null, leagueActiveId = '', leagueBusy = false;
try { leagueSchool = LEAGUE_STORAGE?.getItem('nailoong-league-school') || ''; } catch {}

const panel = leagueElement('section', 'school-result-panel'); panel.id = 'school-result-panel';
panel.innerHTML = `<div class="school-panel-heading"><b>这一局，为母校上分。</b><span id="school-round-points">+0 赞</span></div>
  <p class="school-league-mode" id="school-league-mode">正在准备校园榜单…</p>
  <div class="school-picker-controls"><select id="school-region" aria-label="筛选学校所在国家或地区"></select><input id="school-search" type="search" placeholder="搜校名、英文名或简称" autocomplete="off" aria-label="搜索自己的学校"></div>
  <div class="school-options" id="school-options" role="group" aria-label="可选学校"></div>
  <div class="school-picked" id="school-picked">先选学校，再把这局快乐送过去。</div>
  <button id="school-submit" class="primary-button" disabled>为母校贡献本局点赞</button>
  <p class="school-message" id="school-message" role="status" aria-live="polite"></p>
  <div class="school-mini-board" id="school-mini-board"></div>
  <div class="school-result-actions"><button id="school-view-board">查看校园双榜</button><button id="school-share" disabled>复制战报</button></div>`;
document.getElementById('result-card').insertBefore(panel, document.getElementById('again-button'));
const leagueGet = id => document.getElementById(id);
const leagueMessage = (message, error = false) => { leagueGet('school-message').textContent = message; leagueGet('school-message').classList.toggle('is-error', error); };

const boardDialog = leagueElement('dialog', 'school-board-dialog'); boardDialog.id = 'school-board-dialog';
boardDialog.innerHTML = `<div class="dialog-top"><span class="eyebrow">CAMPUS NAILOONG LEAGUE</span><button id="school-close-board" class="icon-button" aria-label="关闭校园榜">×</button></div><h2>奶龙可以撤，母校不能输。</h2><p id="school-board-note" class="school-board-note"></p>
  <div class="school-board-tabs" role="group" aria-label="选择榜单"><button id="school-tab-total" aria-pressed="true">累计最热</button><button id="school-tab-best" aria-pressed="false">单局最高热度</button></div>
  <div class="school-board-filters"><select id="school-board-region" aria-label="榜单国家或地区"></select><input id="school-board-search" type="search" placeholder="查找学校 / 简称" aria-label="在榜单中搜索学校"><button id="school-board-refresh">刷新</button></div>
  <div class="school-board-table-head"><span>排名 / 学校</span><span id="school-metric-label">累计点赞</span><span id="school-extra-label">贡献局数</span></div><div id="school-board-rows" class="school-board-rows"></div><p class="school-board-footnote" id="school-board-footnote"></p>`;
document.body.append(boardDialog);
const headerLeagueButton = leagueElement('button', 'school-header-button', '校园双榜'); headerLeagueButton.id = 'school-open-board';
document.querySelector('.header-actions').prepend(headerLeagueButton);
const leagueModeLabel = () => leagueData.config.storageMode === 'remote' ? '全校共享榜 · 免登录' : '本机练习榜 · 仅保存在当前浏览器';
function leagueCountryOptions() {
  const codes = [...new Set(leagueData.catalog.schools.map(schoolCountry))];
  for (const id of ['school-region', 'school-board-region']) {
    const select = leagueGet(id); select.replaceChildren(new Option('全部地区', 'ALL'));
    for (const code of codes) select.append(new Option(leagueData.catalog.countries?.[code] || code, code));
  }
}
async function leagueLoad() {
  const embedded = window.__NAILOONG_LEAGUE_DATA__;
  const load = async name => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try { const r = await fetch(new URL(`./data/${name}`, import.meta.url), { cache: 'no-store', signal: controller.signal }); if (!r.ok) throw new Error(); return await r.json(); }
    catch { throw new Error('学校数据暂未加载成功，请刷新重试'); } finally { clearTimeout(timer); }
  };
  const [catalog, config] = embedded ? [embedded.catalog, embedded.config] : await Promise.all([load('schools.json'), load('league-config.json')]);
  leagueData = validateLeagueData(catalog, config);
  leagueAdapter = config.storageMode === 'remote' ? new RemoteLeague(leagueData, leagueClientId) : new LocalLeague(leagueData, LEAGUE_STORAGE);
  leagueGet('school-league-mode').textContent = `${leagueModeLabel()}｜无初始分，每次打卡计 1 赞`;
  if (!catalog.schools.some(s => s.id === leagueSchool)) leagueSchool = '';
  leagueCountryOptions(); leagueRenderPicker();
}
const leagueReady = leagueLoad().catch(e => { leagueMessage(e.message, true); leagueGet('school-league-mode').textContent = '榜单暂未准备好，游戏仍可正常进行'; throw e; });
leagueReady.catch(() => {});
function leagueRenderPicker() {
  if (!leagueData) return;
  const matches = searchSchools(leagueData.catalog.schools, leagueGet('school-search').value, leagueGet('school-region').value);
  const holder = leagueGet('school-options'); holder.replaceChildren();
  const ordered = [...matches].sort((a, b) => Number(b.id === leagueSchool) - Number(a.id === leagueSchool));
  for (const s of ordered.slice(0, 16)) {
    const button = leagueElement('button', `school-option${leagueSchool === s.id ? ' selected' : ''}`); button.type = 'button';
    button.setAttribute('aria-pressed', String(leagueSchool === s.id)); button.disabled = !!leagueReceipt || leagueBusy;
    const country = leagueData.catalog.countries?.[schoolCountry(s)] || schoolCountry(s);
    button.append(leagueElement('b', '', s.name), leagueElement('small', '', s.englishName || country));
    button.addEventListener('click', () => {
      if (leagueReceipt || leagueBusy) return;
      leagueSchool = s.id; try { LEAGUE_STORAGE?.setItem('nailoong-league-school', s.id); } catch {}
      leagueRenderPicker(); leagueRenderMini();
    }); holder.append(button);
  }
  if (!matches.length) holder.append(leagueElement('p', 'school-empty', '没有找到，试试完整校名或英文名。学校目录会继续扩充。'));
  if (matches.length > 16) holder.append(leagueElement('p', 'school-search-tip', `共 ${matches.length} 所，继续输入可缩小范围`));
  const chosen = leagueData.catalog.schools.find(s => s.id === leagueSchool);
  leagueGet('school-picked').textContent = chosen ? `已选：${chosen.name}${chosen.englishName && chosen.name !== chosen.englishName ? ` · ${chosen.englishName}` : ''}` : '先选学校，再把这局快乐送过去。';
  leagueGet('school-submit').disabled = !chosen || !leagueResult || !!leagueReceipt || leagueBusy;
}
function leagueBoardRow(s, compact = false, board = leagueBoard) {
  const row = leagueElement('div', `school-board-row${leagueSchool === s.id ? ' own-school' : ''}${compact ? ' compact' : ''}`);
  const name = leagueElement('div', 'school-board-name'); name.append(leagueElement('span', 'school-rank', String(s.rank).padStart(2, '0')), leagueElement('b', '', s.name)); row.append(name);
  row.append(leagueElement('b', 'school-total-number', `${board === 'best' ? s.bestHeat : s.totalHeat} 赞`));
  if (!compact) row.append(leagueElement('span', 'school-player-number', board === 'best' ? '匿名玩家' : `${s.rounds} 局`));
  return row;
}
function leagueRenderMini() {
  const holder = leagueGet('school-mini-board'); holder.replaceChildren();
  const rows = leagueBoards.total, own = rows.find(s => s.id === leagueSchool), best = leagueBoards.best.find(s => s.id === leagueSchool);
  if (!rows.length) { holder.append(leagueElement('p', 'school-empty', '榜单还空着，谁来为母校拿下第一赞？')); return; }
  if (own) {
    const above = rows.find(s => s.rank === own.rank - 1);
    const gap = above ? `再加 ${above.totalHeat - own.totalHeat + 1} 赞超过 ${above.name}` : '母校暂居累计榜第一！';
    holder.append(leagueElement('p', 'school-chase-hint', `累计第 ${own.rank} 名 · 单局第 ${best.rank} 名（${own.bestHeat} 赞）｜${gap}`));
  } else if (leagueSchool) holder.append(leagueElement('p', 'school-chase-hint', '母校尚未上榜，这一局由你首发！'));
  for (const s of rows.slice(0, 3)) holder.append(leagueBoardRow(s, true, 'total'));
  if (own && own.rank > 3) { holder.append(leagueElement('div', 'school-rank-divider', '· · ·')); holder.append(leagueBoardRow(own, true, 'total')); }
}
async function leagueFetchBoards() {
  const [total, best] = await Promise.all([leagueAdapter.getStandings('total'), leagueAdapter.getStandings('best')]);
  leagueBoards = { total, best };
}
async function leagueOpenBoard() {
  window.dispatchEvent(new CustomEvent('nailoong:league-open'));
  if (!boardDialog.open) boardDialog.showModal();
  leagueGet('school-board-note').textContent = '正在打开校园双榜…';
  try { await leagueReady; await leagueRefreshBoard(); } catch (e) { leagueGet('school-board-note').textContent = e.message; }
}
function leagueRenderBoard() {
  if (!leagueData) return;
  const allowed = new Set(searchSchools(leagueData.catalog.schools, leagueGet('school-board-search').value, leagueGet('school-board-region').value).map(s => s.id));
  const all = leagueBoards[leagueBoard], rows = all.filter(s => allowed.has(s.id)), holder = leagueGet('school-board-rows'); holder.replaceChildren();
  for (const s of rows) holder.append(leagueBoardRow(s));
  if (!rows.length) holder.append(leagueElement('p', 'school-empty', all.length ? '没有匹配的参赛学校。目录中的学校提交首局后即可入榜。' : '还没有学校上榜。完成一局，选学校，成为母校第一位代表！'));
  leagueGet('school-board-note').textContent = `${leagueData.config.seasonTitle}｜${leagueModeLabel()}`;
  leagueGet('school-metric-label').textContent = leagueBoard === 'best' ? '最高单局' : '累计点赞';
  leagueGet('school-extra-label').textContent = leagueBoard === 'best' ? '纪录保持者' : '贡献局数';
  for (const kind of ['total', 'best']) leagueGet(`school-tab-${kind}`).setAttribute('aria-pressed', String(leagueBoard === kind));
  leagueGet('school-board-footnote').textContent = leagueBoard === 'best' ? '每校展示一位匿名玩家创造的最高单局纪录；同分保留原纪录。两校同分按学校 ID 稳定排序。' : '只展示已提交过成绩的学校。累计点赞为所有有效对局之和，无社交平台初始值；地区筛选保留总榜名次。';
}
async function leagueRefreshBoard() {
  const button = leagueGet('school-board-refresh'); button.disabled = true;
  try { await leagueFetchBoards(); leagueRenderBoard(); leagueRenderMini(); }
  finally { button.disabled = false; }
}
headerLeagueButton.addEventListener('click', leagueOpenBoard);
leagueGet('school-view-board').addEventListener('click', leagueOpenBoard);
leagueGet('school-close-board').addEventListener('click', () => boardDialog.close());
leagueGet('school-board-refresh').addEventListener('click', () => leagueRefreshBoard().catch(e => { leagueGet('school-board-note').textContent = e.message; }));
for (const kind of ['total', 'best']) leagueGet(`school-tab-${kind}`).addEventListener('click', () => { leagueBoard = kind; leagueRenderBoard(); });
for (const id of ['school-search', 'school-region']) leagueGet(id).addEventListener('input', leagueRenderPicker);
for (const id of ['school-board-search', 'school-board-region']) leagueGet(id).addEventListener('input', leagueRenderBoard);

window.addEventListener('nailoong:round-start', e => {
  const { roundId, mode } = e.detail; leagueActiveId = roundId; leagueResult = null; leagueReceipt = null;
  const pending = leagueReady.then(() => leagueAdapter.startRound({ roundId, mode }));
  e.detail.ticketReady = pending; pending.catch(() => {}); leagueTicketPromise = pending;
  leagueGet('school-share').disabled = true; leagueGet('school-submit').disabled = true; leagueGet('school-submit').textContent = '为母校贡献本局点赞';
});
window.addEventListener('nailoong:round-end', async e => {
  const { roundId, result } = e.detail;
  if (roundId !== leagueActiveId) return;
  try {
    await leagueReady; if (roundId !== leagueActiveId) return;
    leagueResult = { ...result }; leagueReceipt = null;
    leagueGet('school-round-points').textContent = `+${calculatePoints(result, leagueData.config.rules)} 赞`;
    leagueMessage(`本局收获 ${result.score} 赞。免登录选学校；首次提交即入榜，每局只能为一所学校上分。`);
    leagueRenderPicker(); leagueRenderMini(); await leagueFetchBoards();
    if (roundId === leagueActiveId) leagueRenderMini();
  } catch (err) { if (roundId === leagueActiveId) leagueMessage(err.message, true); }
});
leagueGet('school-submit').addEventListener('click', async () => {
  if (!leagueSchool || !leagueResult || leagueBusy || leagueReceipt) return;
  const roundId = leagueActiveId, schoolId = leagueSchool, result = leagueResult, ticketPromise = leagueTicketPromise;
  leagueBusy = true; leagueRenderPicker(); leagueMessage('正在把快乐送回母校…');
  try {
    const ticket = await ticketPromise; if (roundId !== leagueActiveId) return;
    const receipt = await leagueAdapter.submit({ schoolId, result, ticket });
    if (roundId !== leagueActiveId) return;
    leagueReceipt = receipt;
    try { await leagueFetchBoards(); } catch { /* Successful receipt survives a refresh failure. */ }
    if (roundId !== leagueActiveId) return;
    const name = leagueData.catalog.schools.find(s => s.id === receipt.schoolId).name;
    leagueMessage(`${receipt.firstEntry ? '母校首次入榜！' : ''}已为 ${name} 累加 ${receipt.points} 赞，累计第 ${receipt.totalRank} 名。${receipt.newRecord ? '你创造了学校单局纪录！' : `校内单局纪录仍为 ${receipt.bestHeat} 赞。`}单局榜第 ${receipt.bestRank} 名。`);
    leagueGet('school-submit').textContent = '本局已上分 ✓'; leagueGet('school-share').disabled = false; leagueRenderMini();
  } catch (e) { if (roundId === leagueActiveId) leagueMessage(e.message, true); }
  finally { leagueBusy = false; leagueRenderPicker(); }
});
leagueGet('school-share').addEventListener('click', async () => {
  if (!leagueReceipt) return;
  const school = leagueData.catalog.schools.find(s => s.id === leagueReceipt.schoolId), r = leagueReceipt;
  const scope = leagueData.config.storageMode === 'local' ? '本机练习榜' : '校园联赛';
  const url = /^https?:$/.test(location.protocol) ? `${location.origin}${location.pathname}` : '';
  const message = `我在《此处禁止摆龙》代表${school.name}拿下 ${r.points} 赞！${scope}：累计第 ${r.totalRank} 名，单局第 ${r.bestRank} 名（校纪录 ${r.bestHeat} 赞）。${r.newRecord ? '这局刷新了学校纪录！' : ''}你来给母校撑场吗？${url ? '\n' + url : ''}`;
  try { await navigator.clipboard.writeText(message); leagueMessage('战报已复制，发给同学一起给母校上分！'); }
  catch {
    let area = leagueGet('school-share-text');
    if (!area) { area = leagueElement('textarea', 'school-share-text'); area.id = 'school-share-text'; area.readOnly = true; area.setAttribute('aria-label', '可复制的战报'); panel.append(area); }
    area.value = message; area.focus(); area.select(); leagueMessage('长按或按 Ctrl/Cmd+C 复制战报。');
  }
});
