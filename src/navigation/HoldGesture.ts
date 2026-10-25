/** One Enter gesture; a completed hold never also fires the short action. */
export class HoldGesture {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private held: { id: string; long: boolean; elapsed: boolean; repeated: boolean; short(): void; fire(): void } | null = null;
  // Window timer methods must not receive the injected timers object as `this`.
  constructor(private threshold = 750, private timers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer) }, private requireRepeat = false, private releaseOnly = false) {}
  isDown() { return this.held !== null; }
  down(id: string, short: () => void, long: () => void) {
    if (this.held) return;
    const held = { id, long: false, elapsed: false, repeated: false, short, fire: long };
    this.held = held;
    this.timer = this.timers.set(() => { if (this.held === held) { held.elapsed = true; this.maybeLong(); } }, this.threshold);
  }
  repeat() { if (this.held) { this.held.repeated = true; this.maybeLong(); } }
  private maybeLong() { const held = this.held; if (held && !this.releaseOnly && !held.long && held.elapsed && (!this.requireRepeat || held.repeated)) { held.long = true; held.fire(); } }
  release() {
    const held = this.held;
    this.cancel();
    if (held && this.releaseOnly && held.elapsed) { held.fire(); return; }
    // Missing keyup/repeat cannot be mistaken for a short click after a hold.
    if (held && !held.long && !held.elapsed) held.short();
  }
  cancel() { if (this.timer !== undefined) this.timers.clear(this.timer); this.timer = undefined; this.held = null; }
}
