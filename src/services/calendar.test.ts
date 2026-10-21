import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarPermissionError, addDays, companionCalendarProvider, dayKey, disconnectCalendar, eventsOnDay, mapGoogleEvents, monthDays, pendingCalendarProvider, readCalendarCache, refreshCalendar, validateCalendarSnapshot, writeCalendarCache, zonedDateTime, type CalendarProvider } from './calendar';

const events = mapGoogleEvents('primary', [
  { id: 'all', summary: 'All day', start: { date: '2026-10-21' }, end: { date: '2026-10-23' } },
  { id: 'recurring', summary: 'Recurring instance', recurringEventId: 'series', start: { dateTime: '2026-10-21T23:30:00+10:00' }, end: { dateTime: '2026-10-22T00:30:00+10:00' } },
  { id: 'midnight', start: { dateTime: '2026-10-21T22:00:00+10:00' }, end: { dateTime: '2026-10-22T00:00:00+10:00' } },
  { id: 'cancelled', status: 'cancelled', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } },
  { id: 'invalid', start: { dateTime: 'bad' }, end: { dateTime: 'bad' } },
]);
const snapshot = { events, calendars: [{ id: 'primary', name: 'Main', selected: true }], fetchedAt: 1792540800000 };
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
test('Google mapping is read-only, keeps expanded recurring instances and excludes cancelled events', () => {
  assert.equal(events.length, 3); assert.equal(events[0].allDay, true); assert.equal(events[1].recurring, true);
  assert.equal(events[2].title, 'Untitled event');
  assert.deepEqual(eventsOnDay(events, '2026-10-22', 'Australia/Brisbane').map(event => event.id), ['primary:all', 'primary:recurring']);
  assert.equal(eventsOnDay(events, '2026-10-23', 'Australia/Brisbane').length, 0);
});
test('day boundaries and wall-clock input respect Australian zones and daylight saving', () => {
  assert.equal(dayKey(new Date('2026-10-21T13:30:00Z'), 'Australia/Brisbane'), '2026-10-21');
  assert.equal(dayKey(new Date('2026-10-21T13:30:00Z'), 'Australia/Sydney'), '2026-10-22');
  assert.equal(zonedDateTime('2026-10-21', '09:00', 'Australia/Brisbane')?.toISOString(), '2026-10-20T23:00:00.000Z');
  assert.equal(zonedDateTime('2026-10-21', '09:00', 'Australia/Sydney')?.toISOString(), '2026-10-20T22:00:00.000Z');
  assert.equal(zonedDateTime('2026-10-04', '02:30', 'Australia/Sydney'), null);
  assert.equal(zonedDateTime('2026-02-31', '09:00', 'Australia/Brisbane'), null);
  assert.equal(zonedDateTime('2026-04-05', '02:30', 'Australia/Sydney') instanceof Date, true);
  assert.equal(monthDays('2026-10').length, 42); assert.equal(monthDays('2026-10')[0], '2026-09-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('Calendar cache fallback, expired access, disconnect and absent configuration are honest', async () => {
  const store = storage(), signal = new AbortController().signal;
  let calls = 0;
  const provider: CalendarProvider = { configured: true, async read() { calls++; return snapshot; }, async disconnect() {} };
  assert.equal((await refreshCalendar(provider, store, signal)).status, 'ready');
  assert.deepEqual(readCalendarCache(store), snapshot);
  provider.read = async () => { throw new Error('Offline'); };
  assert.equal((await refreshCalendar(provider, store, signal)).status, 'offline');
  provider.read = async () => { throw new CalendarPermissionError('Revoked'); };
  assert.deepEqual(await refreshCalendar(provider, store, signal), { status: 'expired', snapshot: null });
  assert.equal(readCalendarCache(store), null);
  writeCalendarCache(store, snapshot); await disconnectCalendar(provider, store); assert.equal(readCalendarCache(store), null);
  assert.deepEqual(await refreshCalendar(pendingCalendarProvider, store, signal), { status: 'unconfigured', snapshot: null });
  assert.equal(calls, 1);
  provider.disconnect = async () => { throw Error('Offline'); }; writeCalendarCache(store, snapshot);
  await assert.rejects(disconnectCalendar(provider, store)); assert.equal(readCalendarCache(store), null);
});
test('companion only reads events and disconnects, uses an in-memory credential and handles revoked access', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(snapshot)); }) as typeof fetch;
  const provider = companionCalendarProvider('https://calendar.example.test', () => 'short-lived-tv-session', fetcher);
  assert.deepEqual(await provider.read(new AbortController().signal), snapshot);
  await provider.disconnect();
  assert.deepEqual(calls.map(call => [call.url, call.init?.method]), [['https://calendar.example.test/v1/calendar', 'GET'], ['https://calendar.example.test/v1/calendar/connection', 'DELETE']]);
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer short-lived-tv-session');
  assert.equal(calls[0].init?.redirect, 'error');
  assert.throws(() => companionCalendarProvider('http://calendar.example.test', () => null), /HTTPS/);
  await assert.rejects(companionCalendarProvider('https://calendar.example.test', () => null, fetcher).read(new AbortController().signal), CalendarPermissionError);
  const denied = companionCalendarProvider('https://calendar.example.test', () => 'expired', (async () => new Response('', { status: 401 })) as typeof fetch);
  await assert.rejects(denied.read(new AbortController().signal), CalendarPermissionError);
});
test('calendar response validation drops unknown and deselected calendars', () => {
  assert.equal(validateCalendarSnapshot({ ...snapshot, calendars: [{ id: 'primary', name: 'Main', selected: false }] }).events.length, 0);
  assert.throws(() => validateCalendarSnapshot({ events: [] }), /Invalid/);
});
