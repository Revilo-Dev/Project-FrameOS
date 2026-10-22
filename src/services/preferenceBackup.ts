import { loadSettings, SETTINGS_KEY, type SettingsStorage } from './settings';
import type { Settings } from '../types/settings';
import { loadWidgets, WIDGETS_KEY, type WidgetPreferences } from './widgets';
import { loadMediaPreferences, MEDIA_PREFERENCES_KEY, type MediaPreferences } from './mediaPreferences';
import { loadOrganiser, ORGANISER_KEY, type LocalOrganiser } from './localOrganiser';
import { LAUNCHER_KEY, loadLauncherPreferences, type LauncherPreferences } from './launcherPreferences';

export const RECOVERY_KEY = 'frameos.preferences.recovery.v2';
export const BACKUP_LIMIT = 256 * 1024;
export interface PreferenceBundle { settings: Settings; widgets: WidgetPreferences; media: MediaPreferences; organiser: LocalOrganiser; launcher: LauncherPreferences }
const sections = { settings: SETTINGS_KEY, widgets: WIDGETS_KEY, media: MEDIA_PREFERENCES_KEY, organiser: ORGANISER_KEY, launcher: LAUNCHER_KEY } as const;
export function readPreferenceBundle(storage: SettingsStorage): PreferenceBundle {
  return { settings: loadSettings(storage), widgets: loadWidgets(storage), media: loadMediaPreferences(storage), organiser: loadOrganiser(storage), launcher: loadLauncherPreferences(storage) };
}
export function parsePreferenceBackup(text: string): PreferenceBundle {
  if (text.length * 2 > BACKUP_LIMIT) throw Error('Backup exceeds the 256 KiB limit.');
  const value = JSON.parse(text);
  if (value?.format !== 'frameos.preferences' || ![1, 2].includes(value.version) || !value.preferences || typeof value.preferences !== 'object') throw Error('Unsupported backup format/version.');
  const source = value.preferences;
  for (const section of Object.keys(sections) as (keyof PreferenceBundle)[]) {
    if (section === 'launcher' && value.version === 1 && source.launcher === undefined) continue;
    if (!source[section] || source[section].version !== 1) throw Error(`Unsupported ${section} preference version.`);
  }
  // Existing loaders perform bounded validation and legacy field migrations.
  // An allowlist excludes account tokens, calendar data, caches and unknown keys.
  const data = new Map<string, string>(Object.entries(sections).map(([section, key]) => [key, JSON.stringify(source[section] ?? null)]));
  return readPreferenceBundle({ getItem: key => data.get(key) ?? null, setItem() {} });
}
export function createPreferenceBackup(bundle: PreferenceBundle) {
  const preferences = parsePreferenceBackup(JSON.stringify({ format: 'frameos.preferences', version: 2, preferences: bundle }));
  const text = JSON.stringify({ format: 'frameos.preferences', version: 2, createdAt: new Date().toISOString(), preferences }, null, 2);
  if (text.length * 2 > BACKUP_LIMIT) throw Error('Backup exceeds the 256 KiB limit.');
  return text;
}
export function restorePreferenceBackup(storage: SettingsStorage, text: string, current = readPreferenceBundle(storage)): PreferenceBundle {
  const bundle = parsePreferenceBackup(text);
  const previous = new Map<string, string | null>(Object.values(sections).map(key => [key, storage.getItem(key)]));
  // Abort before touching any preferences if a recovery copy cannot be saved.
  const recovery = createPreferenceBackup(current);
  storage.setItem(RECOVERY_KEY, recovery);
  if (storage.getItem(RECOVERY_KEY) !== recovery) throw Error('The recovery copy could not be verified. Preferences were kept.');
  const written: string[] = [];
  try {
    for (const section of Object.keys(sections) as (keyof PreferenceBundle)[]) {
      const key = sections[section], encoded = JSON.stringify(bundle[section]);
      written.push(key); storage.setItem(key, encoded);
      if (storage.getItem(key) !== encoded) throw Error('Preference readback failed.');
    }
  } catch {
    let restored = true;
    for (const key of written.reverse()) {
      try {
        const original = previous.get(key) ?? null;
        if (original === null && storage.removeItem) storage.removeItem(key); else storage.setItem(key, original ?? 'null');
        const actual = storage.getItem(key);
        if (actual !== original && !(original === null && actual === 'null')) restored = false;
      } catch { restored = false; }
    }
    throw Error(restored ? 'Import failed; your previous preferences were restored.' : 'Import failed and storage prevented complete rollback. The recovery copy was retained.');
  }
  return bundle;
}
