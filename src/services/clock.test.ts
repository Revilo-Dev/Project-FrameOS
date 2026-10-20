import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK_TIME_ZONES, formatClock } from './clock';

test('clock and date use Brisbane time across the UTC date boundary', () => {
  const clock = formatClock(new Date('2026-10-19T15:08:00Z'));
  assert.match(clock.time, /0?1:08/);
  assert.equal(clock.period, 'AM');
  assert.match(clock.date, /Tuesday,? 20 October/);
});

test('defaults to 12-hour time and supports explicit 24-hour time without a period', () => {
  const now = new Date('2026-10-20T08:23:00Z');
  assert.equal(formatClock(now).time, '6:23');
  assert.equal(formatClock(now).period, 'PM');
  const clock = formatClock(now, 'Australia/Brisbane', '24h');
  assert.equal(clock.time, '18:23');
  assert.equal(clock.period, '');
});

test('formats midnight and noon correctly in both time formats', () => {
  const midnight = new Date('2026-10-19T14:08:00Z');
  const noon = new Date('2026-10-20T02:08:00Z');
  assert.equal(formatClock(midnight).time, '12:08');
  assert.equal(formatClock(midnight).period, 'AM');
  assert.equal(formatClock(noon).time, '12:08');
  assert.equal(formatClock(noon).period, 'PM');
  assert.equal(formatClock(midnight, 'Australia/Brisbane', '24h').time, '00:08');
  assert.equal(formatClock(noon, 'Australia/Brisbane', '24h').time, '12:08');
});

test('selected zones change both clock and date and use daylight saving rules', () => {
  const summer = new Date('2026-10-20T13:30:00Z');
  const sydney = formatClock(summer, 'Australia/Sydney', '24h');
  assert.equal(sydney.time, '00:30');
  assert.match(sydney.date, /Wednesday,? 21 October/);
  assert.equal(formatClock(summer, 'Australia/Brisbane', '24h').time, '23:30');
  assert.equal(formatClock(new Date('2026-06-20T13:30:00Z'), 'Australia/Sydney', '24h').time, '23:30');
  assert.equal(formatClock(summer, 'Australia/Adelaide', '24h').time, '00:00');
  assert.equal(formatClock(summer, 'Australia/Eucla', '24h').time, '22:15');
});

test('every offered zone formats successfully and device local time follows the host', () => {
  const now = new Date('2026-10-20T08:23:00Z');
  for (const zone of CLOCK_TIME_ZONES) assert.match(formatClock(now, zone.id).time, /^\d{1,2}:\d{2}$/);
  const local = formatClock(now, 'device', '24h');
  assert.equal(local.time, now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }));
  assert.equal(local.date, now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }));
  assert.deepEqual(formatClock(now, 'invalid/zone'), formatClock(now));
});
