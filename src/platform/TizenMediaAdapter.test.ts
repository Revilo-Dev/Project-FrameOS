import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MediaError } from '../types/media';
import { TizenMediaAdapter, type TizenFile, type TizenFilesystem, type TizenStorage } from './TizenMediaAdapter';
import { video } from '../../tests/mediaFixture';

const drive = { id: 'removable-a', label: 'removable-a', rootPath: 'removable-a' };
const mounted: TizenStorage = { label: drive.id, type: 'EXTERNAL', state: 'MOUNTED' };
const file = (name: string, isDirectory = false): TizenFile => ({ name, isDirectory, fullPath: `${drive.rootPath}/${name}`, fileSize: isDirectory ? undefined : 1024, toURI: () => `file:///media/usb/${name}` });

function fixture(entries: TizenFile[] = []) {
  let storages: TizenStorage[] = [mounted];
  let change: ((storage: TizenStorage) => void) | undefined;
  let failure: ((error: unknown) => void) | undefined;
  let removedId: number | undefined;
  let resolves = 0;
  let enumerations = 0;
  const modes: unknown[] = [];
  const filesystem: TizenFilesystem = {
    listStorages(success) { queueMicrotask(() => success(storages)); },
    resolve(path, success, _failure, mode) {
      modes.push(mode); resolves++;
      queueMicrotask(() => success({ name: '', fullPath: path, isDirectory: true, toURI: () => 'file:///media/usb', listFiles(done) { enumerations++; queueMicrotask(() => done(entries)); } }));
    },
    addStorageStateChangeListener(success, error) { change = success; failure = error; return 7; },
    removeStorageStateChangeListener(id) { removedId = id; },
  };
  return { filesystem, modes, setStorages(value: TizenStorage[]) { storages = value; }, emit(value: TizenStorage) { change?.(value); }, fail(error: unknown) { failure?.(error); }, get resolves() { return resolves; }, get enumerations() { return enumerations; }, get removedId() { return removedId; } };
}

