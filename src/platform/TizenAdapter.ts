import type { NativeAction } from '../types/launcher';
import { plannedAction, type PlatformAdapter } from './PlatformAdapter';

// v0.1 intentionally does not discover devices, launch apps, or touch system settings.
export class TizenAdapter implements PlatformAdapter {
  readonly kind = 'tizen' as const;
  async perform(action: NativeAction) { return plannedAction(action); }
}
