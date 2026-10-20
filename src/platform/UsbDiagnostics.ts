export interface UsbDiagnosticStorage { label: string; type: string; state: string }
export interface UsbDiagnosticRoot { storage: string; path: string; entries: number; skipped: number; at: number }
export interface UsbDiagnosticError { operation: string; name: string; message: string; at: number }
export interface UsbDiagnosticSnapshot {
  runtimeAvailable: boolean;
  filesystemAvailable: boolean;
  readPrivilegeDeclared: boolean | null;
  storages: UsbDiagnosticStorage[];
  roots: UsbDiagnosticRoot[];
  lastScan: number | null;
  lastError: UsbDiagnosticError | null;
  events: { at: number; message: string }[];
}

// Bounded, memory-only diagnostics. Never retain filenames or file contents.
export class UsbDiagnostics {
  private listeners = new Set<() => void>();
  private state: UsbDiagnosticSnapshot;
  constructor(runtimeAvailable: boolean, filesystemAvailable: boolean) {
    this.state = { runtimeAvailable, filesystemAvailable, readPrivilegeDeclared: null, storages: [], roots: [], lastScan: null, lastError: null, events: [] };
  }
  get = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(patch: Partial<UsbDiagnosticSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  event(message: string) {
    this.update({ events: [...this.state.events, { at: Date.now(), message }].slice(-16) });
    console.info(`[FrameOS USB] ${message}`);
  }
  error(operation: string, error: unknown) {
    const value = error as { name?: unknown; message?: unknown } | null;
    const clean = (text: unknown) => typeof text === 'string' ? text.replace(/[\x00-\x1f]/g, ' ').slice(0, 240) : '';
    const name = clean(value?.name) || 'UnknownError';
    const message = clean(value?.message) || 'No native error message provided.';
    this.update({ lastError: { operation, name, message, at: Date.now() } });
    this.event(`${operation}: ${name}`);
  }
  root(storage: string, path: string, entries: number, skipped: number) {
    const at = Date.now();
    this.update({ roots: [...this.state.roots.filter(root => root.storage !== storage || root.path !== path), { storage, path, entries, skipped, at }].slice(-16), lastScan: at });
    this.event(`Directory read: ${entries} entries, ${skipped} invalid entries skipped.`);
  }
  async inspectManifest() {
    if (!this.state.runtimeAvailable || typeof XMLHttpRequest === 'undefined') return;
    try {
      const xml = await new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', new URL('config.xml', window.location.href).href);
        request.timeout = 5000;
        request.onload = () => (request.status === 0 || request.status === 200) && request.responseText ? resolve(request.responseText) : reject(new Error('Packaged manifest could not be read.'));
        request.onerror = request.ontimeout = () => reject(new Error('Packaged manifest is unavailable.'));
        request.send();
      });
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      if (document.getElementsByTagName('parsererror').length || document.documentElement.localName !== 'widget') throw new Error('Packaged manifest is invalid.');
      const privileges = document.getElementsByTagNameNS('http://tizen.org/ns/widgets', 'privilege');
      this.update({ readPrivilegeDeclared: Array.from(privileges).some(node => node.getAttribute('name') === 'http://tizen.org/privilege/filesystem.read') });
    } catch (error) { this.error('Read packaged privilege declaration', error); }
  }
}
