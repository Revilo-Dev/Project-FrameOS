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
it('leaves standard and discovered volume keys entirely to the Samsung system', () => {
  const registered: string[] = [];
  const release = registerMediaKeys({ tizen: { tvinputdevice: {
    getSupportedKeys: () => [{ name: 'VolumeUp', code: 9201 }, { name: 'VolumeDown', code: 9202 }, { name: 'VolumeMute', code: 9203 }, { name: 'ChannelUp', code: 427 }],
    registerKey(name: string) { registered.push(name); }, unregisterKey() {},
  } } });
  for (const [key, keyCode] of [['VolumeUp', 447], ['VolumeDown', 448], ['VolumeMute', 449], ['AudioVolumeUp', 9201], ['Unidentified', 9202], ['Unidentified', 9203]] as const) assert.equal(remoteKey({ key, keyCode }), null);
  assert(!registered.some(name => name.startsWith('Volume')));
  assert.equal(remoteKey({ key: 'Unidentified', keyCode: 427 }), 'media-skip-forward');
  release(); assert.equal(remoteKey({ key: 'VolumeUp', keyCode: 9201 }), null);
});
