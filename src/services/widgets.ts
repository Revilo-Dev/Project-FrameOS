import type { SettingsStorage } from './settings';

export const WIDGETS = [
  { id: 'weather', name: 'Weather', description: 'Current conditions and the next six hours', symbol: 'weather' },
  { id: 'bitcoin', name: 'Bitcoin', description: 'USD price, daily chart and 24-hour market stats', symbol: 'bitcoin' },
  { id: 'calendar', name: 'Calendar', description: 'Your day and upcoming appointments', symbol: 'calendar' },
  { id: 'reminders', name: 'Reminders', description: 'Local reminders with a due date and time', symbol: 'reminders' },
  { id: 'todo', name: 'To-do', description: 'A simple local task list', symbol: 'todo' },
  { id: 'world-clock', name: 'World Clock', description: 'Time around the world, calculated offline', symbol: 'clock' },
] as const;
export type WidgetId = typeof WIDGETS[number]['id'];
export const MAX_WIDGETS = 3;
export const WIDGETS_KEY = 'frameos.widgets.v1';
export const WORLD_CITIES = [
  { id: 'Australia/Brisbane', name: 'Brisbane' },
  { id: 'Europe/Warsaw', name: 'Warsaw' },
  { id: 'America/New_York', name: 'New York' },
  { id: 'Australia/Sydney', name: 'Sydney' },
  { id: 'Australia/Perth', name: 'Perth' },
  { id: 'Europe/London', name: 'London' },
  { id: 'Asia/Tokyo', name: 'Tokyo' },
  { id: 'Asia/Singapore', name: 'Singapore' },
  { id: 'Pacific/Auckland', name: 'Auckland' },
] as const;
export interface WidgetPreferences {
  version: 1;
  bitcoinAdded?: boolean;
  enabled: WidgetId[];
  cities: string[];
  calendarPrivacy: boolean;
}
export function defaultWidgets(): WidgetPreferences {
  return { version: 1, bitcoinAdded: true, enabled: ['weather', 'bitcoin', 'world-clock'], cities: WORLD_CITIES.slice(0, 3).map(city => city.id), calendarPrivacy: false };
}
export function isWidgetId(value: unknown): value is WidgetId { return WIDGETS.some(widget => widget.id === value); }
export function normaliseWidgets(value: unknown): WidgetPreferences {
  const defaults = defaultWidgets();
  if (!value || typeof value !== 'object') return defaults;
  const source = value as Partial<WidgetPreferences>;
  const enabled = Array.isArray(source.enabled) ? source.enabled.filter(isWidgetId).filter((id, i, ids) => ids.indexOf(id) === i).slice(0, MAX_WIDGETS) : defaults.enabled;
  const cities = Array.isArray(source.cities) ? source.cities.filter(id => WORLD_CITIES.some(city => city.id === id)).filter((id, i, ids) => ids.indexOf(id) === i).slice(0, 3) : [];
  return { version: 1, bitcoinAdded: true, enabled, cities: cities.length ? cities : defaults.cities, calendarPrivacy: source.calendarPrivacy === true };
}
export function loadWidgets(storage: SettingsStorage): WidgetPreferences {
  try {
    const source = JSON.parse(storage.getItem(WIDGETS_KEY) || 'null');
    // Upgrade only the old default trio, once. Saved custom/empty rows are kept.
    if (source && !source.bitcoinAdded && Array.isArray(source.enabled) && source.enabled.join(',') === 'weather,calendar,world-clock') source.enabled[1] = 'bitcoin';
    return normaliseWidgets(source);
  } catch { return defaultWidgets(); }
}
export function saveWidgets(storage: SettingsStorage, preferences: WidgetPreferences): boolean {
  try { storage.setItem(WIDGETS_KEY, JSON.stringify(normaliseWidgets(preferences))); return true; } catch { return false; }
}
export function toggleWidget(preferences: WidgetPreferences, id: WidgetId): WidgetPreferences {
  if (preferences.enabled.includes(id)) return { ...preferences, enabled: preferences.enabled.filter(widget => widget !== id) };
  return preferences.enabled.length < MAX_WIDGETS ? { ...preferences, enabled: [...preferences.enabled, id] } : preferences;
}
export function moveWidget(preferences: WidgetPreferences, id: WidgetId, offset: number): WidgetPreferences {
  const index = preferences.enabled.indexOf(id), target = index + offset;
  if (index < 0 || target < 0 || target >= preferences.enabled.length) return preferences;
  const enabled = [...preferences.enabled];
  [enabled[index], enabled[target]] = [enabled[target], enabled[index]];
  return { ...preferences, enabled };
}
export function worldTime(now: Date, timeZone: string, hour12: boolean) {
  const zone = WORLD_CITIES.some(city => city.id === timeZone) ? timeZone : WORLD_CITIES[0].id;
  return {
    time: new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12 }).format(now),
    day: new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(now),
  };
}
