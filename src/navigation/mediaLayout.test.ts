import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseEntries, entryRows, mediaWindow, mediaHeaderRows, mediaOptionsRows, mediaUpReturnsHome } from './mediaLayout';
import { nextFocus } from './remote';
import type { MediaEntry } from '../types/media';

test('large folders retain every navigable entry while only a bounded scrolling window is rendered', () => {
  const rows = entryRows(10001, 6);
  assert.equal(nextFocus(rows, 'media-entry-17', 'down'), 'media-entry-23');
  const window = mediaWindow(10001, 'media-entry-9999', 6);
  assert(window.end - window.start <= 18);
  assert(window.start <= 9999 && window.end > 9999);
});
test('video/photo filters preserve navigable folders and numeric folder-first sorting', () => {
  const entry = (name: string, type: MediaEntry['type']): MediaEntry => ({ id: name, name, type, extension: '', path: `usb/${name}`, parentPath: 'usb', storageId: 'usb', isDirectory: type === 'folder' });
  const entries = [entry('10.mkv', 'video'), entry('Photos', 'folder'), entry('2.mp4', 'video'), entry('image.jpg', 'image')];
  assert.deepEqual(browseEntries(entries, 'video').map((item) => item.name), ['Photos', '2.mp4', '10.mkv']);
  assert.deepEqual(browseEntries(entries, 'folder').map((item) => item.name), ['Photos']);
  assert.deepEqual(browseEntries(entries, 'video', 'name-desc').map(item => item.name), ['Photos', '10.mkv', '2.mp4']);
  assert.deepEqual(entries.map(item => item.name), ['10.mkv', 'Photos', '2.mp4', 'image.jpg']);
});

test('Home exit is gated by header focus and Options contains all library controls', () => {
  assert.equal(mediaUpReturnsHome('media-entry-0'), false);
  assert.equal(mediaUpReturnsHome('crumb-0'), false);
  assert.equal(mediaUpReturnsHome('media-options'), true);
  assert.equal(mediaUpReturnsHome('media-home'), false);
  assert.equal(nextFocus([...mediaHeaderRows(), ...entryRows(12, 6)], 'media-entry-0', 'up'), 'media-options');
  const ids = mediaOptionsRows(true).flat().map(item => item.id);
  for (const id of ['filter-all', 'filter-video', 'filter-image', 'filter-folder', 'sort-natural', 'sort-name', 'sort-name-desc', 'media-hidden', 'media-refresh', 'media-item-options']) assert(ids.includes(id));
});
