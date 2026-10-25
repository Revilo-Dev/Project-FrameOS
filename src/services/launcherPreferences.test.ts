import { it } from 'node:test';
import assert from 'node:assert/strict';
import { addDockItem, appBrowserItems, configuredDock, defaultDock, LAUNCHER_KEY, LEGACY_LAUNCHER_KEY, loadLauncherPreferences, moveDockItem, normaliseDock, removeDockItem, saveLauncherPreferences } from './launcherPreferences';
import { selectableApps } from '../platform/installedApps';
import { createPreferenceBackup, parsePreferenceBackup, readPreferenceBundle, restorePreferenceBackup } from './preferenceBackup';
function memory() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }
const native = { id: 'ActualApp1.Player', name: 'Installed Player', show: true, iconPath: 'file:///opt/icons/player.png' };
it('migrates every old custom slot, deduplicates repeated IDs and retains the original v1 bytes', () => {
  const storage = memory(), old = JSON.stringify({ version: 1, pins: { youtube: { appId: native.id, name: native.name }, stan: { appId: native.id, name: native.name }, browser: { appId: 'OtherApp12.Browser', name: 'Custom Browser' } } });
  storage.setItem(LEGACY_LAUNCHER_KEY, old);
  const migrated = loadLauncherPreferences(storage);
  assert.equal(migrated.version, 2); assert.equal(Object.values(migrated.pins).length, 2);
  assert.equal(configuredDock(migrated).filter(item => item.action.type === 'installed-app').length, 2);
  assert.ok(saveLauncherPreferences(storage, migrated)); assert.equal(storage.getItem(LEGACY_LAUNCHER_KEY), old);
  assert.deepEqual(loadLauncherPreferences(storage), migrated);
});
it('adds beyond seven without duplicates, moves and restores the selected stable ID after restart', () => {
  const storage = memory(); let prefs = defaultDock();
  const item = appBrowserItems([native]).find(item => item.id.startsWith('native:'))!;
  prefs = addDockItem(prefs, item); prefs = addDockItem(prefs, item);
  assert.equal(prefs.order.length, 11);
  prefs = moveDockItem(prefs, item.id, -8); assert.equal(prefs.order[2], item.id);
  prefs.lastFocused = item.id; saveLauncherPreferences(storage, prefs);
  assert.deepEqual(loadLauncherPreferences(storage), prefs);
  assert.equal(removeDockItem(prefs, item.id).order.length, 10);
});
it('keeps recovery destinations present and Art first even after corrupt imports or extreme moves', () => {
  let prefs = normaliseDock({ version: 2, order: ['tv', 'youtube', 'tv'], pins: {}, lastFocused: 'absent' });
  for (const id of ['art', 'tv', 'all-apps']) { prefs = removeDockItem(prefs, id); assert.ok(prefs.order.includes(id)); }
  assert.equal(moveDockItem(prefs, 'tv', -999).order[0], 'art');
  assert.equal(moveDockItem(prefs, 'art', 999).order[0], 'art');
});
it('represents a discovered browser once and never creates a duplicate native shortcut', () => {
  const browser = { id: 'RealBrowse1.Main', name: 'Internet', show: true };
  const items = appBrowserItems([browser]), item = items.find(item => item.id === 'browser')!;
  assert.equal(items.filter(item => item.action.type === 'installed-app').length, 0);
  assert.deepEqual(addDockItem(defaultDock(), item, [browser]), defaultDock());
  const removed = removeDockItem(defaultDock(), 'browser');
  assert.equal(addDockItem(removed, item, [browser]).order.filter(id => id === 'browser').length, 1);
});
it('keeps a migrated native pin and removes a duplicate default destination', () => {
  const prefs = normaliseDock({ version: 1, pins: { youtube: { appId: '73iTZRTc34.Stan', name: 'Stan' } } });
  assert.equal(prefs.pins.youtube.appId, '73iTZRTc34.Stan'); assert.ok(!prefs.order.includes('stan'));
  assert.deepEqual(normaliseDock(prefs), prefs);
});
it('keeps visible consumer apps and excludes hidden Samsung services and reserved system components', () => {
  const choices = selectableApps([native, { id: 'com.vendor.consumer', name: 'Consumer', show: true }, { id: 'com.samsung.background.service', name: 'Worker', show: true }, { id: 'com.samsung.tv.coba.setting', name: 'Settings', show: true }]);
  assert.deepEqual(choices.map(app => app.id), [native.id, 'com.vendor.consumer']);
});
it('round trips v3 backups and restores v1 pins without touching unrelated preferences or legacy storage', () => {
  const storage = memory(); storage.setItem('frameos.custom.unrelated', 'keep'); storage.setItem(LEGACY_LAUNCHER_KEY, '{"version":1,"pins":{}}');
  const before = readPreferenceBundle(storage), next = { ...before, launcher: moveDockItem(before.launcher, 'browser', -4) };
  const text = createPreferenceBackup(next); assert.equal(JSON.parse(text).version, 3);
  assert.deepEqual(parsePreferenceBackup(text), next); restorePreferenceBackup(storage, text);
  assert.equal(storage.getItem('frameos.custom.unrelated'), 'keep'); assert.equal(storage.getItem(LEGACY_LAUNCHER_KEY), '{"version":1,"pins":{}}');
  assert.deepEqual(loadLauncherPreferences(storage), next.launcher); assert.ok(storage.getItem(LAUNCHER_KEY));
});
it('rolls back the new dock and every earlier section when the final launcher import fails readback', () => {
  const storage = memory(); saveLauncherPreferences(storage, defaultDock());
  const before = readPreferenceBundle(storage), text = createPreferenceBackup({ ...before, launcher: moveDockItem(before.launcher, 'browser', -3) });
  const original = new Map(storage.data), set = storage.setItem; let failed = false;
  storage.setItem = (key, value) => { if (key === LAUNCHER_KEY && !failed) { failed = true; set(key, '{}'); } else set(key, value); };
  assert.throws(() => restorePreferenceBackup(storage, text), /previous preferences were restored/);
  assert.deepEqual(readPreferenceBundle(storage), before);
  for (const [key, value] of original) assert.equal(storage.getItem(key), value);
});
