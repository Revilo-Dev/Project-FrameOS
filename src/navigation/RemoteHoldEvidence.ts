import { remoteKey } from './remote';
export interface HoldEvidence { status: 'disabled' | 'testing' | 'supported' | 'unsupported'; samples: number; reason: string; events: { type: string; keyCode: number; repeat: boolean; time: number }[] }
/** Session-only opt-in measurement. No model/firmware implies usable hold events. */
export class RemoteHoldEvidence {
  private value: HoldEvidence = { status: 'disabled', samples: 0, reason: 'Dock hold editing is disabled until this remote is tested.', events: [] };
  private down?: number;
  private timeout?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  get = () => ({ ...this.value, events: [...this.value.events] });
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { for (const listener of this.listeners) listener(); }
  start() {
    if (this.value.status === 'unsupported') return;
    this.cancel(); this.value = { status: 'testing', samples: 0, reason: 'Hold OK for about one second, then release. Repeat twice.', events: [] }; this.emit();
  }
  private fail(reason: string) { this.cancel(); this.value = { ...this.value, status: 'unsupported', reason: `${reason} Dock editing stays disabled for this session.` }; this.emit(); }
  observe = (event: Pick<KeyboardEvent, 'key' | 'keyCode' | 'type' | 'timeStamp' | 'repeat'>): boolean => {
    if (this.value.status !== 'testing' || remoteKey(event) !== 'select') return false;
    this.value.events.push({ type: event.type, keyCode: event.keyCode, repeat: event.repeat, time: Math.round(event.timeStamp) }); this.value.events = this.value.events.slice(-32);
    if (event.type === 'keydown' && this.down === undefined) {
      if (event.repeat) { this.fail('A repeated key arrived without a fresh press.'); return true; }
      this.down = event.timeStamp; this.timeout = setTimeout(() => this.fail('No Select release was received.'), 2600);
    } else if (event.type === 'keyup' && this.down !== undefined) {
      const duration = event.timeStamp - this.down; this.cancel();
      if (duration < 650 || duration > 2500) { this.fail('The hold did not produce a reliable 650–2500 ms press/release pair.'); return true; }
      this.value.samples++;
      if (this.value.samples >= 2) { this.value.status = 'supported'; this.value.reason = 'Two sustained OK press/release pairs verified. Hold editing is available for this session.'; }
    }
    this.emit(); return true;
  };
  cancel() { clearTimeout(this.timeout); this.timeout = undefined; this.down = undefined; }
  suspend() { if (this.value.status === 'testing') this.fail('The test lost focus.'); else this.cancel(); }
  reject() { this.fail('A sustained OK press did not release reliably.'); }
  disable() { this.cancel(); if (this.value.status !== 'unsupported') this.value.status = 'disabled'; this.value.reason = 'Dock hold editing is disabled.'; this.emit(); }
}
