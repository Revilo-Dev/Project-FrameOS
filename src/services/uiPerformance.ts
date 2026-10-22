export interface TimingSummary { samples: number; medianMs: number; p95Ms: number; worstMs: number }
export interface PerformanceReport {
  status: 'Complete' | 'Cancelled'; reason: string; capturedAt: string; context: string;
  elapsedMs: number; callbackFps: number; frames: TimingSummary; handlers: TimingSummary; inputToCallback: TimingSummary;
  viewport: string; runtime: string; visibleStage: boolean;
}
interface Clock { now(): number; request(callback: (time: number) => void): number; cancel(id: number): void }
const browserClock: Clock = { now: () => performance.now(), request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) };
export function timingSummary(values: number[]): TimingSummary {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const at = (q: number) => Math.round((sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] || 0) * 100) / 100;
  return { samples: sorted.length, medianMs: at(.5), p95Ms: at(.95), worstMs: at(1) };
}
/** Opt-in callback timing on the live UI. No synthetic animation, polling or idle RAF.
 * These are browser scheduling measurements, never proof of presented frames. */
export class UiPerformance {
  private listeners = new Set<() => void>();
  private frame = 0;
  private session?: { start: number; last: number; frames: number[]; handlers: number[]; input: number[]; pending: number[]; context: string; duration: number; metadata: Pick<PerformanceReport, 'viewport' | 'runtime' | 'visibleStage'> };
  private report?: PerformanceReport;
  constructor(private clock: Clock = browserClock) {}
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  get = () => ({ running: !!this.session, report: this.report });
  start(context: string, metadata: Pick<PerformanceReport, 'viewport' | 'runtime' | 'visibleStage'>, duration = 6000) {
    this.cancel('Replaced by a new capture');
    this.session = { start: this.clock.now(), last: 0, frames: [], handlers: [], input: [], pending: [], context: context.slice(0, 200), duration: Math.max(1000, Math.min(duration, 15000)), metadata };
    this.frame = this.clock.request(this.tick); this.emit();
  }
  measure = (work: () => void) => {
    const session = this.session;
    if (!session) { work(); return; }
    const start = this.clock.now();
    try { work(); } finally {
      if (session === this.session && start - session.start >= 500) {
        if (session.handlers.length < 256) session.handlers.push(this.clock.now() - start);
        if (session.pending.length < 32) session.pending.push(start);
      }
    }
  };
  cancel(reason = 'FrameOS became hidden') { if (this.session) this.finish('Cancelled', reason); }
  private tick = () => {
    const session = this.session; if (!session) return;
    const now = this.clock.now(), elapsed = now - session.start;
    if (elapsed >= 500) {
      if (session.last && session.frames.length < 1000) session.frames.push(now - session.last);
      session.last = now;
      for (const start of session.pending) if (session.input.length < 256) session.input.push(now - start);
      session.pending = [];
    }
    if (elapsed >= session.duration) this.finish('Complete', '');
    else this.frame = this.clock.request(this.tick);
  };
  private finish(status: PerformanceReport['status'], reason: string) {
    const session = this.session!;
    this.clock.cancel(this.frame); this.frame = 0; this.session = undefined;
    const elapsedMs = this.clock.now() - session.start;
    const total = session.frames.reduce((sum, value) => sum + value, 0);
    this.report = { status, reason, capturedAt: new Date().toISOString(), context: session.context, elapsedMs: Math.round(elapsedMs), callbackFps: total > 0 ? Math.round(session.frames.length / total * 10000) / 10 : 0, frames: timingSummary(session.frames), handlers: timingSummary(session.handlers), inputToCallback: timingSummary(session.input), ...session.metadata };
    this.emit();
  }
  private emit() { for (const listener of this.listeners) listener(); }
}
