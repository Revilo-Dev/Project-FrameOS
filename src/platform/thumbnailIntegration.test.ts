import { it } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackThumbnailProvider, matchingImportedImage } from './thumbnailFallbacks';
import { ThumbnailDiagnostics } from './ThumbnailDiagnostics';
import { ThumbnailService, validThumbnailRecord } from '../services/thumbnails';
import { BoundedMediaCache, type CacheBackend } from '../services/mediaCache';
import { video } from '../../tests/mediaFixture';
import { manifestBucket } from '../services/thumbnailManifest.mjs';

const image = '.frameos-thumbnails/0123456789abcdef01234567.jpg';
const signal = () => new AbortController().signal;
function fixture() {
  const entry = video('Episode 1 Unicode é.mkv'), reads: string[] = [];
  let validImage = true, finds = 0, captures = 0;
  const diagnostics = new ThumbnailDiagnostics();
  class AttributeFilter {}
  const provider = fallbackThumbnailProvider({ tizen: { AttributeFilter, content: {
    find(done: (items: unknown[]) => void) { finds++; done([{ contentURI: entry.uri, thumbnailURIs: ['file:///native.jpg'] }]); },
  }, filesystem: {
    resolve(path: string, done: (file: unknown) => void, fail: (error: unknown) => void, mode: string) {
      assert.equal(mode, 'r'); reads.push(path);
      if (path.endsWith('.json')) {
        const text = JSON.stringify({ version: 1, files: { [entry.name]: { image, relativePath: entry.name, size: entry.size, modified: entry.modified } } });
        done({ isDirectory: false, fileSize: text.length, readAsText: (callback: (text: string) => void) => callback(text) });
      } else if (path.endsWith(image)) done({ isDirectory: false, toURI: () => 'file:///usb/snapshot.jpg' });
      else fail({ name: 'NotFoundError' });
    },
  } } }, { diagnostics, resolveFile: async entry => entry, validate: async uri => uri === 'file:///usb/snapshot.jpg' && !validImage ? null : uri, capture: async () => { captures++; return null; } });
  return { entry, provider, reads, diagnostics, breakImage() { validImage = false; }, get finds() { return finds; }, get captures() { return captures; } };
}
it('prefers a decoded USB import to native extraction, reads its manifest once, and falls through when the image fails', async () => {
  const f = fixture();
  assert.equal(await f.provider(f.entry, signal()), 'file:///usb/snapshot.jpg');
  assert.equal(f.finds, 0); assert.equal(f.captures, 0);
  assert.equal(f.diagnostics.get(f.entry).source, 'Pre-generated USB image');
  await f.provider(f.entry, signal());
  assert.equal(f.reads.filter(path => path.endsWith('.json')).length, 1);
  f.breakImage();
  assert.equal(await f.provider(f.entry, signal()), 'file:///native.jpg');
  assert.equal(f.finds, 1); assert.equal(f.captures, 0);
});
it('matches nested relative identity despite drive mount changes and rejects stale/unsafe imports', () => {
  const entry = video('Episode 1.mkv');
  const item = { image, size: entry.size, modified: entry.modified, relativePath: entry.name };
  assert(matchingImportedImage(item, { ...entry, storageId: 'removable_sdz1', path: 'removable_sdz1/Series/Episode 1.mkv' }));
  for (const invalid of [{ ...item, size: 1 }, { ...item, relativePath: 'Other/Episode 1.mkv' }, { ...item, image: '../escape.jpg' }, { ...item, modified: NaN }]) assert.equal(matchingImportedImage(invalid, entry), false);
});
it('USB reconnect invalidates persistent negative results as well as the manifest cache', async () => {
  let records: Awaited<ReturnType<CacheBackend['read']>> = [], available = false, calls = 0;
  const backend: CacheBackend = { read: async () => records, write: async next => { records = structuredClone(next); } };
  const persistent = () => new BoundedMediaCache(backend, 20, 100000, validThumbnailRecord);
  const provider = async () => { calls++; return available ? 'file:///fresh.jpg' : null; };
  const first = new ThumbnailService(provider, undefined, Date.now, persistent());
  const entry = video();
  assert.equal(await first.get(entry, signal()), null);
  available = true; first.invalidate(entry.storageId);
  assert.equal(await first.get(entry, signal()), 'file:///fresh.jpg');
  const restarted = new ThumbnailService(provider, undefined, Date.now, persistent());
  assert.equal(await restarted.get(entry, signal()), 'file:///fresh.jpg');
  assert.equal(calls, 2); first.dispose(); restarted.dispose();
});
it('a focused item moves ahead of nearby work while retaining one extraction slot', async () => {
  const started: string[] = [], completions: (() => void)[] = [];
  const service = new ThumbnailService(async entry => { started.push(entry.name); await new Promise<void>(resolve => completions.push(resolve)); return null; });
  const entries = ['first.mp4', 'near.mp4', 'focused.mkv'].map(name => video(name));
  const pending = entries.map(entry => service.get(entry, signal()));
  service.prioritize(entries[2]); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(started, ['first.mp4']); completions.shift()!(); await pending[0];
  await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(started, ['first.mp4', 'focused.mkv']);
  completions.shift()!(); await pending[2]; await new Promise(resolve => setTimeout(resolve, 0));
  completions.shift()!(); await pending[1]; service.dispose();
});

it('reads only the selected shard in a large imported folder and caches index/shard metadata', async () => {
  const entry = video('Episode é 1000.mkv'), reads: string[] = [];
  const shard = `.frameos-thumbnails/manifest-${manifestBucket(entry.name)}.json`;
  const provider = fallbackThumbnailProvider({ tizen: { filesystem: {
    resolve(path: string, done: (value: unknown) => void, fail: (error: unknown) => void, mode: string) {
      assert.equal(mode, 'r'); reads.push(path);
      if (path.endsWith('.json')) {
        const value = path.endsWith(shard) ? { version: 1, files: { [entry.name]: { image, relativePath: entry.name, size: entry.size } } } : { version: 2, buckets: 256, algorithm: 'name31-utf16-v1' };
        const text = JSON.stringify(value);
        done({ isDirectory: false, fileSize: text.length, readAsText: (callback: (text: string) => void) => callback(text) });
      } else if (path.endsWith(image)) done({ isDirectory: false, toURI: () => 'file:///snapshot.jpg' });
      else fail({ name: 'NotFoundError' });
    },
  } } }, { validate: async uri => uri });
  assert.equal(await provider(entry, signal()), 'file:///snapshot.jpg');
  assert.equal(await provider(entry, signal()), 'file:///snapshot.jpg');
  assert.deepEqual(reads.filter(path => path.endsWith('.json')), [`${entry.parentPath}/.frameos-thumbnails.json`, `${entry.parentPath}/${shard}`]);
});
