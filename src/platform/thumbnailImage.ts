/** Decode an image before accepting its URI. File references remain valid when
 * Chromium denies canvas readback; readable images are compacted into app cache. */
export function loadableThumbnail(uri: string | null, signal?: AbortSignal, compact = false): Promise<string | null> {
  if (!uri || signal?.aborted || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image(); let done = false;
    const finish = (value: string | null) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); image.onload = image.onerror = null; image.removeAttribute('src'); resolve(value); };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 3000); signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) { finish(null); return; }
      let result = uri;
      if (compact) try {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const context = canvas.getContext('2d');
        if (context) { context.drawImage(image, 0, 0, 320, 180); const jpeg = canvas.toDataURL('image/jpeg', .72); if (jpeg.length <= 150000) result = jpeg; }
      } catch { /* Rendering works even if canvas cannot read this local image. */ }
      finish(result);
    };
    image.onerror = abort; image.src = uri;
  });
}
