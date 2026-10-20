import type { IconName } from '../types/launcher';

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    usb: <><path d="M24 39V10m-6 7 6-7 6 7M24 29l-10-7v-5m10 15 11-8v-5" /><circle cx="24" cy="39" r="3" /><circle cx="14" cy="14" r="3" /><path d="M32 13h6v6h-6z" /></>,
    play: <><rect x="5" y="11" width="38" height="27" rx="9" fill="currentColor" stroke="none" /><path d="m21 19 11 6-11 6z" fill="var(--icon-cutout, #b44048)" stroke="none" /></>,
    stan: <text x="24" y="33" textAnchor="middle" fill="currentColor" stroke="none" fontSize="29" fontWeight="700" fontFamily="Arial, sans-serif">S.</text>,
    foxtel: <><path d="m13 13 22 22m0-22L13 35M24 8v32M8 24h32" strokeWidth="4" /></>,
    gallery: <><rect x="7" y="8" width="34" height="32" rx="7" /><circle cx="30" cy="18" r="4" /><path d="m8 32 11-11 11 13 5-5 6 6" /></>,
    art: <><rect x="7" y="8" width="34" height="30" rx="3" /><path d="m12 31 9-12 7 7 5-5 4 10M19 42h10M24 38v4" /></>,
    browser: <><circle cx="24" cy="24" r="17" /><ellipse cx="24" cy="24" rx="8" ry="17" /><path d="M8 24h32M11 15h26M11 33h26" /></>,
    settings: <><path d="m20 6-2 6-5 1-5 5 3 6-2 6 5 5 6-1 4 5 6-2 1-6 6-3v-7l-6-3-1-6-6-2-4 5z" /><circle cx="23" cy="23" r="6" /></>,
    arrow: <path d="M9 24h29M27 13l11 11-11 11" />,
    close: <path d="m13 13 22 22m0-22L13 35" />,
    check: <path d="m11 24 9 9 18-18" />,
    home: <><path d="m7 22 17-14 17 14M12 20v19h24V20M20 39V27h8v12" /></>,
    moon: <path d="M37 29A17 17 0 0 1 19 10a17 17 0 1 0 18 19Z" />,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
