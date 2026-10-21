import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { WidgetDashboard } from './WidgetDashboard';
import { defaultWidgets } from '../services/widgets';
import { emptyOrganiser } from '../services/localOrganiser';
import { DEFAULT_SETTINGS } from '../services/settings';
import { dayKey, type CalendarState } from '../services/calendar';

test('Privacy Mode removes personal event titles from the rendered Calendar card and accessible text', () => {
  const today = dayKey(new Date(), 'Australia/Brisbane');
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const calendar: CalendarState = { status: 'ready', snapshot: { fetchedAt: Date.now(), calendars: [{ id: 'personal', name: 'Personal', selected: true }], events: [{ id: 'private', calendarId: 'personal', title: 'Sensitive appointment title', start: today, end: next.toISOString().slice(0, 10), allDay: true, recurring: false }] } };
  const preferences = { ...defaultWidgets(), enabled: ['calendar'] as const };
  const render = (privacy: boolean) => renderToStaticMarkup(<WidgetDashboard preferences={{ ...preferences, enabled: [...preferences.enabled], calendarPrivacy: privacy }} organiser={emptyOrganiser()} calendar={calendar} settings={DEFAULT_SETTINGS} focused="widget-calendar" focus={() => {}} open={() => {}} wallpaper="./assets/wallpaper.jpg" />);
  assert.match(render(false), /Sensitive appointment title/);
  const privateMarkup = render(true);
  assert(!privateMarkup.includes('Sensitive appointment title'));
  assert.match(privateMarkup, /1/); assert.match(privateMarkup, /upcoming event/); assert.match(privateMarkup, /Privacy Mode/);
});
test('unconfigured Calendar renders no fixture or stale cached appointments', () => {
  const markup = renderToStaticMarkup(<WidgetDashboard preferences={{ ...defaultWidgets(), enabled: ['calendar'] }} organiser={emptyOrganiser()} calendar={{ status: 'unconfigured', snapshot: null }} settings={DEFAULT_SETTINGS} focused="" focus={() => {}} open={() => {}} wallpaper="./assets/wallpaper.jpg" />);
  assert.match(markup, /connection coming later/); assert(!markup.includes('widget-preview-list'));
});
