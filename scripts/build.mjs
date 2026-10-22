import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const svg = `data:image/svg+xml;base64,${Buffer.from(read('dist/assets/nailoong.svg')).toString('base64')}`;
const engine = read('dist/engine.js').replace(/^export\s+/gm, '');
const controller = read('dist/game.js').replace(/^import\s+.*from\s+['"]\.\/engine\.js['"];?\s*$/m, '');
const code = `${engine}\n${controller}`.replaceAll('./assets/nailoong.svg', svg);
const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
if (check.status !== 0) throw new Error(check.stderr || 'Offline game script did not parse');

const styleTag = '<link rel="stylesheet" href="./style.css">';
const scriptTag = '<script type="module" src="./game.js"></script>';
let html = read('dist/index.html');
if (!html.includes(styleTag) || !html.includes(scriptTag)) throw new Error('Expected entrypoints were not found');
html = html.replace(styleTag, `<style>\n${read('dist/style.css')}\n</style>`)
  .replace(scriptTag, `<script type="module">\n${code.replaceAll('</script', '<\\/script')}\n</script>`)
  .replaceAll('./assets/nailoong.svg', svg);
if (/\b(?:src|href)=["']\.\/assets\//.test(html) || /<script[^>]*\bsrc=/.test(html) || /<link[^>]*rel="stylesheet"/.test(html)) {
  throw new Error('An offline runtime asset was not embedded');
}
writeFileSync(resolve(root, 'dist/offline.html'), html);
for (const resource of ['dist/index.html', 'dist/style.css', 'dist/game.js', 'dist/engine.js', 'dist/assets/nailoong.svg']) {
  if (!existsSync(resolve(root, resource))) throw new Error(`Missing ${resource}`);
}
console.log('Built dist/offline.html; static site and self-contained offline game are ready.');

