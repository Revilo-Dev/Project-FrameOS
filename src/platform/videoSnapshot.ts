import type { MediaEntry } from '../types/media';
import { localFilePath } from '../services/playbackPath';

export function snapshotOffset(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? Math.min(15, duration * 0.2) : 0;
}
export function canSnapshot(video: Pick<HTMLVideoElement, 'canPlayType'>, extension: string): boolean {
  const mime: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm' };
  try { return !!mime[extension] && ['maybe', 'probably'].includes(video.canPlayType(mime[extension])); } catch { return false; }
}
/** Captures only a loaded HTML video frame. AVPlay/native objects never enter canvas. */
export function htmlVideoSnapshot(entry: MediaEntry, signal?: AbortSignal, report: (error: unknown) => void = () => {}): Promise<string | null> {
  if (typeof document === 'undefined' || !entry.uri || signal?.aborted) { report(signal?.aborted ? 'Cancelled' : 'SourceUnavailable: no document or resolved file URI'); return Promise.resolve(null); }
  try { localFilePath(entry.uri); } catch (error) { report(error); return Promise.resolve(null); }
  const video = document.createElement('video');
  if (!canSnapshot(video, entry.extension)) { report(`NotSupported: HTML video does not advertise ${entry.extension.toUpperCase()} decoding; AVPlay support is separate`); return Promise.resolve(null); }
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      video.onloadedmetadata = video.onseeked = video.onerror = video.onloadeddata = video.oncanplay = null;
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* Decoder may already be released after removal. */ }
      video.remove(); resolve(value);
    };
    const cancel = () => { report('Cancelled: thumbnail decoder released'); finish(null); };
    const timer = setTimeout(() => { report('TimeoutError: HTML video did not decode and seek within 4.5 seconds'); finish(null); }, 4500);
    signal?.addEventListener('abort', cancel, { once: true });
    video.muted = true; video.preload = 'auto'; video.setAttribute('playsinline', '');
    video.style.cssText = 'position:absolute;left:-400px;top:-240px;width:320px;height:180px;opacity:0;pointer-events:none';
    video.onerror = () => { report(`VideoLoadError: HTML media error ${video.error?.code || 'unknown'} ${video.error?.message || ''}`); finish(null); };
    video.onloadedmetadata = () => {
      const offset = snapshotOffset(video.duration);
      if (!offset || !video.videoWidth || !video.videoHeight) { report('MetadataError: no finite duration or video dimensions'); finish(null); return; }
      try { video.currentTime = offset; } catch (error) { report(error); finish(null); }
    };
    let sought = false;
    const capture = () => {
      if (settled || !sought || video.readyState < 2) return;
      try {
        if (signal?.aborted) { finish(null); return; }
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const context = canvas.getContext('2d'); if (!context) { report('CanvasUnavailable: no 2D context'); finish(null); return; }
        context.drawImage(video, 0, 0, 320, 180);
        // Reject blank native-surface readback rather than caching black rectangles.
        const pixels = context.getImageData(0, 0, 320, 180).data;
        let visible = false;
        for (let index = 0; index < pixels.length; index += 16) if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 24 && pixels[index + 3]) { visible = true; break; }
        if (!visible) report('BlankFrame: no visible HTML video pixels; native AVPlay surfaces cannot be captured');
        finish(visible ? canvas.toDataURL('image/jpeg', 0.72) : null);
      } catch (error) { report(error); finish(null); }
    };
    video.onseeked = () => { sought = true; if (typeof requestAnimationFrame === 'function') requestAnimationFrame(capture); else capture(); };
    video.onloadeddata = video.oncanplay = () => { if (sought) capture(); };
    try { document.body.appendChild(video); video.src = entry.uri!; video.load(); } catch (error) { report(error); finish(null); }
  });
}
