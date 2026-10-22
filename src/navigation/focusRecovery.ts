import type { FocusRows } from './remote';

export function recoverFocus(rows: FocusRows, remembered: string, available: (id: string) => boolean): string | undefined {
  const ids = rows.flatMap(row => row.map(node => node.id));
  return ids.includes(remembered) && available(remembered) ? remembered : ids.find(available);
}
