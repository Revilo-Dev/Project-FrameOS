import type { WallpaperId } from '../types/settings';

export const wallpapers: { id: WallpaperId; name: string; mood: string; src: string; ambient: string }[] = [
  { id: 'tidal', name: 'Tidal', mood: 'A quieter kind of blue', src: './wallpapers/tidal.jpg', ambient: './wallpapers/tidal-soft.jpg' },
  { id: 'dune', name: 'Dune', mood: 'A little warmth, a little wonder', src: './wallpapers/dune.jpg', ambient: './wallpapers/dune-soft.jpg' },
  { id: 'dusk', name: 'Dusk', mood: 'Where the day slows down', src: './wallpapers/dusk.jpg', ambient: './wallpapers/dusk-soft.jpg' },
];
