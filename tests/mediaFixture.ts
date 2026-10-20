import type { MediaEntry } from '../src/types/media';
export function video(name = 'Episode 1.MKV', parentPath = 'usb-a/Series'): MediaEntry {
  const path = `${parentPath}/${name}`;
  return { id: path, name, path, parentPath, storageId: parentPath.split('/')[0], uri: `file:///media/${path.split('/').map(encodeURIComponent).join('/')}`, isDirectory: false, type: 'video', extension: name.split('.').pop()!.toLowerCase(), size: 100 };
}
