import { it } from 'node:test';
import assert from 'node:assert/strict';
import { registerMediaKeys } from './mediaKeys';
import { remoteKey } from '../navigation/remote';
it('registers/unregisters only media keys and preserves Samsung system buttons', () => {
  const registered: string[] = [], removed: string[] = [];
  const cleanup = registerMediaKeys({ tizen: { tvinputdevice: {
    registerKey(name: string) { registered.push(name); }, unregisterKey(name: string) { removed.push(name); },
    getSupportedKeys() { return [{ name: 'MediaTrackNext', code: 9001 }, { name: 'Power', code: 409 }]; },
  } } });
  assert(registered.includes('MediaPlayPause')); assert(registered.includes('MediaTrackNext'));
  for (const reserved of ['Power', 'VolumeUp', 'Home', 'Exit']) assert.equal(registered.includes(reserved), false);
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 9001 }), 'media-next');
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 409 }), null);
  cleanup(); assert.deepEqual(removed, registered); assert.equal(remoteKey({ key: 'Unidentified', keyCode: 9001 }), null);
});
