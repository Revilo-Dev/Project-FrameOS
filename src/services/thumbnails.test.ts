import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ThumbnailService, validThumbnailRecord } from './thumbnails';
import { nativeThumbnailUri, tizenThumbnailProvider } from '../platform/TizenThumbnails';
import { BoundedMediaCache, type CacheBackend } from './mediaCache';
import { video } from '../../tests/mediaFixture';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const signal = () => new AbortController().signal;
describe('bounded lazy thumbnail metadata', () => {
  it('uses documented native thumbnail creation only for an indexed file and handles unsupported/denied capabilities', async () => {
    class AttributeFilter {}
    const entry = video(); let creations = 0, denied = false, indexed = true;
    const runtime = { tizen: { AttributeFilter, content: {
      find(success: (items: unknown[]) => void) { success(indexed ? [{ contentURI: entry.uri, thumbnailURIs: [] }] : []); },
      createThumbnail(_content: unknown, success: (path: string) => void, failure: (error: unknown) => void) { creations++; if (denied) failure({ name: 'SecurityError' }); else success('/home/owner/thumb with space.jpg'); },
    } } };
    assert.equal(await tizenThumbnailProvider(runtime, true)!(entry), 'file:///home/owner/thumb%20with%20space.jpg');
    assert.equal(creations, 1); indexed = false; assert.equal(await tizenThumbnailProvider(runtime, true)!(entry), null); assert.equal(creations, 1);
    indexed = true; denied = true; const blocked = tizenThumbnailProvider(runtime, true)!;
    await blocked(entry); await blocked(entry); assert.equal(creations, 2);
    assert.equal(nativeThumbnailUri('/home/../escape.jpg'), null);
    assert.equal(nativeThumbnailUri('https://example.com/thumb.jpg'), null);
  });
  it('does no work at construction, caches URI-only hits/misses and tolerates quota errors', async () => {
    let calls = 0, persisted = ''; const storage = { getItem: () => persisted, setItem: (_key: string, value: string) => { persisted = value; } };
    let records: Awaited<ReturnType<CacheBackend['read']>> = [];
    const backend: CacheBackend = { read: async () => records, write: async value => { records = JSON.parse(JSON.stringify(value)); } };
    const persistent = () => new BoundedMediaCache(backend, 256, 8 * 1024 * 1024, validThumbnailRecord);
    const cache = new ThumbnailService(async () => { calls++; return 'file:///thumb/preview.jpg'; }, storage, Date.now, persistent());
    assert.equal(calls, 0); assert.equal(await cache.get(video(), signal()), 'file:///thumb/preview.jpg');
    assert.equal(await cache.get(video(), signal()), 'file:///thumb/preview.jpg'); assert.equal(calls, 1);
    assert(!persisted.includes('base64')); await tick(); const restored = new ThumbnailService(async () => { throw Error('should be cached'); }, storage, Date.now, persistent());
    assert.equal(await restored.get(video(), signal()), 'file:///thumb/preview.jpg');
    let misses = 0; const noImage = new ThumbnailService(async () => { misses++; throw Error('Unsupported video'); }, { ...storage, setItem() { throw Error('quota'); } });
    assert.equal(await noImage.get(video('bad.mp4'), signal()), null); assert.equal(await noImage.get(video('bad.mp4'), signal()), null); assert.equal(misses, 1);
    assert.equal(await new ThumbnailService().get(video(), signal()), null);
    cache.dispose(); restored.dispose(); noImage.dispose();
  });
  it('has at most one uncancellable native call; aborting a view cannot start extra work', async () => {
    let started = 0; const callbacks: ((value: string | null) => void)[] = [];
    const cache = new ThumbnailService(() => { started++; return new Promise(resolve => callbacks.push(resolve)); });
    const abort = new AbortController(); const pending = [cache.get(video('one.mp4'), abort.signal), cache.get(video('two.mp4'), abort.signal), cache.get(video('three.mp4'), signal())];
    await tick(); assert.equal(started, 1); abort.abort(); await tick(); assert.equal(started, 1);
    callbacks[0]('file:///thumb/a.jpg'); await tick(); assert.equal(started, 2);
    callbacks[1](null); assert.deepEqual(await Promise.all(pending), [null, null, null]); cache.dispose();
  });
  it('cancels queued work, bounds the queue and ignores obsolete results after USB removal/disposal', async () => {
    const callbacks: ((value: string | null) => void)[] = []; let calls = 0;
    const cache = new ThumbnailService(() => { calls++; return new Promise(resolve => callbacks.push(resolve)); });
    const pending = Array.from({ length: 40 }, (_, i) => cache.get(video(`${i}.mp4`), signal()));
    await tick(); assert.equal(calls, 1); cache.invalidate('usb-a');
    callbacks[0]('file:///thumb/a.jpg');
    assert((await Promise.all(pending)).every(value => value === null));
    const next = cache.get(video('0.mp4'), signal()); await tick(); assert.equal(calls, 2);
    cache.dispose(); callbacks[1]('file:///thumb/a.jpg'); assert.equal(await next, null);
  });
  it('queries only existing indexed metadata with exact file URI and read-only content.find', async () => {
    const entry = video(); let calls = 0;
    class AttributeFilter { constructor(public field: string, public match: string, public value: string) {} }
    const provider = tizenThumbnailProvider({ tizen: { AttributeFilter, content: { find(success: (items: unknown[]) => void, _error: unknown, directory: unknown, filter: AttributeFilter, sort: unknown, count: number, offset: number) {
      calls++; assert.equal(directory, null); assert.equal(sort, null); assert.equal(count, 1); assert.equal(offset, 0);
      assert.deepEqual(filter, new AttributeFilter('contentURI', 'EXACTLY', entry.uri!));
      success([Object.create({ get contentURI() { return entry.uri; }, get thumbnailURIs() { return ['file:///thumb/indexed.jpg']; } })]);
    } } } })!;
    assert.equal(await provider(entry), 'file:///thumb/indexed.jpg'); assert.equal(calls, 1);
    assert.equal(tizenThumbnailProvider({ tizen: {} }), undefined);
    const denied = tizenThumbnailProvider({ tizen: { AttributeFilter, content: { find(_done: unknown, error: (failure: unknown) => void) { error({ name: 'SecurityError' }); } } } })!;
    assert.equal(await denied(entry), null); assert.equal(await denied(entry), null);
  });
});
