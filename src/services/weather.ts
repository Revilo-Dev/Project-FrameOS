/** Open-Meteo free forecast API: personal/non-commercial use, CC BY 4.0.
 * https://open-meteo.com/en/docs | https://open-meteo.com/en/terms
 * City presets avoid geolocation and a separate geocoding request.
 */
export const WEATHER_LOCATIONS = [
  { id: 'brisbane', name: 'Brisbane', latitude: -27.4698, longitude: 153.0251, timezone: 'Australia/Brisbane' },
  // Open-Meteo geocoding result 8348547 (New Beith, Logan, Queensland).
  { id: 'new-beith', name: 'New Beith', latitude: -27.766, longitude: 152.942, timezone: 'Australia/Brisbane' },
  { id: 'sydney', name: 'Sydney', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney' },
  { id: 'melbourne', name: 'Melbourne', latitude: -37.8136, longitude: 144.9631, timezone: 'Australia/Melbourne' },
  { id: 'perth', name: 'Perth', latitude: -31.9523, longitude: 115.8613, timezone: 'Australia/Perth' },
  { id: 'adelaide', name: 'Adelaide', latitude: -34.9285, longitude: 138.6007, timezone: 'Australia/Adelaide' },
  { id: 'hobart', name: 'Hobart', latitude: -42.8821, longitude: 147.3272, timezone: 'Australia/Hobart' },
] as const;

export type WeatherCity = typeof WEATHER_LOCATIONS[number]['id'];
export const DEFAULT_WEATHER_CITY: WeatherCity = 'brisbane';
export const WEATHER_REFRESH_MS = 45 * 60 * 1000;
export const WEATHER_TIMEOUT_MS = 8000;
const CACHE_PREFIX = 'frameos.weather.v2.';

export interface WeatherStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WeatherHour { time: string; code: number; temperature: number; isDay: boolean; rainChance: number }
export interface WeatherSnapshot {
  city: WeatherCity;
  timezone: string;
  fetchedAt: number;
  current: { temperature: number; code: number; isDay: boolean; time: string };
  hours: WeatherHour[];
}
export interface WeatherResult {
  weather: WeatherSnapshot | null;
  status: 'fresh' | 'cached' | 'unavailable';
}
export type WeatherIconName = 'sun' | 'moon' | 'partly-cloudy' | 'partly-cloudy-night' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' | 'unknown';

export function isWeatherCity(value: unknown): value is WeatherCity {
  return WEATHER_LOCATIONS.some((location) => location.id === value);
}

export function weatherLocation(city: WeatherCity) {
  return WEATHER_LOCATIONS.find((location) => location.id === city) || WEATHER_LOCATIONS[0];
}

export function weatherUrl(city: WeatherCity): string {
  const location = weatherLocation(city);
  const query = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    temperature_unit: 'celsius',
    forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid weather response.');
  return value as Record<string, unknown>;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Weather value unavailable.');
  return value;
}
function code(value: unknown): number {
  const result = number(value);
  if (!Number.isInteger(result) || result < 0 || result > 99) throw new Error('Invalid weather code.');
  return result;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid weather date.');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Invalid weather date.');
  return value;
}
function currentTime(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new Error('Invalid weather observation time.');
  }
  date(value.slice(0, 10));
  return value;
}
/** Retain API-local hourly times; never reinterpret them in the host timezone. */
export function mapWeatherResponse(value: unknown, city: WeatherCity, fetchedAt = Date.now()): WeatherSnapshot {
  const response = object(value);
  const current = object(response.current);
  const hourly = object(response.hourly);
  const location = weatherLocation(city);
  if (response.error || response.timezone !== location.timezone || !Number.isFinite(fetchedAt) || fetchedAt < 0) {
    throw new Error('Weather response does not match the requested location.');
  }
  const time = currentTime(current.time);
  const fields = ['time', 'weather_code', 'temperature_2m', 'is_day', 'precipitation_probability'] as const;
  for (const field of fields) {
    if (!Array.isArray(hourly[field])) throw new Error('Incomplete hourly forecast.');
  }
  const times = hourly.time as unknown[];
  if (times.length < 6 || fields.some((field) => (hourly[field] as unknown[]).length !== times.length)) {
    throw new Error('Incomplete hourly forecast.');
  }
  const hours = times.map((value, index) => {
    const hourTime = currentTime(value);
    const isDay = (hourly.is_day as unknown[])[index];
    const rainChance = number((hourly.precipitation_probability as unknown[])[index]);
    if ((isDay !== 0 && isDay !== 1) || rainChance < 0 || rainChance > 100) throw new Error('Invalid hourly forecast.');
    return { time: hourTime, code: code((hourly.weather_code as unknown[])[index]), temperature: number((hourly.temperature_2m as unknown[])[index]), isDay: isDay === 1, rainChance };
  }).filter(hour => hour.time > time).slice(0, 6);
  if (hours.length !== 6 || hours.some((hour, index) => index > 0 && hour.time <= hours[index - 1].time)) throw new Error('Incomplete upcoming hourly forecast.');
  if (current.is_day !== 0 && current.is_day !== 1) throw new Error('Invalid day/night value.');
  return {
    city,
    timezone: location.timezone,
    fetchedAt,
    current: { temperature: number(current.temperature_2m), code: code(current.weather_code), isDay: current.is_day === 1, time },
    hours,
  };
}

