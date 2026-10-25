import { useLayoutEffect, useRef } from 'react';
import { nextFocus, remoteKey, tabFocus, type Direction, type FocusRows } from './remote';
import type { RemoteKey } from './remote';
import { HoldGesture } from './HoldGesture';

interface RemoteState {
  rows: FocusRows;
  current: string;
  focus(id: string): void;
  back(): void;
  measure?(work: () => void): void;
  direction?(direction: Direction, current: string): boolean | string;
  input?(key: NonNullable<RemoteKey>, current: string): boolean;
  observe?(event: KeyboardEvent): boolean;
  longPress?: { eligible(id: string): boolean; open(id: string): void; context?(id: string): void; thresholdMs?: number; requireRepeat?: boolean; releaseOnly?: boolean; unsupported?(): void };
}

export function useRemote(state: RemoteState) {
  const latest = useRef(state);
  latest.current = state;
  const cancelHeld = useRef<() => void>(() => {});
  useLayoutEffect(() => { cancelHeld.current(); }, [state.current]);
  useLayoutEffect(() => {
    let hold = new HoldGesture();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let selectDown = false, lastSelect = 0;
    const handle = (event: KeyboardEvent) => {
      if (latest.current.observe?.(event)) { clearTimeout(watchdog); hold.cancel(); selectDown = false; event.preventDefault(); return; }
      const key = event.key === 'F10' && event.shiftKey ? 'context' : remoteKey(event);
      if (!key) return;
      if (document.hidden) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Let native editors own arrows/channel buttons while their keyboard is open.
      if (event.isComposing || target?.isContentEditable || target?.matches('input, textarea, select')) return;
      const active = latest.current;
      if (key === 'select') {
        event.preventDefault();
        lastSelect = Date.now();
        if (selectDown) { hold.repeat(); return; }
        // A repeat with no corresponding first event must not activate anything.
        if (event.repeat) return;
        selectDown = true;
      } else { clearTimeout(watchdog); hold.cancel(); selectDown = false; }
      if (active.input?.(key, active.current)) { event.preventDefault(); return; }
      if (key.startsWith('media-')) return;
      event.preventDefault();
      if (key === 'context') { hold.cancel(); if (active.longPress?.eligible(active.current)) (active.longPress.context || active.longPress.open)(active.current); return; }
      if (key !== 'select') hold.cancel();
      if (key === 'back') { if (!event.repeat) active.back(); return; }
      if (key === 'select') {
        if (hold.isDown()) return;
        if (active.longPress?.eligible(active.current)) {
          const id = active.current;
          hold = new HoldGesture(active.longPress.thresholdMs ?? 750, undefined, active.longPress.requireRepeat ?? false, active.longPress.releaseOnly ?? false);
          hold.down(id, () => { if (latest.current.current === id) document.getElementById(id)?.click(); }, () => { if (latest.current.current === id && latest.current.longPress?.eligible(id)) latest.current.longPress.open(id); });
          if (active.longPress.unsupported) watchdog = setTimeout(() => { hold.cancel(); latest.current.longPress?.unsupported?.(); }, 2600);
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
    const release = (event: KeyboardEvent) => { clearTimeout(watchdog); if (latest.current.observe?.(event)) { hold.cancel(); selectDown = false; event.preventDefault(); return; } if (remoteKey(event) === 'select') { event.preventDefault(); selectDown = false; lastSelect = Date.now(); hold.release(); } };
    const dispatch = (event: KeyboardEvent) => { const measure = latest.current.measure; if (measure && remoteKey(event)) measure(() => handle(event)); else handle(event); };
    const cancel = () => { clearTimeout(watchdog); hold.cancel(); };
    cancelHeld.current = () => { clearTimeout(watchdog); hold.cancel(); };
    // Native keyboard-generated clicks can follow remote Enter on some firmware.
    const ghostClick = (event: MouseEvent) => { if (event.isTrusted && event.detail === 0 && (selectDown || Date.now() - lastSelect < 350)) { event.preventDefault(); event.stopImmediatePropagation(); } };
    document.addEventListener('keydown', dispatch);
    document.addEventListener('keyup', release);
    document.addEventListener('click', ghostClick, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => { cancel(); document.removeEventListener('keydown', dispatch); document.removeEventListener('keyup', release); document.removeEventListener('click', ghostClick, true); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); };
  }, []);
}
