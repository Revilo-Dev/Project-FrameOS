import { memo, useEffect, useState } from 'react';

// Isolated from launcher state: one text update/second, no launcher rerenders.
export const FpsCounter = memo(function FpsCounter() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    let request = 0, frames = 0, start = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - start >= 1000) { setFps(Math.round(frames * 1000 / (now - start))); frames = 0; start = now; }
      request = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(request); frames = 0; start = performance.now();
      if (!document.hidden) request = requestAnimationFrame(tick);
    };
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(request); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return <span className="fps-counter" aria-label="Frame rate">{fps === null ? '—' : fps} FPS <span>· TEST</span></span>;
});