function validateSnapshot(value: unknown, city: WeatherCity): WeatherSnapshot {
  const saved = object(value);
  const current = object(saved.current);
  if (saved.city !== city || saved.timezone !== weatherLocation(city).timezone || !Array.isArray(saved.hours) || saved.hours.length !== 6) {
    throw new Error('Invalid weather cache.');
  }
  const fetchedAt = number(saved.fetchedAt);
  if (fetchedAt < 0) throw new Error('Invalid cache time.');
  const time = currentTime(current.time);
  if (typeof current.isDay !== 'boolean') throw new Error('Invalid cached day/night value.');
  const hours = saved.hours.map((value) => {
    const hour = object(value);
    const hourTime = currentTime(hour.time);
    const rainChance = number(hour.rainChance);
    if (hourTime <= time || typeof hour.isDay !== 'boolean' || rainChance < 0 || rainChance > 100) throw new Error('Invalid cached forecast.');
    return { time: hourTime, code: code(hour.code), temperature: number(hour.temperature), isDay: hour.isDay, rainChance };
  });
  if (hours.some((hour, index) => index > 0 && hour.time <= hours[index - 1].time)) throw new Error('Invalid cached hourly order.');
  return {
    city, timezone: weatherLocation(city).timezone, fetchedAt,
    current: { temperature: number(current.temperature), code: code(current.code), isDay: current.isDay, time }, hours,
  };
}

export function readWeatherCache(storage: WeatherStorage, city: WeatherCity): WeatherSnapshot | null {
  try {
    const saved = object(JSON.parse(storage.getItem(`${CACHE_PREFIX}${city}`) || 'null'));
    if (saved.version !== 2) return null;
    return validateSnapshot(saved.weather, city);
  } catch { return null; }
}

export function writeWeatherCache(storage: WeatherStorage, weather: WeatherSnapshot): boolean {
  try {
    storage.setItem(`${CACHE_PREFIX}${weather.city}`, JSON.stringify({ version: 2, weather }));
    return true;
  } catch { return false; }
}

export function isWeatherFresh(weather: WeatherSnapshot | null, now = Date.now()): boolean {
  return !!weather && now >= weather.fetchedAt && now - weather.fetchedAt < WEATHER_REFRESH_MS;
}

function abortError(): Error {
  const error = new Error('Weather request cancelled.');
  error.name = 'AbortError';
  return error;
}

async function fetchWeather(city: WeatherCity, fetcher: typeof fetch, signal: AbortSignal | undefined, timeoutMs: number): Promise<unknown> {
  if (signal && signal.aborted) throw abortError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    cancel = () => { controller.abort(); reject(abortError()); };
    if (signal) signal.addEventListener('abort', cancel);
    timer = setTimeout(() => { controller.abort(); reject(new Error('Weather request timed out.')); }, timeoutMs);
  });
  try {
    const request = async () => {
      const response = await fetcher(weatherUrl(city), { signal: controller.signal });
      if (!response.ok) throw new Error(`Weather request failed (${response.status}).`);
      return response.json() as Promise<unknown>;
    };
    return await Promise.race([request(), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', cancel);
  }
}

export async function loadWeather(city: WeatherCity, options: {
  storage: WeatherStorage;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
  timeoutMs?: number;
}): Promise<WeatherResult> {
  const now = options.now || Date.now;
  const cached = readWeatherCache(options.storage, city);
  if (options.signal && options.signal.aborted) throw abortError();
  if (isWeatherFresh(cached, now())) return { weather: cached, status: 'fresh' };
  try {
    const response = await fetchWeather(city, options.fetcher || fetch, options.signal, options.timeoutMs || WEATHER_TIMEOUT_MS);
    if (options.signal && options.signal.aborted) throw abortError();
    const weather = mapWeatherResponse(response, city, now());
    writeWeatherCache(options.storage, weather);
    return { weather, status: 'fresh' };
  } catch (error) {
    if (options.signal && options.signal.aborted) throw error;
    return { weather: cached, status: cached ? 'cached' : 'unavailable' };
  }
}

/** WMO code groups documented by Open-Meteo; unknown codes stay explicitly unknown. */
export function weatherCondition(value: number, isDay = true): { label: string; icon: WeatherIconName } {
  if (value === 0) return { label: isDay ? 'Clear sky' : 'Clear night', icon: isDay ? 'sun' : 'moon' };
  if (value === 1) return { label: 'Mainly clear', icon: isDay ? 'sun' : 'moon' };
  if (value === 2) return { label: 'Partly cloudy', icon: isDay ? 'partly-cloudy' : 'partly-cloudy-night' };
  if (value === 3) return { label: 'Overcast', icon: 'cloud' };
  if (value === 45 || value === 48) return { label: 'Fog', icon: 'fog' };
  if ([51, 53, 55, 56, 57].indexOf(value) >= 0) return { label: 'Drizzle', icon: 'rain' };
  if ([61, 63, 65, 66, 67].indexOf(value) >= 0) return { label: 'Rain', icon: 'rain' };
  if ([80, 81, 82].indexOf(value) >= 0) return { label: 'Rain showers', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].indexOf(value) >= 0) return { label: 'Snow', icon: 'snow' };
  if ([95, 96, 97, 99].indexOf(value) >= 0) return { label: 'Thunderstorm', icon: 'storm' };
  return { label: 'Condition unavailable', icon: 'unknown' };
}
