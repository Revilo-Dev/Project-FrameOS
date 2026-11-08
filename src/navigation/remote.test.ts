import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentSettingsTab, homeRows, playerEpisodeRows, playerRows, settingsLayout } from './layout';
import { nextFocus, remoteKey, tabFocus } from './remote';

describe('remote navigation', () => {
  it('moves from centred controls down to the timeline and back to Play/Pause', () => {
    assert.equal(nextFocus(playerRows, 'player-toggle', 'left'), 'player-rewind');
    assert.equal(nextFocus(playerRows, 'player-toggle', 'right'), 'player-forward');
    assert.equal(nextFocus(playerRows, 'player-next', 'down'), 'player-seek');
    assert.equal(nextFocus(playerRows, 'player-seek', 'up'), 'player-toggle');
    assert.equal(nextFocus(playerRows, 'player-toggle', 'up'), 'player-episodes');
    assert.equal(nextFocus(playerRows, 'player-episodes', 'right'), 'player-home');
    const episodes = playerEpisodeRows(3);
    assert.equal(nextFocus(episodes, 'player-episodes-close', 'down'), 'player-episode-0');
    assert.equal(nextFocus(episodes, 'player-episode-2', 'up'), 'player-episode-1');
    assert.equal(tabFocus(episodes, 'player-episode-2', false), 'player-episodes-close');
  });
  it('cycles the existing Settings tabs with wrapping and makes clock fonts D-pad reachable', () => {
    assert.equal(adjacentSettingsTab('appearance', -1), 'advanced');
    assert.equal(adjacentSettingsTab('advanced', 1), 'appearance');
    assert.equal(adjacentSettingsTab('clock', 1), 'home-dock');
    const rows = settingsLayout('clock', 0);
    assert.equal(nextFocus(rows, 'time-format-12h', 'down'), 'clock-font-modern');
    assert.equal(nextFocus(rows, 'clock-font-bold', 'up'), 'clock-font-modern');
  });
  it('uses native Tizen Back and desktop equivalents through one mapping', () => {
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 10009 }), 'back');
    assert.equal(remoteKey({ key: 'Escape', keyCode: 27 }), 'back');
    assert.equal(remoteKey({ key: 'Unidentified', keyCode: 40 }), 'down');
    assert.equal(remoteKey({ key: 'MediaPlay', keyCode: 415 }), 'media-play');
    assert.equal(remoteKey({ key: 'Home', keyCode: 36 }), 'home');
    assert.equal(remoteKey({ key: 'BrowserHome', keyCode: 0 }), 'home');
  });
  it('reaches all ten default tiles without focusing the Media label', () => {
    let id = 'app-art';
    const visited = [id];
    for (let i = 0; i < 15; i++) { id = nextFocus(homeRows, id, 'right'); visited.push(id); }
    assert.equal(new Set(visited).size, 10);
    assert.equal(id, 'app-all-apps');
    assert.equal(nextFocus(homeRows, id, 'down'), id);
    assert.equal(homeRows.some(row => row.some(node => node.id === 'home-media')), false);
    assert.equal(nextFocus(homeRows, 'app-youtube', 'left'), 'app-art');
    assert.equal(nextFocus(homeRows, 'app-art', 'left'), 'app-art');
  });
  it('moves vertically to the nearest column and provides a route out of each row', () => {
    const settingsRows = settingsLayout('appearance', 0);
    assert.equal(nextFocus(homeRows, 'app-settings', 'up'), 'top-network');
    assert.equal(nextFocus(settingsRows, 'motion-off', 'up'), 'theme-aqua');
    assert.equal(nextFocus(settingsRows, 'theme-warm', 'up'), 'settings-tab-tv-sources');
  });
  it('contains Tab navigation in the active panel with reverse traversal', () => {
    const settingsRows = settingsLayout('weather', 0);
    assert.equal(tabFocus(settingsRows, 'city-hobart', false), 'settings-close');
    assert.equal(tabFocus(settingsRows, 'settings-close', true), 'city-hobart');
  });
});
