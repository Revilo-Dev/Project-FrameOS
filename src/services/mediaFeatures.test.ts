import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { video } from '../../tests/mediaFixture';
import { compareMediaNames, detectEpisode, playbackQueue, videoDisplayTitle } from './episodes';
import { defaultMediaPreferences, hiddenIdentity, isMediaHidden, loadMediaPreferences, saveMediaPreferences, toggleMediaHidden } from './mediaPreferences';
import { localFilePath, playbackPath } from './playbackPath';

describe('episode identification and playback lists', () => {
  it('formats display titles without renaming files or changing episode detection', () => {
    assert.equal(videoDisplayTitle('EP03-the_first_one.mkv'), 'EP03-The first one');
    assert.equal(videoDisplayTitle('EP03-the_first_one'), 'EP03-The first one');
    assert.equal(videoDisplayTitle('S01E02_the_one_with_PBS.MP4'), 'S01E02 The one with PBS');
    assert.equal(videoDisplayTitle('EP04__the__one_with_Joey.m4v'), 'EP04 The one with Joey');
    assert.equal(videoDisplayTitle('A title with NASA.mp4'), 'A title with NASA');
    assert.equal(detectEpisode('EP03-the_first_one.mkv')?.episode, 3);
  });
  it('recognises explicit episode patterns, season and series while preserving filenames', () => {
    for (const [filename, episode] of [['Episode 1.mkv', 1], ['Episode 02.mp4', 2], ['Ep 3.mkv', 3], ['E04.mp4', 4], ['S01E05.mkv', 5], ['Series.Name.S02E06.1080p.mkv', 6], ['1x07.mp4', 7]] as const) {
      const result = detectEpisode(filename)!;
      assert.equal(result.episode, episode); assert.equal(result.label, `Episode ${String(episode).padStart(2, '0')}`);
    }
    assert.deepEqual(detectEpisode('Series.Name.S02E06.1080p.mkv'), { episode: 6, season: 2, series: 'Series Name', label: 'Episode 06' });
  });
  it('does not invent episodes from resolutions, years, codec versions or ambiguous ranges', () => {
    for (const name of ['1080p.mkv', '2160p.mp4', '2024.mkv', 'Movie.2020.x264.mkv', 'h265.10bit.mkv', '123456.mp4', 'S01E01-E02.mkv', 'S01E01E02.mkv', 'Episode 1-2.mkv', 'Episode 1 Episode 2.mp4', '1920x1080.mp4']) assert.equal(detectEpisode(name), null, name);
  });
  it('sorts seasons and episodes naturally and limits Next to the current series/folder/drive', () => {
    const current = video('Show.S01E02.MKV');
    const entries = [video('Show.S02E01.mp4'), video('Show.S01E10.mkv'), current, video('Show.S01E01.mp4'), video('Other.S01E03.mp4'), video('Show.S01E03.mp4', 'usb-b/Series'), { ...video('folder'), isDirectory: true, type: 'folder' as const }, { ...video('notes.txt'), type: 'other' as const }];
    assert.deepEqual(playbackQueue(entries, current).map(entry => entry.name), ['Show.S01E01.mp4', 'Show.S01E02.MKV', 'Show.S01E10.mkv', 'Show.S02E01.mp4']);
    assert.deepEqual([video('Episode 10.mp4'), video('Episode 2.mp4'), video('Episode 1.mp4')].sort(compareMediaNames).map(entry => detectEpisode(entry.name)!.episode), [1, 2, 10]);
    assert.deepEqual(playbackQueue([video('Movie 10.mp4'), video('Movie 2.MKV')], video('Movie 2.MKV')).map(entry => entry.name), ['Movie 2.MKV', 'Movie 10.mp4']);
  });
});
describe('application-only hidden items', () => {
  it('persists storage/relative-path identities, separates identical filenames and survives reinsertion', () => {
    const entry = video(); const otherFolder = video(entry.name, 'usb-a/Other'); const otherDrive = video(entry.name, 'usb-b/Series');
    const preferences = toggleMediaHidden(defaultMediaPreferences(), entry);
    assert.equal(isMediaHidden(entry, new Set(preferences.hidden)), true);
    assert.equal(isMediaHidden(otherFolder, new Set(preferences.hidden)), false); assert.equal(isMediaHidden(otherDrive, new Set(preferences.hidden)), false);
    let stored = ''; const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    assert.equal(saveMediaPreferences(storage, { ...preferences, showHidden: true }), true);
    const restored = loadMediaPreferences(storage); assert.equal(restored.showHidden, true);
    assert.equal(isMediaHidden({ ...entry }, new Set(restored.hidden)), true);
    assert.deepEqual(toggleMediaHidden(restored, entry).hidden, []); assert.equal(entry.name, 'Episode 1.MKV');
    assert.equal(preferences.hidden[0], hiddenIdentity('usb-a', 'usb-a/Series/Episode 1.MKV'));
  });
  it('inherits folder visibility, unhide restores ancestors and corrupt preferences fail safely', () => {
    const folder = { ...video('Series', 'usb-a'), isDirectory: true, type: 'folder' as const };
    const hidden = toggleMediaHidden(defaultMediaPreferences(), folder);
    assert.equal(isMediaHidden(video(), new Set(hidden.hidden)), true);
    assert.deepEqual(toggleMediaHidden(hidden, video()).hidden, []);
    assert.deepEqual(loadMediaPreferences({ getItem: () => '{broken', setItem() {} }), defaultMediaPreferences());
    assert.equal(saveMediaPreferences({ getItem: () => null, setItem() { throw Error('quota'); } }, hidden), false);
  });
});
describe('validated native playback paths', () => {
  it('decodes an actual local URI once and preserves spaces, unicode, percent and hash filenames', () => {
    assert.equal(localFilePath('file:///media/USB%20A/Caf%C3%A9%20%2520%23.MKV'), '/media/USB A/Café %20#.MKV');
    const entry = video('Café #1.MKV'); assert.equal(playbackPath(entry), '/media/usb-a/Series/Café #1.MKV');
  });
  it('rejects URLs, blobs, relative paths, traversal, controls, mismatched file and folder entries', () => {
    for (const path of ['blob:x', 'http://localhost/movie.mp4', 'file://host/movie.mp4', '/media/movie.mp4', 'file:///a/%2e%2e/movie.mp4', 'file:///a/%00.mp4', 'file:///a/movie.mp4?x=1', 'file:///a\\movie.mp4']) assert.throws(() => localFilePath(path), path);
    for (const entry of [{ ...video(), uri: undefined }, { ...video(), uri: 'file:///media/other.mkv' }, { ...video(), path: 'usb-a/elsewhere.mkv' }, { ...video(), isDirectory: true }]) assert.throws(() => playbackPath(entry));
  });
});
