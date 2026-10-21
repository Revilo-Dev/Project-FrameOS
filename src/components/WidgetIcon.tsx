import type { WidgetId } from '../services/widgets';

export function WidgetIcon({ id }: { id: WidgetId }) {
  return <svg className={`widget-icon widget-icon-${id}`} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {id === 'weather' && <><circle cx="16" cy="16" r="6" /><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3" /></>}
    {id === 'calendar' && <><rect x="4" y="6" width="24" height="23" rx="6" /><path d="M10 3v7m12-7v7M4 14h24m-17 6h2m6 0h2m-10 5h2" /></>}
    {id === 'reminders' && <><path d="M6 23h20l-3-5v-6a7 7 0 0 0-14 0v6l-3 5Zm7 4a3 3 0 0 0 6 0M16 3v2" /></>}
    {id === 'todo' && <><rect x="4" y="4" width="24" height="25" rx="6" /><path d="m9 13 2 2 4-5m3 3h5m-14 9 2 2 4-5m3 3h5" /></>}
    {id === 'world-clock' && <><circle cx="16" cy="16" r="13" /><path d="M16 8v9l6 3" /></>}
  </svg>;
}
