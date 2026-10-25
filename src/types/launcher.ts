export type IconName = 'usb' | 'play' | 'stan' | 'prime' | 'gallery' | 'art' | 'browser' | 'settings' | 'arrow' | 'close' | 'check' | 'home' | 'moon' | 'file' | 'music' | 'apps' | 'tv' | 'sources';

export type NativeAction =
  | { type: 'usb' }
  | { type: 'launch-app'; app: 'youtube' | 'stan' | 'prime' }
  | { type: 'gallery' }
  | { type: 'art-mode' }
  | { type: 'browser' }
  | { type: 'system-settings' }
  | { type: 'samsung-home' }
  | { type: 'installed-app'; appId: string; name: string }
  | { type: 'avplay'; source: string };

export type LauncherAction = NativeAction | { type: 'settings' } | { type: 'all-apps' } | { type: 'sources' } | { type: 'source'; sourceType: string; number: number };

export interface LauncherItem {
  id: string;
  name: string;
  icon: IconName;
  action: LauncherAction;
  availability: 'available' | 'planned' | 'unavailable';
  iconPath?: string;
  kind?: 'internal' | 'installed' | 'system' | 'pinned';
  metadata?: { category: string; description: string };
}

export interface ActionResult {
  status: 'unsupported' | 'unavailable' | 'error';
  title: string;
  message: string;
}
