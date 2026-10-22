import type { MediaEntry } from '../types/media';
import { ThumbnailDiagnostics, thumbnailWriteDeclared, thumbnailError } from './ThumbnailDiagnostics';
import { loadableThumbnail } from './thumbnailImage';
export { loadableThumbnail } from './thumbnailImage';
import type { ThumbnailProvider } from '../services/thumbnails';
import { safeThumbnail } from '../services/thumbnails';
import { htmlVideoSnapshot } from './videoSnapshot';
import { tizenThumbnailProvider } from './TizenThumbnails';
import { manifestBucket } from '../services/thumbnailManifest.mjs';

interface ReadFile { isDirectory: boolean; fileSize?: number; toURI?(): string; readAsText?(success: (text: string) => void, failure: (error: unknown) => void, encoding: string): void }
interface Filesystem { resolve(path: string, success: (file: ReadFile) => void, failure: (error: unknown) => void, mode: 'r'): void }
interface ImportedImage { image: string; relativePath?: string; size: number; modified?: number }
interface Manifest { version: number; files?: Record<string, unknown>; buckets?: number; algorithm?: string }
export function validManifestImage(value: unknown): value is string {
  return typeof value === 'string' && /^\.frameos-thumbnails\/[a-f0-9]{24}\.jpg$/.test(value);
}
/** Per-directory relative identity, independent of Windows/Tizen mount names. */
export function matchingImportedImage(value: unknown, entry: MediaEntry): value is ImportedImage {
  const item = value as ImportedImage | null;
  return !!item && validManifestImage(item.image) && Number.isFinite(item.size) && item.size === entry.size
    && (item.relativePath === undefined || item.relativePath === entry.name)
    && (item.modified === undefined || Number.isFinite(item.modified))
    && (entry.modified === undefined || item.modified === undefined || Math.abs(entry.modified - item.modified) <= 2000);
}
export function fallbackThumbnailProvider(runtime: unknown, options: {
  diagnostics?: ThumbnailDiagnostics; resolveFile?(entry: MediaEntry): Promise<MediaEntry>;
  validate?(uri: string | null, signal?: AbortSignal): Promise<string | null>;
  capture?(entry: MediaEntry, signal?: AbortSignal, report?: (error: unknown) => void): Promise<string | null>;
} = {}): ThumbnailProvider {
  const diagnostics = options.diagnostics;
  const validate = options.validate || ((uri, signal) => loadableThumbnail(uri, signal));
  let permission: Promise<boolean> | undefined;
  const indexed = tizenThumbnailProvider(runtime, () => permission ||= thumbnailWriteDeclared(), { diagnostics, validate: (uri, signal) => validate(uri, signal) });
  const fs = (runtime as { tizen?: { filesystem?: Filesystem } })?.tizen?.filesystem;
  const manifests = new Map<string, { until: number; files: Promise<Manifest> }>();
  const resolveFile = (entry: MediaEntry, path: string, signal?: AbortSignal) => new Promise<ReadFile | null>(resolve => {
    let done = false;
    const finish = (file: ReadFile | null) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(file); };
    const abort = () => finish(null);
    const timer = setTimeout(() => { diagnostics?.attempt(entry, 'usb-image-resolve', 'TimeoutError: ' + path); finish(null); }, 2000);
    signal?.addEventListener('abort', abort, { once: true });
    try { if (!fs || signal?.aborted) finish(null); else fs.resolve(path, file => finish(file), error => { diagnostics?.attempt(entry, 'usb-image-resolve', thumbnailError(error) + ': ' + path); finish(null); }, 'r'); } catch (error) { diagnostics?.attempt(entry, 'usb-image-resolve', error); finish(null); }
  });
  const readManifest = async (entry: MediaEntry, relative: string, signal?: AbortSignal) => {
    const key = `${entry.storageId}:${entry.parentPath}/${relative}`;
    if (!manifests.has(key) || manifests.get(key)!.until < Date.now()) {
      if (manifests.size >= 32) manifests.delete(manifests.keys().next().value!);
      const record = { until: Date.now() + 300000, files: (async (): Promise<Manifest> => {
        const file = await resolveFile(entry, `${entry.parentPath}/${relative}`, signal);
        if (!file?.readAsText || file.isDirectory || file.fileSize === undefined || file.fileSize > 256 * 1024) return { version: 1, files: {} };
        return new Promise<Manifest>(resolve => {
          let done = false;
          const finish = (manifest: Manifest = { version: 1, files: {} }) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(manifest); };
          const abort = () => finish();
          const timer = setTimeout(() => { diagnostics?.attempt(entry, 'offline-manifest', 'TimeoutError: manifest text read stalled'); finish(); }, 2000);
          signal?.addEventListener('abort', abort, { once: true });
          try { file.readAsText!(text => {
            if (done) return;
            try {
              const value = JSON.parse(text);
              const valid = value.version === 1 && value.files && !Array.isArray(value.files) && typeof value.files === 'object'
                || value.version === 2 && value.buckets === 256 && value.algorithm === 'name31-utf16-v1';
              if (text.length > 256 * 1024 || !valid) throw Error('Invalid manifest schema/size');
              finish(value);
            } catch (error) { diagnostics?.attempt(entry, 'offline-manifest', error); finish(); }
          }, error => { diagnostics?.attempt(entry, 'offline-manifest', error); finish(); }, 'UTF-8'); } catch (error) { diagnostics?.attempt(entry, 'offline-manifest', error); finish(); }
        });
      })() };
      manifests.set(key, record);
      // A cancelled view must not cache an empty manifest for five minutes.
      void record.files.then(() => { if (signal?.aborted && manifests.get(key) === record) manifests.delete(key); });
    }
    return manifests.get(key)!.files;
  };
  const provider: ThumbnailProvider = async (original, signal) => {
    let entry = original;
    if (signal?.aborted) return null;
    diagnostics?.attempt(entry, 'file-resolve');
    diagnostics?.update(entry, { source: 'None', imageUri: '', imageAccess: 'Not checked', frame: 'Not produced' });
    try {
      entry = options.resolveFile ? await options.resolveFile(entry) : entry;
      diagnostics?.update(entry, { path: original.path, accessibility: options.resolveFile ? 'Readable (native resolve succeeded)' : 'Not verified by filesystem', sourceUri: entry.uri || '' });
    } catch (error) { diagnostics?.update(entry, { accessibility: 'Unavailable' }); diagnostics?.attempt(entry, 'file-resolve', error); return null; }
    const usbImage = async (path: string, method: string) => {
      const file = await resolveFile(entry, path, signal);
      if (!file || file.isDirectory || signal?.aborted) return null;
      try {
        const uri = safeThumbnail(file.toURI?.());
        diagnostics?.attempt(entry, method);
        diagnostics?.update(entry, { imageUri: uri || '', imageAccess: 'Filesystem resolved; checking image decode' });
        const accepted = await validate(uri, signal);
        if (accepted) diagnostics?.update(entry, { source: 'Pre-generated USB image', imageAccess: 'Image decoded successfully', frame: 'Pre-generated image available', lastError: '' });
        else diagnostics?.attempt(entry, method, 'ImageLoadError: USB image did not decode');
        return accepted;
      } catch (error) { diagnostics?.attempt(entry, method, error); return null; }
    };
    // Offline screenshots precede both indexed thumbnails and device decoders.
    if (fs && !signal?.aborted) {
      diagnostics?.attempt(entry, 'offline-manifest');
      const index = await readManifest(entry, '.frameos-thumbnails.json', signal);
      const selected = index.version === 2 && !signal?.aborted ? await readManifest(entry, `.frameos-thumbnails/manifest-${manifestBucket(entry.name)}.json`, signal) : index;
      const files = selected.files || {};
      const item = Object.prototype.hasOwnProperty.call(files, entry.name) ? files[entry.name] : undefined;
      if (matchingImportedImage(item, entry)) {
        const uri = await usbImage(`${entry.parentPath}/${item.image}`, 'offline-manifest');
        if (uri) return uri;
      } else diagnostics?.attempt(entry, 'offline-manifest', item ? 'ManifestMismatch: relative path, size or modification time differs' : 'NotFound: no matching imported snapshot');
      if (signal?.aborted) return null;
      const sidecar = await usbImage(`${entry.parentPath}/${entry.name.replace(/\.[^.]+$/, '')}.jpg`, 'sidecar');
      if (sidecar) return sidecar;
    }
    if (signal?.aborted) return null;
    if (!indexed) { diagnostics?.update(entry, { nativeFind: false }); diagnostics?.attempt(entry, 'native-find', 'NotSupported: Content API or AttributeFilter is unavailable'); }
    const native = await indexed?.(entry, signal);
    if (signal?.aborted) return null;
    if (safeThumbnail(native)) {
      diagnostics?.update(entry, { source: 'Native Tizen thumbnail', imageAccess: 'Image decoded successfully', frame: 'Native image available', lastError: '' });
      return native!;
    }
    diagnostics?.attempt(entry, 'html-video');
    const captured = await (options.capture || htmlVideoSnapshot)(entry, signal, error => diagnostics?.attempt(entry, 'html-video', error));
    if (captured && !signal?.aborted) diagnostics?.update(entry, { source: 'HTML video frame', imageAccess: 'Canvas readback succeeded', frame: 'Decoded nonblank frame captured', lastError: '' });
    return signal?.aborted ? null : captured;
  };
  provider.invalidate = () => { manifests.clear(); indexed?.invalidate?.(); permission = undefined; };
  return provider;
}
