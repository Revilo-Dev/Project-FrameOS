import { BitcoinWidget } from './BitcoinWidget';
import type { BitcoinState } from '../services/bitcoin';
import { FocusButton } from './FocusButton';
import { WeatherWidget } from './WeatherWidget';
import { WidgetIcon } from './WidgetIcon';
import { useMinute } from './useMinute';
import { WORLD_CITIES, WIDGETS, worldTime, type WidgetId, type WidgetPreferences } from '../services/widgets';
import { dayKey, eventsOnDay, resolvedZone, type CalendarState } from '../services/calendar';
import { upcomingReminders, type LocalOrganiser } from '../services/localOrganiser';
import type { Settings } from '../types/settings';

export function eventTime(start: string, allDay: boolean, settings: Pick<Settings, 'timeZone' | 'timeFormat'>): string {
  return allDay ? 'All day' : new Date(start).toLocaleTimeString('en-AU', { timeZone: resolvedZone(settings.timeZone), hour: 'numeric', minute: '2-digit', hour12: settings.timeFormat === '12h' });
}
export function WorldTimes({ cities, timeFormat, now }: { cities: string[]; timeFormat: Settings['timeFormat']; now: Date }) {
  return <div className="world-times">{cities.map(id => {
    const city = WORLD_CITIES.find(item => item.id === id), value = worldTime(now, id, timeFormat === '12h');
    return <div className="world-city" key={id}><div><strong>{city?.name}</strong><small>{value.day}</small></div><time dateTime={now.toISOString()}>{value.time}</time></div>;
  })}</div>;
}
export function WidgetDashboard({ preferences, organiser, calendar, bitcoin, settings, focused, focus, open, wallpaper }: {
  preferences: WidgetPreferences; organiser: LocalOrganiser; calendar: CalendarState; bitcoin?: BitcoinState; settings: Settings;
  focused: string; focus(id: string): void; open(id: WidgetId): void; wallpaper: string;
}) {
  const now = useMinute();
  const today = dayKey(now, settings.timeZone);
  const events = eventsOnDay(calendar.snapshot?.events || [], today, settings.timeZone).filter(event => event.allDay || Date.parse(event.end) > now.getTime());
  const reminders = upcomingReminders(organiser.reminders), tasks = organiser.tasks.filter(item => !item.completed);
  return <div className={`widget-dashboard widget-count-${preferences.enabled.length}`} data-widget-count={preferences.enabled.length} aria-label="Home widgets">
    {preferences.enabled.map(id => <FocusButton key={id} id={`widget-${id}`} focused={focused} onFocused={focus} onClick={() => open(id)} className={`dashboard-card dashboard-${id}`} aria-label={`Open ${WIDGETS.find(widget => widget.id === id)?.name}`}>
      <span className="widget-wallpaper" style={{ backgroundImage: `url("${wallpaper}")` }} />
      <span className="widget-heading"><WidgetIcon id={id} /><span>{WIDGETS.find(widget => widget.id === id)?.name}</span></span>
      {id === 'weather' && <WeatherWidget city={settings.weatherCity} timeFormat={settings.timeFormat} />}
      {id === 'bitcoin' && <BitcoinWidget state={bitcoin || { status: 'loading', snapshot: null }} timeZone={settings.timeZone} />}
      {id === 'calendar' && <div className="calendar-preview">
        <p className="widget-date">{now.toLocaleDateString('en-AU', { timeZone: resolvedZone(settings.timeZone), weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {calendar.status === 'unconfigured' || calendar.status === 'disconnected' || calendar.status === 'expired' ? <div className="widget-empty"><strong>{calendar.status === 'expired' ? 'Reconnect Google Calendar' : 'Your calendar, here'}</strong><span>{calendar.status === 'unconfigured' ? 'Google Calendar connection coming later' : 'Connect Google Calendar to see your events'}</span></div>
          : calendar.status === 'loading' ? <p className="widget-empty">Loading your calendar…</p>
          : preferences.calendarPrivacy ? <div className="calendar-private"><strong>{events.length}</strong><span>upcoming {events.length === 1 ? 'event' : 'events'} today</span><small>Privacy Mode</small></div>
          : events.length ? <ul className="widget-preview-list">{events.slice(0, 3).map(event => <li key={event.id}><small>{eventTime(event.start, event.allDay, settings)}</small><span>{event.title}</span></li>)}</ul> : <p className="widget-empty">{calendar.status === 'error' ? 'Calendar temporarily unavailable' : 'No more events today'}</p>}
        {calendar.status === 'offline' && <small className="widget-footnote">Offline · Saved events</small>}
      </div>}
      {id === 'reminders' && (reminders.length ? <ul className="widget-preview-list reminder-preview">{reminders.slice(0, 3).map(item => <li key={item.id}><small>{new Date(item.due!).toLocaleDateString('en-AU', { timeZone: resolvedZone(settings.timeZone), day: 'numeric', month: 'short' })} · {eventTime(item.due!, false, settings)}</small><span>{item.title}</span></li>)}</ul> : <div className="widget-empty"><strong>A little peace of mind</strong><span>Add a reminder with a date and time</span></div>)}
      {id === 'todo' && (tasks.length ? <ul className="widget-preview-list todo-preview">{tasks.slice(0, 4).map(item => <li key={item.id}><span className="task-bullet" /><span>{item.title}</span></li>)}</ul> : <div className="widget-empty"><strong>A clear day ahead</strong><span>Add the things you want to get done</span></div>)}
      {id === 'world-clock' && <WorldTimes cities={preferences.cities} timeFormat={settings.timeFormat} now={now} />}
    </FocusButton>)}
  </div>;
}
