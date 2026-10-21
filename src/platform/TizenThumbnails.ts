import type { ThumbnailProvider } from '../services/thumbnails';
import { localFilePath } from '../services/playbackPath';

interface ContentItem { contentURI: string; thumbnailURIs?: string[] | null }
interface ContentApi {
  find(success: (items: ContentItem[]) => void, failure: (error: unknown) => void, directory: null, filter: unknown, sort: null, count: number, offset: number): void;
  createThumbnail?(content: ContentItem, success: (path: string) => void, failure: (error: unknown) => void): void;
}
export function nativeThumbnailUri(path: string): string | null {
  try {
    const uri = path.startsWith('/') && !path.startsWith('//') ? `file://${path.split('/').map(encodeURIComponent).join('/')}` : path;
    localFilePath(uri); return uri.length <= 4096 ? uri : null;
  } catch { return null; }
}
/** Existing index, then documented createThumbnail for an indexed Content object.
 * No scanFile, content update, or USB file writes. Frame offset is platform-owned. */
export function tizenThumbnailProvider(runtime: unknown, create = false): ThumbnailProvider | undefined {
  try {
    const tizen = (runtime as { tizen?: { content?: ContentApi; AttributeFilter?: new (field: string, match: string, value: string) => unknown } })?.tizen;
    if (!tizen?.content?.find || !tizen.AttributeFilter) return undefined;
    let disabled = false;
    let creationDisabled = false;
    return (entry, signal) => {
      if (disabled || !entry.uri || signal?.aborted) return Promise.resolve(null);
      return new Promise(resolve => {
        let settled = false;
        const finish = (value: string | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
        // Stop further native queries after a hung database/denied privilege.
        const timer = setTimeout(() => { disabled = true; finish(null); }, create ? 8000 : 3000);
        try {
          localFilePath(entry.uri!);
          const filter = new tizen.AttributeFilter!('contentURI', 'EXACTLY', entry.uri!);
          tizen.content!.find(items => {
            try {
              const item = items.find(item => localFilePath(item.contentURI) === localFilePath(entry.uri!));
              const existing = item?.thumbnailURIs?.[0];
              if (existing) { finish(nativeThumbnailUri(existing)); return; }
              if (signal?.aborted || !item || !create || creationDisabled || !tizen.content?.createThumbnail) { finish(null); return; }
              tizen.content.createThumbnail(item, path => finish(signal?.aborted ? null : nativeThumbnailUri(path)), error => {
                const name = (error as { name?: string })?.name;
                if (name === 'SecurityError' || name === 'NotSupportedError') creationDisabled = true;
                finish(null);
              });
            } catch (error) { if (['SecurityError', 'NotSupportedError'].includes((error as { name?: string })?.name || '')) creationDisabled = true; finish(null); }
          }, error => {
            if ((error as { name?: string })?.name === 'SecurityError') disabled = true;
            finish(null);
          }, null, filter, null, 1, 0);
        } catch { disabled = true; finish(null); }
      });
    };
  } catch { return undefined; }
}
