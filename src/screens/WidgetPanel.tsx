import { BitcoinWidget } from '../components/BitcoinWidget';
import type { BitcoinState } from '../services/bitcoin';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FocusButton } from '../components/FocusButton';
import { WeatherWidget } from '../components/WeatherWidget';
import { WidgetIcon } from '../components/WidgetIcon';
import { WorldTimes, eventTime } from '../components/WidgetDashboard';
import { useMinute } from '../components/useMinute';
import { WIDGETS, type WidgetId, type WidgetPreferences } from '../services/widgets';
import { addDays, dayKey, eventsOnDay, monthDays, resolvedZone, zonedDateTime, type CalendarState } from '../services/calendar';
import { MAX_LOCAL_ITEMS, addLocalItem, upcomingReminders, type LocalItem, type LocalOrganiser } from '../services/localOrganiser';
import type { Settings } from '../types/settings';
import type { FocusRows } from '../navigation/remote';

export function widgetPanelRows(id: WidgetId, organiser: LocalOrganiser, month: string, refreshable = false, agendaDays: string[] = []): FocusRows {
  const rows: FocusRows = [[{ id: 'widget-close', x: 1700 }]];
  if (id === 'calendar') return [...rows, ['calendar-prev', 'calendar-today', 'calendar-next', ...(refreshable ? ['calendar-refresh'] : [])].map((id, i) => ({ id, x: 420 + i * 240 })), ...Array.from({ length: 6 }, (_, row) => monthDays(month).slice(row * 7, row * 7 + 7).map((day, i) => ({ id: `calendar-day-${day}`, x: 400 + i * 100 }))), ...(agendaDays.length ? agendaDays.map(day => [{ id: `calendar-agenda-${day}`, x: 700 }]) : [[{ id: 'calendar-agenda', x: 700 }]])];
  if (id === 'todo' || id === 'reminders') {
    const items = id === 'todo' ? organiser.tasks : [...upcomingReminders(organiser.reminders), ...organiser.reminders.filter(item => item.completed)];
    return [...rows, [{ id: 'organiser-title', x: 500 }], ...(id === 'reminders' ? [[{ id: 'organiser-date', x: 400 }, { id: 'organiser-time', x: 800 }]] : []), [{ id: 'organiser-add', x: 700 }], ...items.map(item => [{ id: `organiser-toggle-${item.id}`, x: 600 }, { id: `organiser-remove-${item.id}`, x: 1300 }])];
  }
  return [...rows, [{ id: 'widget-configure', x: 960 }]];
}
interface Props {
  id: WidgetId; settings: Settings; preferences: WidgetPreferences; organiser: LocalOrganiser;
  updateOrganiser(value: LocalOrganiser): void; calendar: CalendarState; bitcoin: BitcoinState; month: string; setMonth(value: string): void;
  selectedDay: string; selectDay(value: string): void; refreshCalendar(): void;
  focused: string; focus(id: string): void; close(): void; configure(): void; wallpaper: string; saved: boolean;
}
export function WidgetPanel(props: Props) {
  const { id, settings, preferences, organiser, updateOrganiser, calendar, month, setMonth, selectedDay, selectDay, focused, focus, close, configure, wallpaper, saved } = props;
  const now = useMinute(), today = dayKey(now, settings.timeZone);
  const [title, setTitle] = useState(''), [date, setDate] = useState(today), [time, setTime] = useState('09:00'), [message, setMessage] = useState('');
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = document.getElementById(focused), container = content.current;
    if (element && container?.contains(element)) {
      const bounds = element.getBoundingClientRect(), frame = container.getBoundingClientRect();
      const scale = frame.height / container.clientHeight || 1;
      if (bounds.bottom > frame.bottom - 18) container.scrollTop += (bounds.bottom - frame.bottom + 18) / scale;
      else if (bounds.top < frame.top + 18) container.scrollTop += (bounds.top - frame.top - 18) / scale;
    }
  }, [focused]);
  const reminder = id === 'reminders', items = reminder ? [...upcomingReminders(organiser.reminders), ...organiser.reminders.filter(item => item.completed)] : organiser.tasks;
  const update = (values: LocalItem[]) => updateOrganiser({ ...organiser, [reminder ? 'reminders' : 'tasks']: values });
  const add = () => {
    const due = reminder ? zonedDateTime(date, time, settings.timeZone) : null;
    if (!title.trim()) { setMessage('Enter a title first.'); focus('organiser-title'); return; }
    if (reminder && !due) { setMessage('Choose a valid date and time. That time may not exist when daylight saving changes.'); return; }
    if (items.length >= MAX_LOCAL_ITEMS) { setMessage('The list is full. Remove an item before adding another.'); return; }
    update(addLocalItem(reminder ? organiser.reminders : organiser.tasks, title, due?.toISOString()));
    setTitle(''); setMessage(reminder ? 'Reminder added on this TV.' : 'Task added on this TV.'); focus('organiser-add');
  };
  const fieldKeys = (event: KeyboardEvent<HTMLInputElement>, next: string) => {
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); focus(next); }
    else if (event.key === 'Escape' || event.keyCode === 10009) { event.preventDefault(); event.stopPropagation(); focus('organiser-add'); }
    else if (event.key === 'Tab') { event.preventDefault(); focus(event.shiftKey ? 'widget-close' : next); }
    else if (event.key === 'ArrowDown' && event.currentTarget.type === 'text') { event.preventDefault(); focus(next); }
  };
  const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-AU', { ...options, timeZone: 'UTC' });
  const events = calendar.snapshot?.events || [];
  const renderEvents = (day: string) => {
    const daily = eventsOnDay(events, day, settings.timeZone);
    return preferences.calendarPrivacy ? <p className="private-event-count">{daily.length} {daily.length === 1 ? 'event' : 'events'} · Titles hidden</p> : daily.length ? <ul className="calendar-event-list">{daily.map(event => <li key={event.id}><time>{eventTime(event.start, event.allDay, settings)}</time><span>{event.title}{event.recurring && <small>Recurring</small>}</span></li>)}</ul> : <p className="calendar-no-events">No events</p>;
  };
  const hasData = calendar.status === 'ready' || calendar.status === 'offline';
  return <div className="panel-scrim widget-scrim"><div className="settings-wallpaper" style={{ backgroundImage: `url("${wallpaper}")` }} /><section className={`widget-panel widget-panel-${id}`} role="dialog" aria-modal="true" aria-labelledby="widget-panel-title">
    <header className="widget-panel-header"><div><WidgetIcon id={id} /><h2 id="widget-panel-title">{WIDGETS.find(widget => widget.id === id)?.name}</h2></div><FocusButton id="widget-close" focused={focused} onFocused={focus} className="round-button" aria-label="Close widget" onClick={close}>×</FocusButton></header>
    <div className="widget-panel-content" ref={content}>
      {id === 'bitcoin' && <><BitcoinWidget state={props.bitcoin} timeZone={settings.timeZone} detailed /><FocusButton id="widget-configure" focused={focused} onFocused={focus} className="option" onClick={configure}>Configure Home widgets</FocusButton></>}
      {id === 'weather' && <><WeatherWidget city={settings.weatherCity} timeFormat={settings.timeFormat} /><p className="widget-detail-note">Current conditions and hourly forecast · Open-Meteo</p><FocusButton id="widget-configure" focused={focused} onFocused={focus} className="option" onClick={configure}>Choose weather location</FocusButton></>}
      {id === 'world-clock' && <><WorldTimes cities={preferences.cities} timeFormat={settings.timeFormat} now={now} /><p className="widget-detail-note">Times update automatically. No internet connection is needed.</p><FocusButton id="widget-configure" focused={focused} onFocused={focus} className="option" onClick={configure}>Choose cities</FocusButton></>}
      {(id === 'todo' || reminder) && <>
        <p className="widget-detail-note">{reminder ? `Reminders use ${resolvedZone(settings.timeZone)} time.` : 'One thing at a time.'} Saved locally on this TV.</p>
        <div className="organiser-form">
          <label className="organiser-title-label" htmlFor="organiser-title">{reminder ? 'Reminder' : 'Task'}<input id="organiser-title" type="text" maxLength={160} value={title} placeholder={reminder ? 'What do you want to remember?' : 'What needs doing?'} tabIndex={focused === 'organiser-title' ? 0 : -1} onFocus={() => focus('organiser-title')} onChange={event => setTitle(event.target.value)} onKeyDown={event => fieldKeys(event, reminder ? 'organiser-date' : 'organiser-add')} /></label>
          {reminder && <div className="organiser-due"><label htmlFor="organiser-date">Date<input id="organiser-date" type="date" value={date} tabIndex={focused === 'organiser-date' ? 0 : -1} onFocus={() => focus('organiser-date')} onChange={event => setDate(event.target.value)} onKeyDown={event => fieldKeys(event, 'organiser-time')} /></label><label htmlFor="organiser-time">Time<input id="organiser-time" type="time" value={time} tabIndex={focused === 'organiser-time' ? 0 : -1} onFocus={() => focus('organiser-time')} onChange={event => setTime(event.target.value)} onKeyDown={event => fieldKeys(event, 'organiser-add')} /></label></div>}
          <FocusButton id="organiser-add" focused={focused} onFocused={focus} className="primary-button" onClick={add}>+ Add {reminder ? 'reminder' : 'task'}</FocusButton>
        </div>
        <p className="organiser-status" role="status">{!saved ? 'Local storage is unavailable. Changes last for this session only.' : message || `${items.filter(item => !item.completed).length} outstanding`}</p>
        <div className="organiser-list">{items.map(item => <div className={`organiser-item${item.completed ? ' completed' : ''}`} key={item.id}>
          <FocusButton id={`organiser-toggle-${item.id}`} focused={focused} onFocused={focus} className="option organiser-complete" aria-pressed={item.completed} aria-label={`${item.completed ? 'Mark incomplete' : 'Complete'}: ${item.title}`} onClick={() => update((reminder ? organiser.reminders : organiser.tasks).map(value => value.id === item.id ? { ...value, completed: !value.completed } : value))}><span className="task-check" aria-hidden="true">{item.completed ? '✓' : ''}</span><span><strong>{item.title}</strong>{item.due && <small>{new Date(item.due).toLocaleDateString('en-AU', { timeZone: resolvedZone(settings.timeZone), weekday: 'short', day: 'numeric', month: 'short' })} · {eventTime(item.due, false, settings)}{Date.parse(item.due) < now.getTime() && !item.completed ? ' · Due' : ''}</small>}</span></FocusButton>
          <FocusButton id={`organiser-remove-${item.id}`} focused={focused} onFocused={focus} className="option organiser-remove" aria-label={`Remove: ${item.title}`} onClick={() => { update((reminder ? organiser.reminders : organiser.tasks).filter(value => value.id !== item.id)); focus('organiser-add'); }}>Remove</FocusButton>
        </div>)}{!items.length && <p className="organiser-empty">{reminder ? 'No reminders yet.' : 'Your list is clear.'}</p>}</div>
      </>}
      {id === 'calendar' && <>
        <div className={`calendar-connection calendar-state-${calendar.status}`} role="status">{calendar.status === 'unconfigured' ? <><strong>Google Calendar connection coming later</strong><span>The calendar is ready to browse. Connect your Google-backed calendars in a future update to see appointments here.</span></> : <><strong>{calendar.status === 'offline' ? 'Offline · Showing saved events' : calendar.status === 'ready' ? 'Google Calendar · Read-only' : calendar.status === 'loading' ? 'Refreshing Calendar…' : calendar.status === 'expired' ? 'Calendar permission expired' : 'Google Calendar is disconnected or unavailable'}</strong>{calendar.snapshot && <span>Updated {new Date(calendar.snapshot.fetchedAt).toLocaleString('en-AU', { timeZone: resolvedZone(settings.timeZone) })}</span>}</>}</div>
        <div className="calendar-toolbar"><FocusButton id="calendar-prev" focused={focused} onFocused={focus} className="option" aria-label="Previous month" onClick={() => setMonth(addDays(`${month}-01`, -1).slice(0, 7))}>‹</FocusButton><FocusButton id="calendar-today" focused={focused} onFocused={focus} className="option" onClick={() => { setMonth(today.slice(0, 7)); selectDay(today); }}>Today</FocusButton><h3>{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</h3><FocusButton id="calendar-next" focused={focused} onFocused={focus} className="option" aria-label="Next month" onClick={() => setMonth(addDays(`${month}-01`, 32).slice(0, 7))}>›</FocusButton><FocusButton id="calendar-refresh" focused={focused} onFocused={focus} className="option" disabled={calendar.status === 'unconfigured' || calendar.status === 'loading' || calendar.status === 'disconnected'} onClick={props.refreshCalendar}>Refresh</FocusButton></div>
        <div className="calendar-body"><div className="calendar-month"><div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days">{monthDays(month).map(day => <FocusButton id={`calendar-day-${day}`} focused={focused} onFocused={focus} key={day} className={`calendar-day${day.slice(0, 7) !== month ? ' adjacent-month' : ''}${day === today ? ' calendar-is-today' : ''}${day === selectedDay ? ' selected' : ''}`} aria-label={dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} aria-pressed={day === selectedDay} onClick={() => selectDay(day)}><span>{Number(day.slice(8))}</span>{hasData && eventsOnDay(events, day, settings.timeZone).length > 0 && <i className="calendar-event-dot" />}</FocusButton>)}</div></div>
          <div className="calendar-selected"><h3>{dateLabel(selectedDay, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>{hasData ? renderEvents(selectedDay) : <p className="calendar-no-events">{calendar.status === 'loading' ? 'Loading events…' : 'Connect Google Calendar to see events.'}</p>}{preferences.calendarPrivacy && <small className="privacy-label">Privacy Mode · Event titles are hidden</small>}</div></div>
        <section id="calendar-agenda" className="calendar-agenda" aria-label="Next seven days agenda" tabIndex={!hasData && focused === 'calendar-agenda' ? 0 : -1} onFocus={event => { if (event.target === event.currentTarget) focus('calendar-agenda'); }}><h3>Next seven days</h3>{hasData ? Array.from({ length: 7 }, (_, i) => addDays(today, i)).map(day => <div id={`calendar-agenda-${day}`} className="agenda-day" key={day} role="group" aria-label={dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' })} tabIndex={focused === `calendar-agenda-${day}` ? 0 : -1} onFocus={() => focus(`calendar-agenda-${day}`)}><h4>{dateLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })}</h4>{renderEvents(day)}</div>) : <p className="calendar-no-events">Your upcoming agenda will appear after Google Calendar is connected.</p>}</section>
      </>}
    </div>
    <footer className="widget-panel-footer">Back closes · D-pad navigates{(id === 'todo' || reminder) && ' · Enter edits a field'}</footer>
  </section></div>;
}
