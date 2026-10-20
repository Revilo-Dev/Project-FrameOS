import { MediaError, type MediaAdapter, type MediaEntry, type MediaStorage } from '../types/media';
import { classifyMedia, mediaExtension, validMediaPath } from '../services/media';

/** Explicit development preview only; createPlatform gates this behind Vite DEV. */
export class MockMediaAdapter implements MediaAdapter {
  readonly kind = 'mock' as const;
  readonly available = true;
  private readonly storages: MediaStorage[] = [
    { id: 'dev-usb', label: 'Development USB', rootPath: 'dev-usb' },
    { id: 'dev-photos', label: 'Development Photos', rootPath: 'dev-photos' },
  ];

  async listStorages() { return this.storages; }
  async listDirectory(storage: MediaStorage, requestedPath: string): Promise<MediaEntry[]> {
    const path = validMediaPath(storage, requestedPath);
    if (!this.storages.some(item => item.id === storage.id)) throw new MediaError('removed', 'This development drive is disconnected.');
    const directories: Record<string, [string, boolean, number?][]> = {
      'dev-usb': [['Movies', true], ['Music', true], ['A very long video filename for checking television viewing distance and truncation.mp4', false, 1_572_864_000], ['Sample.mkv', false, 734_003_200], ['Read me.txt', false, 240]],
      'dev-usb/Movies': [['Weekend.mp4', false, 524_288_000], ['Archive', true]],
      'dev-usb/Movies/Archive': [['Holiday.mkv', false, 268_435_456]],
      'dev-usb/Music': [['Morning.flac', false, 20_971_520]],
      'dev-photos': [['Coast.jpg', false, 3_145_728], ['Empty folder', true]],
      'dev-photos/Empty folder': [],
    };
    if (!(path in directories)) throw new MediaError('inaccessible', 'This development folder is unavailable.');
    return directories[path].map(([name, isDirectory, size]) => ({ id: JSON.stringify([storage.id, `${path}/${name}`]), name, isDirectory, extension: isDirectory ? '' : mediaExtension(name), type: classifyMedia(name, isDirectory), path: `${path}/${name}`, storageId: storage.id, parentPath: path, size }));
  }
  subscribeStorageChanges() { return () => {}; }
}
