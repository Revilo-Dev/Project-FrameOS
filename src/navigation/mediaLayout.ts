import type { FocusRows } from './remote';
import type { MediaEntry } from '../types/media';
import { compareMediaNames } from '../services/episodes';

export type MediaFilter = 'all' | 'video' | 'image' | 'folder';
export type MediaSort = 'natural' | 'name' | 'name-desc';
export const mediaFilters: { id: MediaFilter; name: string }[] = [{ id: 'all', name: 'All Files' }, { id: 'video', name: 'Videos' }, { id: 'image', name: 'Photos' }, { id: 'folder', name: 'Folders' }];
export const mediaSorts: { id: MediaSort; name: string }[] = [{ id: 'natural', name: 'Episode / name order' }, { id: 'name', name: 'Name · A to Z' }, { id: 'name-desc', name: 'Name · Z to A' }];
const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function browseEntries(entries: readonly MediaEntry[], filter: MediaFilter, sort: MediaSort = 'natural'): MediaEntry[] {
  return entries.filter((entry) => filter === 'all' || entry.isDirectory || entry.type === filter)
    .sort(sort === 'natural' ? compareMediaNames : (a, b) => Number(b.isDirectory) - Number(a.isDirectory) || nameOrder.compare(a.name, b.name) * (sort === 'name-desc' ? -1 : 1));
}
export function mediaHeaderRows(): FocusRows { return [[{ id: 'media-home', x: 160 }, { id: 'media-options', x: 1700 }]]; }
export function mediaOptionsRows(hasSelection: boolean): FocusRows {
  return [...mediaFilters.map(item => `filter-${item.id}`), ...mediaSorts.map(item => `sort-${item.id}`), 'media-hidden', 'media-refresh', ...(hasSelection ? ['media-item-options'] : [])].map(id => [{ id, x: 1700 }]);
}
export function mediaUpReturnsHome(id: string): boolean { return id === 'media-home' || id === 'media-options'; }
export function entryRows(count: number, columns: number): FocusRows {
  const rows = [];
  for (let start = 0; start < count; start += columns) {
    rows.push(Array.from({ length: Math.min(columns, count - start) }, (_, i) => ({ id: `media-entry-${start + i}`, x: 220 + i * 280 })));
  }
  return rows;
}
export function mediaWindow(count: number, focused: string, columns: number, rowCount = 3) {
  const index = focused.startsWith('media-entry-') ? Number(focused.slice(12)) : 0;
  const row = Math.floor(Math.min(Math.max(0, index || 0), Math.max(0, count - 1)) / columns);
  const start = Math.max(0, row - 1) * columns;
  return { start, end: Math.min(start + columns * rowCount, count) };
}
export function formatSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
