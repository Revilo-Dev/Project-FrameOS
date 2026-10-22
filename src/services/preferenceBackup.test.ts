import { it } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_LIMIT, createPreferenceBackup, parsePreferenceBackup, readPreferenceBundle, RECOVERY_KEY, restorePreferenceBackup } from './preferenceBackup';
import { configuredDock, LAUNCHER_KEY, loadLauncherPreferences } from './launcherPreferences';
import { SETTINGS_KEY } from './settings';
function memory() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }
it('round trips only allowlisted preferences and keeps Art/Settings dock controls intact', () => {
  const storage = memory(); storage.setItem('frameos.account.token', 'secret');
  storage.setItem(LAUNCHER_KEY, JSON.stringify({ version: 1, pins: { youtube: { appId: 'Abcdef1234.Player', name: 'Player' }, art: { appId: 'BadApp', name: 'Bad' }, stan: { appId: 'com.samsung.tv.csfs', name: 'Home' } } }));
  const bundle = readPreferenceBundle(storage), text = createPreferenceBackup(bundle);
  assert.doesNotMatch(text, /secret|account.token|BadApp/); assert.deepEqual(parsePreferenceBackup(text), bundle);
  const dock = configuredDock(loadLauncherPreferences(storage)); assert.equal(dock.find(item => item.id === 'youtube')?.name, 'Player'); assert.equal(dock.find(item => item.id === 'art')?.action.type, 'art-mode'); assert.equal(dock.find(item => item.id === 'settings')?.action.type, 'settings');
});
it('migrates v1 backups with no launcher and existing legacy wallpaper/widget fields', () => {
  const preferences = readPreferenceBundle(memory());
  const source = { ...preferences, settings: { ...preferences.settings, wallpaper: 'dusk' }, widgets: { version: 1, enabled: ['weather', 'calendar', 'world-clock'] }, launcher: undefined };
  const bundle = parsePreferenceBackup(JSON.stringify({ format: 'frameos.preferences', version: 1, preferences: source }));
  assert.deepEqual(bundle.launcher, { version: 1, pins: {} }); assert.notEqual(bundle.settings.wallpaper, 'dusk'); assert.deepEqual(bundle.widgets.enabled, ['weather', 'bitcoin', 'world-clock']);
});
it('rejects unsupported backup/section versions and oversized input before writing', () => {
  const storage = memory(), preferences = readPreferenceBundle(storage);
  assert.throws(() => parsePreferenceBackup('x'.repeat(BACKUP_LIMIT)), /limit/);
  assert.throws(() => parsePreferenceBackup(JSON.stringify({ format: 'frameos.preferences', version: 3, preferences })), /version/);
  assert.throws(() => restorePreferenceBackup(storage, JSON.stringify({ format: 'frameos.preferences', version: 2, preferences: { ...preferences, launcher: { version: 99 } } })), /version/);
  assert.equal(storage.data.size, 0);
});
it('saves a verified recovery copy before import and restores the prior state on a partial write failure', () => {
  const storage = memory(), before = readPreferenceBundle(storage), next = { ...before, settings: { ...before.settings, theme: 'warm' as const } };
  storage.setItem(SETTINGS_KEY, JSON.stringify(before.settings));
  const original = new Map(storage.data), set = storage.setItem; let writes = 0;
  storage.setItem = (key, value) => { writes++; if (writes === 3) throw Error('quota'); set(key, value); };
  assert.throws(() => restorePreferenceBackup(storage, createPreferenceBackup(next)), /previous preferences were restored/);
  assert.deepEqual(parsePreferenceBackup(storage.getItem(RECOVERY_KEY)!), before);
  storage.data.delete(RECOVERY_KEY); assert.deepEqual(storage.data, original);
});
it('aborts import if a recovery copy cannot be saved or verified', () => {
  const storage = memory(), text = createPreferenceBackup(readPreferenceBundle(storage));
  storage.setItem = () => { throw Error('quota'); }; assert.throws(() => restorePreferenceBackup(storage, text), /quota/); assert.equal(storage.data.size, 0);
  storage.setItem = () => {}; assert.throws(() => restorePreferenceBackup(storage, text), /recovery copy/); assert.equal(storage.data.size, 0);
});
it('reports incomplete rollback and retains the recovery copy when storage keeps failing', () => {
  const storage = memory(), before = readPreferenceBundle(storage), text = createPreferenceBackup({ ...before, settings: { ...before.settings, theme: 'warm' } });
  const set = storage.setItem; let writes = 0;
  storage.setItem = (key, value) => { if (++writes >= 3) throw Error('quota'); set(key, value); }; storage.removeItem = () => { throw Error('quota'); };
  assert.throws(() => restorePreferenceBackup(storage, text), /complete rollback/); assert.deepEqual(parsePreferenceBackup(storage.getItem(RECOVERY_KEY)!), before);
});
