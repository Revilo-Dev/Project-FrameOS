import type { NativeAction } from '../types/launcher';
import { plannedAction, type PlatformAdapter } from './PlatformAdapter';
import { UnavailableMediaAdapter } from './UnavailableMediaAdapter';
import type { MediaAdapter } from '../types/media';

export class BrowserAdapter implements PlatformAdapter {
  readonly kind = 'browser' as const;
  constructor(readonly media: MediaAdapter = new UnavailableMediaAdapter()) {}
  async perform(action: NativeAction) { return plannedAction(action); }
  async exit() { return { status: 'unsupported' as const, title: 'Close this browser tab', message: 'The TV version closes FrameOS. In this preview, close the browser tab to exit.' }; }
}
