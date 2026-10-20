import type { FocusRows } from './remote';
import { launcherItems } from '../services/catalog';
import { wallpaperPageItems, wallpaperPages } from '../services/wallpapers';
import { CLOCK_TIME_ZONES } from '../services/clock';
import { WEATHER_LOCATIONS } from '../services/weather';

export type SettingsTab = 'appearance' | 'clock' | 'wallpapers' | 'weather' | 'usb';
export const settingsTabs: { id: SettingsTab; name: string }[] = [{ id: 'appearance', name: 'Appearance' }, { id: 'clock', name: 'Clock' }, { id: 'wallpapers', name: 'Wallpapers' }, { id: 'weather', name: 'Weather' }, { id: 'usb', name: 'USB diagnostics' }];
export const homeRows: FocusRows = [
  ['settings', 'network', 'power'].map((id, i) => ({ id: `top-${id}`, x: 1610 + i * 80 })),
  launcherItems.map((item, i) => ({ id: `app-${item.id}`, x: 200 + i * 248 })),
  [{ id: 'home-media', x: 960 }],
];
export function homeLayout(compact: boolean): FocusRows {
  return compact ? [homeRows[0], homeRows[1].slice(0, 4), homeRows[1].slice(4).map((node, i) => ({ ...node, x: 300 + i * 440 })), homeRows[2]] : homeRows;
}
export function settingsLayout(tab: SettingsTab, page: number): FocusRows {
  const rows: FocusRows = [[{ id: 'settings-close', x: 1800 }], settingsTabs.map((item, i) => ({ id: `settings-tab-${item.id}`, x: 140 + i * 180 }))];
  if (tab === 'appearance') return [...rows,
    ['slate', 'midnight', 'warm'].map((id, i) => ({ id: `theme-${id}`, x: 240 + i * 280 })),
    ['full', 'subtle', 'off'].map((id, i) => ({ id: `motion-${id}`, x: 240 + i * 280 })),
    [{ id: 'fps-toggle', x: 400 }],
  ];
  if (tab === 'wallpapers') {
    const choices = wallpaperPageItems(page).map((wallpaper, i) => ({ id: `wallpaper-${wallpaper.id}`, x: 160 + (i % 4) * 240 }));
    return [...rows, ...Array.from({ length: Math.ceil(choices.length / 4) }, (_, i) => choices.slice(i * 4, (i + 1) * 4)), [
      ...(page > 0 ? [{ id: 'wallpapers-prev', x: 200 }] : []), ...(page < wallpaperPages - 1 ? [{ id: 'wallpapers-next', x: 900 }] : []),
    ]];
  }
  if (tab === 'clock') {
    const zones = CLOCK_TIME_ZONES.map((zone, i) => ({ id: `timezone-${zone.id}`, x: 240 + i % 3 * 280 }));
    return [...rows, [{ id: 'time-format-12h', x: 280 }, { id: 'time-format-24h', x: 700 }], ...Array.from({ length: Math.ceil(zones.length / 3) }, (_, i) => zones.slice(i * 3, (i + 1) * 3))];
  }
  if (tab === 'weather') return [...rows, ...Array.from({ length: Math.ceil(WEATHER_LOCATIONS.length / 3) }, (_, row) => WEATHER_LOCATIONS.slice(row * 3, row * 3 + 3).map(({ id }, i) => ({ id: `city-${id}`, x: 240 + i * 280 })))];
  return [...rows, [{ id: 'usb-rescan', x: 800 }], [{ id: 'usb-scroll-up', x: 350 }, { id: 'usb-scroll-down', x: 650 }]];
}
