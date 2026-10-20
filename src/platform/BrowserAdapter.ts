import type { NativeAction } from '../types/launcher';
import { plannedAction, type PlatformAdapter } from './PlatformAdapter';

export class BrowserAdapter implements PlatformAdapter {
  readonly kind = 'browser' as const;
  async perform(action: NativeAction) { return plannedAction(action); }
}
