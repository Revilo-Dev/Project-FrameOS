export type IconName = 'usb' | 'play' | 'stan' | 'prime' | 'gallery' | 'art' | 'browser' | 'settings' | 'arrow' | 'close' | 'check' | 'home' | 'moon' | 'file' | 'music';

export type NativeAction =
  | { type: 'usb' }
  | { type: 'launch-app'; app: 'youtube' | 'stan' | 'prime' }
  | { type: 'gallery' }
  | { type: 'art-mode' }
  | { type: 'browser' }
  | { type: 'system-settings' }
  | { type: 'avplay'; source: string };

export type LauncherAction = NativeAction | { type: 'settings' };

export interface LauncherItem {
  id: string;
  name: string;
  icon: IconName;
  action: LauncherAction;
  availability: 'available' | 'planned' | 'unavailable';
  metadata?: { category: string; description: string };
}

export interface ActionResult {
  status: 'unsupported' | 'unavailable' | 'error';
  title: string;
  message: string;
}
