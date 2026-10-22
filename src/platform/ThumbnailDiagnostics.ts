import type { MediaEntry } from '../types/media';

export interface ThumbnailDiagnostic {
  path: string; storage: string; extension: string; sourceUri: string;
  accessibility: string; nativeFind: boolean | null; nativeCreate: boolean | null; nativeScan: boolean | null;
  privilege: 'unknown' | 'declared' | 'not declared'; indexed: string;
  method: string; lastError: string; uri: string; cache: string; rendering: string;
  source?: string; imageUri?: string; imageAccess?: string; frame?: string;
  attempts: { method: string; error: string; at: number }[];
}
export function thumbnailError(error: unknown) {
  const value = error as { name?: string; message?: string } | null;
  return (typeof error === 'string' ? error : `${value?.name || 'Error'}: ${value?.message || 'No native detail'}`).replace(/[\x00-\x1f]/g, ' ').slice(0, 400);
}
/** Temporary, bounded, memory-only evidence. No video bytes or personal URLs persisted. */
export class ThumbnailDiagnostics {
  private records = new Map<string, ThumbnailDiagnostic>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get(entry: MediaEntry): ThumbnailDiagnostic {
    return this.records.get(entry.id) || { path: entry.path, storage: entry.storageId, extension: entry.extension, sourceUri: entry.uri || '', accessibility: 'Not checked', nativeFind: null, nativeCreate: null, nativeScan: null, privilege: 'unknown', indexed: 'Not checked', method: 'Not attempted', lastError: '', uri: '', cache: 'Not checked', rendering: 'Not checked', attempts: [] };
  }
  update(entry: MediaEntry, patch: Partial<ThumbnailDiagnostic>) {
    const value = { ...this.get(entry), ...patch };
    this.records.delete(entry.id); this.records.set(entry.id, value);
    while (this.records.size > 64) this.records.delete(this.records.keys().next().value!);
    for (const listener of this.listeners) listener();
  }
  attempt(entry: MediaEntry, method: string, error?: unknown) {
    const message = error === undefined ? '' : thumbnailError(error);
    this.update(entry, { method, ...(message ? { lastError: message } : {}), attempts: [...this.get(entry).attempts, { method, error: message, at: Date.now() }].slice(-16) });
    if (message) console.info(`[FrameOS thumbnail] ${method}: ${message}`);
  }
}

/** Inspect the installed app's declaration, never request or add a privilege. */
export async function thumbnailWriteDeclared(): Promise<boolean> {
  if (typeof XMLHttpRequest === 'undefined' || typeof window === 'undefined') return false;
  return new Promise(resolve => {
    const request = new XMLHttpRequest(); let done = false;
    const finish = (value: boolean) => { if (!done) { done = true; resolve(value); } };
    try {
      request.open('GET', new URL('config.xml', window.location.href).href); request.timeout = 2000;
      request.onerror = request.ontimeout = () => finish(false);
      request.onload = () => {
        try {
          const xml = new DOMParser().parseFromString(request.responseText, 'application/xml');
          finish(!xml.getElementsByTagName('parsererror').length && Array.from(xml.getElementsByTagNameNS('http://tizen.org/ns/widgets', 'privilege')).some(node => node.getAttribute('name') === 'http://tizen.org/privilege/content.write'));
        } catch { finish(false); }
      };
      request.send();
    } catch { finish(false); }
  });
}
