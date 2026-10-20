import type { NativeAction } from '../types/launcher';
import { plannedAction, type PlatformAdapter } from './PlatformAdapter';
import { mediaFilesystem, TizenMediaAdapter } from './TizenMediaAdapter';

export class TizenAdapter implements PlatformAdapter {
  readonly kind = 'tizen' as const;
  readonly media: TizenMediaAdapter;
  constructor(runtime: unknown = typeof window === 'undefined' ? undefined : window) {
    this.media = new TizenMediaAdapter(mediaFilesystem(runtime), { runtimeAvailable: true });
    this.runtime = runtime;
  }
  private runtime: unknown;
  async exit() {
    try {
      const application = (this.runtime as { tizen?: { application?: { getCurrentApplication?(): { exit(): void } } } })?.tizen?.application?.getCurrentApplication?.();
      if (!application) throw new Error('unavailable');
      application.exit();
      return null;
    } catch { return { status: 'error' as const, title: 'Unable to close FrameOS', message: 'Use the TV remote to return to Samsung Home.' }; }
  }
  async perform(action: NativeAction) { return plannedAction(action); }
}
