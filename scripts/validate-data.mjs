import { readFileSync } from 'node:fs';
import { validateLeagueData } from '../dist/league-core.js';
const read = name => JSON.parse(readFileSync(new URL(`../dist/data/${name}`, import.meta.url), 'utf8'));
const data = validateLeagueData(read('schools.json'), read('league-config.json'));
console.log(`School directory valid: ${data.catalog.schools.length} selectable schools; two leaderboards start empty; no social seed.`);
