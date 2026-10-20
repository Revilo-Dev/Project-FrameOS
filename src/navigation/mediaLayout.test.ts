import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseEntries, entryRows, mediaWindow } from './mediaLayout';
import { nextFocus } from './remote';
import type { MediaEntry } from '../types/media';

test('large folders retain every navigable entry while only one bounded page is rendered', () => {
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
});
