import { launcherItems } from './catalog';
import type { LauncherItem } from '../types/launcher';
import type { SettingsStorage } from './settings';
import { validAppId, FRAMEOS_APP_ID, SAMSUNG_HOME_ID } from '../platform/installedApps';

export const LAUNCHER_KEY = 'frameos.launcher.v1';
export const dockSlots = ['youtube', 'stan', 'prime', 'gallery', 'browser'] as const;
export type DockSlot = typeof dockSlots[number];
export interface DockPin { appId: string; name: string }
export interface LauncherPreferences { version: 1; pins: Partial<Record<DockSlot, DockPin>> }
export function loadLauncherPreferences(storage: SettingsStorage): LauncherPreferences {
  const result: LauncherPreferences = { version: 1, pins: {} };
  try {
    const value = JSON.parse(storage.getItem(LAUNCHER_KEY) || 'null');
    if (value?.version !== 1) return result;
    for (const slot of dockSlots) {
      const pin = value.pins?.[slot];
      if (pin && validAppId(pin.appId) && ![FRAMEOS_APP_ID, SAMSUNG_HOME_ID, 'org.tizen.art-app', 'com.samsung.tv.coba.art', 'com.samsung.tv.coba.setting'].includes(pin.appId) && typeof pin.name === 'string' && pin.name.trim()) result.pins[slot] = { appId: pin.appId, name: pin.name.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 80) };
    }
  } catch { /* Existing defaults remain usable without storage. */ }
  return result;
}
export function saveLauncherPreferences(storage: SettingsStorage, value: LauncherPreferences) {
  try { storage.setItem(LAUNCHER_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function configuredDock(preferences: LauncherPreferences): LauncherItem[] {
  return launcherItems.map(item => {
    const pin = preferences.pins[item.id as DockSlot];
    return pin && dockSlots.includes(item.id as DockSlot) ? { ...item, name: pin.name, icon: 'play', action: { type: 'installed-app', appId: pin.appId, name: pin.name } } : item;
  });
}
