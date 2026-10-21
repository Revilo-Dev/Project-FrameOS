import { useCallback, useEffect, useRef, useState } from 'react';
import { CALENDAR_REFRESH_MS, disconnectCalendar, pendingCalendarProvider, readCalendarCache, refreshCalendar, type CalendarProvider, type CalendarState } from '../services/calendar';
import type { SettingsStorage } from '../services/settings';

export function useCalendar(storage: SettingsStorage, provider: CalendarProvider = pendingCalendarProvider) {
  const [state, setState] = useState<CalendarState>(() => ({ status: provider.configured ? 'loading' : 'unconfigured', snapshot: provider.configured ? readCalendarCache(storage) : null }));
  const controller = useRef<AbortController>(), pending = useRef(false), due = useRef(0), mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!provider.configured || pending.current || document.hidden) return;
    pending.current = true; controller.current = new AbortController();
    setState(current => ({ ...current, status: 'loading' }));
    try {
      const next = await refreshCalendar(provider, storage, controller.current.signal);
      if (mounted.current) setState(next);
    } catch { /* Aborted on unmount or disconnect. */ }
    finally { pending.current = false; due.current = Date.now() + CALENDAR_REFRESH_MS; }
  }, [provider, storage]);
  useEffect(() => {
    mounted.current = true;
    if (!provider.configured) return () => { mounted.current = false; };
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      clearTimeout(timer);
      if (document.hidden) return;
      if (Date.now() >= due.current) await refresh();
      if (mounted.current) timer = setTimeout(update, Math.max(1000, due.current - Date.now()));
    };
    const online = () => { due.current = 0; void update(); };
    void update(); document.addEventListener('visibilitychange', update); window.addEventListener('online', online);
    return () => { mounted.current = false; clearTimeout(timer); controller.current?.abort(); document.removeEventListener('visibilitychange', update); window.removeEventListener('online', online); };
  }, [provider, refresh]);
  const disconnect = useCallback(async () => {
    controller.current?.abort();
    setState({ status: 'disconnected', snapshot: null });
    await disconnectCalendar(provider, storage);
  }, [provider, storage]);
  return { state, refresh, disconnect };
}
