import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homeRows, settingsLayout } from './layout';
import { nextFocus, remoteKey, tabFocus } from './remote';

describe('remote navigation', () => {
  it('uses native Tizen Back and desktop equivalents through one mapping', () => {
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 10009 }), 'back');
    assert.equal(remoteKey({ key: 'Escape', keyCode: 27 }), 'back');
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 40 }), 'down');
    assert.equal(remoteKey({ key: 'MediaPlay', keyCode: 415 }), null);
  });
  it('reaches all seven tiles and the Media prompt without a redundant USB tile', () => {
    let id = 'app-youtube';
    const visited = [id];
    for (let i = 0; i < 15; i++) { id = nextFocus(homeRows, id, 'right'); visited.push(id); }
    assert.equal(new Set(visited).size, 7);
    assert.equal(id, 'app-settings');
    assert.equal(nextFocus(homeRows, id, 'down'), 'home-media');
    assert.equal(nextFocus(homeRows, 'app-youtube', 'left'), 'app-youtube');
  });
  it('moves vertically to the nearest column and provides a route out of each row', () => {
    const settingsRows = settingsLayout('appearance', 0);
    assert.equal(nextFocus(homeRows, 'app-settings', 'up'), 'top-network');
    assert.equal(nextFocus(settingsRows, 'motion-off', 'up'), 'theme-warm');
    assert.equal(nextFocus(settingsRows, 'theme-warm', 'up'), 'settings-tab-usb');
  });
  it('contains Tab navigation in the active panel with reverse traversal', () => {
    const settingsRows = settingsLayout('weather', 0);
    assert.equal(tabFocus(settingsRows, 'city-hobart', false), 'settings-close');
    assert.equal(tabFocus(settingsRows, 'settings-close', true), 'city-hobart');
  });
});
