import type { ActionResult, NativeAction } from '../types/launcher';
import type { MediaAdapter } from '../types/media';
import type { AvPlayController } from './AvPlayController';
import type { ThumbnailService } from '../services/thumbnails';

export interface PlatformAdapter {
  readonly kind: 'browser' | 'tizen';
  readonly media: MediaAdapter;
  readonly player: AvPlayController;
  readonly thumbnails: ThumbnailService;
  registerMediaKeys(): () => void;
  perform(action: NativeAction): Promise<ActionResult | null>;
  exit(): Promise<ActionResult | null>;
}

export function plannedAction(action: NativeAction): ActionResult {
  const details: Record<NativeAction['type'], string> = {
    usb: 'USB discovery, file browsing and playback are planned for a future version.',
    'launch-app': 'Opening installed TV apps is planned for a future version.',
    gallery: 'Your photo gallery is planned for a future version.',
    'art-mode': 'Native Samsung Art Mode integration is planned for a future version.',
    browser: 'Opening the TV browser is planned for a future version.',
    'system-settings': 'Samsung system settings integration is planned for a future version.',
    avplay: 'Samsung AVPlay integration is planned for a future version.',
  };
  return { status: 'unsupported', title: 'A little more to come.', message: details[action.type] };
}
