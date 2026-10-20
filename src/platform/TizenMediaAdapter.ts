import { MediaError, type MediaAdapter, type MediaEntry, type MediaStorage, type MediaStorageChange } from '../types/media';
import { classifyMedia, mediaExtension, validMediaPath } from '../services/media';
import { UsbDiagnostics } from './UsbDiagnostics';

export interface TizenStorage { label: string; type: 'INTERNAL' | 'EXTERNAL'; state: 'MOUNTED' | 'REMOVED' | 'UNMOUNTABLE' }
export interface TizenFile {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  fileSize?: number;
  toURI?(): string;
  listFiles?(success: (files: TizenFile[]) => void, failure?: (error: unknown) => void): void;
}
export interface TizenFilesystem {
  listStorages(success: (storages: TizenStorage[]) => void, failure?: (error: unknown) => void): void;
  resolve(path: string, success: (file: TizenFile) => void, failure?: (error: unknown) => void, mode?: 'r'): void;
  addStorageStateChangeListener?(success: (storage: TizenStorage) => void, failure?: (error: unknown) => void): number;
  removeStorageStateChangeListener?(id: number): void;
}

export function mediaFilesystem(runtime: unknown): TizenFilesystem | undefined {
  try {
    const filesystem = (runtime as { tizen?: { filesystem?: TizenFilesystem } })?.tizen?.filesystem;
    return typeof filesystem?.listStorages === 'function' && typeof filesystem?.resolve === 'function' ? filesystem : undefined;
  } catch { return undefined; }
}

function mediaError(error: unknown): MediaError {
  if (error instanceof MediaError) return error;
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'SecurityError' || name === 'PermissionDeniedError') return new MediaError('permission-denied', 'USB access was denied. Check the application’s read-only filesystem permissions.');
  if (name === 'NotSupportedError') return new MediaError('unsupported', 'USB browsing is unavailable on this device.');
  if (name === 'NotFoundError') return new MediaError('inaccessible', 'This folder is no longer available. Refresh the drive or return to its root.');
  if (name === 'InvalidValuesError' || name === 'TypeMismatchError') return new MediaError('invalid-path', 'The device could not open this filename or path.');
  return new MediaError('inaccessible', 'The USB folder could not be read. The drive may be disconnected, inaccessible or use an unsupported filesystem.');
}

function asStorage(storage: TizenStorage): MediaStorage {
  return { id: storage.label, label: storage.label, rootPath: storage.label };
}

/** Tizen 5.5 callback APIs, always resolved with explicit read-only access. */
export class TizenMediaAdapter implements MediaAdapter {
  readonly kind = 'tizen' as const;
  readonly available: boolean;
  readonly diagnostics: UsbDiagnostics;
  private readonly timeoutMs: number;
  private readonly pollMs: number;
  private readonly states = new Map<string, TizenStorage>();
  private readonly generation = new Map<string, number>();
  private revision = 0;

  constructor(private readonly filesystem?: TizenFilesystem, options: { timeoutMs?: number; pollMs?: number; runtimeAvailable?: boolean } = {}) {
    this.available = Boolean(filesystem);
    this.diagnostics = new UsbDiagnostics(options.runtimeAvailable ?? Boolean(filesystem), this.available);
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.pollMs = options.pollMs ?? 5_000;
  }

