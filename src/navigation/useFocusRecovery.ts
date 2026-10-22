import { useEffect, useRef } from 'react';
import { recoverFocus } from './focusRecovery';
import type { FocusRows } from './remote';

/** Recover DOM focus only when Samsung shows FrameOS again. Never launch an app,
 * request foreground ownership, or move focus out of an active editor. */
export function useFocusRecovery(rows: FocusRows, current: string, focus: (id: string) => void, suspended: boolean) {
  const latest = useRef({ rows, current, focus, suspended }); latest.current = { rows, current, focus, suspended };
  useEffect(() => {
    let request = 0;
    const restore = () => {
      cancelAnimationFrame(request);
      if (document.hidden) return;
      request = requestAnimationFrame(() => {
        const state = latest.current;
        if (state.suspended || document.hidden || (document.activeElement as HTMLElement | null)?.matches('input,textarea,select,[contenteditable="true"]')) return;
        const id = recoverFocus(state.rows, state.current, id => {
          const element = document.getElementById(id);
          return !!element && !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0;
        });
        if (id) state.focus(id);
      });
    };
    document.addEventListener('visibilitychange', restore); window.addEventListener('pageshow', restore);
    return () => { cancelAnimationFrame(request); document.removeEventListener('visibilitychange', restore); window.removeEventListener('pageshow', restore); };
  }, []);
}
