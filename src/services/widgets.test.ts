import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS_KEY, defaultWidgets, loadWidgets, moveWidget, normaliseWidgets, saveWidgets, toggleWidget, worldTime } from './widgets';
import { adjacentSettingsTab, homeLayout, settingsLayout } from '../navigation/layout';

function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
test('widget defaults, maximum three, zero widgets and persistence', () => {
  const store = storage(), defaults = defaultWidgets();
  assert.deepEqual(defaults.enabled, ['weather', 'bitcoin', 'world-clock']);
  assert.equal(toggleWidget(defaults, 'todo'), defaults);
  let value = toggleWidget(defaults, 'weather');
  value = toggleWidget(value, 'todo');
  assert.deepEqual(value.enabled, ['bitcoin', 'world-clock', 'todo']);
  assert.equal(saveWidgets(store, value), true);
  assert.deepEqual(loadWidgets(store), value);
  value = value.enabled.reduce((state, id) => toggleWidget(state, id), value);
  assert.deepEqual(value.enabled, []);
  saveWidgets(store, value); assert.deepEqual(loadWidgets(store).enabled, []);
  assert.equal(homeLayout(false, []).flat().some(item => item.id.startsWith('widget-')), false);
});
test('widget ordering preserves enabled ids and is bounded', () => {
  const value = defaultWidgets(), moved = moveWidget(value, 'world-clock', -1);
  assert.deepEqual(moved.enabled, ['weather', 'world-clock', 'bitcoin']);
  assert.equal(moveWidget(value, 'weather', -1), value);
  assert.equal(moveWidget(value, 'todo', 1), value);
  assert.deepEqual(homeLayout(false, moved.enabled)[1].map(item => item.id), ['widget-weather', 'widget-world-clock', 'widget-bitcoin']);
});
test('invalid widget preferences migrate safely and retain privacy/city choices', () => {
  const store = storage();
  store.setItem(WIDGETS_KEY, '{broken'); assert.deepEqual(loadWidgets(store), defaultWidgets());
  const value = normaliseWidgets({ enabled: ['todo', 'bad', 'todo', 'weather', 'calendar', 'reminders'], cities: ['Europe/Warsaw', 'bad', 'Europe/Warsaw'], calendarPrivacy: true });
  assert.deepEqual(value.enabled, ['todo', 'weather', 'calendar']); assert.deepEqual(value.cities, ['Europe/Warsaw']);
  assert.equal(value.calendarPrivacy, true);
  assert.equal(saveWidgets({ getItem() { return null; }, setItem() { throw Error(); } }, value), false);
});
test('world clocks use IANA daylight saving and the actual local date without network', () => {
  const date = new Date('2026-07-01T01:00:00Z');
  assert.match(worldTime(date, 'Australia/Brisbane', false).time, /11:00/);
  assert.match(worldTime(date, 'Europe/Warsaw', false).time, /03:00/);
  assert.match(worldTime(date, 'America/New_York', false).time, /21:00/);
  assert.match(worldTime(date, 'America/New_York', false).day, /30 June/);
  assert.match(worldTime(new Date('2026-01-01T01:00:00Z'), 'Europe/Warsaw', false).time, /02:00/);
});
test('Widgets participates in existing Settings channel routing and D-pad rows', () => {
  assert.equal(adjacentSettingsTab('weather', 1), 'widgets');
  assert.equal(adjacentSettingsTab('widgets', -1), 'weather');
  assert.equal(adjacentSettingsTab('appearance', -1), 'media');
  const rows = settingsLayout('widgets', 0, defaultWidgets().enabled).flat().map(item => item.id);
  assert(rows.includes('widget-later-weather'));
  assert(!rows.includes('widget-earlier-weather'));
  assert(rows.includes('world-city-Europe/Warsaw'));
  assert(rows.includes('calendar-privacy'));
});
