import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAdapter } from './BrowserAdapter';
import { TizenAdapter } from './TizenAdapter';
import { createPlatform } from './index';
import type { NativeAction } from '../types/launcher';

const actions: NativeAction[] = [{ type: 'usb' }, { type: 'launch-app', app: 'youtube' }, { type: 'gallery' }, { type: 'art-mode' }, { type: 'browser' }, { type: 'system-settings' }, { type: 'avplay', source: 'test' }];

describe('platform boundary', () => {
  it('closes only the current Tizen application when explicitly requested', async () => {
    let exits = 0;
    const platform = new TizenAdapter({ tizen: { application: { getCurrentApplication: () => ({ exit() { exits++; } }) } } });
    assert.equal(exits, 0);
    assert.equal(await platform.exit(), null);
    assert.equal(exits, 1);
    assert.equal((await new BrowserAdapter().exit()).status, 'unsupported');
  });
  it('falls back to browser when Tizen is missing, partial, or inaccessible', () => {
    assert.equal(createPlatform({}).kind, 'browser');
    assert.equal(createPlatform({ tizen: {} }).kind, 'browser');
    assert.equal(createPlatform({ get tizen() { throw new Error('denied'); } }).kind, 'browser');
    assert.equal(createPlatform({ tizen: { application: {} } }).kind, 'tizen');
  });
  it('browser startup has no synthetic USB drives and keeps an unavailable media boundary', async () => {
    const platform = createPlatform({});
    assert.equal(platform.media.available, false);
    assert.equal(platform.media.kind, 'unavailable');
    assert.deepEqual(await platform.media.listStorages(), []);
  });
  for (const adapter of [new BrowserAdapter(), new TizenAdapter()]) {
    it(`${adapter.kind} reports every native action as unsupported without calling APIs`, async () => {
      for (const action of actions) {
        const result = await adapter.perform(action);
        assert(result);
        if (adapter.kind === 'tizen' && ['launch-app', 'gallery', 'browser'].includes(action.type)) { assert.equal(result.status, 'unavailable'); continue; }
        assert.equal(result.status, 'unsupported');
        assert.match(result.message, action.type === 'art-mode' ? /FrameOS Home/ : /future version/);
      }
    });
  }
});
