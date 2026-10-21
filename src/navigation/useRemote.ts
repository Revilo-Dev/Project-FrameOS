import { useEffect, useRef } from 'react';
import { nextFocus, remoteKey, tabFocus, type Direction, type FocusRows } from './remote';
import type { RemoteKey } from './remote';
import { HoldGesture } from './HoldGesture';

interface RemoteState {
  rows: FocusRows;
  current: string;
  focus(id: string): void;
  back(): void;
  direction?(direction: Direction, current: string): boolean | string;
  input?(key: NonNullable<RemoteKey>, current: string): boolean;
  longPress?: { eligible(id: string): boolean; open(id: string): void };
}

export function useRemote(state: RemoteState) {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const hold = new HoldGesture();
    const handle = (event: KeyboardEvent) => {
      const key = event.key === 'F10' && event.shiftKey ? 'context' : remoteKey(event);
      if (!key) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Let native editors own arrows/channel buttons while their keyboard is open.
      if (event.isComposing || target?.isContentEditable || target?.matches('input, textarea, select')) return;
      const active = latest.current;
      if (active.input?.(key, active.current)) { event.preventDefault(); return; }
      if (key.startsWith('media-')) return;
      event.preventDefault();
      if (key === 'context') { hold.cancel(); if (active.longPress?.eligible(active.current)) active.longPress.open(active.current); return; }
      if (key !== 'select') hold.cancel();
      if (key === 'back') { if (!event.repeat) active.back(); return; }
      if (key === 'select') {
        if (hold.isDown()) return;
        if (active.longPress?.eligible(active.current)) {
          const id = active.current;
          hold.down(id, () => { if (latest.current.current === id) document.getElementById(id)?.click(); }, () => { if (latest.current.current === id && latest.current.longPress?.eligible(id)) latest.current.longPress.open(id); });
          return;
        }
        // Holding Enter must not open a panel and immediately activate its first option.
        if (!event.repeat) document.getElementById(active.current)?.click();
        return;
      }
      if (key !== 'tab') {
        const override = active.direction?.(key as Direction, active.current);
        if (typeof override === 'string') {
          latest.current = { ...active, current: override };
          active.focus(override);
          return;
        }
        if (override) return;
      }
      const id = key === 'tab'
        ? tabFocus(active.rows, active.current, event.shiftKey)
        : nextFocus(active.rows, active.current, key as Direction);
      // Update the ref synchronously so bursts of remote events never use stale state.
      latest.current = { ...active, current: id };
      active.focus(id);
    };
    const release = (event: KeyboardEvent) => { if (remoteKey(event) === 'select') hold.release(); };
    const cancel = () => hold.cancel();
    document.addEventListener('keydown', handle);
    document.addEventListener('keyup', release);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => { hold.cancel(); document.removeEventListener('keydown', handle); document.removeEventListener('keyup', release); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); };
  }, []);
}
