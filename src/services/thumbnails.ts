import type { MediaEntry } from '../types/media';
import type { SettingsStorage } from './settings';
import { localFilePath } from './playbackPath';

export type ThumbnailProvider = (entry: MediaEntry) => Promise<string | null>;
interface Cached { key: string; storage: string; uri: string | null; until: number }
interface Job { entry: MediaEntry; key: string; epoch: number; signal: AbortSignal; resolve(uri: string | null): void }
const CACHE_KEY = 'frameos.thumbnails.v1';
export function safeThumbnail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try { localFilePath(value); return value; } catch { return null; }
}

/** Two metadata lookups, bounded queue/cache, URI-only persistence. Never decode video. */
export class ThumbnailService {
  private cache = new Map<string, Cached>();
  private queue: Job[] = [];
  private running = 0;
  private stopped = false;
  private epoch = 0;
  constructor(private provider?: ThumbnailProvider, private storage?: SettingsStorage, private now = Date.now) {
    try {
      const stored = JSON.parse(storage?.getItem(CACHE_KEY) || '[]') as Cached[];
      if (Array.isArray(stored)) for (const item of stored.slice(-128)) if (typeof item.key === 'string' && item.key.length < 8192 && typeof item.storage === 'string' && item.until > now() && (item.uri === null || safeThumbnail(item.uri))) this.cache.set(item.key, item);
    } catch { /* Cache is optional and quota-bounded. */ }
  }
  private key(entry: MediaEntry) { return JSON.stringify([entry.id, entry.uri, entry.size]); }
  get(entry: MediaEntry, signal: AbortSignal): Promise<string | null> {
    if (this.stopped || signal.aborted || !this.provider || entry.type !== 'video') return Promise.resolve(null);
    const key = this.key(entry), cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return Promise.resolve(cached.uri);
    return new Promise(resolve => {
      const job = { entry, key, epoch: this.epoch, signal, resolve };
      const cancel = () => {
        const index = this.queue.indexOf(job);
        if (index >= 0) { this.queue.splice(index, 1); resolve(null); }
      };
      if (this.queue.length >= 24) this.queue.shift()!.resolve(null);
      this.queue.push(job); signal.addEventListener('abort', cancel, { once: true });
      const finish = job.resolve;
      job.resolve = uri => { signal.removeEventListener('abort', cancel); finish(uri); };
      this.drain();
    });
  }
  private drain() {
    while (!this.stopped && this.running < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.signal.aborted) { job.resolve(null); continue; }
      const cached = this.cache.get(job.key);
      if (cached && cached.until > this.now()) { job.resolve(cached.uri); continue; }
      this.running++;
      // An uncancellable native metadata callback still owns its slot until it
      // settles. Cancelling a view never starts unbounded background queries.
      void Promise.resolve().then(() => this.provider!(job.entry)).catch(() => null).then(value => {
        const uri = safeThumbnail(value);
        const live = !this.stopped && !job.signal.aborted && job.epoch === this.epoch;
        if (live) {
          this.cache.delete(job.key);
          this.cache.set(job.key, { key: job.key, storage: job.entry.storageId, uri, until: this.now() + (uri ? 86400000 : 300000) });
          while (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
          try { this.storage?.setItem(CACHE_KEY, JSON.stringify([...this.cache.values()])); } catch { /* Keep memory cache if persistence is full/unavailable. */ }
        }
        job.resolve(live ? uri : null);
      }).finally(() => { this.running--; this.drain(); });
    }
  }
  invalidate(storage?: string) {
    ++this.epoch;
    for (const [key, item] of this.cache) if (!storage || item.storage === storage) this.cache.delete(key);
    const queued = this.queue; this.queue = [];
    for (const job of queued) if (!storage || job.entry.storageId === storage) job.resolve(null); else this.queue.push(job);
    try { this.storage?.setItem(CACHE_KEY, JSON.stringify([...this.cache.values()])); } catch { /* Optional persistence. */ }
  }
  dispose() { this.stopped = true; for (const job of this.queue) job.resolve(null); this.queue = []; this.cache.clear(); }
}
