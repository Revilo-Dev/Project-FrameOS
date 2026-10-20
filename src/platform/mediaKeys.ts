const keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaTrackNext', 'MediaTrackPrevious', 'MediaFastForward', 'MediaRewind'];
import { bindMediaKeys } from '../navigation/remote';
export function registerMediaKeys(runtime: unknown): () => void {
  const registered: string[] = [];
  const input = (runtime as { tizen?: { tvinputdevice?: { registerKey(name: string): void; unregisterKey(name: string): void; getSupportedKeys?(): { name: string; code: number }[] } } })?.tizen?.tvinputdevice;
  if (input?.registerKey) for (const key of keys) { try { input.registerKey(key); registered.push(key); } catch { /* Some keys are absent on individual remotes. */ } }
  let unbind = () => {};
  try { unbind = bindMediaKeys((input?.getSupportedKeys?.() || []).filter(key => registered.includes(key.name))); } catch { /* Enter/arrows remain usable. */ }
  return () => { unbind(); for (const key of registered) { try { input?.unregisterKey(key); } catch { /* Runtime is closing. */ } } };
}
