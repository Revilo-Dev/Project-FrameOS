import { useEffect, useState, type ReactNode } from 'react';

export function Stage({ children }: { children: ReactNode }) {
  const measure = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const [scale, setScale] = useState(measure);
  useEffect(() => {
    const resize = () => setScale(measure());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>{children}</div>;
}
