import type { MediaEntry } from '../types/media';
import { playbackPath } from '../services/playbackPath';

export interface AvPlayApi {
  open(path: string): void; close(): void; stop(): void; play(): void; pause(): void;
  getState(): string; getDuration(): number;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setDisplayMethod?(method: string): void;
  setListener(listener: AvPlayListener): void;
  prepareAsync(success: () => void, failure: (error: unknown) => void): void;
  seekTo(position: number, success: () => void, failure: (error: unknown) => void): void;
}
export interface AvPlayListener {
  onbufferingstart(): void; onbufferingprogress(percent: number): void; onbufferingcomplete(): void;
  oncurrentplaytime(position: number): void; onstreamcompleted(): void; onerror(error: unknown): void;
}
export interface PlayerSnapshot {
  status: 'closed' | 'preparing' | 'playing' | 'paused' | 'ended' | 'error';
  busy: boolean; buffering: boolean; percent: number; position: number; duration: number; error: string;
}
const initial = (): PlayerSnapshot => ({ status: 'closed', busy: false, buffering: false, percent: 0, position: 0, duration: 0, error: '' });
export function avPlayApi(runtime: unknown): AvPlayApi | undefined {
  try {
    const api = (runtime as { webapis?: { avplay?: AvPlayApi } })?.webapis?.avplay;
    return api && ['open', 'close', 'stop', 'play', 'pause', 'getState', 'getDuration', 'setDisplayRect', 'setListener', 'prepareAsync', 'seekTo'].every(name => typeof api[name as keyof AvPlayApi] === 'function') ? api : undefined;
  } catch { return undefined; }
}

/** One native AVPlay owner. No SDK calls overlap prepare/seek callbacks. */
export class AvPlayController {
  readonly available: boolean;
  private snapshot = initial();
  private listeners = new Set<() => void>();
  private busy = false;
  private finish: PlayerSnapshot['status'] | null = null;
  private generation = 0;
  private entry: MediaEntry | null = null;
  constructor(private api?: AvPlayApi, private timeoutMs = 15000) { this.available = Boolean(api); }
  get = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<PlayerSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private cleanup(status: PlayerSnapshot['status']) {
    // A pending seek/prepare owns the native API until its real callback returns.
    if (this.busy) { this.finish = status; this.update({ status, buffering: false }); return; }
    ++this.generation;
    try { const state = this.api?.getState(); if (state && ['READY', 'PLAYING', 'PAUSED'].includes(state)) this.api!.stop(); }
    catch { /* Always still try close, even if a disconnected file made stop fail. */ }
    try { if (this.api && this.api.getState() !== 'NONE') this.api.close(); } catch { /* Native error is shown by the caller. */ }
    this.finish = null;
    this.update({ status, busy: false, buffering: false });
  }
  private fail(error: unknown) {
    const detail = typeof error === 'string' ? error : (error as { name?: string })?.name || 'PlaybackError';
    this.update({ error: `Video could not be played (${String(detail).replace(/[\x00-\x1f]/g, '').slice(0, 100)}). The file may be missing or its codec unsupported.` });
    this.cleanup('error');
  }
  private asynchronous(operation: 'prepare' | 'seek', invoke: (success: () => void, failure: (error: unknown) => void) => void, done: () => void) {
    this.busy = true; this.update({ busy: true });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        this.update({ error: `${operation === 'prepare' ? 'Video preparation' : 'Seeking'} took too long. Return to your folder. If the TV player remains unresponsive, reopen FrameOS.` });
        this.cleanup('error');
      }
    }, this.timeoutMs);
    const complete = (error?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); this.busy = false;
      this.update({ busy: false });
      if (this.finish) { this.cleanup(this.finish); return; }
      if (error !== undefined) { this.fail(error); return; }
      try { done(); } catch (failure) { this.fail(failure); }
    };
    try { invoke(() => complete(), error => complete(error ?? 'UnknownError')); }
    catch (error) { complete(error); }
  }
  open(entry: MediaEntry) {
    if (this.busy) { this.update({ error: 'The TV is still finishing its previous operation. Try again once it responds.' }); this.cleanup('error'); return; }
    this.close(); this.entry = entry;
    this.snapshot = initial();
    if (!this.api) { this.update({ status: 'error', error: 'Native video playback requires Samsung AVPlay on the installed TV app. This browser preview does not simulate video playback.' }); return; }
    const token = ++this.generation;
    const live = () => token === this.generation && !this.finish;
    try {
      const path = playbackPath(entry);
      this.api.open(path);
      this.update({ status: 'preparing', error: '' });
      this.api.setListener({
        onbufferingstart: () => { if (live()) this.update({ buffering: true, percent: 0 }); },
        onbufferingprogress: percent => { if (live()) this.update({ percent: Math.max(0, Math.min(100, percent)) }); },
        onbufferingcomplete: () => { if (live()) this.update({ buffering: false, percent: 100 }); },
        oncurrentplaytime: position => { if (live() && Number.isFinite(position) && Math.floor(position / 1000) !== Math.floor(this.snapshot.position / 1000)) this.update({ position: Math.max(0, position) }); },
        onstreamcompleted: () => { if (live()) { this.update({ position: this.snapshot.duration }); this.cleanup('ended'); } },
        onerror: error => { if (live()) this.fail(error); },
      });
      // This API uses the TV's 1920x1080 logical coordinate space, not CSS pixels.
      this.api.setDisplayRect(0, 0, 1920, 1080);
      this.asynchronous('prepare', (success, failure) => this.api!.prepareAsync(success, failure), () => {
        if (!live()) return;
        const duration = this.api!.getDuration();
        this.update({ duration: Number.isFinite(duration) ? Math.max(0, duration) : 0 });
        this.api!.setDisplayRect(0, 0, 1920, 1080);
        this.api!.setDisplayMethod?.('PLAYER_DISPLAY_MODE_LETTER_BOX');
        this.api!.play(); this.update({ status: 'playing', buffering: false });
      });
    } catch (error) { this.fail(error); }
  }
  play() {
    if (this.busy || !this.api) return;
    if (this.snapshot.status === 'ended' && this.entry) { this.open(this.entry); return; }
    if (this.snapshot.status !== 'paused') return;
    try { if (this.api.getState() === 'PAUSED') { this.api.play(); this.update({ status: 'playing' }); } } catch (error) { this.fail(error); }
  }
  pause() {
    if (this.busy || !this.api || this.snapshot.status !== 'playing') return;
    try { if (this.api.getState() === 'PLAYING') { this.api.pause(); this.update({ status: 'paused' }); } } catch (error) { this.fail(error); }
  }
  toggle() { if (this.snapshot.status === 'playing') this.pause(); else this.play(); }
  seek(position: number) {
    if (this.busy || !this.api || !['playing', 'paused'].includes(this.snapshot.status) || !Number.isFinite(position) || this.snapshot.duration <= 0) return;
    const target = Math.round(Math.max(0, Math.min(this.snapshot.duration - 1, position)));
    this.asynchronous('seek', (success, failure) => this.api!.seekTo(target, success, failure), () => this.update({ position: target }));
  }
  close() { this.cleanup('closed'); }
}
