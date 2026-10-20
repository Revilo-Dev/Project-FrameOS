import type { MediaEntry } from '../types/media';

/** AVPlay accepts an absolute POSIX path; a virtual root/Blob/HTTP URL is not it. */
export function localFilePath(uri: string): string {
  if (!uri.startsWith('file:///') || /[?#\x00-\x1f\\]/.test(uri)) throw new Error('A local file URI from the Tizen filesystem is required.');
  let path: string;
  try { path = decodeURIComponent(uri.slice('file://'.length)); } catch { throw new Error('Invalid file URI encoding.'); }
  if (!path.startsWith('/') || /[\x00-\x1f\\]/.test(path) || path.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid local media path.');
  return path;
}
export function playbackPath(entry: MediaEntry): string {
  if (entry.isDirectory || entry.type !== 'video' || !entry.uri || entry.path !== `${entry.parentPath}/${entry.name}` || /[\/\x00-\x1f]/.test(entry.name)) throw new Error('This item is not a resolved USB video file.');
  const path = localFilePath(entry.uri);
  if (path.slice(path.lastIndexOf('/') + 1) !== entry.name) throw new Error('The resolved video path does not match the selected file.');
  return path;
}
