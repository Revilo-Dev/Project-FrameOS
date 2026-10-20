import { memo, useEffect, useState } from 'react';
import type { MediaEntry } from '../types/media';
import type { ThumbnailService } from '../services/thumbnails';
import { Icon } from './Icon';

export const MediaThumbnail = memo(function MediaThumbnail({ entry, service, active }: { entry: MediaEntry; service: ThumbnailService; active: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    setUri(null);
    if (!active) return;
    const controller = new AbortController();
    void service.get(entry, controller.signal).then(uri => { if (!controller.signal.aborted) setUri(uri); });
    return () => controller.abort();
  }, [entry, service, active]);
  return <span className="media-thumbnail">{uri ? <img src={uri} alt="" onError={() => setUri(null)} /> : <Icon name="play" />}<span className="media-thumbnail-badge">{entry.extension.toUpperCase()}</span></span>;
});
