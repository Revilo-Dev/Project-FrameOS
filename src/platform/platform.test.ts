import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAdapter } from './BrowserAdapter';
import { TizenAdapter } from './TizenAdapter';
import { createPlatform } from './index';
import type { NativeAction } from '../types/launcher';

const actions: NativeAction[] = [{ type: 'usb' }, { type: 'launch-app', app: 'youtube' }, { type: 'gallery' }, { type: 'art-mode' }, { type: 'browser' }, { type: 'system-settings' }, { type: 'avplay', source: 'test' }];

describe('platform boundary', () => {
  it('falls back to browser when Tizen is missing, partial, or inaccessible', () => {
    assert.equal(createPlatform({}).kind, 'browser');
    assert.equal(createPlatform({ tizen: {} }).kind, 'browser');
    assert.equal(createPlatform({ get tizen() { throw new Error('denied'); } }).kind, 'browser');
    assert.equal(createPlatform({ tizen: { application: {} } }).kind, 'tizen');
  });
  for (const adapter of [new BrowserAdapter(), new TizenAdapter()]) {
    it(`${adapter.kind} reports every native action as unsupported without calling APIs`, async () => {
      for (const action of actions) {
        const result = await adapter.perform(action);
        assert.equal(result.status, 'unsupported');
        assert.match(result.message, /future version/);
      }
    });
  }
});
