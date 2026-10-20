import type { ActionResult, NativeAction } from '../types/launcher';

export interface PlatformAdapter {
  readonly kind: 'browser' | 'tizen';
  perform(action: NativeAction): Promise<ActionResult>;
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
