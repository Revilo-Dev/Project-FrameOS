import type { FocusRows } from './remote';

export const homeRows: FocusRows = [
  [{ id: 'top-settings', x: 1730 }],
  [{ id: 'hero-usb', x: 240 }, { id: 'hero-personalise', x: 528 }],
  ['usb', 'youtube', 'stan', 'foxtel', 'gallery', 'art', 'browser', 'settings'].map((id, index) => ({ id: `app-${id}`, x: 200 + index * 216 })),
];

export const settingsRows: FocusRows = [
  [{ id: 'settings-close', x: 640 }],
  ['slate', 'midnight', 'warm'].map((id, index) => ({ id: `theme-${id}`, x: 140 + index * 200 })),
  ['tidal', 'dune', 'dusk'].map((id, index) => ({ id: `wallpaper-${id}`, x: 140 + index * 200 })),
  ['full', 'subtle', 'off'].map((id, index) => ({ id: `motion-${id}`, x: 140 + index * 200 })),
];
