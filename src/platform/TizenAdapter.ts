import type { NativeAction } from '../types/launcher';
import { plannedAction, type PlatformAdapter } from './PlatformAdapter';
import { mediaFilesystem, TizenMediaAdapter } from './TizenMediaAdapter';
import { AvPlayController, avPlayApi } from './AvPlayController';
import { ThumbnailService } from '../services/thumbnails';
import { fallbackThumbnailProvider } from './thumbnailFallbacks';
import { browserStorage } from '../services/settings';
import { ThumbnailDiagnostics } from './ThumbnailDiagnostics';
import { registerMediaKeys } from './mediaKeys';
import { launchTvApp } from './launchTvApp';

export class TizenAdapter implements PlatformAdapter {
  readonly kind = 'tizen' as const;
  readonly media: TizenMediaAdapter;
  readonly player: AvPlayController;
  readonly thumbnails: ThumbnailService;
  constructor(runtime: unknown = typeof window === 'undefined' ? undefined : window) {
    this.media = new TizenMediaAdapter(mediaFilesystem(runtime), { runtimeAvailable: true });
    this.runtime = runtime;
    this.player = new AvPlayController(avPlayApi(runtime));
    const diagnostics = new ThumbnailDiagnostics();
    this.thumbnails = new ThumbnailService(fallbackThumbnailProvider(runtime, { diagnostics, resolveFile: entry => this.media.resolveFile(entry) }), browserStorage(), Date.now, undefined, diagnostics);
  }
  private runtime: unknown;
  async exit() {
    this.player.close();
    try {
      const application = (this.runtime as { tizen?: { application?: { getCurrentApplication?(): { exit(): void } } } })?.tizen?.application?.getCurrentApplication?.();
      if (!application) throw new Error('unavailable');
      application.exit();
      return null;
    } catch { return { status: 'error' as const, title: 'Unable to close FrameOS', message: 'Use the TV remote to return to Samsung Home.' }; }
  }
  async perform(action: NativeAction) {
    if (action.type === 'launch-app') return launchTvApp(this.runtime, action.app);
    if (action.type === 'gallery' || action.type === 'browser') return launchTvApp(this.runtime, action.type);
    if (action.type === 'art-mode') return launchTvApp(this.runtime, 'art');
    return plannedAction(action);
  }
  registerMediaKeys() { return registerMediaKeys(this.runtime); }
}
