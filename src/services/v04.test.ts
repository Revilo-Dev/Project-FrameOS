import { it } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedMediaCache, type CacheBackend } from './mediaCache';
import { createMediaService, validDirectoryRecord, type DirectoryRecord } from './media';
import { video } from '../../tests/mediaFixture';
import type { MediaAdapter } from '../types/media';
import { ThumbnailService, safeThumbnail, validThumbnailRecord } from './thumbnails';
import { canSnapshot, htmlVideoSnapshot, snapshotOffset } from '../platform/videoSnapshot';
import { validManifestImage } from '../platform/thumbnailFallbacks';
import { defaultMediaPreferences, loadMediaPreferences, saveMediaPreferences, isMediaHidden } from './mediaPreferences';
import { watchLifecycle } from './lifecycle';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function memoryBackend() {
  let records: Awaited<ReturnType<CacheBackend['read']>> = [];
  return { read: async () => structuredClone(records), write: async (value: typeof records) => { records = structuredClone(value); } };
}
it('persists a bounded LRU, rejects corrupt/future records, and tolerates read/write/quota failures', async () => {
  const backend = memoryBackend();
  const valid = (value: unknown): value is string => typeof value === 'string';
  const cache = new BoundedMediaCache(backend, 2, 1000, valid);
  await cache.put('a', 'a'); await new Promise(resolve => setTimeout(resolve, 2)); await cache.put('b', 'b');
  await new Promise(resolve => setTimeout(resolve, 2)); await cache.get('a'); await cache.put('c', 'c');
  const restored = new BoundedMediaCache(backend, 2, 1000, valid);
  assert.equal(await restored.get('b'), undefined); assert.equal(await restored.get('a'), 'a');
  await restored.put('huge', 'x'.repeat(1001)); assert.equal(await restored.get('huge'), undefined);
  await restored.clear(); assert.equal(await new BoundedMediaCache(backend, 2, 1000, valid).get('a'), undefined);
  const broken = new BoundedMediaCache({ read: async () => { throw Error('corrupt'); }, write: async () => { throw Error('quota'); } }, 2, 1000, valid);
  await broken.put('a', 'kept in memory'); assert.equal(await broken.get('a'), 'kept in memory');
  assert.equal(validDirectoryRecord({ schema: 2, entries: [] }), false);
});
it('restores visited directories then reconciles deleted/modified files, with separate drive identities', async () => {
  const backend = memoryBackend(), cache = () => new BoundedMediaCache(backend, 128, 8 * 1024 * 1024, validDirectoryRecord);
  let files = [video(), video('Episode 2.mp4')], reads = 0;
  const adapter: MediaAdapter = { kind: 'mock', available: true, listStorages: async () => [], listDirectory: async () => { reads++; return files; }, subscribeStorageChanges: () => () => {} };
  const drive = { id: 'usb-a', label: 'USB A', rootPath: 'usb-a' };
  const first = createMediaService(adapter, { persistent: cache() }); await first.listDirectory(drive, 'usb-a/Series'); await tick();
  const second = createMediaService(adapter, { persistent: cache() });
  assert.equal((await second.cachedDirectory(drive, 'usb-a/Series'))?.length, 2); assert.equal(reads, 1);
  files = [{ ...video(), size: 999, modified: 123 }]; await second.listDirectory(drive, 'usb-a/Series'); await tick();
  assert.equal((await second.cachedDirectory(drive, 'usb-a/Series'))?.[0].size, 999);
  assert.equal((await second.cachedDirectory(drive, 'usb-a/Series'))?.length, 1);
  assert.equal(await second.cachedDirectory({ ...drive, id: 'usb-b', rootPath: 'usb-b' }, 'usb-b/Series'), undefined);
  assert.equal(reads, 2); // No recursive scan.
  await second.clearCache(); assert.equal(await second.cachedDirectory(drive, 'usb-a/Series'), undefined);
});
it('rejects corrupt cached directory paths before exposing them', async () => {
  const cache = new BoundedMediaCache<DirectoryRecord>(undefined, 128, 1024 * 1024, validDirectoryRecord);
  await cache.put(JSON.stringify(['usb-a', '/Series']), { schema: 1, drive: 'usb-a', relativePath: '/Series', entries: [{ ...video(), path: 'usb-a/../escape.mp4' }], updated: 1 });
  const adapter: MediaAdapter = { kind: 'mock', available: true, listStorages: async () => [], listDirectory: async () => [], subscribeStorageChanges: () => () => {} };
  assert.equal(await createMediaService(adapter, { persistent: cache }).cachedDirectory({ id: 'usb-a', label: 'A', rootPath: 'usb-a' }, 'usb-a/Series'), undefined);
});
it('pauses thumbnail extraction, cancels on USB removal, and invalidates size/mtime cache keys', async () => {
  let calls = 0;
  const backend = memoryBackend();
  const cache = new ThumbnailService(async (_entry, signal) => { calls++; if (calls > 1) return 'file:///thumb/new.jpg'; return new Promise(resolve => signal!.addEventListener('abort', () => resolve(null), { once: true })); }, undefined, Date.now, new BoundedMediaCache(backend, 256, 100000, validThumbnailRecord));
  cache.setPaused(true); const pending = cache.get(video(), new AbortController().signal); await tick(); assert.equal(calls, 0);
  cache.setPaused(false); await tick(); cache.invalidate('usb-a'); assert.equal(await pending, null);
  assert.equal(await cache.get({ ...video(), modified: 99 }, new AbortController().signal), 'file:///thumb/new.jpg');
  assert.equal(calls, 2); cache.dispose();
  assert.equal(safeThumbnail('https://example.com/stock.jpg'), null);
  assert.equal(validManifestImage('../escape.jpg'), false); assert.equal(validManifestImage('.frameos-thumbnails/0123456789abcdef01234567.jpg'), true);
});
it('detects HTML video capability and uses short-file offsets without native-surface capture', async () => {
  assert.equal(canSnapshot({ canPlayType: () => '' }, 'mkv'), false);
  assert.equal(canSnapshot({ canPlayType: () => 'maybe' }, 'mp4'), true);
  assert.equal(canSnapshot({ canPlayType: () => 'probably' }, 'exe'), false);
  assert.equal(snapshotOffset(600), 15); assert.equal(snapshotOffset(5), 1); assert.equal(snapshotOffset(Infinity), 0);
  assert.equal(await htmlVideoSnapshot({ ...video(), uri: 'https://invalid.example/video.mp4' }), null);
  assert.equal(await htmlVideoSnapshot(video(), AbortSignal.abort()), null);
});
it('migrates autoplay default ON, persists OFF, and keeps hidden preferences independently of disposable caches', () => {
  let json = JSON.stringify({ version: 1, hidden: [JSON.stringify(['usb-a', 'Series'])], showHidden: false });
  const storage = { getItem: () => json, setItem: (_key: string, value: string) => { json = value; } };
  const old = loadMediaPreferences(storage); assert.equal(old.autoplayNext, true);
  assert.equal(saveMediaPreferences(storage, { ...old, autoplayNext: false }), true);
  assert.equal(loadMediaPreferences(storage).autoplayNext, false); assert.deepEqual(loadMediaPreferences(storage).hidden, old.hidden);
  assert.equal(defaultMediaPreferences().autoplayNext, true); assert.equal(isMediaHidden(video('.private.mp4'), new Set()), true);
});
it('captures an actual HTML-video frame, rejects blank/tainted readback, and releases the decoder', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let blank = false, tainted = false, drawn = 0, released = 0;
  const video = {
    canPlayType: () => 'probably', style: {}, muted: false, preload: '', src: '', duration: 5, videoWidth: 640, videoHeight: 360, readyState: 2,
    onloadedmetadata: null as (() => void) | null, onseeked: null as (() => void) | null, onerror: null as (() => void) | null,
    setAttribute() {}, removeAttribute() { this.src = ''; }, pause() {}, remove() { released++; },
    load() { if (this.src) queueMicrotask(() => this.onloadedmetadata?.()); },
    set currentTime(value: number) { assert.equal(value, 1); queueMicrotask(() => this.onseeked?.()); },
  };
  const context = { drawImage(source: unknown) { assert.equal(source, video); drawn++; if (tainted) throw Error('SecurityError'); }, getImageData: () => ({ data: new Uint8ClampedArray(blank ? [0,0,0,255] : [100,100,100,255]) }) };
  const document = { body: { appendChild() {} }, createElement: (name: string) => name === 'video' ? video : { width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/jpeg;base64,aGVsbG8=' } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  try {
    assert.match((await htmlVideoSnapshot(videoEntry()))!, /^data:image\/jpeg/);
    blank = true; assert.equal(await htmlVideoSnapshot(videoEntry()), null);
    blank = false; tainted = true; assert.equal(await htmlVideoSnapshot(videoEntry()), null);
    assert.equal(drawn, 3); assert.equal(released, 3);
  } finally { if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document'); }
  function videoEntry() { return { ...videoFixture(), extension: 'mp4' }; }
  function videoFixture() { return { id: 'usb/test.mp4', name: 'test.mp4', path: 'usb/test.mp4', parentPath: 'usb', storageId: 'usb', type: 'video' as const, isDirectory: false, uri: 'file:///media/usb/test.mp4' }; }
});
it('restores only OS-delivered visibility/pageshow events and removes lifecycle listeners', () => {
  const document = Object.assign(new EventTarget(), { hidden: true }), window = new EventTarget(); let resume = 0, suspend = 0;
  const stop = watchLifecycle(document, window, () => resume++, () => suspend++);
  window.dispatchEvent(new Event('pageshow')); assert.equal(resume, 0);
  document.dispatchEvent(new Event('visibilitychange')); assert.equal(suspend, 1);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); assert.equal(resume, 2);
  stop(); window.dispatchEvent(new Event('pageshow')); assert.equal(resume, 2);
});
