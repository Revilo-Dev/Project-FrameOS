export type MediaType = 'folder' | 'video' | 'image' | 'audio' | 'other';

export interface MediaStorage {
  readonly id: string;
  readonly label: string;
  /** Tizen virtual root returned by listStorages; never an assumed mount path. */
  readonly rootPath: string;
}

/** Retained intact when opening details; a future player needs no second scan. */
export interface MediaEntry {
  readonly id: string;
  readonly name: string;
  readonly extension: string;
  readonly size?: number;
  readonly path: string;
  readonly uri?: string;
  readonly storageId: string;
  readonly parentPath: string;
  readonly isDirectory: boolean;
  readonly type: MediaType;
}

export interface MediaStorageChange {
  readonly storage: MediaStorage;
  readonly state: 'mounted' | 'removed' | 'unmountable';
}

export type MediaErrorCode = 'unsupported' | 'permission-denied' | 'inaccessible' | 'removed' | 'timeout' | 'invalid-path' | 'unmountable';

export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode, message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

export interface MediaAdapter {
  readonly kind: 'tizen' | 'unavailable' | 'mock';
  readonly available: boolean;
  readonly diagnostics?: import('../platform/UsbDiagnostics').UsbDiagnostics;
  listStorages(): Promise<MediaStorage[]>;
  listDirectory(storage: MediaStorage, path: string): Promise<MediaEntry[]>;
  resolveFile?(entry: MediaEntry): Promise<MediaEntry>;
  subscribeStorageChanges(listener: (change: MediaStorageChange) => void, onError?: (error: MediaError) => void): () => void;
}
