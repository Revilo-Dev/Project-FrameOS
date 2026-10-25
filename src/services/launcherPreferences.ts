import { browserDestinations, launcherItems } from './catalog';
import type { LauncherItem } from '../types/launcher';
import type { SettingsStorage } from './settings';
import { validAppId, FRAMEOS_APP_ID, SAMSUNG_HOME_ID, safeIconPath, type InstalledApp } from '../platform/installedApps';
import { tvAppCandidates, type TvApp } from '../platform/launchTvApp';

export const LEGACY_LAUNCHER_KEY = 'frameos.launcher.v1';
export const V2_LAUNCHER_KEY = 'frameos.launcher.v2';
export const LAUNCHER_KEY = 'frameos.launcher.v3';
export const dockSlots = ['youtube', 'stan', 'prime', 'gallery', 'browser'] as const;
export type DockSlot = typeof dockSlots[number];
export interface DockPin { appId: string; name: string; iconPath?: string }
export interface SourcePin { type: string; number: number }
export interface LauncherPreferences { version: 3; order: string[]; pins: Record<string, DockPin>; sources: Record<string, SourcePin>; lastFocused: string }
export const protectedDockIds = ['art', 'tv', 'all-apps'];
const builtins = [...browserDestinations, launcherItems.find(item => item.id === 'all-apps')!];
const reserved = [FRAMEOS_APP_ID, SAMSUNG_HOME_ID, 'org.tizen.art-app', 'com.samsung.tv.coba.art', 'com.samsung.tv.coba.setting'];
export function defaultDock(): LauncherPreferences { return { version: 3, order: launcherItems.map(item => item.id), pins: {}, sources: {}, lastFocused: 'youtube' }; }
export function sourceShortcut(source: SourcePin): LauncherItem {
  return { id: `source:${source.type}:${source.number}`, name: source.type === 'TV' ? 'TV input' : `${source.type.replace(/_/g, ' ')} ${source.number}`, icon: 'sources', kind: 'internal', action: { type: 'source', sourceType: source.type, number: source.number }, availability: 'available' };
}
export function normaliseDock(value: unknown): LauncherPreferences {
  const source = value as Partial<LauncherPreferences> | null;
  const result = defaultDock();
  if (!source || ![1, 2, 3].includes(source.version as number)) return result;
  const legacy = source.version as number === 1;
  const order = legacy ? result.order : Array.isArray(source.order) ? source.order : result.order;
  result.order = [];
  const seenApps = new Set<string>();
  for (const id of order) {
    if (typeof id !== 'string' || result.order.includes(id)) continue;
    const input = source.sources?.[id];
    if (input && typeof input.type === 'string' && /^[A-Z0-9_]{1,40}$/.test(input.type) && Number.isInteger(input.number) && input.number >= 0 && id === `source:${input.type}:${input.number}`) {
      result.sources[id] = { type: input.type, number: input.number }; result.order.push(id); continue;
    }
    const pin = source.pins?.[id];
    if (pin && !protectedDockIds.includes(id) && (dockSlots.includes(id as DockSlot) || id === `native:${pin.appId}`) && validAppId(pin.appId) && !reserved.includes(pin.appId) && typeof pin.name === 'string' && pin.name.trim()) {
      if (seenApps.has(pin.appId)) continue;
      seenApps.add(pin.appId);
      result.pins[id] = { appId: pin.appId, name: pin.name.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 120), ...(safeIconPath(pin.iconPath) ? { iconPath: safeIconPath(pin.iconPath) } : {}) };
      result.order.push(id);
    } else if (builtins.some(item => item.id === id)) result.order.push(id);
  }
  result.order = ['art', ...result.order.filter(id => id !== 'art')];
  for (const id of protectedDockIds) if (!result.order.includes(id)) result.order.push(id);
  // Prefer a user's migrated shortcut over a default that opens the same app.
  const pinnedApps = Object.values(result.pins).map(pin => ({ id: pin.appId, name: pin.name }));
  result.order = result.order.filter(id => {
    if (result.pins[id] || protectedDockIds.includes(id)) return true;
    const builtin = builtins.find(item => item.id === id);
    return !builtin || !nativeIdentity(builtin, pinnedApps);
  });
  result.lastFocused = typeof source.lastFocused === 'string' && result.order.includes(source.lastFocused) ? source.lastFocused : result.order.includes('youtube') ? 'youtube' : 'art';
  return result;
}
export function loadLauncherPreferences(storage: SettingsStorage): LauncherPreferences {
  try { return normaliseDock(JSON.parse(storage.getItem(LAUNCHER_KEY) ?? storage.getItem(V2_LAUNCHER_KEY) ?? storage.getItem(LEGACY_LAUNCHER_KEY) ?? 'null')); }
  catch { return defaultDock(); }
}
export function saveLauncherPreferences(storage: SettingsStorage, value: LauncherPreferences) {
  try { const text = JSON.stringify(normaliseDock(value)); storage.setItem(LAUNCHER_KEY, text); return storage.getItem(LAUNCHER_KEY) === text; } catch { return false; }
}
export function configuredDock(preferences: LauncherPreferences): LauncherItem[] {
  return preferences.order.map(id => {
    if (preferences.sources[id]) return sourceShortcut(preferences.sources[id]);
    const pin = preferences.pins[id];
    if (pin) return { id, name: pin.name, icon: 'play', iconPath: pin.iconPath, kind: 'pinned', action: { type: 'installed-app', appId: pin.appId, name: pin.name }, availability: 'available' } as LauncherItem;
    const item = builtins.find(item => item.id === id)!;
    return { ...item, kind: ['art-mode', 'usb', 'all-apps', 'settings'].includes(item.action.type) ? 'internal' : ['samsung-home', 'system-settings', 'sources'].includes(item.action.type) ? 'system' : 'installed' } as LauncherItem;
  });
}
export function nativeIdentity(item: LauncherItem, apps: InstalledApp[]): string | undefined {
  const action = item.action;
  if (action.type === 'installed-app') return action.appId;
  const destination = action.type === 'launch-app' ? action.app : ['browser', 'gallery'].includes(action.type) ? action.type as TvApp : undefined;
  return destination ? tvAppCandidates(destination, apps)[0] : undefined;
}
export function appBrowserItems(apps: InstalledApp[]): LauncherItem[] {
  const destinations = browserDestinations.filter(item => !['launch-app', 'gallery', 'browser'].includes(item.action.type) || !!nativeIdentity(item, apps)).map(item => ({ ...item, iconPath: apps.find(app => app.id === nativeIdentity(item, apps))?.iconPath }));
  const represented = new Set(destinations.map(item => nativeIdentity(item, apps)).filter(Boolean));
  return [...destinations, ...apps.filter(app => !represented.has(app.id)).map(app => ({ id: `native:${app.id}`, name: app.name, icon: 'play' as const, iconPath: app.iconPath, kind: 'pinned' as const, action: { type: 'installed-app' as const, appId: app.id, name: app.name }, availability: 'available' as const }))];
}
export function pinnedItem(preferences: LauncherPreferences, item: LauncherItem, apps: InstalledApp[] = []): LauncherItem | undefined {
  const identity = nativeIdentity(item, apps);
  return configuredDock(preferences).find(pin => pin.id === item.id && pin.action.type === item.action.type || !!identity && nativeIdentity(pin, apps) === identity);
}
export function addDockItem(preferences: LauncherPreferences, item: LauncherItem, apps: InstalledApp[] = []): LauncherPreferences {
  if (pinnedItem(preferences, item, apps)) return preferences;
  let id = item.id;
  const pins = { ...preferences.pins };
  if (item.action.type === 'source') {
    const source = { type: item.action.sourceType, number: item.action.number };
    return normaliseDock({ ...preferences, order: [...preferences.order, sourceShortcut(source).id], sources: { ...preferences.sources, [sourceShortcut(source).id]: source } });
  }
  if (item.action.type === 'installed-app') {
    id = `native:${item.action.appId}`;
    pins[id] = { appId: item.action.appId, name: item.name, iconPath: item.iconPath };
  } else if (preferences.pins[id]) {
    const nativeId = nativeIdentity(item, apps);
    if (!nativeId) return preferences;
    id = `native:${nativeId}`; pins[id] = { appId: nativeId, name: item.name, iconPath: item.iconPath };
  }
  return normaliseDock({ ...preferences, order: [...preferences.order, id], pins });
}
export function removeDockItem(preferences: LauncherPreferences, id: string): LauncherPreferences {
  if (protectedDockIds.includes(id)) return preferences;
  const pins = { ...preferences.pins }, sources = { ...preferences.sources }; delete pins[id]; delete sources[id];
  return normaliseDock({ ...preferences, order: preferences.order.filter(item => item !== id), pins, sources });
}
export function moveDockItem(preferences: LauncherPreferences, id: string, delta: number): LauncherPreferences {
  if (id === 'art') return preferences;
  const order = [...preferences.order], index = order.indexOf(id);
  if (index < 1) return preferences;
  const target = Math.max(1, Math.min(order.length - 1, index + delta));
  order.splice(index, 1); order.splice(target, 0, id);
  return { ...preferences, order };
}
