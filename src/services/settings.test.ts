import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from './settings';
import { wallpapers } from './wallpapers';
import { CLOCK_FONTS } from './clockFonts';

describe('settings persistence', () => {
  it('round trips every clock font and migrates missing/invalid fonts safely', () => {
    for (const font of CLOCK_FONTS) {
      const storage = { getItem: () => JSON.stringify({ ...DEFAULT_SETTINGS, clockFont: font.id }), setItem() {} };
      assert.equal(loadSettings(storage).clockFont, font.id);
    }
    for (const clockFont of [undefined, 'not-a-font', null, 42]) {
      assert.equal(loadSettings({ getItem: () => JSON.stringify({ ...DEFAULT_SETTINGS, clockFont }), setItem() {} }).clockFont, 'modern');
    }
  });
  it('preserves theme and motion and replaces a removed v0.1 wallpaper with the new default', () => {
    const storage = { getItem: () => JSON.stringify({ version: 1, theme: 'warm', wallpaper: 'dusk', motion: 'off' }), setItem() {} };
    assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS, theme: 'warm', motion: 'off' });
  });
  it('round trips settings across sessions', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const settings = { ...DEFAULT_SETTINGS, theme: 'warm' as const, wallpaper: wallpapers[46].id, motion: 'off' as const, showFps: false, timeFormat: '24h' as const, timeZone: 'America/New_York' };
    assert.equal(saveSettings(storage, settings), true);
    assert.deepEqual(loadSettings(storage), settings);
    assert.equal(values.has(SETTINGS_KEY), true);
  });
  it('recovers safely from malformed, invalid and future-version data', () => {
    for (const data of ['{invalid', 'null', '5', '{"version":2,"theme":"warm"}', '{"version":1,"theme":"invalid","wallpaper":42,"motion":null,"timeFormat":"invalid","timeZone":"invalid/zone"}']) {
      assert.deepEqual(loadSettings({ getItem: () => data, setItem() {} }), DEFAULT_SETTINGS);
    }
  });
  it('survives unavailable or full storage without claiming persistence', () => {
    const storage = { getItem(): string | null { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
    assert.equal(saveSettings(storage, DEFAULT_SETTINGS), false);
  });
});
