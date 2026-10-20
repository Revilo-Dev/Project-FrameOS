/** One Enter gesture; a completed hold never also fires the short action. */
export class HoldGesture {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private held: { id: string; long: boolean; short(): void } | null = null;
  constructor(private threshold = 750, private timers = { set: setTimeout, clear: clearTimeout }) {}
  isDown() { return this.held !== null; }
  down(id: string, short: () => void, long: () => void) {
    if (this.held) return;
    const held = { id, long: false, short };
    this.held = held;
    this.timer = this.timers.set(() => { if (this.held === held) { held.long = true; long(); } }, this.threshold);
  }
  release() {
    const held = this.held;
    this.cancel();
    if (held && !held.long) held.short();
  }
  cancel() { if (this.timer !== undefined) this.timers.clear(this.timer); this.timer = undefined; this.held = null; }
}
