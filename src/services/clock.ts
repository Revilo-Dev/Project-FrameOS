import type { TimeFormat } from '../types/settings';

export const DEFAULT_TIME_ZONE = 'Australia/Brisbane';
export const CLOCK_TIME_ZONES = [
  { id: 'device', name: 'Device local time' },
  { id: 'Australia/Brisbane', name: 'Brisbane' },
  { id: 'Australia/Sydney', name: 'Sydney' },
  { id: 'Australia/Melbourne', name: 'Melbourne' },
  { id: 'Australia/Adelaide', name: 'Adelaide' },
  { id: 'Australia/Darwin', name: 'Darwin' },
  { id: 'Australia/Perth', name: 'Perth' },
  { id: 'Australia/Hobart', name: 'Hobart' },
  { id: 'Australia/Eucla', name: 'Eucla' },
  { id: 'Australia/Lord_Howe', name: 'Lord Howe Island' },
  { id: 'UTC', name: 'UTC' },
  { id: 'Pacific/Auckland', name: 'Auckland' },
  { id: 'Asia/Tokyo', name: 'Tokyo' },
  { id: 'Asia/Singapore', name: 'Singapore' },
  { id: 'Asia/Kolkata', name: 'India' },
  { id: 'Europe/London', name: 'London' },
  { id: 'America/New_York', name: 'New York' },
  { id: 'America/Los_Angeles', name: 'Los Angeles' },
] as const;

export function isClockTimeZone(value: unknown): value is string {
  return CLOCK_TIME_ZONES.some(zone => zone.id === value);
}

export function formatClock(now: Date, timeZone = DEFAULT_TIME_ZONE, timeFormat: TimeFormat = '12h') {
  const zone = isClockTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const options = zone === 'device' ? {} : { timeZone: zone };
  const parts = new Intl.DateTimeFormat('en-AU', { ...options, hour: timeFormat === '24h' ? '2-digit' : 'numeric', minute: '2-digit', hour12: timeFormat === '12h' }).formatToParts(now);
  return {
    time: parts.filter(part => part.type !== 'dayPeriod').map(part => part.value).join('').trim(),
    period: parts.find(part => part.type === 'dayPeriod')?.value.toUpperCase() || '',
    date: now.toLocaleDateString('en-AU', { ...options, weekday: 'long', day: 'numeric', month: 'long' }),
  };
}
