export interface LaunchRecord {
  sequence: number; name: string; appId: string; startedAt: number;
  state: 'Resolving installed app' | 'Launch requested' | 'API accepted' | 'Failed';
  method: string; error: string; discovery: string; frameosHidden: boolean; returned: boolean;
}
export function launchError(error: unknown) {
  const value = error as { name?: string; message?: string } | null;
  return (typeof error === 'string' ? error : `${value?.name || 'Error'}: ${value?.message || 'No additional TV detail'}`).replace(/[\x00-\x1f]/g, ' ').slice(0, 400);
}
/** Bounded, memory-only evidence. An API acknowledgement never proves display. */
export class LaunchDiagnostics {
  private records: LaunchRecord[] = [];
  private sequence = 0;
  private listeners = new Set<() => void>();
  constructor(private now = Date.now) {}
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  get = () => this.records.map(record => ({ ...record }));
  begin(name: string) {
    const record: LaunchRecord = { sequence: ++this.sequence, name, appId: '', startedAt: this.now(), state: 'Resolving installed app', method: '', error: '', discovery: 'Not checked', frameosHidden: false, returned: false };
    this.records.unshift(record); this.records.length = Math.min(this.records.length, 20); this.emit(); return record.sequence;
  }
  update(sequence: number, value: Partial<LaunchRecord>) { const record = this.records.find(item => item.sequence === sequence); if (record) { Object.assign(record, value); this.emit(); } }
  visibility(hidden: boolean) {
    const record = this.records[0];
    if (!record || this.now() - record.startedAt > 30000 || record.state === 'Failed') return;
    if (hidden) record.frameosHidden = true; else if (record.frameosHidden) record.returned = true;
    this.emit();
  }
  private emit() { for (const listener of this.listeners) listener(); }
}
