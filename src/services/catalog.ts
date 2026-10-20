import type { LauncherItem } from '../types/launcher';

export const launcherItems: LauncherItem[] = [
  { id: 'youtube', name: 'YouTube', icon: 'play', action: { type: 'launch-app', app: 'youtube' }, availability: 'planned', metadata: { category: 'WATCH', description: 'Videos, music and more' } },
  { id: 'stan', name: 'Stan', icon: 'stan', action: { type: 'launch-app', app: 'stan' }, availability: 'planned', metadata: { category: 'WATCH', description: 'Stories worth staying in for' } },
  { id: 'foxtel', name: 'Foxtel', icon: 'foxtel', action: { type: 'launch-app', app: 'foxtel' }, availability: 'planned', metadata: { category: 'WATCH', description: 'Entertainment on your terms' } },
  { id: 'gallery', name: 'Gallery', icon: 'gallery', action: { type: 'gallery' }, availability: 'planned', metadata: { category: 'YOUR SPACE', description: 'Make room for your memories' } },
  { id: 'art', name: 'Art Mode', icon: 'art', action: { type: 'art-mode' }, availability: 'planned', metadata: { category: 'YOUR SPACE', description: 'A different kind of screen time' } },
  { id: 'browser', name: 'Browser', icon: 'browser', action: { type: 'browser' }, availability: 'planned', metadata: { category: 'EXPLORE', description: 'A window to the web' } },
  { id: 'settings', name: 'Settings', icon: 'settings', action: { type: 'settings' }, availability: 'available', metadata: { category: 'MAKE IT YOURS', description: 'Small details. Your way.' } },
];
