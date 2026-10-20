import type { ThumbnailProvider } from '../services/thumbnails';
import { localFilePath } from '../services/playbackPath';

interface ContentItem { contentURI: string; thumbnailURIs?: string[] | null }
interface ContentApi { find(success: (items: ContentItem[]) => void, failure: (error: unknown) => void, directory: null, filter: unknown, sort: null, count: number, offset: number): void }
/** Query existing indexed metadata only. scanFile/content writes are never used. */
export function tizenThumbnailProvider(runtime: unknown): ThumbnailProvider | undefined {
  try {
    const tizen = (runtime as { tizen?: { content?: ContentApi; AttributeFilter?: new (field: string, match: string, value: string) => unknown } })?.tizen;
    if (!tizen?.content?.find || !tizen.AttributeFilter) return undefined;
    let disabled = false;
    return entry => {
      if (disabled || !entry.uri) return Promise.resolve(null);
      return new Promise(resolve => {
        let settled = false;
        const finish = (value: string | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
        // Stop further native queries after a hung database/denied privilege.
        const timer = setTimeout(() => { disabled = true; finish(null); }, 3000);
        try {
          localFilePath(entry.uri!);
          const filter = new tizen.AttributeFilter!('contentURI', 'EXACTLY', entry.uri!);
          tizen.content!.find(items => {
            try {
              const item = items.find(item => localFilePath(item.contentURI) === localFilePath(entry.uri!));
              finish(item?.thumbnailURIs?.[0] || null);
            } catch { finish(null); }
          }, error => {
            if ((error as { name?: string })?.name === 'SecurityError') disabled = true;
            finish(null);
          }, null, filter, null, 1, 0);
        } catch { disabled = true; finish(null); }
      });
    };
  } catch { return undefined; }
}
