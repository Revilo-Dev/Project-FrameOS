import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentSettingsTab, homeRows, playerRows, settingsLayout } from './layout';
import { nextFocus, remoteKey, tabFocus } from './remote';

describe('remote navigation', () => {
  it('navigates all five transport controls and centres timeline return on Play/Pause', () => {
    assert.equal(nextFocus(playerRows, 'player-toggle', 'left'), 'player-rewind');
    assert.equal(nextFocus(playerRows, 'player-rewind', 'left'), 'player-previous');
    assert.equal(nextFocus(playerRows, 'player-toggle', 'right'), 'player-forward');
    assert.equal(nextFocus(playerRows, 'player-forward', 'right'), 'player-next');
    assert.equal(nextFocus(playerRows, 'player-next', 'up'), 'player-seek');
    assert.equal(nextFocus(playerRows, 'player-seek', 'down'), 'player-toggle');
  });
  it('cycles the existing Settings tabs with wrapping and makes clock fonts D-pad reachable', () => {
    assert.equal(adjacentSettingsTab('appearance', -1), 'media');
    assert.equal(adjacentSettingsTab('media', 1), 'appearance');
    assert.equal(adjacentSettingsTab('clock', 1), 'wallpapers');
    const rows = settingsLayout('clock', 0);
    assert.equal(nextFocus(rows, 'time-format-12h', 'down'), 'clock-font-modern');
    assert.equal(nextFocus(rows, 'clock-font-bold', 'up'), 'clock-font-modern');
  });
  it('uses native Tizen Back and desktop equivalents through one mapping', () => {
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 10009 }), 'back');
    assert.equal(remoteKey({ key: 'Escape', keyCode: 27 }), 'back');
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 40 }), 'down');
    assert.equal(remoteKey({ key: 'MediaPlay', keyCode: 415 }), 'media-play');
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
    assert.equal(nextFocus(settingsRows, 'theme-warm', 'up'), 'settings-tab-widgets');
  });
  it('contains Tab navigation in the active panel with reverse traversal', () => {
    const settingsRows = settingsLayout('weather', 0);
    assert.equal(tabFocus(settingsRows, 'city-hobart', false), 'settings-close');
    assert.equal(tabFocus(settingsRows, 'settings-close', true), 'city-hobart');
  });
});
