import type { ActionResult, NativeAction } from '../types/launcher';
import type { MediaAdapter } from '../types/media';
import type { AvPlayController } from './AvPlayController';
import type { ThumbnailService } from '../services/thumbnails';
import type { TvApplications } from './launchTvApp';

export interface PlatformAdapter {
  readonly kind: 'browser' | 'tizen';
  readonly media: MediaAdapter;
  readonly player: AvPlayController;
  readonly thumbnails: ThumbnailService;
  readonly apps: TvApplications;
  registerMediaKeys(): () => void;
  perform(action: NativeAction): Promise<ActionResult | null>;
  exit(): Promise<ActionResult | null>;
}

export function plannedAction(action: NativeAction): ActionResult {
  const details: Record<NativeAction['type'], string> = {
    usb: 'USB discovery, file browsing and playback are planned for a future version.',
    'launch-app': 'Opening installed TV apps is planned for a future version.',
    gallery: 'Your photo gallery is planned for a future version.',
    'art-mode': 'Select Art Mode from the FrameOS Home screen.',
    'samsung-home': 'Samsung Home is available on your Samsung TV.',
    'installed-app': 'Installed applications are available on your Samsung TV.',
    browser: 'Opening the TV browser is planned for a future version.',
    'system-settings': 'Samsung system settings integration is planned for a future version.',
    avplay: 'Samsung AVPlay integration is planned for a future version.',
  };
  return { status: 'unsupported', title: 'A little more to come.', message: details[action.type] };
}
