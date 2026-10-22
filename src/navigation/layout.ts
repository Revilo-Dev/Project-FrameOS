import type { FocusRows } from './remote';
import { launcherItems } from '../services/catalog';
import { wallpaperPageItems, wallpaperPages } from '../services/wallpapers';
import { CLOCK_TIME_ZONES } from '../services/clock';
import { WEATHER_LOCATIONS } from '../services/weather';
import { CLOCK_FONTS } from '../services/clockFonts';
import { WIDGETS, WORLD_CITIES, type WidgetId } from '../services/widgets';

export type SettingsTab = 'appearance' | 'clock' | 'wallpapers' | 'weather' | 'widgets' | 'media' | 'usb';
export const settingsTabs: { id: SettingsTab; name: string }[] = [{ id: 'appearance', name: 'Appearance' }, { id: 'clock', name: 'Clock' }, { id: 'wallpapers', name: 'Wallpapers' }, { id: 'weather', name: 'Weather' }, { id: 'widgets', name: 'Widgets' }, { id: 'usb', name: 'USB diagnostics' }, { id: 'media', name: 'Media' }];
export function adjacentSettingsTab(tab: SettingsTab, offset: number): SettingsTab {
  return settingsTabs[(settingsTabs.findIndex(item => item.id === tab) + offset + settingsTabs.length) % settingsTabs.length].id;
}
export const homeRows: FocusRows = [
  ['settings', 'network', 'power'].map((id, i) => ({ id: `top-${id}`, x: 1610 + i * 80 })),
  launcherItems.map((item, i) => ({ id: `app-${item.id}`, x: 200 + i * 248 })),
  [{ id: 'home-media', x: 960 }],
];
export const playerRows: FocusRows = [
  ['previous', 'rewind', 'toggle', 'forward', 'next'].map((id, i) => ({ id: `player-${id}`, x: 744 + i * 108 })),
  [{ id: 'player-seek', x: 960 }],
];
export function homeLayout(compact: boolean, widgets: WidgetId[] = []): FocusRows {
  const dashboard = widgets.length ? [widgets.map((id, i) => ({ id: `widget-${id}`, x: 960 + (i - (widgets.length - 1) / 2) * 560 }))] : [];
  const apps = widgets.length ? homeRows[1].map((node, i) => ({ ...node, x: 960 + (i - (homeRows[1].length - 1) / 2) * 124 })) : homeRows[1];
  return compact ? [homeRows[0], ...dashboard, apps.slice(0, 4), apps.slice(4).map((node, i) => ({ ...node, x: 300 + i * 440 })), homeRows[2]] : [homeRows[0], ...dashboard, apps, homeRows[2]];
}
export function settingsLayout(tab: SettingsTab, page: number, enabledWidgets: WidgetId[] = [], hasThumbnailVideos = false, appearanceRows?: FocusRows): FocusRows {
  const rows: FocusRows = [[{ id: 'settings-close', x: 1800 }], settingsTabs.map((item, i) => ({ id: `settings-tab-${item.id}`, x: 140 + i * 180 }))];
  if (tab === 'appearance' && appearanceRows) return [...rows, ...appearanceRows];
  if (tab === 'appearance') return [...rows,
    ['slate', 'midnight', 'warm'].map((id, i) => ({ id: `theme-${id}`, x: 240 + i * 280 })),
    ['full', 'subtle', 'off'].map((id, i) => ({ id: `motion-${id}`, x: 240 + i * 280 })),
    [{ id: 'fps-toggle', x: 400 }],
    ...['home', 'apps', 'performance', 'backup'].map(id => [{ id: `launcher-${id}`, x: 600 }]),
  ];
  if (tab === 'wallpapers') {
    const choices = wallpaperPageItems(page).map((wallpaper, i) => ({ id: `wallpaper-${wallpaper.id}`, x: 160 + (i % 4) * 240 }));
    return [...rows, ...Array.from({ length: Math.ceil(choices.length / 4) }, (_, i) => choices.slice(i * 4, (i + 1) * 4)), [
      ...(page > 0 ? [{ id: 'wallpapers-prev', x: 200 }] : []), ...(page < wallpaperPages - 1 ? [{ id: 'wallpapers-next', x: 900 }] : []),
    ]];
  }
  if (tab === 'clock') {
    const zones = CLOCK_TIME_ZONES.map((zone, i) => ({ id: `timezone-${zone.id}`, x: 240 + i % 3 * 280 }));
    const fonts = CLOCK_FONTS.map((font, i) => ({ id: `clock-font-${font.id}`, x: 240 + i % 3 * 280 }));
    return [...rows, [{ id: 'time-format-12h', x: 280 }, { id: 'time-format-24h', x: 700 }], ...Array.from({ length: 2 }, (_, i) => fonts.slice(i * 3, (i + 1) * 3)), ...Array.from({ length: Math.ceil(zones.length / 3) }, (_, i) => zones.slice(i * 3, (i + 1) * 3))];
  }
  if (tab === 'media') return [...rows, [{ id: 'autoplay-toggle', x: 800 }], [{ id: 'media-cache-clear', x: 800 }]];
  if (tab === 'widgets') return [...rows, ...WIDGETS.map(widget => {
    const index = enabledWidgets.indexOf(widget.id);
    return [{ id: `widget-toggle-${widget.id}`, x: 600 }, ...(index > 0 ? [{ id: `widget-earlier-${widget.id}`, x: 1250 }] : []), ...(index >= 0 && index < enabledWidgets.length - 1 ? [{ id: `widget-later-${widget.id}`, x: 1450 }] : [])];
  }), [{ id: 'calendar-privacy', x: 600 }], ...Array.from({ length: 3 }, (_, row) => WORLD_CITIES.slice(row * 3, row * 3 + 3).map((city, i) => ({ id: `world-city-${city.id}`, x: 500 + i * 360 })))];
  if (tab === 'weather') return [...rows, ...Array.from({ length: Math.ceil(WEATHER_LOCATIONS.length / 3) }, (_, row) => WEATHER_LOCATIONS.slice(row * 3, row * 3 + 3).map(({ id }, i) => ({ id: `city-${id}`, x: 240 + i * 280 })))];
  return [...rows, [{ id: 'usb-rescan', x: 800 }], [{ id: 'usb-scroll-up', x: 350 }, { id: 'usb-scroll-down', x: 650 }], ...(hasThumbnailVideos ? [[{ id: 'thumbnail-previous', x: 300 }, { id: 'thumbnail-next', x: 650 }, { id: 'thumbnail-retry', x: 1000 }], [{ id: 'thumbnail-scroll-up', x: 350 }, { id: 'thumbnail-scroll-down', x: 650 }]] : [])];
}
