import { useEffect, useRef, useState } from 'react';
import { remoteKey } from './remote';

/** Capture wake input before the launcher. Holding Select cannot wake/reenter. */
export function useArtMode(restore: () => void) {
  const [active, setActive] = useState(false);
  const state = useRef(false), restoreRef = useRef(restore);
  restoreRef.current = restore;
  const swallowed = useRef(new Set<string>());
  const down = useRef(new Set<string>());
  const ignoreClickUntil = useRef(0);
  useEffect(() => {
    const wake = () => { state.current = false; setActive(false); restoreRef.current(); };
    const keydown = (event: KeyboardEvent) => {
      const key = remoteKey(event);
      if (!key || !['select', 'back', 'left', 'right', 'up', 'down', 'tab'].includes(key)) return;
      const held = down.current.has(key); down.current.add(key);
      if (!state.current && !swallowed.current.has(key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (state.current && !event.repeat && !held) { swallowed.current.add(key); wake(); }
    };
    const keyup = (event: KeyboardEvent) => {
      const key = remoteKey(event);
      if (key) down.current.delete(key);
      if (key && swallowed.current.delete(key)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const click = (event: MouseEvent | TouchEvent) => {
      if (!state.current && Date.now() >= ignoreClickUntil.current) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (state.current) { wake(); if (event.type === 'touchend') ignoreClickUntil.current = Date.now() + 700; }
    };
    const blur = () => { swallowed.current.clear(); down.current.clear(); };
    document.addEventListener('keydown', keydown, true); document.addEventListener('keyup', keyup, true);
    document.addEventListener('click', click, true); document.addEventListener('touchend', click, { capture: true, passive: false });
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true);
      document.removeEventListener('click', click, true); document.removeEventListener('touchend', click, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return { active, enter: () => { state.current = true; setActive(true); (document.activeElement as HTMLElement | null)?.blur(); } };
}
