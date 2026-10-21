import { FocusButton } from './FocusButton';
import { WidgetIcon } from './WidgetIcon';
import { MAX_WIDGETS, WORLD_CITIES, WIDGETS, moveWidget, toggleWidget, type WidgetPreferences } from '../services/widgets';

export function WidgetsSettings({ preferences, change, focused, focus }: {
  preferences: WidgetPreferences; change(value: WidgetPreferences): void; focused: string; focus(id: string): void;
}) {
  return <div className="widgets-settings">
    <div className="widget-settings-summary"><div><h3>Home widgets</h3><p>Choose up to three. Your main clock always stays visible.</p></div><span className="widget-counter">{preferences.enabled.length} / {MAX_WIDGETS} active</span></div>
    {preferences.enabled.length === MAX_WIDGETS && <p className="widget-limit" role="status">Three widgets are active. Turn one off to choose another.</p>}
    <div className="widget-settings-list">{WIDGETS.map(widget => {
      const index = preferences.enabled.indexOf(widget.id), enabled = index >= 0;
      return <div className="widget-setting-row" key={widget.id}>
        <FocusButton id={`widget-toggle-${widget.id}`} focused={focused} onFocused={focus} className={`option widget-toggle${enabled ? ' selected' : ''}`} aria-pressed={enabled} aria-label={`${widget.name}, ${enabled ? 'enabled' : 'disabled'}`} aria-disabled={!enabled && preferences.enabled.length === MAX_WIDGETS} onClick={() => change(toggleWidget(preferences, widget.id))}>
          <WidgetIcon id={widget.id} /><span><strong>{widget.name}</strong><small>{widget.description}</small></span><span className={`toggle-switch${enabled ? ' toggle-on' : ''}`} aria-hidden="true"><i /></span>
        </FocusButton>
        <FocusButton id={`widget-earlier-${widget.id}`} focused={focused} onFocused={focus} className="widget-order option" aria-label={`Move ${widget.name} earlier`} disabled={!enabled || index === 0} onClick={() => { change(moveWidget(preferences, widget.id, -1)); focus(`widget-toggle-${widget.id}`); }}>←</FocusButton>
        <span className="widget-position">{enabled ? index + 1 : '–'}</span>
        <FocusButton id={`widget-later-${widget.id}`} focused={focused} onFocused={focus} className="widget-order option" aria-label={`Move ${widget.name} later`} disabled={!enabled || index === preferences.enabled.length - 1} onClick={() => { change(moveWidget(preferences, widget.id, 1)); focus(`widget-toggle-${widget.id}`); }}>→</FocusButton>
      </div>;
    })}</div>
    <h3>Calendar</h3><p>Google Calendar will be added later. Events are read-only and require a Google-backed calendar in Samsung Calendar.</p>
    <FocusButton id="calendar-privacy" focused={focused} onFocused={focus} className={`option toggle-option${preferences.calendarPrivacy ? ' selected' : ''}`} aria-pressed={preferences.calendarPrivacy} onClick={() => change({ ...preferences, calendarPrivacy: !preferences.calendarPrivacy })}><span>Privacy Mode</span><small>{preferences.calendarPrivacy ? 'Event titles are hidden' : 'Show event titles'}</small></FocusButton>
    <h3>World Clock cities</h3><p>Choose one to three cities. Times are calculated offline.</p>
    <div className="option-row city-options">{WORLD_CITIES.map(city => {
      const active = preferences.cities.includes(city.id);
      return <FocusButton id={`world-city-${city.id}`} key={city.id} focused={focused} onFocused={focus} className={`option${active ? ' selected' : ''}`} aria-pressed={active} aria-disabled={active ? preferences.cities.length === 1 : preferences.cities.length === 3} onClick={() => {
        if (active && preferences.cities.length > 1) change({ ...preferences, cities: preferences.cities.filter(id => id !== city.id) });
        else if (!active && preferences.cities.length < 3) change({ ...preferences, cities: [...preferences.cities, city.id] });
      }}>{city.name}</FocusButton>;
    })}</div>
    <p className="widget-footnote">Weather location is set in Weather. Reminders and To-do are stored on this TV and do not sync to Google.</p>
  </div>;
}
