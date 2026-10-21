import { memo, useEffect, useRef, useState } from 'react';
import type { MediaEntry } from '../types/media';
import type { ThumbnailService } from '../services/thumbnails';
import { Icon } from './Icon';

export const MediaThumbnail = memo(function MediaThumbnail({ entry, service, active }: { entry: MediaEntry; service: ThumbnailService; active: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const identity = `${entry.id}:${entry.size}:${entry.modified}`;
  const current = useRef(identity); current.current = identity;
  useEffect(() => setRetry(0), [identity]);
  useEffect(() => {
    setUri(null);
    if (!active) return;
    const controller = new AbortController();
    void service.get(entry, controller.signal).then(uri => { if (!controller.signal.aborted) setUri(uri); });
    return () => controller.abort();
  }, [entry, service, active, retry]);
  return <span className="media-thumbnail">{uri ? <img src={uri} alt="" onLoad={() => service.rendering(entry, true)} onError={() => { service.rendering(entry, false); setUri(null); if (!retry) void service.forget(entry).then(() => { if (current.current === identity) setRetry(1); }); }} /> : <Icon name="play" />}<span className="media-thumbnail-badge">{entry.extension.toUpperCase()}</span></span>;
});
