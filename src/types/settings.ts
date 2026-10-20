export type Theme = 'slate' | 'midnight' | 'warm';
export type WallpaperId = string;
export type Motion = 'full' | 'subtle' | 'off';
export type TimeFormat = '12h' | '24h';
export type WeatherCity = 'brisbane' | 'sydney' | 'melbourne' | 'perth' | 'adelaide' | 'hobart';

export interface Settings {
  version: 1;
  theme: Theme;
  wallpaper: WallpaperId;
  motion: Motion;
  weatherCity: WeatherCity;
  showFps: boolean;
  timeFormat: TimeFormat;
  timeZone: string;
}
