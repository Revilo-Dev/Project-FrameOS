import type { MediaEntry } from '../types/media';
import { ThumbnailDiagnostics, thumbnailWriteDeclared } from './ThumbnailDiagnostics';
import { loadableThumbnail } from './thumbnailImage';
export { loadableThumbnail } from './thumbnailImage';
import type { ThumbnailProvider } from '../services/thumbnails';
import { safeThumbnail } from '../services/thumbnails';
import { htmlVideoSnapshot } from './videoSnapshot';
import { tizenThumbnailProvider } from './TizenThumbnails';

interface ReadFile { isDirectory: boolean; fileSize?: number; toURI?(): string; readAsText?(success: (text: string) => void, failure: () => void, encoding: string): void }
interface Filesystem { resolve(path: string, success: (file: ReadFile) => void, failure: () => void, mode: 'r'): void }
export function validManifestImage(value: unknown): value is string {
  return typeof value === 'string' && /^\.frameos-thumbnails\/[a-f0-9]{24}\.jpg$/.test(value);
}
export function fallbackThumbnailProvider(runtime: unknown, options: { diagnostics?: ThumbnailDiagnostics; resolveFile?(entry: MediaEntry): Promise<MediaEntry> } = {}): ThumbnailProvider {
  const diagnostics = options.diagnostics;
  let permission: Promise<boolean> | undefined;
  const indexed = tizenThumbnailProvider(runtime, () => permission ||= thumbnailWriteDeclared(), { diagnostics, validate: (uri, signal) => loadableThumbnail(uri, signal, true) });
  const fs = (runtime as { tizen?: { filesystem?: Filesystem } })?.tizen?.filesystem;
  const manifests = new Map<string, { until: number; files: Promise<Record<string, { image: string; size: number; modified?: number }>> }>();
  const resolveFile = (path: string, signal?: AbortSignal) => new Promise<ReadFile | null>(resolve => {
    let done = false;
    const finish = (file: ReadFile | null) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(file); };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 2000); signal?.addEventListener('abort', abort, { once: true });
    try { if (!fs || signal?.aborted) finish(null); else fs.resolve(path, file => finish(file), abort, 'r'); } catch { finish(null); }
  });
  const provider: ThumbnailProvider = async (original, signal) => {
    let entry = original;
    if (signal?.aborted) return null;
    diagnostics?.attempt(entry, 'file-resolve');
    try {
      entry = options.resolveFile ? await options.resolveFile(entry) : entry;
      diagnostics?.update(entry, { path: entry.nativePath || entry.path, accessibility: options.resolveFile ? 'Readable (native resolve succeeded)' : 'Not verified by filesystem', sourceUri: entry.uri || '' });
    } catch (error) { diagnostics?.update(entry, { accessibility: 'Unavailable' }); diagnostics?.attempt(entry, 'file-resolve', error); return null; }
    if (signal?.aborted) return null;
    if (!indexed) { diagnostics?.update(entry, { nativeFind: false }); diagnostics?.attempt(entry, 'native-find', 'NotSupported: Content API or AttributeFilter is unavailable'); }
    const native = await indexed?.(entry, signal);
    if (signal?.aborted) return null;
    if (safeThumbnail(native)) return native!;
    const capture = async () => {
      diagnostics?.attempt(entry, 'html-video');
      return htmlVideoSnapshot(entry, signal, error => diagnostics?.attempt(entry, 'html-video', error));
    };
    if (!fs) return capture();
    // Conventional same-basename sidecar artwork, read-only resolution.
    diagnostics?.attempt(entry, 'sidecar');
    const sidecar = await resolveFile(`${entry.parentPath}/${entry.name.replace(/\.[^.]+$/, '')}.jpg`, signal);
    if (signal?.aborted) return null;
    if (sidecar && !sidecar.isDirectory) { try { const uri = await loadableThumbnail(safeThumbnail(sidecar.toURI?.()), signal, true); if (uri) return uri; } catch { /* Try the manifest. */ } }
    diagnostics?.attempt(entry, 'offline-manifest');
    const key = `${entry.storageId}:${entry.parentPath}`;
    if (!manifests.has(key) || manifests.get(key)!.until < Date.now()) {
      if (manifests.size >= 32) manifests.delete(manifests.keys().next().value!);
      manifests.set(key, { until: Date.now() + 300000, files: (async () => {
        const file = await resolveFile(`${entry.parentPath}/.frameos-thumbnails.json`, signal);
        // Never read an unbounded or misidentified video file into memory.
        if (!file?.readAsText || file.isDirectory || file.fileSize === undefined || file.fileSize > 256 * 1024) { diagnostics?.attempt(entry, 'offline-manifest', 'ManifestUnavailable: absent, unreadable or larger than 256 KiB'); return {}; }
        return new Promise<Record<string, { image: string; size: number; modified?: number }>>(resolve => {
          const timer = setTimeout(() => { diagnostics?.attempt(entry, 'offline-manifest', 'TimeoutError: manifest text read stalled'); resolve({}); }, 2000);
          try { file.readAsText!(text => { clearTimeout(timer); try { const value = JSON.parse(text); const valid = text.length <= 256 * 1024 && value.version === 1 && value.files && typeof value.files === 'object'; if (!valid) diagnostics?.attempt(entry, 'offline-manifest', 'InvalidManifest: schema or size check failed'); resolve(valid ? value.files : {}); } catch (error) { diagnostics?.attempt(entry, 'offline-manifest', error); resolve({}); } }, () => { clearTimeout(timer); diagnostics?.attempt(entry, 'offline-manifest', 'ReadError: manifest could not be read'); resolve({}); }, 'UTF-8'); } catch (error) { clearTimeout(timer); diagnostics?.attempt(entry, 'offline-manifest', error); resolve({}); }
        });
      })() });
    }
    const item = (await manifests.get(key)!.files)?.[entry.name];
    if (signal?.aborted) return null;
    if (!item || !validManifestImage(item.image) || item.size !== entry.size || (entry.modified !== undefined && item.modified !== undefined && Math.abs(entry.modified - item.modified) > 2000)) { diagnostics?.attempt(entry, 'offline-manifest', item ? 'ManifestMismatch: path, size or modification time does not match' : 'NotFound: no matching imported snapshot'); return capture(); }
    const image = await resolveFile(`${entry.parentPath}/${item.image}`, signal);
    try {
      const uri = !signal?.aborted && image && !image.isDirectory ? await loadableThumbnail(safeThumbnail(image.toURI?.()), signal, true) : null;
      if (uri) return uri;
    } catch (error) { diagnostics?.attempt(entry, 'offline-manifest', error); }
    diagnostics?.attempt(entry, 'offline-manifest', 'ImageLoadError: imported snapshot is not readable/renderable');
    return capture();
  };
  provider.invalidate = () => { manifests.clear(); indexed?.invalidate?.(); permission = undefined; };
  return provider;
}
