import type { MediaEntry } from '../types/media';
import type { ThumbnailProvider } from '../services/thumbnails';
import { localFilePath } from '../services/playbackPath';
import type { ThumbnailDiagnostics } from './ThumbnailDiagnostics';

interface ContentItem { contentURI: string; thumbnailURIs?: string[] | null }
interface ContentApi {
  find(success: (items: ContentItem[]) => void, failure: (error: unknown) => void, directory: null, filter: unknown, sort: null, count: number, offset: number): void;
  createThumbnail?(content: ContentItem, success: (path: string) => void, failure: (error: unknown) => void): void;
  scanDirectory?: unknown;
}
export function nativeThumbnailUri(path: string): string | null {
  try {
    const uri = path.startsWith('/') && !path.startsWith('//') ? 'file://' + path.split('/').map(encodeURIComponent).join('/') : path;
    localFilePath(uri); return uri.length <= 4096 ? uri : null;
  } catch { return null; }
}
export interface NativeThumbnailOptions {
  diagnostics?: ThumbnailDiagnostics;
  validate?(uri: string, signal?: AbortSignal): Promise<string | null>;
}
/** Read-only lookup first. Creation uses only a matched native Content object,
 * after the installed manifest's existing declaration has been checked. Never scans USB. */
export function tizenThumbnailProvider(runtime: unknown, create: boolean | (() => Promise<boolean>) = false, options: NativeThumbnailOptions = {}): ThumbnailProvider | undefined {
  try {
    const tizen = (runtime as { tizen?: { content?: ContentApi; AttributeFilter?: new (field: string, match: string, value: string) => unknown } })?.tizen;
    if (!tizen?.content?.find || !tizen.AttributeFilter) return undefined;
    const api = tizen.content;
    let blocked = '', creationBlocked = '';
    const note = (entry: MediaEntry, stage: string, error?: unknown) => options.diagnostics?.attempt(entry, stage, error);
    const provider: ThumbnailProvider = async (entry, signal) => {
      options.diagnostics?.update(entry, { nativeFind: true, nativeCreate: typeof api.createThumbnail === 'function', nativeScan: typeof api.scanDirectory === 'function' });
      if (signal?.aborted || !entry.uri) return null;
      if (blocked) { note(entry, 'native-find', blocked); return null; }
      let path: string;
      try { path = localFilePath(entry.uri); } catch (error) { note(entry, 'native-uri', error); return null; }
      const find = (field: string, value: string) => new Promise<ContentItem[]>(resolve => {
        let done = false;
        const finish = (items: ContentItem[]) => { if (done) return; done = true; clearTimeout(timer); resolve(items); };
        const fail = (error: unknown) => { const name = (error as { name?: string })?.name; if (name === 'SecurityError' || name === 'NotSupportedError' || name === 'TimeoutError') blocked = name; note(entry, 'native-find', error); finish([]); };
        const timer = setTimeout(() => fail({ name: 'TimeoutError', message: 'Content lookup did not respond within 3 seconds' }), 3000);
        try { api.find(finish, fail, null, new tizen.AttributeFilter!(field, 'EXACTLY', value), null, field === 'name' ? 16 : 1, 0); } catch (error) { fail(error); }
      });
      const nativeUri = entry.nativePath && nativeThumbnailUri(entry.nativePath);
      const nativePath = nativeUri ? localFilePath(nativeUri) : '';
      const queries = [['contentURI', entry.uri], ...(nativePath && nativePath !== path ? [['contentURI', nativePath]] : []), ['contentURI', path], ['name', entry.name]];
      let item: ContentItem | undefined;
      for (const [field, value] of queries) {
        if (signal?.aborted || blocked) break;
        note(entry, 'native-find');
        const items = await find(field, value);
        item = items.find(candidate => { try { const uri = nativeThumbnailUri(candidate.contentURI); const candidatePath = uri && localFilePath(uri); return !!candidatePath && (candidatePath === path || candidatePath === nativePath); } catch { return false; } });
        if (item) break;
      }
      if (signal?.aborted) return null;
      options.diagnostics?.update(entry, { indexed: item ? 'Matched exact USB path' : blocked ? 'Lookup failed' : 'No indexed match' });
      if (!item) { if (!blocked) note(entry, 'native-find', 'NotIndexed: no Content object matches the resolved USB path'); return null; }
      for (const value of item.thumbnailURIs || []) {
        const uri = nativeThumbnailUri(value); if (!uri) { note(entry, 'native-image', 'Invalid thumbnail URI: ' + String(value).slice(0, 160)); continue; }
        note(entry, 'native-image');
        const accepted = options.validate ? await options.validate(uri, signal) : uri;
        if (accepted) return accepted;
        note(entry, 'native-image', 'ImageLoadError: indexed thumbnail cannot render');
      }
      if (signal?.aborted || !create || !api.createThumbnail) { note(entry, 'native-create', 'Unavailable: native thumbnail creation is absent or disabled'); return null; }
      if (creationBlocked) { note(entry, 'native-create', creationBlocked); return null; }
      const allowed = typeof create === 'function' ? await create() : create;
      options.diagnostics?.update(entry, { privilege: allowed ? 'declared' : 'not declared' });
      if (!allowed || signal?.aborted) { note(entry, 'native-create', 'PrivilegeMissing: content.write is not confirmed in the installed manifest'); return null; }
      note(entry, 'native-create');
      const uri = await new Promise<string | null>(resolve => {
        let done = false;
        const finish = (uri: string | null) => { if (done) return; done = true; clearTimeout(timer); resolve(uri); };
        const fail = (error: unknown) => { const name = (error as { name?: string })?.name; if (name === 'SecurityError' || name === 'NotSupportedError' || name === 'TimeoutError') creationBlocked = name; note(entry, 'native-create', error); finish(null); };
        const timer = setTimeout(() => fail({ name: 'TimeoutError', message: 'Native thumbnail creation did not respond within 8 seconds' }), 8000);
        try { api.createThumbnail!(item!, result => { const uri = nativeThumbnailUri(result); if (!uri) note(entry, 'native-create', 'Invalid native output path'); finish(uri); }, fail); } catch (error) { fail(error); }
      });
      if (!uri || signal?.aborted) return null;
      const accepted = options.validate ? await options.validate(uri, signal) : uri;
      if (!accepted) note(entry, 'native-create', 'ImageLoadError: generated native thumbnail cannot render');
      return accepted;
    };
    provider.invalidate = () => { blocked = ''; creationBlocked = ''; };
    return provider;
  } catch { return undefined; }
}
