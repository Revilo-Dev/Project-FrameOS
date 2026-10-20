import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'acorn';
import { samsungRuntimeScript } from './samsung-runtime.mjs';

export function localPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f<>:"|?*]/.test(value)
      || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
    throw new Error(`Unsafe local asset path: ${JSON.stringify(value)}`);
  }
  return value;
}

export async function listFiles(root, prefix = '') {
  const files = [];
  for (const item of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    localPath(relative);
    const info = await lstat(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link or junction: ${relative}`);
    if (info.isDirectory()) files.push(...await listFiles(root, relative));
    else if (info.isFile()) files.push(relative);
    else throw new Error(`Unsupported filesystem entry: ${relative}`);
  }
  return files.sort();
}

function reference(value, from, { root = false } = {}) {
  value = value.trim();
  if (!value || value.startsWith('#') || value.startsWith('data:')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('/')) throw new Error(`Non-local production reference in ${from}: ${value}`);
  let decoded;
  try { decoded = decodeURIComponent(value.split(/[?#]/)[0]); } catch { throw new Error(`Invalid URL in ${from}`); }
  if (!decoded) return null;
  const relative = path.posix.normalize(path.posix.join(root ? '' : path.posix.dirname(from), decoded));
  if (relative.startsWith('../')) throw new Error(`Asset escapes production directory: ${value}`);
  return localPath(relative);
}

function cssReferences(text, from) {
  const references = [];
  for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const found = reference(match[1] ?? match[2] ?? match[3], from);
    if (found) references.push(found);
  }
  for (const match of text.matchAll(/@import\s+["']([^"']+)["']/gi)) {
    const found = reference(match[1], from);
    if (found) references.push(found);
  }
  return references;
}

export async function validateProduction(directory) {
  const available = new Set(await listFiles(directory));
  if (!available.has('index.html')) throw new Error('Production build is missing dist/index.html.');
  const pending = ['index.html'];
  const required = new Set();
  while (pending.length) {
    const relative = pending.pop();
    if (required.has(relative)) continue;
    if (!available.has(relative)) throw new Error(`Missing referenced production asset: ${relative}`);
    required.add(relative);
    const extension = path.posix.extname(relative);
    if (!['.html', '.css', '.js', '.svg'].includes(extension)) continue;
    const text = await readFile(path.join(directory, relative), 'utf8');
    if (extension === '.html' || extension === '.svg') {
      for (const match of text.matchAll(/\b(?:src|href|data-src|xlink:href)\s*=\s*["']([^"']+)["']/gi)) {
        if (relative === 'index.html' && match[1] === samsungRuntimeScript && /<script\b[^>]*$/.test(text.slice(0, match.index))) continue;
        const found = reference(match[1], relative);
        if (found) pending.push(found);
      }
      for (const match of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
        for (const entry of match[1].split(',')) {
          const found = reference(entry.trim().split(/\s+/)[0], relative);
          if (found) pending.push(found);
        }
      }
      pending.push(...cssReferences(text, relative));
    } else if (extension === '.css') pending.push(...cssReferences(text, relative));
    else {
      const nodes = [parse(text, { ecmaVersion: 2019, sourceType: 'script' })];
      const literalReferences = (value) => {
        if (typeof value !== 'string') return;
        if (/^\.\.?\//.test(value) && /\.[a-z\d]{1,8}(?:[?#].*)?$/i.test(value)) {
          const found = reference(value, relative, { root: !/\.js(?:[?#]|$)/.test(value) });
          if (found) pending.push(found);
        }
      };
      while (nodes.length) {
        const node = nodes.pop();
        // Vite resolves public font URLs against the SystemJS chunk's meta.url.
        // These are real runtime assets even when the URL lacks a './' prefix.
        if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL'
            && node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string'
            && node.arguments[1]?.type === 'MemberExpression' && node.arguments[1].property.name === 'url'
            && node.arguments[1].object?.type === 'MemberExpression' && node.arguments[1].object.property.name === 'meta') {
          const found = reference(node.arguments[0].value, relative);
          if (found) pending.push(found);
        }
        if (node.type === 'Literal' && typeof node.value === 'string') {
          const value = node.value;
          literalReferences(value);
          // Large imported JSON catalogs are emitted as JSON.parse('...').
          // Inspect their data as well; otherwise every wallpaper is omitted.
          if (/^\s*[\[{]/.test(value)) {
            let json;
            try { json = JSON.parse(value); } catch { /* Not a JSON data literal. */ }
            const values = [json];
            while (values.length) {
              const item = values.pop();
              if (item && typeof item === 'object') values.push(...Object.values(item));
              else literalReferences(item);
            }
          }
          if (value.includes('url(') || value.includes('@import')) pending.push(...cssReferences(value, 'index.html'));
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) nodes.push(...value.filter((child) => child && typeof child.type === 'string'));
          else if (value && typeof value === 'object' && typeof value.type === 'string') nodes.push(value);
        }
      }
    }
  }
  return [...required].sort();
}
