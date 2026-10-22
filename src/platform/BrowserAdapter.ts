import type { NativeAction } from '../types/launcher';
import { plannedAction, type PlatformAdapter } from './PlatformAdapter';
import { UnavailableMediaAdapter } from './UnavailableMediaAdapter';
import type { MediaAdapter } from '../types/media';
import { AvPlayController } from './AvPlayController';
import { ThumbnailService } from '../services/thumbnails';
import { TvApplications } from './launchTvApp';

export class BrowserAdapter implements PlatformAdapter {
  readonly kind = 'browser' as const;
  readonly player = new AvPlayController();
  readonly thumbnails = new ThumbnailService();
  readonly apps = new TvApplications();
  registerMediaKeys() { return () => {}; }
  constructor(readonly media: MediaAdapter = new UnavailableMediaAdapter()) {}
  async perform(action: NativeAction) { return plannedAction(action); }
  async exit() { return { status: 'unsupported' as const, title: 'Close this browser tab', message: 'The TV version closes FrameOS. In this preview, close the browser tab to exit.' }; }
}
