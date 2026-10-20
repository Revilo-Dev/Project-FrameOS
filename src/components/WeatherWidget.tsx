import { memo, useEffect, useState } from 'react';
import { browserStorage } from '../services/settings';
import type { TimeFormat } from '../types/settings';
import {
  isWeatherFresh, loadWeather, readWeatherCache, WEATHER_REFRESH_MS, weatherCondition, weatherLocation,
  type WeatherCity, type WeatherIconName, type WeatherResult,
} from '../services/weather';

function WeatherIcon({ name }: { name: WeatherIconName }) {
  const cloud = <path d="M15 35H39a9 9 0 0 0 0-18h-1a13 13 0 0 0-25-1 10 10 0 0 0 2 19Z" />;
  const sun = <><circle cx="24" cy="24" r="9" /><path d="M24 3v6m0 30v6M3 24h6m30 0h6M9 9l4 4m22 22 4 4M9 39l4-4M35 13l4-4" /></>;
  return <svg className={`weather-icon weather-icon-${name}`} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'sun' && sun}
    {name === 'moon' && <path d="M37 32A18 18 0 0 1 17 8a18 18 0 1 0 20 24Z" />}
    {name === 'partly-cloudy' && <><g transform="translate(2 -4) scale(.72)">{sun}</g>{cloud}</>}
    {name === 'partly-cloudy-night' && <><path d="M24 4a13 13 0 0 0 17 17A15 15 0 0 1 24 4Z" />{cloud}</>}
    {['cloud', 'fog', 'rain', 'snow', 'storm'].indexOf(name) >= 0 && <g transform="translate(0 -5)">{cloud}</g>}
    {name === 'fog' && <path d="M7 37h34M12 44h24" />}
    {name === 'rain' && <path d="m15 35-3 6m13-6-3 6m13-6-3 6" />}
    {name === 'snow' && <><path d="M16 35v10m-4-7 8 5m-8 0 8-5M33 35v10m-4-7 8 5m-8 0 8-5" /></>}
    {name === 'storm' && <path d="m25 31-7 9h7l-3 7 11-11h-8l4-5" />}
    {name === 'unknown' && <><circle cx="24" cy="24" r="17" /><path d="M19 18a5 5 0 0 1 10 0c0 4-5 4-5 8m0 6v1" /></>}
  </svg>;
}

function forecastHour(value: string, timeFormat: TimeFormat): string {
  if (timeFormat === '24h') return value.slice(11, 16);
  const hour = Number(value.slice(11, 13));
  return `${hour % 12 || 12} ${hour >= 12 ? 'pm' : 'am'}`;
}

function cachedTime(value: number, timeFormat: TimeFormat): string {
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12h' });
}

export const WeatherWidget = memo(function WeatherWidget({ city, timeFormat }: { city: WeatherCity; timeFormat: TimeFormat }) {
  const [result, setResult] = useState<WeatherResult>(() => {
    const weather = readWeatherCache(browserStorage(), city);
    return { weather, status: isWeatherFresh(weather) ? 'fresh' : weather ? 'cached' : 'unavailable' };
  });
  const [loading, setLoading] = useState(!result.weather);

  useEffect(() => {
    const storage = browserStorage();
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dueAt = 0;
    let pending = false;
    const cached = readWeatherCache(storage, city);
    setResult({ weather: cached, status: isWeatherFresh(cached) ? 'fresh' : cached ? 'cached' : 'unavailable' });
    setLoading(!cached);

    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (!disposed && !document.hidden) timer = setTimeout(refresh, Math.max(1000, dueAt - Date.now()));
    };
    const refresh = async () => {
      if (disposed || pending || document.hidden) return;
      if (Date.now() < dueAt) { schedule(); return; }
      pending = true;
      controller = new AbortController();
      try {
        const next = await loadWeather(city, { storage, signal: controller.signal });
        if (disposed) return;
        setResult(next);
        setLoading(false);
        dueAt = next.status === 'fresh' && next.weather
          ? next.weather.fetchedAt + WEATHER_REFRESH_MS : Date.now() + WEATHER_REFRESH_MS;
      } catch {
        // Unmount/city changes cancel requests; no error state should replace the next city.
      } finally {
        pending = false;
        schedule();
      }
    };
    const visibility = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (!document.hidden) void refresh();
    };
    const online = () => {
      if (!pending && !document.hidden) { dueAt = 0; void refresh(); }
    };
    void refresh();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      if (controller) controller.abort();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online);
    };
  }, [city]);

  const weather = result.weather && result.weather.city === city ? result.weather : null;
  const location = weatherLocation(city);
  const condition = weather ? weatherCondition(weather.current.code, weather.current.isDay) : null;
  return <section className="weather-widget" aria-label={`Weather for ${location.name}`} aria-busy={loading}>
    {weather && condition ? <>
      <div className="weather-current">
        <WeatherIcon name={condition.icon} />
        <span className="weather-temperature">{Math.round(weather.current.temperature)}<small>°C</small></span>
        <div className="weather-summary"><span className="weather-city">{location.name}</span><span className="weather-condition">{condition.label}</span></div>
      </div>
      <div className="weather-forecast" aria-label="Next six hours">
        {weather.hours.map((hour) => {
          const condition = weatherCondition(hour.code, hour.isDay);
          return <div className="weather-hour" key={hour.time} aria-label={`${forecastHour(hour.time, timeFormat)}, ${condition.label}, ${Math.round(hour.temperature)} degrees Celsius, ${Math.round(hour.rainChance)} percent chance of rain`}>
            <time dateTime={hour.time}>{forecastHour(hour.time, timeFormat)}</time>
            <WeatherIcon name={condition.icon} />
            <span className="weather-hour-temperature">{Math.round(hour.temperature)}°</span>
            <span className="weather-rain">{Math.round(hour.rainChance)}<small>% rain</small></span>
          </div>;
        })}
      </div>
      {result.status === 'cached' && <p className="weather-status" role="status">Offline or unavailable · Saved {cachedTime(weather.fetchedAt, timeFormat)}</p>}
    </> : <div className="weather-unavailable" role="status"><WeatherIcon name="cloud" /><div><span className="weather-city">{location.name}</span><span className="weather-condition">{loading ? 'Checking weather…' : 'Weather unavailable'}</span></div></div>}
  </section>;
});
