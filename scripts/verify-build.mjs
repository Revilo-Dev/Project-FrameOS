import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'acorn';

const directory = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', directory), 'utf8');
assert(!html.includes('type="module"'), 'Packaged output must use classic scripts');
assert(!/\b(?:src|href)=["'](?:\/|https?:)/.test(html), 'HTML assets must be relative and offline');
assert(!html.includes('nomodule'), 'Classic-only output must run in module-capable Chrome 69');
assert(!/<script\b[^>]*\bcrossorigin/.test(html), 'Local widget scripts must not request CORS');
const scriptPaths = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
assert(scriptPaths.length >= 2, 'Expected local legacy runtime and application scripts');
let total = 0;
const styles = [];
for (const script of scriptPaths) {
  assert(script.startsWith('./'), `Non-relative asset: ${script}`);
  const source = await readFile(new URL(script, directory), 'utf8');
  // Chrome 66+ supports optional catch bindings (ES2019); ES2020 syntax is rejected.
  const ast = parse(source, { ecmaVersion: 2019, sourceType: 'script' });
  // Vite embeds the stylesheet in its classic SystemJS chunk. Inspect the actual
  // emitted CSS string, rather than silently checking an empty list of CSS files.
  const nodes = [ast];
  while (nodes.length) {
    const node = nodes.pop();
    if (node.type === 'Literal' && typeof node.value === 'string' && node.value.includes('.frameos')) styles.push(node.value);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) nodes.push(...value.filter((child) => child && typeof child.type === 'string'));
      else if (value && typeof value === 'object' && typeof value.type === 'string') nodes.push(value);
    }
  }
  total += Buffer.byteLength(source);
}
const wallpapers = JSON.parse(await readFile(new URL('../src/services/wallpaper-catalog.json', import.meta.url), 'utf8'));
assert(wallpapers.length > 0 && new Set(wallpapers.map(item => item.id)).size === wallpapers.length, 'Wallpaper catalog must contain unique entries');
for (const wallpaper of wallpapers) for (const field of ['src', 'thumbnail', 'ambient']) await stat(new URL(wallpaper[field], directory));
for (const file of ['frameos.svg', 'gallery.svg', 'settings.svg', 'yt.svg', 'fonts/LibreCaslonText-Bold.ttf', 'fonts/OFL.txt']) await stat(new URL(`assets/${file}`, directory));
const assets = await readdir(new URL('assets/', directory));
for (const file of assets.filter((name) => name.endsWith('.css'))) {
  styles.push(await readFile(new URL(join('assets', file), directory), 'utf8'));
}
assert(styles.length > 0, 'Expected emitted application styles');
for (const css of styles) {
  assert(!/backdrop-filter|color-mix\(|\boklch\(|\binset:|\bgap:/.test(css), 'CSS uses features unsupported by the TV target');
}
console.log(`Build verified: relative classic scripts, ES2019 syntax, offline wallpapers, Chrome 69 CSS. JS: ${(total / 1024).toFixed(1)} KiB.`);
