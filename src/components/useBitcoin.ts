import { useEffect, useState } from 'react';
import { BITCOIN_REFRESH_MS, readBitcoinCache, refreshBitcoin, type BitcoinState } from '../services/bitcoin';
import type { SettingsStorage } from '../services/settings';

export function useBitcoin(storage: SettingsStorage, timeZone: string, active: boolean): BitcoinState {
  const [state, setState] = useState<BitcoinState>(() => ({ status: 'loading', snapshot: readBitcoinCache(storage, timeZone) }));
  useEffect(() => {
    if (!active) return;
    let live = true, pending = false;
    let controller: AbortController | undefined;
    const update = async () => {
      if (!live || document.hidden || pending) return;
      pending = true; controller = new AbortController();
      const next = await refreshBitcoin(storage, timeZone, controller.signal);
      if (live && !controller.signal.aborted) setState(next);
      pending = false;
    };
    setState({ status: 'loading', snapshot: readBitcoinCache(storage, timeZone) });
    void update();
    const resume = () => { if (document.hidden) controller?.abort(); else void update(); };
    const timer = setInterval(() => void update(), BITCOIN_REFRESH_MS);
    document.addEventListener('visibilitychange', resume); window.addEventListener('online', update);
    return () => { live = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', update); };
  }, [storage, timeZone, active]);
  return state;
}
