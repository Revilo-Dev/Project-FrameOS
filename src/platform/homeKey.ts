import { bindHomeKey } from '../navigation/remote';

/** Only request Home when the public input API advertises it. Some TV firmware
 * reserves Home for Smart Hub and never delivers it to web applications. */
export function registerHomeKey(runtime: unknown): () => void {
  const input = (runtime as { tizen?: { tvinputdevice?: { getSupportedKeys?(): { name: string; code: number }[]; registerKey(name: string): void; unregisterKey(name: string): void } } })?.tizen?.tvinputdevice;
  try {
    const key = input?.getSupportedKeys?.().find(key => key.name === 'Home' && Number.isFinite(key.code));
    if (!input || !key) return () => {};
    input.registerKey(key.name);
    const unbind = bindHomeKey(key.code);
    return () => { unbind(); try { input.unregisterKey(key.name); } catch { /* Runtime is closing. */ } };
  } catch { return () => {}; }
}
