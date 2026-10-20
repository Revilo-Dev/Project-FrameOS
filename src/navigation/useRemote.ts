import { useEffect, useRef } from 'react';
import { nextFocus, remoteKey, tabFocus, type FocusRows } from './remote';

interface RemoteState {
  rows: FocusRows;
  current: string;
  focus(id: string): void;
  back(): void;
}

export function useRemote(state: RemoteState) {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const key = remoteKey(event);
      if (!key) return;
      event.preventDefault();
      const active = latest.current;
      if (key === 'back') { if (!event.repeat) active.back(); return; }
      if (key === 'select') {
        // Holding Enter must not open a panel and immediately activate its first option.
        if (!event.repeat) document.getElementById(active.current)?.click();
        return;
      }
      const id = key === 'tab'
        ? tabFocus(active.rows, active.current, event.shiftKey)
        : nextFocus(active.rows, active.current, key);
      // Update the ref synchronously so bursts of remote events never use stale state.
      latest.current = { ...active, current: id };
      active.focus(id);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);
}
