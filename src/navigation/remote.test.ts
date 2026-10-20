import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homeRows, settingsRows } from './layout';
import { nextFocus, remoteKey, tabFocus } from './remote';

describe('remote navigation', () => {
  it('uses native Tizen Back and desktop equivalents through one mapping', () => {
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 10009 }), 'back');
    assert.equal(remoteKey({ key: 'Escape', keyCode: 27 }), 'back');
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 40 }), 'down');
    assert.equal(remoteKey({ key: 'MediaPlay', keyCode: 415 }), null);
  });
  it('reaches all eight tiles and stays at row boundaries under repeated input', () => {
    let id = nextFocus(homeRows, 'hero-usb', 'down');
    const visited = [id];
    for (let i = 0; i < 15; i++) { id = nextFocus(homeRows, id, 'right'); visited.push(id); }
    assert.equal(new Set(visited).size, 8);
    assert.equal(id, 'app-settings');
    assert.equal(nextFocus(homeRows, id, 'down'), id);
    assert.equal(nextFocus(homeRows, 'app-usb', 'left'), 'app-usb');
  });
  it('moves vertically to the nearest column and provides a route out of each row', () => {
    assert.equal(nextFocus(homeRows, 'app-settings', 'up'), 'hero-personalise');
    assert.equal(nextFocus(homeRows, 'hero-personalise', 'up'), 'top-settings');
    assert.equal(nextFocus(settingsRows, 'motion-off', 'up'), 'wallpaper-dusk');
    assert.equal(nextFocus(settingsRows, 'theme-warm', 'up'), 'settings-close');
  });
  it('contains Tab navigation in the active panel with reverse traversal', () => {
    assert.equal(tabFocus(settingsRows, 'motion-off', false), 'settings-close');
    assert.equal(tabFocus(settingsRows, 'settings-close', true), 'motion-off');
  });
});
