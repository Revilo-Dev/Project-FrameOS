import type { MediaEntry } from '../types/media';
import type { SettingsStorage } from './settings';
import { localFilePath } from './playbackPath';
import { BoundedMediaCache, indexedBackend } from './mediaCache';

export type ThumbnailProvider = ((entry: MediaEntry, signal?: AbortSignal) => Promise<string | null>) & { invalidate?(storage?: string): void };
export interface Cached { key: string; storage: string; uri: string | null; until: number }
export function thumbnailIdentity(entry: MediaEntry) { return JSON.stringify([entry.storageId, entry.path, entry.size, entry.modified]); }
interface Job { entry: MediaEntry; key: string; epoch: number; signal: AbortSignal; controller: AbortController; resolve(uri: string | null): void }
export function validThumbnailRecord(value: unknown): value is Cached { const item = value as Cached | null; return !!item && typeof item.key === 'string' && typeof item.storage === 'string' && Number.isFinite(item.until) && (item.uri === null || !!safeThumbnail(item.uri)); }
export function safeThumbnail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value) && value.length <= 150000) return value;
  if (value.length > 4096) return null;
  try { localFilePath(value); return value; } catch { return null; }
}

/** One lazy extraction job. Persist compact snapshots/references in bounded IndexedDB. */
export class ThumbnailService {
  private cache = new Map<string, Cached>();
  private queue: Job[] = [];
  private running = 0;
  private stopped = false;
  private epoch = 0;
  private paused = false;
  private active?: Job;
  constructor(private provider?: ThumbnailProvider, _storage?: SettingsStorage, private now = Date.now, private persistent = new BoundedMediaCache(indexedBackend('thumbnails'), 256, 8 * 1024 * 1024, validThumbnailRecord)) {}
  setPaused(paused: boolean) { this.paused = paused; if (paused) this.active?.controller.abort(); else this.drain(); }
  async clear() { this.invalidate(); await this.persistent.clear(); }
  async forget(entry: MediaEntry) { const key = this.key(entry); this.cache.delete(key); await this.persistent.delete(key); }
  private key(entry: MediaEntry) { return thumbnailIdentity(entry); }
  get(entry: MediaEntry, signal: AbortSignal): Promise<string | null> {
    if (this.stopped || signal.aborted || !this.provider || entry.type !== 'video') return Promise.resolve(null);
    const key = this.key(entry), cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return Promise.resolve(cached.uri);
    return new Promise(resolve => {
      const job = { entry, key, epoch: this.epoch, signal, controller: new AbortController(), resolve };
      const cancel = () => {
        job.controller.abort();
        const index = this.queue.indexOf(job);
        if (index >= 0) { this.queue.splice(index, 1); resolve(null); }
      };
      if (this.queue.length >= 36) this.queue.shift()!.resolve(null);
      this.queue.push(job); signal.addEventListener('abort', cancel, { once: true });
      const finish = job.resolve;
      job.resolve = uri => { signal.removeEventListener('abort', cancel); finish(uri); };
      this.drain();
    });
  }
  private drain() {
    while (!this.stopped && !this.paused && this.running < 1 && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.signal.aborted) { job.resolve(null); continue; }
      const cached = this.cache.get(job.key);
      if (cached && cached.until > this.now()) { job.resolve(cached.uri); continue; }
      this.running++; this.active = job;
      let restoredRecord: Cached | undefined;
      // An uncancellable native metadata callback still owns its slot until it
      // settles. Cancelling a view never starts unbounded background queries.
      void Promise.resolve().then(async () => {
        const restored = await this.persistent.get(job.key);
        if (restored && restored.until > this.now()) { restoredRecord = restored; return restored.uri; }
        if (this.paused || job.controller.signal.aborted) return null;
        return this.provider!(job.entry, job.controller.signal);
      }).catch(() => null).then(value => {
        const uri = safeThumbnail(value);
        const live = !this.stopped && !job.signal.aborted && !job.controller.signal.aborted && job.epoch === this.epoch;
        if (live) {
          this.cache.delete(job.key);
          this.cache.set(job.key, restoredRecord || { key: job.key, storage: job.entry.storageId, uri, until: this.now() + (uri ? 86400000 : 300000) });
          while (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
          void this.persistent.put(job.key, this.cache.get(job.key)!);
        }
        job.resolve(live ? uri : null);
      }).finally(() => { this.running--; this.active = undefined; this.drain(); });
    }
  }
  invalidate(storage?: string) {
    ++this.epoch;
    this.provider?.invalidate?.(storage);
    if (!storage || this.active?.entry.storageId === storage) this.active?.controller.abort();
    for (const [key, item] of this.cache) if (!storage || item.storage === storage) this.cache.delete(key);
    const queued = this.queue; this.queue = [];
    for (const job of queued) if (!storage || job.entry.storageId === storage) job.resolve(null); else this.queue.push(job);

  }
  dispose() { this.stopped = true; this.active?.controller.abort(); for (const job of this.queue) job.resolve(null); this.queue = []; this.cache.clear(); }
}
