import type { Settings } from '../types/settings';

export const SETTINGS_KEY = 'frameos.settings.v1';
export const DEFAULT_SETTINGS: Settings = { version: 1, theme: 'slate', wallpaper: 'tidal', motion: 'subtle' };
export interface SettingsStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadSettings(storage: SettingsStorage): Settings {
  try {
    const value: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) || 'null');
    if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
    const saved = value as Partial<Settings>;
    if (saved.version !== 1) return { ...DEFAULT_SETTINGS };
    return {
      version: 1,
      theme: ['slate', 'midnight', 'warm'].indexOf(saved.theme || '') >= 0 ? saved.theme! : DEFAULT_SETTINGS.theme,
      wallpaper: ['tidal', 'dune', 'dusk'].indexOf(saved.wallpaper || '') >= 0 ? saved.wallpaper! : DEFAULT_SETTINGS.wallpaper,
      motion: ['full', 'subtle', 'off'].indexOf(saved.motion || '') >= 0 ? saved.motion! : DEFAULT_SETTINGS.motion,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage: SettingsStorage, settings: Settings): boolean {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}

// Accessing localStorage itself can throw on restricted widget/browser origins.
export function browserStorage(): SettingsStorage {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
}
