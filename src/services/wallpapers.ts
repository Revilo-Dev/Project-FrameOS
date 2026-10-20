import catalog from './wallpaper-catalog.json';

export const wallpapers = catalog;
export const WALLPAPERS_PER_PAGE = 12;
export const wallpaperPages = Math.ceil(wallpapers.length / WALLPAPERS_PER_PAGE);
export function wallpaperPageItems(page: number) {
  return wallpapers.slice(page * WALLPAPERS_PER_PAGE, (page + 1) * WALLPAPERS_PER_PAGE);
}
