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
it('discovers channel keycodes, skips unadvertised keys, and releases bindings when the player exits', () => {
  const registered: string[] = [];
  const cleanup = registerMediaKeys({ tizen: { tvinputdevice: {
    getSupportedKeys: () => [{ name: 'ChannelUp', code: 12345 }, { name: 'ChannelDown', code: 12346 }],
    registerKey(name: string) { registered.push(name); }, unregisterKey() {},
  } } });
  assert(registered.includes('ChannelUp')); assert(registered.includes('ChannelDown'));
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 12345 }), 'media-skip-forward');
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 12346 }), 'media-skip-back');
  cleanup(); assert.equal(remoteKey({ key: 'Unidentified', keyCode: 12345 }), null);
  const unsupported: string[] = [];
  registerMediaKeys({ tizen: { tvinputdevice: { getSupportedKeys() { throw Error('unsupported'); }, registerKey(name: string) { unsupported.push(name); }, unregisterKey() {} } } })();
  assert.equal(unsupported.includes('ChannelUp'), false);
  assert.equal(remoteKey({ key: 'PageUp', keyCode: 0 }), 'media-skip-forward');
});
it('captures supported volume keys only when playback requests seeking, and releases both native and named mappings', () => {
  const registered: string[] = [], removed: string[] = [];
  const runtime = { tizen: { tvinputdevice: {
    getSupportedKeys: () => [{ name: 'VolumeUp', code: 9201 }, { name: 'VolumeDown', code: 9202 }, { name: 'VolumeMute', code: 449 }],
    registerKey(name: string) { registered.push(name); }, unregisterKey(name: string) { removed.push(name); },
  } } };
  registerMediaKeys(runtime)();
  assert.equal(registered.includes('VolumeUp'), false);
  assert.equal(remoteKey({ key: 'VolumeUp', keyCode: 9201 }), null);
  const release = registerMediaKeys(runtime, { volumeSeek: true });
  assert(registered.includes('VolumeUp')); assert(registered.includes('VolumeDown'));
  assert.equal(registered.includes('VolumeMute'), false);
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 9201 }), 'media-volume-forward');
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 9202 }), 'media-volume-back');
  assert.equal(remoteKey({ key: 'AudioVolumeUp', keyCode: 0 }), 'media-volume-forward');
  assert.equal(remoteKey({ key: 'VolumeDown', keyCode: 0 }), 'media-volume-back');
  release(); assert.equal(remoteKey({ key: 'VolumeUp', keyCode: 9201 }), null);
  assert.equal(remoteKey({ key: 'AudioVolumeDown', keyCode: 0 }), null);
  assert.deepEqual(removed, registered);
});
it('does not bind a volume direction whose native registration failed', () => {
  const release = registerMediaKeys({ tizen: { tvinputdevice: {
    getSupportedKeys: () => [{ name: 'VolumeUp', code: 9201 }, { name: 'VolumeDown', code: 9202 }],
    registerKey(name: string) { if (name === 'VolumeDown') throw new Error('unsupported'); }, unregisterKey() {},
  } } }, { volumeSeek: true });
  assert.equal(remoteKey({ key: 'VolumeDown', keyCode: 9202 }), null);
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 9201 }), 'media-volume-forward');
  release();
});
