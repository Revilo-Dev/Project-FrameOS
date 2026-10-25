import { launchError } from './LaunchDiagnostics';

export interface VideoSource { type: string; number: number; signal?: boolean | null }
export interface SourceChoice extends VideoSource { id: string; connected?: boolean }
interface SourceApi {
  systeminfo?: { getPropertyValue(property: string, success: (value: { connected?: VideoSource[]; disconnected?: VideoSource[] }) => void, failure: (error: unknown) => void): void };
  tvwindow?: {
    getSource?(type?: string): VideoSource;
    setSource?(source: VideoSource, success: (source: VideoSource) => void, failure: (error: unknown) => void, type?: string): void;
    show?(success: (rectangle: string[]) => void, failure: (error: unknown) => void, rectangle: string[], type: string, z: string): void;
    hide?(success: () => void, failure: (error: unknown) => void, type?: string): void;
  };
}
export const sourceId = (source: VideoSource) => `${source.type}:${source.number}`;
export const sourceLabel = (source: VideoSource) => source.type === 'TV' ? 'TV' : `${source.type.replace(/_/g, ' ')} ${source.number}`;
function validSource(value: VideoSource): boolean { return !!value && typeof value.type === 'string' && /^[A-Z0-9_]{1,40}$/.test(value.type) && Number.isInteger(value.number) && value.number >= 0; }
export const SOURCE_FALLBACK = 'Open the TV tile for Samsung Home, then select Source to change inputs manually.';
/** Public TVWindow only. A callback is evidence of API acceptance, never picture. */
export class TvSources {
  private api?: SourceApi;
  private epoch = 0;
  private windowRequested = false;
  readonly diagnostics: string[] = [];
  get active() { return this.windowRequested; }
  constructor(runtime?: unknown, private timeoutMs = 4000) { this.api = (runtime as { tizen?: SourceApi })?.tizen; }
  private log(message: string) { this.diagnostics.unshift(message); this.diagnostics.length = Math.min(this.diagnostics.length, 20); }
  async resolve(type: string, number: number): Promise<SourceChoice> {
    const result = await this.read();
    const source = result.sources.find(item => item.type === type && item.number === number);
    if (!source) throw Error(`This input is no longer reported by the TV. ${SOURCE_FALLBACK}`);
    return source;
  }
  private call<T>(operation: (success: (value: T) => void, failure: (error: unknown) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (work: () => void) => { if (!done) { done = true; clearTimeout(timer); work(); } };
      const timer = setTimeout(() => finish(() => reject(Error('TimeoutError: TV source API did not respond.'))), this.timeoutMs);
      try { operation(value => finish(() => resolve(value)), error => finish(() => reject(error))); } catch (error) { finish(() => reject(error)); }
    });
  }
  async read(): Promise<{ sources: SourceChoice[]; current?: string; note: string }> {
    const system = this.api?.systeminfo;
    if (!system?.getPropertyValue) throw Error(`Source discovery is available on the television only. ${SOURCE_FALLBACK}`);
    const value = await this.call<{ connected?: VideoSource[]; disconnected?: VideoSource[] }>((ok, fail) => system.getPropertyValue('VIDEOSOURCE', ok, fail));
    const choices = new Map<string, SourceChoice>();
    for (const [list, connected] of [[value.disconnected, false], [value.connected, true]] as const) {
      if (!Array.isArray(list)) continue;
      for (const source of list) if (validSource(source)) choices.set(sourceId(source), { type: source.type, number: source.number, id: sourceId(source), connected });
    }
    let current: string | undefined, note = '';
    try {
      const source = this.api?.tvwindow?.getSource?.('MAIN');
      if (source && validSource(source)) {
        current = sourceId(source);
        const choice = choices.get(current);
        if (choice && typeof source.signal === 'boolean') choice.signal = source.signal;
      }
    } catch (error) { note = `Current input unavailable: ${launchError(error)}`; }
    this.log(`VIDEOSOURCE returned ${choices.size} sources; current=${current || 'unknown'}`);
    return { sources: [...choices.values()], current, note };
  }
  async select(source: SourceChoice): Promise<string> {
    const epoch = ++this.epoch, window = this.api?.tvwindow;
    if (!window?.setSource || !window.show || !window.hide) throw Error(`TVWindow switching is unavailable. ${SOURCE_FALLBACK}`);
    // Re-read before sending an input request: never pass an invented/stale port.
    const latest = await this.read();
    const actual = latest.sources.find(item => item.id === source.id);
    if (!actual || epoch !== this.epoch) throw Error('Source request cancelled or input is no longer reported.');
    try { await this.call<VideoSource>((ok, fail) => window.setSource!(actual, ok, fail, 'MAIN')); }
    catch (error) { this.log(`setSource failed ${source.id}: ${launchError(error)}`); throw Error(`${launchError(error)} ${SOURCE_FALLBACK}`); }
    this.log(`setSource accepted ${source.id}; visible picture unverified`);
    if (epoch !== this.epoch) return 'Source request cancelled.';
    this.windowRequested = true;
    try {
      await this.call<string[]>((ok, fail) => window.show!(rectangle => {
        if (epoch !== this.epoch) { this.windowRequested = true; void this.hide().catch(() => {}); }
        ok(rectangle);
      }, fail, ['0', '0', '100%', '100%'], 'MAIN', 'FRONT'));
      if (epoch !== this.epoch) { await this.hide(); return 'Source request cancelled.'; }
      this.log(`show FRONT full-screen accepted ${source.id}; visible picture unverified`);
      return 'Full-screen TVWindow request accepted. Verify the picture on the TV. Press Back to return to FrameOS. If no picture appears, use Samsung Home > Source.';
    } catch (error) { this.log(`show failed ${source.id}: ${launchError(error)}`); await this.hide().catch(() => {}); throw Error(`${launchError(error)} ${SOURCE_FALLBACK}`); }
  }
  async hide(): Promise<void> {
    this.epoch++;
    if (!this.windowRequested) return;
    const window = this.api?.tvwindow;
    if (!window?.hide) throw Error(SOURCE_FALLBACK);
    await this.call<void>((ok, fail) => window.hide!(ok, fail, 'MAIN'));
    this.windowRequested = false; this.log('TVWindow hide accepted');
  }
}
