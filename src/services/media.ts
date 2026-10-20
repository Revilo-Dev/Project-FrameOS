import { MediaError, type MediaAdapter, type MediaEntry, type MediaStorage, type MediaStorageChange, type MediaType } from '../types/media';

const video = new Set(['mp4', 'mkv', 'm4v', 'mov', 'avi', 'webm', 'ts', 'mpeg', 'mpg', 'wmv']);
const image = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'tif', 'tiff', 'avif']);
const audio = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'aiff']);

export function mediaExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Classification is for browsing only; it makes no codec/playback promise. */
export function classifyMedia(name: string, isDirectory = false): MediaType {
  if (isDirectory) return 'folder';
  const extension = mediaExtension(name);
  return video.has(extension) ? 'video' : image.has(extension) ? 'image' : audio.has(extension) ? 'audio' : 'other';
}

export function validMediaPath(storage: MediaStorage, path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const root = storage.rootPath.replace(/\/+$/, '');
  if (!root || !normalized || normalized.includes('\0') || normalized.split('/').some(part => part === '.' || part === '..') ||
      (normalized !== root && !normalized.startsWith(`${root}/`))) {
    throw new MediaError('invalid-path', 'This folder is outside the selected USB drive.');
  }
  return normalized;
}

export interface MediaService extends MediaAdapter {
  invalidate(storageId?: string, path?: string): void;
  dispose(): void;
}

interface CachedDirectory { storageId: string; path: string; expiresAt: number; entries: MediaEntry[] }
interface PendingDirectory { storageId: string; path: string; promise: Promise<MediaEntry[]> }

/** Bounded directory LRU. Only the directory explicitly requested is enumerated. */
export function createMediaService(adapter: MediaAdapter, options: { maxDirectories?: number; ttlMs?: number; now?: () => number } = {}): MediaService {
  const maximum = Math.max(1, options.maxDirectories ?? 32);
  const ttl = Math.max(0, options.ttlMs ?? 5 * 60_000);
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedDirectory>();
  const pending = new Map<string, PendingDirectory>();
  const listeners = new Set<(change: MediaStorageChange) => void>();
  const errors = new Set<(error: MediaError) => void>();
  const removed = new Set<string>();
  const storageEpoch = new Map<string, number>();
  const knownStorageIds = new Set<string>();
  let unsubscribe: (() => void) | undefined;
  let disposed = false;
  const keyFor = (storageId: string, path: string) => JSON.stringify([storageId, path]);
  const invalidate = (storageId?: string, path?: string) => {
    for (const [key, entry] of cache) if ((!storageId || entry.storageId === storageId) && (!path || entry.path === path)) cache.delete(key);
    // Removing the token also prevents a late callback from repopulating cache.
    for (const [key, entry] of pending) if ((!storageId || entry.storageId === storageId) && (!path || entry.path === path)) pending.delete(key);
  };
  const onChange = (change: MediaStorageChange) => {
    invalidate(change.storage.id);
    storageEpoch.set(change.storage.id, (storageEpoch.get(change.storage.id) ?? 0) + 1);
    knownStorageIds.add(change.storage.id);
    if (change.state === 'mounted') removed.delete(change.storage.id);
    else removed.add(change.storage.id);
    for (const listener of listeners) listener(change);
  };
  return {
    kind: adapter.kind,
    available: adapter.available,
    async listStorages() {
      const storages = await adapter.listStorages();
      for (const storage of storages) removed.delete(storage.id);
      const present = new Set(storages.map(storage => storage.id));
      const tracked = new Set([...knownStorageIds, ...Array.from(cache.values(), entry => entry.storageId), ...Array.from(pending.values(), entry => entry.storageId)]);
      for (const id of tracked) if (!present.has(id)) {
        if (!removed.has(id)) storageEpoch.set(id, (storageEpoch.get(id) ?? 0) + 1);
        removed.add(id);
        invalidate(id);
      }
      for (const storage of storages) knownStorageIds.add(storage.id);
      return storages;
    },
    listDirectory(storage, path) {
      if (disposed) return Promise.reject(new MediaError('inaccessible', 'The media browser is closed.'));
      if (removed.has(storage.id)) return Promise.reject(new MediaError('removed', 'The USB drive was disconnected.'));
      let normalized: string;
      try { normalized = validMediaPath(storage, path); } catch (error) { return Promise.reject(error); }
      const key = keyFor(storage.id, normalized);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) {
        cache.delete(key);
        cache.set(key, cached);
        return Promise.resolve(cached.entries);
      }
      cache.delete(key);
      const current = pending.get(key);
      if (current) return current.promise;
      const token: PendingDirectory = { storageId: storage.id, path: normalized, promise: Promise.resolve([]) };
      const epoch = storageEpoch.get(storage.id);
      token.promise = Promise.resolve().then(() => adapter.listDirectory(storage, normalized)).then(entries => {
        if (disposed || removed.has(storage.id) || epoch !== storageEpoch.get(storage.id)) throw new MediaError('removed', 'The USB drive was disconnected.');
        if (pending.get(key) === token) {
          cache.set(key, { storageId: storage.id, path: normalized, entries, expiresAt: now() + ttl });
          while (cache.size > maximum) cache.delete(cache.keys().next().value!);
        }
        return entries;
      }).finally(() => { if (pending.get(key) === token) pending.delete(key); });
      pending.set(key, token);
      return token.promise;
    },
    subscribeStorageChanges(listener, onError) {
      listeners.add(listener);
      if (onError) errors.add(onError);
      if (!unsubscribe && !disposed) unsubscribe = adapter.subscribeStorageChanges(onChange, error => { for (const handler of errors) handler(error); });
      return () => {
        listeners.delete(listener);
        if (onError) errors.delete(onError);
        if (listeners.size === 0 && unsubscribe) { unsubscribe(); unsubscribe = undefined; }
      };
    },
    invalidate,
    dispose() { disposed = true; unsubscribe?.(); unsubscribe = undefined; listeners.clear(); errors.clear(); cache.clear(); pending.clear(); },
  };
}
