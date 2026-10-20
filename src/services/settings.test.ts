import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from './settings';

describe('settings persistence', () => {
  it('round trips settings across sessions', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const settings = { ...DEFAULT_SETTINGS, theme: 'warm' as const, wallpaper: 'dusk' as const, motion: 'off' as const };
    assert.equal(saveSettings(storage, settings), true);
    assert.deepEqual(loadSettings(storage), settings);
    assert.equal(values.has(SETTINGS_KEY), true);
  });
  it('recovers safely from malformed, invalid and future-version data', () => {
    for (const data of ['{invalid', 'null', '5', '{"version":2,"theme":"warm"}', '{"version":1,"theme":"invalid","wallpaper":42,"motion":null}']) {
      assert.deepEqual(loadSettings({ getItem: () => data, setItem() {} }), DEFAULT_SETTINGS);
    }
  });
  it('survives unavailable or full storage without claiming persistence', () => {
    const storage = { getItem(): string | null { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
    assert.equal(saveSettings(storage, DEFAULT_SETTINGS), false);
  });
});
