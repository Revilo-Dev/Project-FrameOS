import type { MediaEntry } from '../types/media';
import type { SettingsStorage } from './settings';

export const MEDIA_PREFERENCES_KEY = 'frameos.media.v1';
export interface MediaPreferences { version: 1; showHidden: boolean; hidden: string[] }
export const defaultMediaPreferences = (): MediaPreferences => ({ version: 1, showHidden: false, hidden: [] });
function relativePath(storage: string, path: string) { return path.startsWith(`${storage}/`) ? path.slice(storage.length + 1) : path; }
export function hiddenIdentity(storage: string, path: string): string { return JSON.stringify([storage, relativePath(storage, path)]); }
function validIdentity(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 4096) return false;
  try { const value: unknown = JSON.parse(key); return Array.isArray(value) && value.length === 2 && value.every(part => typeof part === 'string' && part.length > 0 && !/[\x00-\x1f]/.test(part)) && !value[1].split('/').some((part: string) => part === '.' || part === '..'); }
  catch { return false; }
}
export function loadMediaPreferences(storage: SettingsStorage): MediaPreferences {
  try {
    const value = JSON.parse(storage.getItem(MEDIA_PREFERENCES_KEY) || 'null') as Partial<MediaPreferences> | null;
    if (value?.version !== 1) return defaultMediaPreferences();
    return { version: 1, showHidden: value.showHidden === true, hidden: Array.isArray(value.hidden) ? [...new Set(value.hidden.filter(validIdentity))].slice(0, 4096) : [] };
  } catch { return defaultMediaPreferences(); }
}
export function saveMediaPreferences(storage: SettingsStorage, preferences: MediaPreferences): boolean {
  try { storage.setItem(MEDIA_PREFERENCES_KEY, JSON.stringify(preferences)); return true; } catch { return false; }
}
export function isMediaHidden(entry: MediaEntry, hidden: ReadonlySet<string>): boolean {
  let path = entry.path;
  while (path.includes('/')) {
    if (hidden.has(hiddenIdentity(entry.storageId, path))) return true;
    path = path.slice(0, path.lastIndexOf('/'));
  }
  return false;
}
export function toggleMediaHidden(preferences: MediaPreferences, entry: MediaEntry): MediaPreferences {
  const hidden = new Set(preferences.hidden);
  if (isMediaHidden(entry, hidden)) {
    // Restoring an inherited hidden item must also restore its hidden ancestors.
    let path = entry.path;
    while (path.includes('/')) { hidden.delete(hiddenIdentity(entry.storageId, path)); path = path.slice(0, path.lastIndexOf('/')); }
  } else {
    if (hidden.size >= 4096) throw new Error('Hidden-item storage is full. Unhide some items before hiding more.');
    hidden.add(hiddenIdentity(entry.storageId, entry.path));
  }
  return { ...preferences, hidden: [...hidden] };
}
