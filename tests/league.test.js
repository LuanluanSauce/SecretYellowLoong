import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalLeague, RemoteLeague, calculatePoints, rankStandings, aggregateRegions, searchSchools, validateLeagueData } from '../dist/league-core.js';
const read = name => JSON.parse(readFileSync(new URL(`../dist/data/${name}`, import.meta.url), 'utf8'));
const data = validateLeagueData(read('schools.json'), read('league-config.json'));
const result = score => ({ mode: 'normal', score, survived: 180, losses: 0, relocations: 4, won: score >= 24 });
const memory = () => { const map = new Map(); return { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) }; };
const submit = async (league, roundId, schoolId, score) => league.submit({ schoolId, result: result(score), ticket: await league.startRound({ roundId, mode: 'normal' }) });

test('directory remains searchable while both participation boards start empty', async () => {
  assert.equal(data.catalog.schools.length, 560);
  assert.deepEqual(Object.fromEntries(Object.entries(data.catalog.countries)), {
    CN: '中国', HK: '中国香港', SG: '新加坡', US: '美国', CA: '加拿大', JP: '日本', AU: '澳大利亚', GB: '英国',
  });
  assert.equal(searchSchools(data.catalog.schools, 'UCL', 'GB').some(s => s.englishName === 'University College London'), true);
  assert.equal(searchSchools(data.catalog.schools, '爱丁堡')[0].englishName, 'University of Edinburgh');
  assert.equal(searchSchools(data.catalog.schools, '北大', 'CN')[0].id, 'cn-pku');
  assert.equal(searchSchools(data.catalog.schools, '港大', 'HK')[0].id, 'hk-the-university-of-hong-kong');
  assert.equal(searchSchools(data.catalog.schools, 'NUS', 'SG')[0].id, 'sg-national-university-of-singapore');
  assert.equal(searchSchools(data.catalog.schools, 'MIT', 'US')[0].id, 'us-massachusetts-institute-of-technology');
  assert.equal(searchSchools(data.catalog.schools, 'UBC', 'CA')[0].id, 'ca-university-of-british-columbia-the');
  assert.equal(searchSchools(data.catalog.schools, '京大', 'JP')[0].id, 'jp-kyoto-university');
  assert.equal(searchSchools(data.catalog.schools, 'UNSW', 'AU')[0].id, 'au-unsw');
  assert.deepEqual(Object.fromEntries(['HK', 'SG', 'US', 'CA', 'JP', 'AU'].map(code => [code, searchSchools(data.catalog.schools, '', code).length])), {
    HK: 8, SG: 7, US: 69, CA: 97, JP: 85, AU: 38,
  });
  const league = new LocalLeague(data, memory());
  assert.deepEqual(await league.getStandings('total'), []); assert.deepEqual(await league.getStandings('best'), []);
  await league.startRound({ roundId: 'not-finished', mode: 'normal' });
  assert.deepEqual(await league.getStandings(), [], 'opening a round does not enter any school');
});
test('one photo equals one like with no seed or completion bonus; invalid rounds are rejected', () => {
  assert.equal(calculatePoints(result(24), data.config.rules), 24);
  assert.equal(calculatePoints({ ...result(24), mode: 'easy' }, data.config.rules), 24);
  assert.equal(calculatePoints({ ...result(5), survived: 45, losses: 3 }, data.config.rules), 5);
  assert.throws(() => calculatePoints(result(99999), data.config.rules));
  assert.throws(() => calculatePoints({ ...result(24), survived: 5 }, data.config.rules));
});
test('first submission enters both boards; repeat delivery cannot add likes twice or switch schools', async () => {
  const league = new LocalLeague(data, memory()), ticket = await league.startRound({ roundId: 'round-one', mode: 'normal' });
  const a = await league.submit({ schoolId: 'cn-pku', result: result(24), ticket });
  const b = await league.submit({ schoolId: 'cn-pku', result: result(24), ticket });
  assert.equal(a.firstEntry, true); assert.equal(a.newRecord, true); assert.equal(a.totalHeat, 24); assert.equal(a.bestHeat, 24);
  assert.equal(b.duplicate, true); assert.equal((await league.getStandings())[0].rounds, 1);
  await assert.rejects(() => league.submit({ schoolId: 'cn-tsinghua', result: result(24), ticket }));
  assert.equal((await league.getStandings()).length, 1);
});
test('lower and tied rounds only add to cumulative likes; a higher round replaces the school record', async () => {
  const league = new LocalLeague(data, memory());
  await submit(league, 'one', 'cn-pku', 24);
  const original = (await league.getStandings('best'))[0];
  assert.equal((await submit(league, 'two', 'cn-pku', 10)).newRecord, false);
  assert.equal((await submit(league, 'three', 'cn-pku', 24)).newRecord, false);
  assert.equal((await league.getStandings('best'))[0].bestAt, original.bestAt);
  assert.equal((await submit(league, 'four', 'cn-pku', 35)).newRecord, true);
  await submit(league, 'five', 'cn-tsinghua', 50);
  assert.equal((await league.getStandings('total'))[0].id, 'cn-pku');
  assert.equal((await league.getStandings('best'))[0].id, 'cn-tsinghua');
  const row = (await league.getStandings('total'))[0];
  assert.equal(row.totalHeat, 93); assert.equal(row.bestHeat, 35); assert.equal(row.rounds, 4);
});
test('zero-like completed rounds may enter a school; restarts preserve results without importing the old demo store', async () => {
  const storage = memory(); storage.setItem(`nailoong-league:${data.config.seasonId}`, JSON.stringify({ contributions: { 'cn-pku': { playerHeat: 9999, rounds: 5 } } }));
  const league = new LocalLeague(data, storage); assert.deepEqual(await league.getStandings(), []);
  await submit(league, 'zero', 'cn-pku', 0);
  const row = (await new LocalLeague(data, storage).getStandings())[0];
  assert.equal(row.totalHeat, 0); assert.equal(row.bestHeat, 0); assert.equal(row.rounds, 1);
});
test('regional totals sum school contributions while regional single-round scores take a maximum', () => {
  const schools = [{ id: 'a', name: 'A', countryCode: 'CN', mapRegionId: 'CN-11' }, { id: 'b', name: 'B', countryCode: 'CN', mapRegionId: 'CN-11' }, { id: 'c', name: 'C', countryCode: 'GB', mapRegionId: null }];
  const contributions = { a: { totalHeat: 100, bestHeat: 25, rounds: 4 }, b: { totalHeat: 50, bestHeat: 40, rounds: 2 }, c: { totalHeat: 500, bestHeat: 60, rounds: 10 } };
  const rows = rankStandings(schools, contributions);
  assert.deepEqual(aggregateRegions(rows), [{ countryCode: 'CN', mapRegionId: 'CN-11', totalHeat: 150, bestHeat: 40, rounds: 6, schools: 2 }]);
  assert.equal(searchSchools(schools, '', 'CN', 'CN-11').length, 2);
  assert.equal(rankStandings(schools, contributions, 'best')[0].id, 'c');
});
test('remote league retries one transient network failure without changing the request', async () => {
  const calls = [];
  const fetcher = async function (url, options) {
    assert.equal(this, globalThis);
    calls.push({ url, method: options.method, body: options.body });
    if (calls.length === 1) throw new TypeError('temporary network failure');
    return new Response(JSON.stringify({ roundId: 'signed-round', token: 'signed-token' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const remoteData = { ...data, config: { ...data.config, storageMode: 'remote', apiBaseUrl: '/api' } };
  const ticket = await new RemoteLeague(remoteData, 'visitor_retry_0001', fetcher).startRound({ mode: 'normal' });
  assert.deepEqual(ticket, { roundId: 'signed-round', token: 'signed-token' });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});