  private call<T>(operation: (success: (value: T) => void, failure: (error: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(() => reject(new MediaError('timeout', 'The USB drive took too long to respond. Try Refresh.'))), this.timeoutMs);
      const finish = (callback: () => void) => { if (!settled) { settled = true; clearTimeout(timer); callback(); } };
      try { operation(value => finish(() => resolve(value)), error => finish(() => reject(mediaError(error)))); }
      catch (error) { finish(() => reject(mediaError(error))); }
    });
  }

  private update(storage: TizenStorage): void {
    const previous = this.states.get(storage.label);
    if (!previous || previous.state !== storage.state) {
      this.generation.set(storage.label, (this.generation.get(storage.label) ?? 0) + 1);
      this.revision++;
    }
    // Native WebIDL attributes can be prototype getters/non-enumerable. Spreading
    // a FileSystemStorage produces {} on such runtimes, hiding every mounted USB.
    this.states.set(storage.label, { label: storage.label, type: storage.type, state: storage.state });
  }

  private requireFilesystem(): TizenFilesystem {
    if (!this.filesystem) throw new MediaError('unsupported', 'The native Tizen filesystem API is unavailable.');
    return this.filesystem;
  }

  async listStorages(): Promise<MediaStorage[]> {
    const filesystem = this.requireFilesystem();
    const revision = this.revision;
    this.diagnostics.event('Storage discovery started.');
    let storages: TizenStorage[];
    try { storages = await this.call<TizenStorage[]>((success, failure) => filesystem.listStorages(success, error => { this.diagnostics.error('Storage discovery', error); failure(error); })); }
    catch (error) { if (!this.diagnostics.get().lastError || error instanceof MediaError && error.code === 'timeout') this.diagnostics.error('Storage discovery', error); throw error; }
    this.diagnostics.update({ storages: storages.map(storage => ({ label: storage.label, type: storage.type, state: storage.state })), lastScan: Date.now() });
    this.diagnostics.event(`Storage discovery: ${storages.length} storages reported.`);
    // A native hotplug callback supersedes a snapshot started before that event.
    if (revision === this.revision) {
      const external = storages.filter(storage => storage.type === 'EXTERNAL' && typeof storage.label === 'string' && storage.label.length > 0);
      const present = new Set(external.map(storage => storage.label));
      for (const storage of external) this.update(storage);
      for (const storage of this.states.values()) if (!present.has(storage.label) && storage.state !== 'REMOVED') this.update({ ...storage, state: 'REMOVED' });
    }
    const mounted = Array.from(this.states.values()).filter(storage => storage.state === 'MOUNTED');
    if (!mounted.length && Array.from(this.states.values()).some(storage => storage.state === 'UNMOUNTABLE')) {
      throw new MediaError('unmountable', 'The TV could not mount this USB drive. Its filesystem may be unsupported or the drive may need repair.');
    }
    return mounted.map(asStorage).sort((a, b) => a.label.localeCompare(b.label));
  }

  async listDirectory(storage: MediaStorage, requestedPath: string): Promise<MediaEntry[]> {
    const filesystem = this.requireFilesystem();
    const path = validMediaPath(storage, requestedPath);
    const generation = this.generation.get(storage.id);
    const ensurePresent = () => {
      const state = this.states.get(storage.id)?.state;
      if (state === 'REMOVED' || state === 'UNMOUNTABLE' || generation !== this.generation.get(storage.id)) {
        throw new MediaError('removed', 'The USB drive was disconnected while reading this folder.');
      }
    };
    ensurePresent();
    let operation = 'Storage root/folder resolution';
    const started = Date.now();
    try {
      const directory = await this.call<TizenFile>((success, failure) => {
        try { filesystem.resolve(path, success, error => { this.diagnostics.error('Storage root/folder resolution', error); failure(error); }, 'r'); }
        catch (error) { this.diagnostics.error('Storage root/folder resolution', error); failure(error); }
      });
      ensurePresent();
      if (!directory.isDirectory || typeof directory.listFiles !== 'function') throw new MediaError('inaccessible', 'This item is not an accessible folder.');
      operation = 'Directory enumeration';
      const files = await this.call<TizenFile[]>((success, failure) => {
        try { directory.listFiles!(success, error => { this.diagnostics.error('Directory enumeration', error); failure(error); }); }
        catch (error) { this.diagnostics.error('Directory enumeration', error); failure(error); }
      });
      ensurePresent();
      const entries: MediaEntry[] = [];
      const seen = new Set<string>();
      let directoryUri: string | undefined;
      try { directoryUri = directory.toURI?.().replace(/\/+$/, ''); } catch { /* Full virtual paths remain available. */ }
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        // A malformed native entry must not hide every other entry in a folder.
        try {
          const name = file.name;
          if (typeof name !== 'string' || !name || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) continue;
          // The enumerated parent and exact native name give a stable virtual
          // path even when a firmware reports fullPath as an absolute OS path.
          const entryPath = validMediaPath(storage, `${path}/${name}`);
          if (seen.has(entryPath)) continue;
          seen.add(entryPath);
          const isDirectory = Boolean(file.isDirectory);
          let size: number | undefined;
          let uri: string | undefined;
          try { const value = file.fileSize; if (!isDirectory && typeof value === 'number' && Number.isFinite(value) && value >= 0) size = value; } catch { /* Optional metadata may be inaccessible. */ }
          // Convert the directory once rather than making a native toURI call
          // for every file in a large folder. No file contents are read.
          try { if (directoryUri) uri = `${directoryUri}/${encodeURIComponent(name)}`; } catch { /* Preserve unusual UTF-16 names through the virtual path. */ }
          entries.push({ id: JSON.stringify([storage.id, entryPath]), name, extension: isDirectory ? '' : mediaExtension(name), size, path: entryPath, uri, storageId: storage.id, parentPath: path, isDirectory, type: classifyMedia(name, isDirectory) });
        } catch { /* Ignore an invalid native path, never change it on the drive. */ }
        if (index > 0 && index % 500 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); ensurePresent(); }
      }
      ensurePresent();
      const compare = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
      this.diagnostics.root(storage.id, path, entries.length, files.length - entries.length);
      if (files.length > 0 && entries.length === 0) throw new MediaError('invalid-path', 'The TV returned directory entries, but none had valid filenames. See USB diagnostics.');
      return entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || compare(a.name, b.name));
    } catch (error) {
      ensurePresent();
      const failure = mediaError(error);
      if (!this.diagnostics.get().lastError || this.diagnostics.get().lastError!.at < started) this.diagnostics.error(operation, error);
      if (failure.code === 'inaccessible') throw new MediaError(failure.code, `${operation} failed. ${failure.message}`);
      throw failure;
    }
  }

  subscribeStorageChanges(listener: (change: MediaStorageChange) => void, onError?: (error: MediaError) => void): () => void {
    if (!this.filesystem) { onError?.(new MediaError('unsupported', 'The native Tizen filesystem API is unavailable.')); return () => {}; }
    const filesystem = this.filesystem;
    let active = true;
    let watchId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    const emit = (storage: TizenStorage) => {
      if (!active || storage.type !== 'EXTERNAL') return;
      this.update(storage);
      this.diagnostics.event(`Storage state changed: ${storage.state}.`);
      listener({ storage: asStorage(storage), state: storage.state === 'MOUNTED' ? 'mounted' : storage.state === 'UNMOUNTABLE' ? 'unmountable' : 'removed' });
    };
    const removeWatch = () => {
      if (watchId !== undefined) {
        const id = watchId;
        watchId = undefined;
        try { filesystem.removeStorageStateChangeListener?.(id); } catch { /* Runtime may deny the listener privilege; no file writes occur. */ }
      }
    };
    const poll = async () => {
      if (!active) return;
      try {
        const storages = await this.call<TizenStorage[]>((success, failure) => filesystem.listStorages(success, failure));
        if (!active) return;
        const external = storages.filter(storage => storage.type === 'EXTERNAL');
        const present = new Set(external.map(storage => storage.label));
        for (const storage of external) if (this.states.get(storage.label)?.state !== storage.state) emit(storage);
        for (const storage of this.states.values()) if (!present.has(storage.label) && storage.state !== 'REMOVED') emit({ ...storage, state: 'REMOVED' });
      } catch (error) { if (active) onError?.(mediaError(error)); }
      finally { if (active) timer = setTimeout(() => { void poll(); }, this.pollMs); }
    };
    const fallback = () => {
      if (!active || polling) return;
      polling = true;
      removeWatch();
      // Samsung documents filesystem.write for hotplug listeners. Do not request
      // write access: compare read-only snapshots only while Media Hub subscribes.
      void poll();
    };
    try {
      if (!filesystem.addStorageStateChangeListener || !filesystem.removeStorageStateChangeListener) fallback();
      else {
        watchId = filesystem.addStorageStateChangeListener(emit, fallback);
        // Handles a mock/runtime which invokes its error callback synchronously.
        if (polling) removeWatch();
      }
    } catch { fallback(); }
    return () => { active = false; if (timer !== undefined) clearTimeout(timer); removeWatch(); };
  }
}
