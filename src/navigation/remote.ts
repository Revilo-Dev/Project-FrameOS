export type Direction = 'left' | 'right' | 'up' | 'down';
export type MediaKey = 'media-toggle' | 'media-play' | 'media-pause' | 'media-stop' | 'media-next' | 'media-previous' | 'media-forward' | 'media-rewind';
export type RemoteKey = Direction | MediaKey | 'select' | 'back' | 'tab' | 'context' | null;
const mediaNames: Record<string, MediaKey> = { MediaPlayPause: 'media-toggle', MediaPlay: 'media-play', MediaPause: 'media-pause', MediaStop: 'media-stop', MediaTrackNext: 'media-next', MediaTrackPrevious: 'media-previous', MediaFastForward: 'media-forward', MediaRewind: 'media-rewind' };
const nativeMediaCodes = new Map<number, MediaKey>();
export function bindMediaKeys(keys: { name: string; code: number }[]) {
  for (const key of keys) if (mediaNames[key.name]) nativeMediaCodes.set(key.code, mediaNames[key.name]);
  return () => { for (const key of keys) nativeMediaCodes.delete(key.code); };
}
export interface FocusNode { id: string; x: number }
export type FocusRows = readonly (readonly FocusNode[])[];

export function remoteKey(event: { key: string; keyCode: number }): RemoteKey {
  const keys: Record<string, RemoteKey> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'select', Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back', Tab: 'tab' };
  const codes: Record<number, RemoteKey> = { 37: 'left', 39: 'right', 38: 'up', 40: 'down', 13: 'select', 27: 'back', 8: 'back', 10009: 'back' };
  return keys[event.key] || codes[event.keyCode] || mediaNames[event.key] || nativeMediaCodes.get(event.keyCode) || (event.key === 'ContextMenu' ? 'context' : null);
}

export function nextFocus(rows: FocusRows, current: string, direction: Direction): string {
  const rowIndex = rows.findIndex((row) => row.some((node) => node.id === current));
  if (rowIndex < 0) return rows[0]?.[0]?.id || current;
  const row = rows[rowIndex];
  const column = row.findIndex((node) => node.id === current);
  if (direction === 'left' || direction === 'right') {
    return row[Math.max(0, Math.min(row.length - 1, column + (direction === 'left' ? -1 : 1)))].id;
  }
  const target = rows[rowIndex + (direction === 'up' ? -1 : 1)];
  if (!target?.length) return current;
  return target.reduce((best, node) => Math.abs(node.x - row[column].x) < Math.abs(best.x - row[column].x) ? node : best).id;
}

export function tabFocus(rows: FocusRows, current: string, backwards: boolean): string {
  const ids = rows.reduce<string[]>((all, row) => all.concat(row.map((node) => node.id)), []);
  if (!ids.length) return current;
  const index = ids.indexOf(current);
  return ids[(index + (backwards ? -1 : 1) + ids.length) % ids.length];
}
