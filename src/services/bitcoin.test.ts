import { it } from 'node:test';
import assert from 'node:assert/strict';
import { BITCOIN_CACHE_KEY, mapBitcoin, readBitcoinCache, refreshBitcoin } from './bitcoin';
import { defaultWidgets, loadWidgets, saveWidgets, WIDGETS_KEY } from './widgets';

const now = Date.parse('2026-10-21T08:00:00Z'), start = Date.parse('2026-10-20T14:00:00Z');
const stats = { last: '105000', high: '106000', low: '99000', volume: '15000' };
const candles = [[start / 1000 + 3600, 100000, 104000, 101000, 103000, 10], [start / 1000, 99000, 101000, 100000, 101000, 10]];
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
it('uses local midnight for today, sorts/deduplicates history and keeps 24h stats separate', () => {
  const value = mapBitcoin(stats, [...candles, candles[1], [start / 1000 - 300, 1, 1, 1, 1, 1]], 'Australia/Brisbane', now);
  assert.equal(value.day, '2026-10-21'); assert.equal(value.openToday, 100000); assert.equal(value.high, 106000);
  assert.equal(value.points.length, 3); assert.equal(value.points[0].time, start); assert.equal(value.points.at(-1)?.price, 105000);
  assert.equal(mapBitcoin(stats, [candles[0]], 'Australia/Brisbane', now).openToday, null);
  assert.throws(() => mapBitcoin({ ...stats, last: null }, candles, 'Australia/Brisbane', now), /Invalid/);
  assert.throws(() => mapBitcoin(stats, Array(301).fill(candles[0]), 'Australia/Brisbane', now), /Invalid/);
});
it('persists a small genuine snapshot, reuses its TTL and preserves timestamped saved data on failure', async () => {
  const store = storage(); let calls = 0;
  const fetcher = (async (url: string) => { calls++; return { ok: true, json: async () => url.endsWith('/stats') ? stats : candles }; }) as typeof fetch;
  const first = await refreshBitcoin(store, 'Australia/Brisbane', new AbortController().signal, fetcher, now);
  assert.equal(first.status, 'ready'); assert.equal(calls, 2); assert(store.getItem(BITCOIN_CACHE_KEY)!.length < 50000);
  await refreshBitcoin(store, 'Australia/Brisbane', new AbortController().signal, fetcher, now + 1000); assert.equal(calls, 2);
  const offline = await refreshBitcoin(store, 'Australia/Brisbane', new AbortController().signal, (async () => { throw Error('offline'); }) as typeof fetch, now + 600000);
  assert.equal(offline.status, 'offline'); assert.equal(offline.snapshot?.fetchedAt, now);
  assert.equal(readBitcoinCache(store, 'UTC', now), null); assert.equal(readBitcoinCache(store, 'Australia/Brisbane', now + 4 * 86400000), null);
  store.setItem(BITCOIN_CACHE_KEY, '{broken'); assert.equal(readBitcoinCache(store, 'Australia/Brisbane', now), null);
});
it('adds Bitcoin to the old default trio once and preserves custom, empty and explicitly restored Calendar rows', () => {
  const store = storage();
  store.setItem(WIDGETS_KEY, JSON.stringify({ ...defaultWidgets(), bitcoinAdded: false, enabled: ['weather', 'calendar', 'world-clock'] }));
  assert.deepEqual(loadWidgets(store).enabled, ['weather', 'bitcoin', 'world-clock']);
  saveWidgets(store, { ...defaultWidgets(), enabled: ['weather', 'calendar', 'world-clock'] });
  assert.deepEqual(loadWidgets(store).enabled, ['weather', 'calendar', 'world-clock']);
  saveWidgets(store, { ...defaultWidgets(), enabled: [] }); assert.deepEqual(loadWidgets(store).enabled, []);
});
