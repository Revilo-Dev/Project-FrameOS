import type { LauncherItem } from '../types/launcher';

export const launcherItems: LauncherItem[] = [
  { id: 'art', name: 'Art Mode', icon: 'art', action: { type: 'art-mode' }, availability: 'available', metadata: { category: 'YOUR SPACE', description: 'A different kind of screen time' } },
  { id: 'youtube', name: 'YouTube', icon: 'play', action: { type: 'launch-app', app: 'youtube' }, availability: 'available', metadata: { category: 'WATCH', description: 'Videos, music and more' } },
  { id: 'stan', name: 'Stan', icon: 'stan', action: { type: 'launch-app', app: 'stan' }, availability: 'available', metadata: { category: 'WATCH', description: 'Stories worth staying in for' } },
  { id: 'prime', name: 'Prime Video', icon: 'prime', action: { type: 'launch-app', app: 'prime' }, availability: 'available', metadata: { category: 'WATCH', description: 'Entertainment on your terms' } },
  { id: 'gallery', name: 'Gallery', icon: 'gallery', action: { type: 'gallery' }, availability: 'available', metadata: { category: 'YOUR SPACE', description: 'Make room for your memories' } },
  { id: 'browser', name: 'Browser', icon: 'browser', action: { type: 'browser' }, availability: 'available', metadata: { category: 'EXPLORE', description: 'A window to the web' } },
  { id: 'settings', name: 'Settings', icon: 'settings', action: { type: 'settings' }, availability: 'available' },
  { id: 'sources', name: 'Sources', icon: 'sources', action: { type: 'sources' }, availability: 'available' },
  { id: 'tv', name: 'TV', icon: 'tv', action: { type: 'samsung-home' }, availability: 'available' },
  { id: 'all-apps', name: 'All Apps', icon: 'apps', action: { type: 'all-apps' }, availability: 'available' },
];

export const browserDestinations: LauncherItem[] = [...launcherItems.filter(item => item.id !== 'all-apps'),
  { id: 'media', name: 'Media Hub', icon: 'usb', action: { type: 'usb' }, availability: 'available' },
  { id: 'frameos-settings', name: 'FrameOS Settings', icon: 'settings', action: { type: 'settings' }, availability: 'available' },
];
