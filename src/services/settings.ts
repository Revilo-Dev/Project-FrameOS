import type { Settings } from '../types/settings';
import { wallpapers } from './wallpapers';
import { DEFAULT_TIME_ZONE, isClockTimeZone } from './clock';
import { isWeatherCity } from './weather';
import { isClockFont } from './clockFonts';

export const SETTINGS_KEY = 'frameos.settings.v1';
export const DEFAULT_SETTINGS: Settings = { version: 1, theme: 'slate', wallpaper: wallpapers[0].id, motion: 'subtle', weatherCity: 'brisbane', showFps: true, timeFormat: '12h', timeZone: DEFAULT_TIME_ZONE, clockFont: 'modern' };
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
      wallpaper: wallpapers.some(item => item.id === saved.wallpaper) ? saved.wallpaper! : DEFAULT_SETTINGS.wallpaper,
      motion: ['full', 'subtle', 'off'].indexOf(saved.motion || '') >= 0 ? saved.motion! : DEFAULT_SETTINGS.motion,
      weatherCity: isWeatherCity(saved.weatherCity) ? saved.weatherCity : DEFAULT_SETTINGS.weatherCity,
      showFps: typeof saved.showFps === 'boolean' ? saved.showFps : true,
      timeFormat: saved.timeFormat === '24h' ? '24h' : '12h',
      timeZone: isClockTimeZone(saved.timeZone) ? saved.timeZone : DEFAULT_TIME_ZONE,
      clockFont: isClockFont(saved.clockFont) ? saved.clockFont : DEFAULT_SETTINGS.clockFont,
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
