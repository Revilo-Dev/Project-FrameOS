import { it } from 'node:test';
import assert from 'node:assert/strict';
import { ThumbnailDiagnostics } from './ThumbnailDiagnostics';
import { tizenThumbnailProvider } from './TizenThumbnails';
import { ThumbnailService, thumbnailIdentity, validThumbnailRecord } from '../services/thumbnails';
import { BoundedMediaCache } from '../services/mediaCache';
import { video } from '../../tests/mediaFixture';
import { htmlVideoSnapshot } from './videoSnapshot';

it('matches the native absolute content path, rejects another drive and tries every indexed thumbnail before creation', async () => {
  const entry = video(), diagnostics = new ThumbnailDiagnostics(); let creates = 0;
  class AttributeFilter { constructor(public field: string, public match: string, public value: string) {} }
  const provider = tizenThumbnailProvider({ tizen: { AttributeFilter, content: {
    find(done: (items: unknown[]) => void, _error: unknown, _dir: unknown, filter: AttributeFilter) {
      done(filter.value.startsWith('file:') ? [] : [{ contentURI: '/media/other-drive/Episode 1.MKV', thumbnailURIs: ['file:///wrong.jpg'] }, { contentURI: '/media/usb-a/Series/Episode 1.MKV', thumbnailURIs: ['/missing.jpg', '/good.jpg'] }]);
    },
    createThumbnail() { creates++; },
  } } }, true, { diagnostics, validate: async uri => uri === 'file:///good.jpg' ? uri : null })!;
  assert.equal(await provider(entry), 'file:///good.jpg'); assert.equal(creates, 0);
  assert.equal(diagnostics.get(entry).indexed, 'Matched exact USB path');
  assert(diagnostics.get(entry).attempts.some(attempt => attempt.error.includes('ImageLoadError')));
});
it('performs read-only matching before checking existing write permission and never scans USB', async () => {
  const entry = video(), diagnostics = new ThumbnailDiagnostics(); let permission = 0, creates = 0, scans = 0;
  class AttributeFilter {}
  const provider = tizenThumbnailProvider({ tizen: { AttributeFilter, content: {
    find(done: (items: unknown[]) => void) { assert.equal(permission, 0); done([{ contentURI: entry.uri }]); },
    createThumbnail() { creates++; }, scanDirectory() { scans++; },
  } } }, async () => { permission++; return false; }, { diagnostics })!;
  assert.equal(await provider(entry), null); assert.equal(permission, 1); assert.equal(creates, 0); assert.equal(scans, 0);
  assert.match(diagnostics.get(entry).lastError, /PrivilegeMissing/);
});
it('retries a legacy negative cache entry and keeps precise failure evidence until Retry bypasses it', async () => {
  const entry = video(), cache = new BoundedMediaCache(undefined, 256, 100000, validThumbnailRecord);
  await cache.put(thumbnailIdentity(entry), { key: thumbnailIdentity(entry), storage: entry.storageId, uri: null, until: Date.now() + 60000 });
  let calls = 0;
  const service = new ThumbnailService(async () => { calls++; if (calls === 1) throw new Error('Decoder failure'); return 'file:///real.jpg'; }, undefined, Date.now, cache);
  const signal = () => new AbortController().signal;
  assert.equal(await service.get(entry, signal()), null); assert.equal(calls, 1);
  assert.match(service.diagnostics.get(entry).lastError, /Decoder failure/);
  await service.get(entry, signal()); assert.equal(calls, 1);
  assert.equal(await service.retry(entry, signal()), 'file:///real.jpg'); assert.equal(calls, 2);
  assert.equal(service.diagnostics.get(entry).lastError, '');
  service.rendering(entry, false); assert.match(service.diagnostics.get(entry).lastError, /ImageLoadError/);
});
it('bounds diagnostic records and attempts', () => {
  const diagnostics = new ThumbnailDiagnostics();
  for (let index = 0; index < 100; index++) diagnostics.attempt(video(`${index}.mp4`), 'test');
  const entry = video('99.mp4'); for (let index = 0; index < 100; index++) diagnostics.attempt(entry, 'test');
  assert.equal(diagnostics.get(entry).attempts.length, 16); assert.equal(diagnostics.get(video('0.mp4')).attempts.length, 0);
});

it('bounds exact index queries and matches native fullPath aliases without trusting a filename alone', async () => {
  const entry = { ...video(), nativePath: '/opt/storage/USB/Series/Episode 1.MKV' };
  class AttributeFilter { constructor(public field: string, public match: string, public value: string) {} }
  const queries: AttributeFilter[] = [];
  const provider = tizenThumbnailProvider({ tizen: { AttributeFilter, content: {
    find(done: (items: unknown[]) => void, _error: unknown, _dir: unknown, filter: AttributeFilter) {
      queries.push(filter);
      done(filter.field === 'name' ? [{ contentURI: 'file:///opt/storage/USB/Series/Episode%201.MKV', thumbnailURIs: ['/alias.jpg'] }] : []);
    },
  } } })!;
  assert.equal(await provider(entry), 'file:///alias.jpg');
  assert.equal(queries.length, 4);
  assert(queries.every(query => query.match === 'EXACTLY'));
  assert.deepEqual(queries.map(query => query.field), ['contentURI', 'contentURI', 'contentURI', 'name']);
});

it('Retry supersedes active extraction and waits for its slot without restoring the old outcome', async () => {
  const entry = video(), callbacks: ((uri: string | null) => void)[] = [];
  let calls = 0;
  const service = new ThumbnailService(() => { calls++; return new Promise(resolve => callbacks.push(resolve)); });
  const pending = service.get(entry, new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 0));
  const retried = service.retry(entry, new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  callbacks[0]('file:///obsolete.jpg'); assert.equal(await pending, null);
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(calls, 2);
  callbacks[1]('file:///fresh.jpg'); assert.equal(await retried, 'file:///fresh.jpg');
  assert.equal(await service.get(entry, new AbortController().signal), 'file:///fresh.jpg');
  service.dispose();
});

it('HTML extraction waits for decoded data after seeked and releases the decoder after capture', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let draws = 0, released = false, loads = 0;
  const media = {
    canPlayType: () => 'probably', muted: false, preload: '', style: { cssText: '' },
    duration: 100, videoWidth: 720, videoHeight: 404, currentTime: 0, readyState: 1,
    setAttribute() {}, removeAttribute() { released = true; }, pause() {}, load() { loads++; }, remove() {},
    onloadedmetadata: null as (() => void) | null, onseeked: null as (() => void) | null,
    onloadeddata: null as (() => void) | null, oncanplay: null as (() => void) | null, onerror: null,
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body: { appendChild() {} }, createElement: (tag: string) => tag === 'video' ? media : {
      getContext: () => ({ drawImage() { draws++; }, getImageData: () => ({ data: [255, 255, 255, 255] }) }),
      toDataURL: () => 'data:image/jpeg;base64,AAAA',
    },
  } });
  try {
    const pending = htmlVideoSnapshot({ ...video(), extension: 'mp4' });
    media.onloadedmetadata!(); assert.equal(media.currentTime, 15);
    media.onseeked!(); assert.equal(draws, 0); assert.equal(released, false);
    media.readyState = 2; media.onloadeddata!();
    assert.equal(await pending, 'data:image/jpeg;base64,AAAA');
    assert.equal(draws, 1); assert.equal(released, true); assert.equal(loads, 2); assert.equal(media.onseeked, null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document');
  }
});
