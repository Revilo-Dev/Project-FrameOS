import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWeatherCity, isWeatherFresh, loadWeather, mapWeatherResponse, readWeatherCache, WEATHER_LOCATIONS,
  WEATHER_REFRESH_MS, weatherCondition, weatherUrl, writeWeatherCache, type WeatherStorage,
} from './weather';

const now = Date.parse('2026-10-20T02:00:00Z');
function response() {
  return {
    timezone: 'Australia/Brisbane',
    current: { time: '2026-10-20T12:00', temperature_2m: 26.4, weather_code: 2, is_day: 1 },
    daily: { time: ['2026-10-20', '2026-10-21'], temperature_2m_max: [28.7, 30.1], temperature_2m_min: [18.2, 19.4] },
    hourly: {
      time: ['2026-10-20T12:00', '2026-10-20T13:00', '2026-10-20T14:00', '2026-10-20T15:00', '2026-10-20T16:00', '2026-10-20T17:00', '2026-10-20T18:00'],
      weather_code: [2, 3, 61, 0, 95, 2, 3],
      temperature_2m: [26.4, 27.3, 27.1, 26.2, 25.9, 24.3, 23.6],
      is_day: [1, 1, 1, 1, 1, 1, 0],
      precipitation_probability: [0, 10, 50, 0, 70, 20, 10],
    },
  };
}
function storage(): WeatherStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (key) => values.get(key) || null, setItem: (key, value) => { values.set(key, value); } };
}
function fetcher(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('weather forecast mapping', () => {
  it('uses one documented timezone-aware request for each selectable Australian city', () => {
    assert.equal(WEATHER_LOCATIONS.length, 7);
    for (const location of WEATHER_LOCATIONS) {
      const url = new URL(weatherUrl(location.id));
      assert.equal(url.origin, 'https://api.open-meteo.com');
      assert.equal(url.pathname, '/v1/forecast');
      assert.equal(url.searchParams.get('timezone'), location.timezone);
      assert.equal(url.searchParams.get('latitude'), String(location.latitude));
      assert.equal(url.searchParams.get('forecast_days'), '2');
      assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
      assert.equal(url.searchParams.get('current'), 'temperature_2m,weather_code,is_day');
      assert.equal(url.searchParams.get('daily'), 'temperature_2m_max,temperature_2m_min');
      assert.equal(url.searchParams.get('hourly'), 'temperature_2m,weather_code,is_day,precipitation_probability');
      assert.equal(url.searchParams.has('apikey'), false);
      assert.equal(isWeatherCity(location.id), true);
    }
    assert.equal(isWeatherCity('invalid'), false);
    assert.equal(isWeatherCity(null), false);
  });

  it('retains real values and the next six local hours, excluding the current hour', () => {
    const weather = mapWeatherResponse(response(), 'brisbane', now);
    assert.equal(weather.current.temperature, 26.4);
    assert.equal(weather.current.time, '2026-10-20T12:00');
    assert.equal(weather.current.code, 2);
    assert.equal(weather.current.isDay, true);
    assert.equal(weather.timezone, 'Australia/Brisbane');
    assert.equal(weather.fetchedAt, now);
    assert.deepEqual(weather.daily, { date: '2026-10-20', high: 28.7, low: 18.2 });
    assert.deepEqual(weather.hours.map(hour => hour.time), response().hourly.time.slice(1));
    assert.deepEqual(weather.hours[0], { time: '2026-10-20T13:00', code: 3, temperature: 27.3, isDay: true, rainChance: 10 });
  });

  it('selects the observation day in the city timezone and tolerates unavailable daily values', () => {
    const original = response();
    const shifted = { ...original, daily: { time: ['2026-10-19', '2026-10-20', '2026-10-21'], temperature_2m_max: [40, 28.7, 30.1], temperature_2m_min: [22, 18.2, 19.4] } };
    assert.deepEqual(mapWeatherResponse(shifted, 'brisbane', now).daily, { date: '2026-10-20', high: 28.7, low: 18.2 });
    for (const daily of [undefined, null, {}, { ...original.daily, time: ['2026-10-19', '2026-10-21'] }, { ...original.daily, temperature_2m_max: [null, 30] }, { ...original.daily, temperature_2m_max: [10, 30] }, { ...original.daily, temperature_2m_min: [18] }]) {
      const weather = mapWeatherResponse({ ...original, daily }, 'brisbane', now);
      assert.equal(weather.daily, null);
      assert.equal(weather.hours.length, 6);
      assert.equal(weather.current.temperature, 26.4);
    }
  });

  it('rejects missing/null/invalid values and wrong locations instead of inventing data', () => {
    const original = response();
    const invalid: unknown[] = [null, {}, { ...original, error: true }, { ...original, timezone: 'Australia/Sydney' },
      { ...original, current: { ...original.current, temperature_2m: null } },
      { ...original, current: { ...original.current, temperature_2m: Number.NaN } },
      { ...original, current: { ...original.current, is_day: 2 } },
      { ...original, current: { ...original.current, time: '2026-02-30T12:00' } },
      { ...original, hourly: { ...original.hourly, temperature_2m: [28, null, 27, 30, 31, 20, 19] } },
      { ...original, hourly: { ...original.hourly, time: original.hourly.time.map((time, i) => i === 2 ? original.hourly.time[1] : time) } },
      { ...original, hourly: { ...original.hourly, weather_code: [1, 2] } },
      { ...original, hourly: { ...original.hourly, precipitation_probability: [101, 20, 21, 22, 23, 24, 25] } },
    ];
    for (const value of invalid) assert.throws(() => mapWeatherResponse(value, 'brisbane', now));
  });

  it('maps documented WMO conditions and keeps unknown conditions honest', () => {
    assert.deepEqual(weatherCondition(0), { label: 'Clear sky', icon: 'sun' });
    assert.deepEqual(weatherCondition(0, false), { label: 'Clear night', icon: 'moon' });
    assert.equal(weatherCondition(2).icon, 'partly-cloudy');
    assert.equal(weatherCondition(2, false).icon, 'partly-cloudy-night');
    assert.equal(weatherCondition(45).icon, 'fog');
    assert.equal(weatherCondition(55).icon, 'rain');
    assert.equal(weatherCondition(82).label, 'Rain showers');
    assert.equal(weatherCondition(86).icon, 'snow');
    assert.equal(weatherCondition(99).icon, 'storm');
    assert.deepEqual(weatherCondition(4), { label: 'Condition unavailable', icon: 'unknown' });
  });
});

describe('weather cache and nonblocking failures', () => {
  it('upgrades old hourly-only caches and preserves them offline without inventing daily temperatures', async () => {
    const memory = storage(), legacy = { ...mapWeatherResponse(response(), 'brisbane', now) };
    delete legacy.daily;
    writeWeatherCache(memory, legacy);
    const offline = await loadWeather('brisbane', { storage: memory, now: () => now + 1000, fetcher: (async () => { throw Error('offline'); }) as typeof fetch });
    assert.equal(offline.status, 'cached'); assert.equal(offline.weather?.daily, undefined); assert.equal(offline.weather?.hours.length, 6);
    const updated = await loadWeather('brisbane', { storage: memory, now: () => now + 1000, fetcher: fetcher(response()) });
    assert.equal(updated.status, 'fresh'); assert.deepEqual(updated.weather?.daily, { date: '2026-10-20', high: 28.7, low: 18.2 });
    assert.deepEqual(readWeatherCache(memory, 'brisbane')?.daily, updated.weather?.daily);
    const malformed = JSON.stringify({ version: 2, weather: { ...updated.weather, daily: { date: '2026-10-19', high: 30, low: 20 } } });
    assert.equal(readWeatherCache({ getItem: () => malformed, setItem() {} }, 'brisbane')?.daily, null);
  });
  it('round trips separate city caches and rejects malformed or mismatched records', () => {
    const memory = storage();
    const weather = mapWeatherResponse(response(), 'brisbane', now);
    assert.equal(writeWeatherCache(memory, weather), true);
    assert.deepEqual(readWeatherCache(memory, 'brisbane'), weather);
    assert.equal(readWeatherCache(memory, 'sydney'), null);
    const serialized = [...memory.values.values()][0];
    assert.equal(readWeatherCache({ getItem: () => serialized, setItem() {} }, 'sydney'), null);
    for (const invalid of ['{', 'null', '{"version":2}', JSON.stringify({ version: 2, weather: { ...weather, hours: [] } })]) {
      assert.equal(readWeatherCache({ getItem: () => invalid, setItem() {} }, 'brisbane'), null);
    }
  });

  it('respects the 45-minute cache window without fetching again during navigation', async () => {
    const memory = storage();
    const weather = mapWeatherResponse(response(), 'brisbane', now);
    writeWeatherCache(memory, weather);
    assert.equal(isWeatherFresh(weather, now), true);
    assert.equal(isWeatherFresh(weather, now + WEATHER_REFRESH_MS - 1), true);
    assert.equal(isWeatherFresh(weather, now + WEATHER_REFRESH_MS), false);
    assert.equal(isWeatherFresh(weather, now - 1), false);
    let requests = 0;
    const result = await loadWeather('brisbane', { storage: memory, now: () => now + 1000, fetcher: (async () => { requests++; throw new Error('unexpected'); }) as typeof fetch });
    assert.equal(requests, 0);
    assert.deepEqual(result, { weather, status: 'fresh' });
  });

  it('fetches on first launch and persists a valid response', async () => {
    const memory = storage();
    const result = await loadWeather('brisbane', { storage: memory, now: () => now, fetcher: fetcher(response()) });
    assert.equal(result.status, 'fresh');
    assert.equal(result.weather?.current.temperature, 26.4);
    assert.deepEqual(readWeatherCache(memory, 'brisbane'), result.weather);
  });

  it('returns latest valid stale weather after offline, HTTP or malformed-response failures', async () => {
    const memory = storage();
    const weather = mapWeatherResponse(response(), 'brisbane', now);
    writeWeatherCache(memory, weather);
    for (const request of [
      (async () => { throw new Error('offline'); }) as typeof fetch,
      fetcher({ error: true }, 429), fetcher({ current: { temperature_2m: null } }),
    ]) {
      const result = await loadWeather('brisbane', { storage: memory, now: () => now + WEATHER_REFRESH_MS, fetcher: request });
      assert.deepEqual(result, { weather, status: 'cached' });
      assert.deepEqual(readWeatherCache(memory, 'brisbane'), weather);
    }
  });

  it('has a truthful unavailable state with no cache and does not let storage failures hide weather', async () => {
    const denied = { getItem(): string | null { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.equal(readWeatherCache(denied, 'brisbane'), null);
    assert.equal(writeWeatherCache(denied, mapWeatherResponse(response(), 'brisbane', now)), false);
    assert.deepEqual(await loadWeather('brisbane', { storage: denied, now: () => now, fetcher: fetcher({}, 503) }), { weather: null, status: 'unavailable' });
    const result = await loadWeather('brisbane', { storage: denied, now: () => now, fetcher: fetcher(response()) });
    assert.equal(result.status, 'fresh');
    assert.equal(result.weather?.current.temperature, 26.4);
  });

  it('bounds a hung request even when the network implementation ignores cancellation', async () => {
    const memory = storage();
    const weather = mapWeatherResponse(response(), 'brisbane', now);
    writeWeatherCache(memory, weather);
    let requestSignal: AbortSignal | undefined;
    const request = ((_url: unknown, init: RequestInit | undefined) => {
      requestSignal = init?.signal || undefined;
      return new Promise<Response>(() => {});
    }) as typeof fetch;
    const result = await loadWeather('brisbane', { storage: memory, now: () => now + WEATHER_REFRESH_MS, fetcher: request, timeoutMs: 10 });
    assert.equal(requestSignal?.aborted, true);
    assert.deepEqual(result, { weather, status: 'cached' });
  });

  it('cancels a location change without writing the previous request into storage', async () => {
    const memory = storage();
    const controller = new AbortController();
    const request = loadWeather('brisbane', {
      storage: memory, now: () => now, signal: controller.signal,
      fetcher: (() => new Promise<Response>(() => {})) as typeof fetch,
    });
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
    assert.equal(memory.values.size, 0);
  });
});
