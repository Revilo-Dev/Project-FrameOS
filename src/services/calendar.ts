/** Read-only port for a future OAuth companion. Google credentials never belong in this bundle. */
import type { SettingsStorage } from './settings';

export interface CalendarEvent {
  id: string; calendarId: string; title: string; start: string; end: string; allDay: boolean;
  recurring: boolean;
}
export interface GoogleEvent {
  id?: string; status?: string; summary?: string; recurringEventId?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
}
export interface CalendarSource { id: string; name: string; selected: boolean }
export type CalendarStatus = 'unconfigured' | 'disconnected' | 'loading' | 'ready' | 'offline' | 'expired' | 'error';
export interface CalendarSnapshot { events: CalendarEvent[]; calendars: CalendarSource[]; fetchedAt: number }
export interface CalendarState { status: CalendarStatus; snapshot: CalendarSnapshot | null }
export interface CalendarProvider {
  configured: boolean;
  read(signal: AbortSignal): Promise<CalendarSnapshot>;
  disconnect(): Promise<void>;
}
export const CALENDAR_CACHE_KEY = 'frameos.calendar.cache.v1';
export const CALENDAR_REFRESH_MS = 10 * 60 * 1000;
export class CalendarPermissionError extends Error {}
export const pendingCalendarProvider: CalendarProvider = {
  configured: false,
  async read() { throw new Error('Google Calendar will be connected in a later update.'); },
  async disconnect() { /* No account is connected in this release. */ },
};
/** Companion credential is short-lived and supplied in memory by a future pairing flow, never a Google token. */
export function companionCalendarProvider(origin: string, credential: () => string | null, fetcher: typeof fetch = fetch): CalendarProvider {
  const url = new URL(origin);
  if (url.protocol !== 'https:') throw new Error('The Calendar companion requires HTTPS.');
  async function request(endpoint: string, method: string, signal?: AbortSignal) {
    const token = credential();
    if (!token) throw new CalendarPermissionError('Connect Google Calendar.');
    const response = await fetcher(new URL(endpoint, url).href, { method, signal, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (response.status === 401 || response.status === 403) throw new CalendarPermissionError('Calendar permission expired. Reconnect your account.');
    if (!response.ok) throw new Error('Calendar companion unavailable.');
    return response;
  }
  return {
    configured: true,
    async read(signal) { return validateCalendarSnapshot(await (await request('/v1/calendar', 'GET', signal)).json()); },
    async disconnect() { await request('/v1/calendar/connection', 'DELETE'); },
  };
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function mapGoogleEvents(calendarId: string, events: GoogleEvent[]): CalendarEvent[] {
  return events.reduce<CalendarEvent[]>((result, event) => {
    if (!event.id || event.status === 'cancelled') return result;
    const allDay = !!event.start?.date;
    const start = allDay ? event.start?.date : event.start?.dateTime;
    const end = allDay ? event.end?.date : event.end?.dateTime;
    if (!start || !end || (allDay ? !DATE.test(start) || !DATE.test(end) || end <= start : !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start))) return result;
    result.push({ id: `${calendarId}:${event.id}`, calendarId, title: event.summary?.trim() || 'Untitled event', start, end, allDay, recurring: !!event.recurringEventId });
    return result;
  }, []);
}
export function validateCalendarSnapshot(value: unknown): CalendarSnapshot {
  const source = value as Partial<CalendarSnapshot> | null;
  if (!source || !Array.isArray(source.events) || !Array.isArray(source.calendars) || typeof source.fetchedAt !== 'number' || !Number.isFinite(source.fetchedAt)) throw new Error('Invalid Calendar response.');
  const calendars = source.calendars.filter(calendar => calendar && typeof calendar.id === 'string' && typeof calendar.name === 'string' && typeof calendar.selected === 'boolean').slice(0, 64);
  const events = source.events.filter(event => event && typeof event.id === 'string' && typeof event.calendarId === 'string' && typeof event.title === 'string' && typeof event.start === 'string' && typeof event.end === 'string' && typeof event.allDay === 'boolean' && calendars.some(calendar => calendar.id === event.calendarId && calendar.selected) && (event.allDay ? DATE.test(event.start) && DATE.test(event.end) && event.end > event.start : Number.isFinite(Date.parse(event.start)) && Date.parse(event.end) > Date.parse(event.start))).slice(0, 2000);
  return { events, calendars, fetchedAt: source.fetchedAt };
}
export function readCalendarCache(storage: SettingsStorage): CalendarSnapshot | null {
  try { return validateCalendarSnapshot(JSON.parse(storage.getItem(CALENDAR_CACHE_KEY) || 'null')); } catch { return null; }
}
export function writeCalendarCache(storage: SettingsStorage, snapshot: CalendarSnapshot | null): boolean {
  try { storage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(snapshot)); return true; } catch { return false; }
}
export async function refreshCalendar(provider: CalendarProvider, storage: SettingsStorage, signal: AbortSignal): Promise<CalendarState> {
  if (!provider.configured) return { status: 'unconfigured', snapshot: null };
  try {
    const snapshot = await provider.read(signal);
    writeCalendarCache(storage, snapshot);
    return { status: 'ready', snapshot };
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof CalendarPermissionError) { writeCalendarCache(storage, null); return { status: 'expired', snapshot: null }; }
    const snapshot = readCalendarCache(storage);
    return { status: snapshot ? 'offline' : 'error', snapshot };
  }
}
export async function disconnectCalendar(provider: CalendarProvider, storage: SettingsStorage): Promise<CalendarState> {
  // Remove personal cached data even when the companion is temporarily unreachable.
  writeCalendarCache(storage, null);
  await provider.disconnect();
  return { status: 'disconnected', snapshot: null };
}
export function resolvedZone(zone: string): string {
  if (zone === 'device') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Brisbane';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone; } catch { return 'Australia/Brisbane'; }
}
export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: resolvedZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
/** Convert a wall-clock input in an IANA zone; reject DST gaps rather than silently moving reminders. */
export function zonedDateTime(day: string, time: string, timeZone: string): Date | null {
  if (!DATE.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const wall = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: resolvedZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const wallValue = (date: Date) => {
    const parts = formatter.formatToParts(date), get = (type: string) => parts.find(item => item.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  };
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const displayed = wallValue(new Date(guess));
    if (displayed === `${day}T${time}`) return new Date(guess);
    guess += wall - Date.parse(`${displayed}:00Z`);
  }
  return null;
}
export function eventsOnDay(events: CalendarEvent[], day: string, zone: string): CalendarEvent[] {
  return events.filter(event => event.allDay ? event.start <= day && day < event.end : dayKey(new Date(event.start), zone) <= day && dayKey(new Date(Date.parse(event.end) - 1), zone) >= day)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}
export function monthDays(month: string): string[] {
  const first = `${month}-01`, weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - (weekday + 6) % 7));
}
