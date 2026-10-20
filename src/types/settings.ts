export type Theme = 'slate' | 'midnight' | 'warm';
export type WallpaperId = 'tidal' | 'dune' | 'dusk';
export type Motion = 'full' | 'subtle' | 'off';

export interface Settings {
  version: 1;
  theme: Theme;
  wallpaper: WallpaperId;
  motion: Motion;
}
