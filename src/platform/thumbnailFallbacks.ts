import type { ThumbnailProvider } from '../services/thumbnails';
import { safeThumbnail } from '../services/thumbnails';
import { htmlVideoSnapshot } from './videoSnapshot';
import { tizenThumbnailProvider } from './TizenThumbnails';

interface ReadFile { isDirectory: boolean; fileSize?: number; toURI?(): string; readAsText?(success: (text: string) => void, failure: () => void, encoding: string): void }
interface Filesystem { resolve(path: string, success: (file: ReadFile) => void, failure: () => void, mode: 'r'): void }
export function validManifestImage(value: unknown): value is string {
  return typeof value === 'string' && /^\.frameos-thumbnails\/[a-f0-9]{24}\.jpg$/.test(value);
}
export function loadableThumbnail(uri: string | null, signal?: AbortSignal): Promise<string | null> {
  if (!uri || signal?.aborted || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image(); let done = false;
    const finish = (value: string | null) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); image.onload = image.onerror = null; image.removeAttribute('src'); resolve(value); };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 2000); signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? uri : null); image.onerror = abort; image.src = uri;
  });
}
export function fallbackThumbnailProvider(runtime: unknown): ThumbnailProvider {
  const indexed = tizenThumbnailProvider(runtime, true);
  const fs = (runtime as { tizen?: { filesystem?: Filesystem } })?.tizen?.filesystem;
  const manifests = new Map<string, { until: number; files: Promise<Record<string, { image: string; size: number; modified?: number }>> }>();
  const resolveFile = (path: string, signal?: AbortSignal) => new Promise<ReadFile | null>(resolve => {
    let done = false;
    const finish = (file: ReadFile | null) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(file); };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 2000); signal?.addEventListener('abort', abort, { once: true });
    try { if (!fs || signal?.aborted) finish(null); else fs.resolve(path, file => finish(file), abort, 'r'); } catch { finish(null); }
  });
  const provider: ThumbnailProvider = async (entry, signal) => {
    if (signal?.aborted) return null;
    const native = await indexed?.(entry, signal);
    if (signal?.aborted) return null;
    const indexedImage = await loadableThumbnail(safeThumbnail(native), signal);
    if (indexedImage) return indexedImage;
    const snapshot = await htmlVideoSnapshot(entry, signal);
    if (signal?.aborted) return null;
    if (snapshot) return snapshot;
    if (!fs) return null;
    // Conventional same-basename sidecar artwork, read-only resolution.
    const sidecar = await resolveFile(`${entry.parentPath}/${entry.name.replace(/\.[^.]+$/, '')}.jpg`, signal);
    if (signal?.aborted) return null;
    if (sidecar && !sidecar.isDirectory) { try { const uri = await loadableThumbnail(safeThumbnail(sidecar.toURI?.()), signal); if (uri) return uri; } catch { /* Try the manifest. */ } }
    const key = `${entry.storageId}:${entry.parentPath}`;
    if (!manifests.has(key) || manifests.get(key)!.until < Date.now()) {
      if (manifests.size >= 32) manifests.delete(manifests.keys().next().value!);
      manifests.set(key, { until: Date.now() + 300000, files: (async () => {
        const file = await resolveFile(`${entry.parentPath}/.frameos-thumbnails.json`, signal);
        // Never read an unbounded or misidentified video file into memory.
        if (!file?.readAsText || file.isDirectory || file.fileSize === undefined || file.fileSize > 256 * 1024) return {};
        return new Promise<Record<string, { image: string; size: number; modified?: number }>>(resolve => {
          const timer = setTimeout(() => resolve({}), 2000);
          try { file.readAsText!(text => { clearTimeout(timer); try { const value = JSON.parse(text); resolve(text.length <= 256 * 1024 && value.version === 1 && value.files && typeof value.files === 'object' ? value.files : {}); } catch { resolve({}); } }, () => { clearTimeout(timer); resolve({}); }, 'UTF-8'); } catch { clearTimeout(timer); resolve({}); }
        });
      })() });
    }
    const item = (await manifests.get(key)!.files)?.[entry.name];
    if (signal?.aborted || !item || !validManifestImage(item.image) || item.size !== entry.size || (entry.modified !== undefined && item.modified !== undefined && Math.abs(entry.modified - item.modified) > 2000)) return null;
    const image = await resolveFile(`${entry.parentPath}/${item.image}`, signal);
    try { return !signal?.aborted && image && !image.isDirectory ? loadableThumbnail(safeThumbnail(image.toURI?.()), signal) : null; } catch { return null; }
  };
  provider.invalidate = () => manifests.clear();
  return provider;
}
