import { MediaError, type MediaAdapter, type MediaEntry } from '../types/media';

export class UnavailableMediaAdapter implements MediaAdapter {
  readonly kind = 'unavailable' as const;
  readonly available = false;
  async listStorages() { return []; }
  async listDirectory(): Promise<MediaEntry[]> {
    throw new MediaError('unsupported', 'USB browsing is available on a supported Samsung TV.');
  }
  subscribeStorageChanges() { return () => {}; }
}
