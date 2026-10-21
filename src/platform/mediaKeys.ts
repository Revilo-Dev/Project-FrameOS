const keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaTrackNext', 'MediaTrackPrevious', 'MediaFastForward', 'MediaRewind'];
import { bindMediaKeys } from '../navigation/remote';
export function registerMediaKeys(runtime: unknown): () => void {
  const registered: string[] = [];
  const input = (runtime as { tizen?: { tvinputdevice?: { registerKey(name: string): void; unregisterKey(name: string): void; getSupportedKeys?(): { name: string; code: number }[] } } })?.tizen?.tvinputdevice;
  let supported: { name: string; code: number }[] = [];
  try { supported = input?.getSupportedKeys?.() || []; } catch { /* Older runtimes retain standard media keys. */ }
  const channelKeys = supported.filter(key => ['ChannelUp', 'ChannelDown'].includes(key.name) && Number.isFinite(key.code));

  if (input && channelKeys.length < 2) console.info('[FrameOS] Channel keys are not fully advertised by this remote. Timeline and fast-forward/rewind remain available.');
  if (input?.registerKey) for (const key of keys) { try { input.registerKey(key); registered.push(key); } catch { /* Some keys are absent on individual remotes. */ } }
  if (input?.registerKey) for (const key of channelKeys) { try { input.registerKey(key.name); registered.push(key.name); } catch { console.info(`[FrameOS] ${key.name} registration unavailable; use the timeline.`); } }
  let unbind = () => {};
  try { unbind = bindMediaKeys(supported.filter(key => registered.includes(key.name) || /^(?:Audio)?Volume(?:Up|Down|Mute)$/.test(key.name))); } catch { /* Enter/arrows remain usable. */ }
  return () => { unbind(); for (const key of registered) { try { input?.unregisterKey(key); } catch { /* Runtime is closing. */ } } };
}
