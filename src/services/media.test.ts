import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMedia, createMediaService, mediaExtension } from './media';
import type { MediaAdapter, MediaEntry, MediaStorageChange } from '../types/media';

const drive = { id: 'usb', label: 'USB', rootPath: 'usb' };
function fixture() {
  let calls = 0;
  let subscriptions = 0;
  let cleanups = 0;
  let change: ((change: MediaStorageChange) => void) | undefined;
  const adapter: MediaAdapter = {
    kind: 'tizen', available: true,
    async listStorages() { return [drive]; },
    async listDirectory() { calls++; return []; },
    subscribeStorageChanges(listener) { subscriptions++; change = listener; return () => { cleanups++; }; },
  };
  return { adapter, emit(state: MediaStorageChange['state']) { change?.({ state, storage: drive }); }, get calls() { return calls; }, get subscriptions() { return subscriptions; }, get cleanups() { return cleanups; } };
}

describe('media classification and lazy directory cache', () => {
  it('classifies MP4/MKV case-insensitively without promising playback', () => {
    assert.equal(classifyMedia('movie.MP4'), 'video');
    assert.equal(classifyMedia('movie.mKv'), 'video');
    assert.equal(classifyMedia('photo.jpeg'), 'image');
    assert.equal(classifyMedia('music.mp3'), 'audio');
    assert.equal(classifyMedia('file.unknown'), 'other');
    assert.equal(classifyMedia('folder.mp4', true), 'folder');
    assert.equal(mediaExtension('.hidden'), '');
    assert.equal(mediaExtension('extensionless'), '');
  });

  it('does no work until requested, deduplicates simultaneous loads and caches only visited folders', async () => {
    const fixtureApi = fixture();
    const service = createMediaService(fixtureApi.adapter);
    assert.equal(fixtureApi.calls, 0);
    assert.equal(fixtureApi.subscriptions, 0);
    await service.listStorages();
    assert.equal(fixtureApi.calls, 0);
    const first = service.listDirectory(drive, drive.rootPath);
    const second = service.listDirectory(drive, drive.rootPath);
    assert.equal(first, second);
    await first;
    await service.listDirectory(drive, drive.rootPath);
    assert.equal(fixtureApi.calls, 1);
    await service.listDirectory(drive, 'usb/Movies');
    assert.equal(fixtureApi.calls, 2);
    service.dispose();
  });

  it('expires cached entries, supports manual refresh and evicts least recently used directories', async () => {
    const fixtureApi = fixture();
    let time = 0;
    const service = createMediaService(fixtureApi.adapter, { maxDirectories: 2, ttlMs: 10, now: () => time });
    await service.listDirectory(drive, 'usb/a');
    await service.listDirectory(drive, 'usb/b');
    await service.listDirectory(drive, 'usb/a');
    await service.listDirectory(drive, 'usb/c');
    await service.listDirectory(drive, 'usb/b');
    assert.equal(fixtureApi.calls, 4);
    time = 11;
    await service.listDirectory(drive, 'usb/b');
    assert.equal(fixtureApi.calls, 5);
    service.invalidate(drive.id, 'usb/b');
    await service.listDirectory(drive, 'usb/b');
    assert.equal(fixtureApi.calls, 6);
    service.dispose();
  });

  it('invalidates removed drives, shares one lazy subscription and cleans it when hidden', async () => {
    const fixtureApi = fixture();
    const service = createMediaService(fixtureApi.adapter);
    const cleanup = service.subscribeStorageChanges(() => {});
    const cleanup2 = service.subscribeStorageChanges(() => {});
    assert.equal(fixtureApi.subscriptions, 1);
    await service.listDirectory(drive, 'usb/a');
    fixtureApi.emit('removed');
    await assert.rejects(service.listDirectory(drive, 'usb/a'), { code: 'removed' });
    fixtureApi.emit('mounted');
    await service.listDirectory(drive, 'usb/a');
    assert.equal(fixtureApi.calls, 2);
    cleanup();
    assert.equal(fixtureApi.cleanups, 0);
    cleanup2();
    assert.equal(fixtureApi.cleanups, 1);
    service.dispose();
  });

  it('does not repopulate an invalidated directory from a stale async request', async () => {
    const fixtureApi = fixture();
    let finish: ((entries: MediaEntry[]) => void) | undefined;
    fixtureApi.adapter.listDirectory = () => new Promise(resolve => { finish = resolve; });
    const service = createMediaService(fixtureApi.adapter);
    const first = service.listDirectory(drive, 'usb/a');
    await Promise.resolve();
    service.invalidate(drive.id);
    finish?.([]);
    await first;
    let newCalls = 0;
    fixtureApi.adapter.listDirectory = async () => { newCalls++; return []; };
    await service.listDirectory(drive, 'usb/a');
    assert.equal(newCalls, 1);
    service.dispose();
  });

  it('rejects removed in-flight results and keeps other drive caches intact', async () => {
    const fixtureApi = fixture();
    let finish: ((entries: MediaEntry[]) => void) | undefined;
    const other = { id: 'usb2', label: 'USB 2', rootPath: 'usb2' };
    const service = createMediaService(fixtureApi.adapter);
    const cleanup = service.subscribeStorageChanges(() => {});
    await service.listDirectory(other, other.rootPath);
    fixtureApi.adapter.listDirectory = () => new Promise(resolve => { finish = resolve; });
    const loading = service.listDirectory(drive, drive.rootPath);
    await Promise.resolve();
    fixtureApi.emit('removed');
    finish?.([]);
    await assert.rejects(loading, { code: 'removed' });
    await service.listDirectory(other, other.rootPath);
    assert.equal(fixtureApi.calls, 1);
    cleanup(); service.dispose();
  });

  it('never caches failures, allowing Refresh to retry a folder', async () => {
    const fixtureApi = fixture();
    const service = createMediaService(fixtureApi.adapter);
    let calls = 0;
    fixtureApi.adapter.listDirectory = async () => { calls++; if (calls === 1) throw new Error('disconnected'); return []; };
    await assert.rejects(service.listDirectory(drive, drive.rootPath));
    await service.listDirectory(drive, drive.rootPath);
    assert.equal(calls, 2);
    service.dispose();
  });

  it('invalidates in-flight folders when a discovery snapshot finds the drive absent', async () => {
    const fixtureApi = fixture();
    let finish: ((entries: MediaEntry[]) => void) | undefined;
    fixtureApi.adapter.listDirectory = () => new Promise(resolve => { finish = resolve; });
    const service = createMediaService(fixtureApi.adapter);
    await service.listStorages();
    const loading = service.listDirectory(drive, drive.rootPath);
    await Promise.resolve();
    fixtureApi.adapter.listStorages = async () => [];
    await service.listStorages();
    finish?.([]);
    await assert.rejects(loading, { code: 'removed' });
    service.dispose();
  });

  it('does not reuse a pending folder from a removed then reinserted drive with the same label', async () => {
    const fixtureApi = fixture();
    let finish: ((entries: MediaEntry[]) => void) | undefined;
    fixtureApi.adapter.listDirectory = () => new Promise(resolve => { finish = resolve; });
    const service = createMediaService(fixtureApi.adapter);
    const cleanup = service.subscribeStorageChanges(() => {});
    const loading = service.listDirectory(drive, drive.rootPath);
    await Promise.resolve();
    fixtureApi.emit('removed');
    fixtureApi.emit('mounted');
    finish?.([]);
    await assert.rejects(loading, { code: 'removed' });
    cleanup(); service.dispose();
  });
});