describe('native read-only USB adapter', () => {
  it('resolves the selected file in read mode before playback and rejects missing files or removed drives', async () => {
    const api = fixture(); const adapter = new TizenMediaAdapter(api.filesystem);
    await adapter.listStorages();
    const entry = video('Episode 1.MKV', `${drive.id}/Series`);
    let mode: unknown;
    api.filesystem.resolve = (_path, success, _failure, readMode) => { mode = readMode; success({ ...file(entry.name), toURI: () => 'file:///media/usb/Series/Episode%201.MKV' }); };
    assert.equal((await adapter.resolveFile(entry)).uri, 'file:///media/usb/Series/Episode%201.MKV'); assert.equal(mode, 'r');
    api.filesystem.resolve = (_path, _success, failure) => failure?.({ name: 'NotFoundError', message: 'File removed' });
    await assert.rejects(adapter.resolveFile(entry), /selected USB video is missing/);
    assert.equal(adapter.diagnostics.get().lastError?.name, 'NotFoundError');
    await assert.rejects(adapter.resolveFile({ ...entry, path: `${drive.id}/../bad.MKV` }));
    api.setStorages([]); await adapter.listStorages(); await assert.rejects(adapter.resolveFile(entry), /no longer connected/);
  });
  it('rejects a stale selected-file resolution after USB removal and retains permission errors', async () => {
    const api = fixture(); const adapter = new TizenMediaAdapter(api.filesystem); await adapter.listStorages();
    const unsubscribe = adapter.subscribeStorageChanges(() => {});
    const entry = video('Episode 1.MKV', `${drive.id}/Series`);
    let done: (file: TizenFile) => void = () => {};
    api.filesystem.resolve = (_path, success) => { done = success; };
    const resolving = adapter.resolveFile(entry); api.emit({ ...mounted, state: 'REMOVED' }); done(file(entry.name));
    await assert.rejects(resolving, { code: 'removed' });
    api.emit(mounted); api.filesystem.resolve = (_path, _success, failure) => failure?.({ name: 'SecurityError', message: 'Read permission denied' });
    await assert.rejects(adapter.resolveFile(entry), { code: 'permission-denied' }); unsubscribe();
  });
  it('copies native WebIDL storage getters explicitly instead of losing non-enumerable properties', async () => {
    const nativeStorage = Object.create({ get label() { return 'removable_sdc7'; }, get type() { return 'EXTERNAL'; }, get state() { return 'MOUNTED'; } }) as TizenStorage;
    assert.deepEqual({ ...nativeStorage }, {});
    const api = fixture(); api.setStorages([nativeStorage]);
    const adapter = new TizenMediaAdapter(api.filesystem);
    assert.deepEqual(await adapter.listStorages(), [{ id: 'removable_sdc7', label: 'removable_sdc7', rootPath: 'removable_sdc7' }]);
    assert.deepEqual(adapter.diagnostics.get().storages, [{ label: 'removable_sdc7', type: 'EXTERNAL', state: 'MOUNTED' }]);
  });

  it('keeps genuine entries when native fullPath uses an absolute device path', async () => {
    const api = fixture([{ ...file('Real Movie.MKV'), fullPath: '/opt/storage/usb/sda1/Real Movie.MKV' }]);
    const adapter = new TizenMediaAdapter(api.filesystem);
    const entries = await adapter.listDirectory(drive, drive.rootPath);
    assert.equal(entries[0].path, `${drive.rootPath}/Real Movie.MKV`);
    assert.equal(entries[0].type, 'video');
    assert.equal(adapter.diagnostics.get().roots[0].entries, 1);
  });

  it('retains native permission error names/messages and identifies the failing filesystem operation', async () => {
    const api = fixture();
    api.filesystem.resolve = (_path, _success, failure) => failure?.({ name: 'SecurityError', message: 'Read privilege missing' });
    const adapter = new TizenMediaAdapter(api.filesystem);
    await assert.rejects(adapter.listDirectory(drive, drive.rootPath), { code: 'permission-denied' });
    assert.equal(adapter.diagnostics.get().lastError?.name, 'SecurityError');
    assert.equal(adapter.diagnostics.get().lastError?.message, 'Read privilege missing');
    assert.match(adapter.diagnostics.get().lastError!.operation, /resolution/);
  });
  it('reports unsupported native APIs without manufacturing drives', async () => {
    const adapter = new TizenMediaAdapter();
    assert.equal(adapter.available, false);
    await assert.rejects(adapter.listStorages(), { code: 'unsupported' });
    await assert.rejects(adapter.listDirectory(drive, drive.rootPath), { code: 'unsupported' });
  });

  it('discovers only mounted external drives, preserving labels for resolve', async () => {
    const fixtureApi = fixture();
    fixtureApi.setStorages([{ label: 'internal0', type: 'INTERNAL', state: 'MOUNTED' }, mounted, { label: 'USB drive with spaces', type: 'EXTERNAL', state: 'MOUNTED' }, { label: 'removed', type: 'EXTERNAL', state: 'REMOVED' }]);
    const adapter = new TizenMediaAdapter(fixtureApi.filesystem);
    const storages = await adapter.listStorages();
    assert.equal(storages.length, 2);
    assert.equal(storages[1].rootPath, 'USB drive with spaces');
    assert.equal(fixtureApi.enumerations, 0);
    assert.equal(fixtureApi.resolves, 0);
  });

  it('reads only the selected directory asynchronously in r mode and retains player metadata', async () => {
    const fixtureApi = fixture([file('movie.MP4'), file('Movies', true), file('sample.mkv'), file('cover.JPG'), file('track.flac'), file('notes.txt')]);
    const adapter = new TizenMediaAdapter(fixtureApi.filesystem);
    await adapter.listStorages();
    const entries = await adapter.listDirectory(drive, drive.rootPath);
    assert.equal(entries[0].type, 'folder');
    const movie = entries.find(entry => entry.name === 'movie.MP4')!;
    assert.deepEqual(movie, { id: JSON.stringify([drive.id, `${drive.rootPath}/movie.MP4`]), name: 'movie.MP4', path: `${drive.rootPath}/movie.MP4`, uri: 'file:///media/usb/movie.MP4', parentPath: drive.rootPath, storageId: drive.id, extension: 'mp4', size: 1024, modified: undefined, hidden: false, isDirectory: false, type: 'video' });
    assert.equal(entries.find(entry => entry.extension === 'mkv')?.type, 'video');
    assert.equal(entries.find(entry => entry.extension === 'jpg')?.type, 'image');
    assert.equal(entries.find(entry => entry.extension === 'flac')?.type, 'audio');
    assert.equal(entries.find(entry => entry.extension === 'txt')?.type, 'other');
    assert.equal(fixtureApi.enumerations, 1);
    assert.equal(fixtureApi.resolves, 1);
    assert.deepEqual(fixtureApi.modes, ['r']);
  });

  it('handles nested folders without scanning siblings or grandchildren', async () => {
    const fixtureApi = fixture([{ ...file('clip.mkv'), fullPath: `${drive.rootPath}/Movies/clip.mkv` }]);
    const entries = await new TizenMediaAdapter(fixtureApi.filesystem).listDirectory(drive, `${drive.rootPath}/Movies`);
    assert.equal(entries[0].parentPath, `${drive.rootPath}/Movies`);
    assert.equal(fixtureApi.enumerations, 1);
  });

  it('receives insert, removal and unmountable events and cleans the native listener', async () => {
    const fixtureApi = fixture();
    const adapter = new TizenMediaAdapter(fixtureApi.filesystem);
    const changes: string[] = [];
    const cleanup = adapter.subscribeStorageChanges(change => changes.push(change.state));
    fixtureApi.emit(mounted);
    fixtureApi.emit({ ...mounted, state: 'REMOVED' });
    fixtureApi.emit({ ...mounted, state: 'UNMOUNTABLE' });
    assert.deepEqual(changes, ['mounted', 'removed', 'unmountable']);
    await assert.rejects(adapter.listDirectory(drive, drive.rootPath), { code: 'removed' });
    cleanup(); cleanup();
    assert.equal(fixtureApi.removedId, 7);
    fixtureApi.emit(mounted);
    assert.equal(changes.length, 3);
  });

  it('rejects a drive removed during enumeration instead of returning stale entries', async () => {
    const fixtureApi = fixture();
    let complete: ((files: TizenFile[]) => void) | undefined;
    fixtureApi.filesystem.resolve = (path, success) => success({ name: '', fullPath: path, isDirectory: true, listFiles(done) { complete = done; } });
    const adapter = new TizenMediaAdapter(fixtureApi.filesystem);
    await adapter.listStorages();
    const cleanup = adapter.subscribeStorageChanges(() => {});
    const reading = adapter.listDirectory(drive, drive.rootPath);
    await Promise.resolve();
    fixtureApi.emit({ ...mounted, state: 'REMOVED' });
    complete?.([file('movie.mp4')]);
    await assert.rejects(reading, { code: 'removed' });
    cleanup();
  });

  it('maps permission errors, unavailable folders, unsupported filesystems and stalled callbacks', async () => {
    const fixtureApi = fixture();
    fixtureApi.filesystem.resolve = (_path, _success, error) => { error?.({ name: 'SecurityError' }); };
    await assert.rejects(new TizenMediaAdapter(fixtureApi.filesystem).listDirectory(drive, drive.rootPath), { code: 'permission-denied' });
    fixtureApi.filesystem.resolve = () => { throw { name: 'NotFoundError' }; };
    await assert.rejects(new TizenMediaAdapter(fixtureApi.filesystem).listDirectory(drive, drive.rootPath), { code: 'inaccessible' });
    fixtureApi.setStorages([{ ...mounted, state: 'UNMOUNTABLE' }]);
    await assert.rejects(new TizenMediaAdapter(fixtureApi.filesystem).listStorages(), { code: 'unmountable' });
    fixtureApi.filesystem.listStorages = () => {};
    await assert.rejects(new TizenMediaAdapter(fixtureApi.filesystem, { timeoutMs: 5 }).listStorages(), { code: 'timeout' });
  });

  it('rejects traversal before calling native APIs and survives malformed filenames', async () => {
    const fixtureApi = fixture([file('../unsafe'), file('bad\0name'), file('real.mp4'), file('.hidden'), file('字幕.mkv')]);
    const adapter = new TizenMediaAdapter(fixtureApi.filesystem);
    await assert.rejects(adapter.listDirectory(drive, `${drive.rootPath}/../internal0`), { code: 'invalid-path' });
    assert.equal(fixtureApi.resolves, 0);
    const entries = await adapter.listDirectory(drive, drive.rootPath);
    assert.deepEqual(entries.map(entry => entry.name).sort(), ['.hidden', 'real.mp4', '字幕.mkv']);
  });

  it('enumerates large directories once and returns every valid entry', async () => {
    const fixtureApi = fixture(Array.from({ length: 5_001 }, (_, index) => file(`Film ${index}.mp4`)));
    const entries = await new TizenMediaAdapter(fixtureApi.filesystem).listDirectory(drive, drive.rootPath);
    assert.equal(entries.length, 5_001);
    assert.equal(entries[2].name, 'Film 2.mp4');
    assert.equal(fixtureApi.enumerations, 1);
  });

  it('falls back to nonoverlapping read-only discovery only while subscribed if listener requires write privilege', async () => {
    const fixtureApi = fixture();
    fixtureApi.filesystem.addStorageStateChangeListener = () => { throw { name: 'SecurityError' }; };
    let calls = 0;
    let inFlight = 0;
    let maximumInFlight = 0;
    fixtureApi.filesystem.listStorages = success => {
      calls++; inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight);
      setTimeout(() => { inFlight--; success(calls > 1 ? [] : [mounted]); }, 3);
    };
    const adapter = new TizenMediaAdapter(fixtureApi.filesystem, { pollMs: 5 });
    const changes: string[] = [];
    assert.equal(calls, 0);
    let sawRemoval: (() => void) | undefined;
    const removed = new Promise<void>(resolve => { sawRemoval = resolve; });
    const cleanup = adapter.subscribeStorageChanges(change => { changes.push(change.state); if (change.state === 'removed') sawRemoval?.(); });
    const timeout = setTimeout(() => sawRemoval?.(), 500);
    await removed;
    clearTimeout(timeout);
    cleanup();
    const stoppedAt = calls;
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(calls, stoppedAt);
    assert.equal(maximumInFlight, 1);
    assert.deepEqual(changes, ['mounted', 'removed']);
  });

  it('provides clear typed errors without surfacing arbitrary native exception text', async () => {
    const fixtureApi = fixture();
    fixtureApi.filesystem.listStorages = (_success, error) => error?.({ name: 'UnknownError', message: 'private native contents' });
    try { await new TizenMediaAdapter(fixtureApi.filesystem).listStorages(); assert.fail(); }
    catch (error) { assert.ok(error instanceof MediaError); assert.doesNotMatch(error.message, /private native contents/); }
  });
});
