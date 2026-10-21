import type { MediaEntry } from '../types/media';
import type { SettingsStorage } from './settings';
import { localFilePath } from './playbackPath';
import { BoundedMediaCache, indexedBackend } from './mediaCache';
import { ThumbnailDiagnostics } from '../platform/ThumbnailDiagnostics';

export type ThumbnailProvider = ((entry: MediaEntry, signal?: AbortSignal) => Promise<string | null>) & { invalidate?(storage?: string): void };
export interface Cached { key: string; storage: string; uri: string | null; until: number; error?: string; method?: string }
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
  private restoredKeys = new Set<string>();
  constructor(private provider?: ThumbnailProvider, _storage?: SettingsStorage, private now = Date.now, private persistent = new BoundedMediaCache(indexedBackend('thumbnails'), 256, 8 * 1024 * 1024, validThumbnailRecord), readonly diagnostics = new ThumbnailDiagnostics()) {}
  rendering(entry: MediaEntry, success: boolean) { this.diagnostics.update(entry, { rendering: success ? 'Rendered on card' : 'Image rendering failed', ...(!success ? { lastError: 'ImageLoadError: card rejected the cached thumbnail' } : {}) }); }
  async retry(entry: MediaEntry, signal: AbortSignal) { if (this.paused) { this.diagnostics.attempt(entry, 'retry', 'Deferred: video playback is active'); return null; } await this.forget(entry); this.provider?.invalidate?.(); this.diagnostics.update(entry, { attempts: [], lastError: '', uri: '', cache: 'Retry: bypassing cached outcome' }); return this.get(entry, signal); }
  setPaused(paused: boolean) { this.paused = paused; if (paused) this.active?.controller.abort(); else this.drain(); }
  async clear() { this.invalidate(); await this.persistent.clear(); }
  async forget(entry: MediaEntry) {
    const key = this.key(entry);
    // A manual Retry must also supersede an in-flight attempt. Keep its native
    // slot until completion, but prevent its old outcome from repopulating cache.
    if (this.active?.key === key) this.active.controller.abort();
    const queued = this.queue; this.queue = [];
    for (const job of queued) if (job.key === key) job.resolve(null); else this.queue.push(job);
    this.cache.delete(key); this.restoredKeys.delete(key); await this.persistent.delete(key);
  }
  private key(entry: MediaEntry) { return thumbnailIdentity(entry); }
  get(entry: MediaEntry, signal: AbortSignal): Promise<string | null> {
    if (this.stopped || signal.aborted || !this.provider || entry.type !== 'video') { this.diagnostics.attempt(entry, 'unavailable', signal.aborted ? 'Cancelled' : 'No thumbnail provider is available'); return Promise.resolve(null); }
    const key = this.key(entry), cached = this.cache.get(key);
    if (cached && cached.until > this.now()) { this.diagnostics.update(entry, { cache: cached.uri ? this.restoredKeys.has(key) ? 'Persistent hit (now in memory)' : 'Memory hit' : 'Negative cache hit', uri: cached.uri || '', method: cached.method || 'Cached', lastError: cached.error || '' }); return Promise.resolve(cached.uri); }
    this.diagnostics.update(entry, { cache: 'Queued', uri: '', rendering: 'Not checked' });
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
      this.diagnostics.update(job.entry, { cache: 'Miss: extraction running' });
      let restoredRecord: Cached | undefined;
      // An uncancellable native metadata callback still owns its slot until it
      // settles. Cancelling a view never starts unbounded background queries.
      void Promise.resolve().then(async () => {
        const restored = await this.persistent.get(job.key);
        if (restored && restored.until > this.now() && (restored.uri || restored.error)) { restoredRecord = restored; this.restoredKeys.add(job.key); this.diagnostics.update(job.entry, { cache: restored.uri ? 'Persistent hit' : 'Persistent negative hit', method: restored.method || 'Cached', lastError: restored.error || '' }); return restored.uri; }
        if (this.paused || job.controller.signal.aborted) return null;
        return this.provider!(job.entry, job.controller.signal);
      }).catch(error => { this.diagnostics.attempt(job.entry, 'provider', error); return null; }).then(value => {
        const uri = safeThumbnail(value);
        const live = !this.stopped && !job.signal.aborted && !job.controller.signal.aborted && job.epoch === this.epoch;
        if (live) {
          this.cache.delete(job.key);
          const evidence = this.diagnostics.get(job.entry);
          const error = uri ? '' : evidence.lastError || 'ExtractionUnavailable: all supported thumbnail methods failed';
          this.cache.set(job.key, restoredRecord || { key: job.key, storage: job.entry.storageId, uri, until: this.now() + (uri ? 86400000 : 300000), error, method: evidence.method });
          this.diagnostics.update(job.entry, { uri: uri || '', lastError: error, cache: restoredRecord ? evidence.cache : uri ? 'Stored' : 'Failure cached for 5 minutes' });
          while (this.cache.size > 128) { const key = this.cache.keys().next().value!; this.cache.delete(key); this.restoredKeys.delete(key); }
          void this.persistent.put(job.key, this.cache.get(job.key)!);
        }
        if (!live) this.diagnostics.attempt(job.entry, 'cancelled', 'USB/view changed or playback started; result discarded');
        job.resolve(live ? uri : null);
      }).finally(() => { this.running--; this.active = undefined; this.drain(); });
    }
  }
  invalidate(storage?: string) {
    ++this.epoch;
    this.restoredKeys.clear();
    this.provider?.invalidate?.(storage);
    if (!storage || this.active?.entry.storageId === storage) this.active?.controller.abort();
    for (const [key, item] of this.cache) if (!storage || item.storage === storage) this.cache.delete(key);
    const queued = this.queue; this.queue = [];
    for (const job of queued) if (!storage || job.entry.storageId === storage) job.resolve(null); else this.queue.push(job);

  }
  dispose() { this.stopped = true; this.active?.controller.abort(); for (const job of this.queue) job.resolve(null); this.queue = []; this.cache.clear(); }
}
