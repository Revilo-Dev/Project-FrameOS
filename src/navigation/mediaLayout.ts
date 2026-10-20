import type { FocusRows } from './remote';
import type { MediaEntry } from '../types/media';

export type MediaFilter = 'all' | 'video' | 'image' | 'folder';
const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' });
export function browseEntries(entries: readonly MediaEntry[], filter: MediaFilter): MediaEntry[] {
  return entries.filter((entry) => filter === 'all' || entry.isDirectory || entry.type === filter)
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || collator.compare(a.name, b.name));
}
export function entryRows(count: number, columns: number): FocusRows {
  const rows = [];
  for (let start = 0; start < count; start += columns) {
    rows.push(Array.from({ length: Math.min(columns, count - start) }, (_, i) => ({ id: `media-entry-${start + i}`, x: 220 + i * 280 })));
  }
  return rows;
}
export function mediaWindow(count: number, focused: string, columns: number) {
  const index = focused.startsWith('media-entry-') ? Number(focused.slice(12)) : 0;
  const pageSize = columns * 3;
  const start = Math.floor(Math.min(Math.max(0, index || 0), Math.max(0, count - 1)) / pageSize) * pageSize;
  return { start, end: Math.min(start + pageSize, count) };
}
export function formatSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
