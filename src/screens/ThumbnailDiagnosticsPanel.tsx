import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MediaEntry } from '../types/media';
import type { ThumbnailService } from '../services/thumbnails';
import { FocusButton } from '../components/FocusButton';

export function ThumbnailDiagnosticsPanel({ entries, selected, service, focused, focus }: { entries: MediaEntry[]; selected?: MediaEntry; service: ThumbnailService; focused: string; focus(id: string): void }) {
  const [index, setIndex] = useState(() => Math.max(0, entries.findIndex(entry => entry.id === selected?.id)));
  const [, render] = useState(0);
  const [busy, setBusy] = useState(false);
  const gate = useRef(false), abort = useRef<AbortController>();
  const records = useRef<HTMLDivElement>(null);
  const overview = useRef<HTMLDivElement>(null);
  const entry = entries[Math.min(index, Math.max(0, entries.length - 1))];
  useEffect(() => service.diagnostics.subscribe(() => render(value => value + 1)), [service]);
  useEffect(() => () => { abort.current?.abort(); gate.current = false; }, [entry?.id]);
  useEffect(() => { if (records.current) records.current.scrollTop = 0; }, [entry?.id]);
  const state = entry && service.diagnostics.get(entry);
  useLayoutEffect(() => {
    const group = overview.current, view = group?.closest('.settings-content');
    if (!group || !view || !group.contains(document.getElementById(focused))) return;
    const rect = group.getBoundingClientRect(), bounds = view.getBoundingClientRect();
    const scale = bounds.height / view.clientHeight || 1;
    if (rect.top < bounds.top + 8) view.scrollTop -= (bounds.top + 8 - rect.top) / scale;
    else if (rect.bottom > bounds.bottom - 8) view.scrollTop += (rect.bottom - bounds.bottom + 8) / scale;
  }, [focused, entry?.id, busy, state?.indexed, state?.lastError, state?.uri]);
  const retry = async () => {
    if (!entry || gate.current) return;
    gate.current = true; setBusy(true); abort.current = new AbortController();
    try { await service.retry(entry, abort.current.signal); }
    finally { gate.current = false; setBusy(false); }
  };
  const available = (value: boolean | null) => value === null ? 'Not checked' : value ? 'Available' : 'Unavailable';
  return <section className="thumbnail-diagnostics" aria-label="Thumbnail Diagnostics">
    <h3>Advanced: Thumbnail Diagnostics</h3>
    <p>Temporary diagnostics for the selected USB video. Retry bypasses cached failures. No storage scan is performed.</p>
    {!entry || !state ? <p>Open a USB folder containing videos, select a video, then return here.</p> : <>
      <div className="thumbnail-diagnostic-overview" ref={overview}>
      <h4>{entry.name}</h4>
      <dl className="thumbnail-diagnostic-summary" aria-label="Thumbnail result">
        <dt>Indexed content match</dt><dd>{state.indexed}</dd>
        <dt>Last thumbnail error</dt><dd>{state.lastError || 'None recorded'}</dd>
        <dt>Final thumbnail URI</dt><dd>{state.uri ? state.uri.startsWith('data:') ? 'Embedded image obtained; full URI in details below' : state.uri.slice(0, 220) + (state.uri.length > 220 ? '...' : '') : 'No thumbnail obtained'}</dd>
      </dl>
      <div className="thumbnail-diagnostic-actions">
        <FocusButton id="thumbnail-previous" focused={focused} onFocused={focus} className="text-button" aria-disabled={index <= 0 || busy} onClick={() => { if (!busy) setIndex(value => Math.max(0, value - 1)); }}>Previous video</FocusButton>
        <FocusButton id="thumbnail-next" focused={focused} onFocused={focus} className="text-button" aria-disabled={index >= entries.length - 1 || busy} onClick={() => { if (!busy) setIndex(value => Math.min(entries.length - 1, value + 1)); }}>Next video</FocusButton>
        <FocusButton id="thumbnail-retry" focused={focused} onFocused={focus} className="text-button" aria-disabled={busy} onClick={() => void retry()}>{busy ? 'Testing...' : 'Retry Thumbnail'}</FocusButton>
      </div>
      </div>
      <div className="thumbnail-diagnostic-actions">
        <FocusButton id="thumbnail-scroll-up" focused={focused} onFocused={focus} className="text-button" onClick={() => { if (records.current) records.current.scrollTop -= 260; }}>↑ Earlier details</FocusButton>
        <FocusButton id="thumbnail-scroll-down" focused={focused} onFocused={focus} className="text-button" onClick={() => { if (records.current) records.current.scrollTop += 260; }}>More details ↓</FocusButton>
      </div>
      <div className="thumbnail-diagnostic-records" ref={records}>
      <dl className="thumbnail-diagnostic-facts">
        <dt>Actual file path</dt><dd>{state.path}</dd><dt>Resolved source URI</dt><dd>{state.sourceUri || 'Unavailable'}</dd>
        <dt>Storage identifier / extension</dt><dd>{state.storage} / {state.extension.toUpperCase()}</dd>
        <dt>File accessibility</dt><dd>{state.accessibility}</dd>
        <dt>Native Content API</dt><dd>find: {available(state.nativeFind)}; createThumbnail: {available(state.nativeCreate)}; scanDirectory: {available(state.nativeScan)} (never called)</dd>
        <dt>content.write declaration</dt><dd>{state.privilege}</dd><dt>Indexed content match</dt><dd>{state.indexed}</dd>
        <dt>Thumbnail method attempted</dt><dd>{state.method}</dd><dt>Last thumbnail error</dt><dd className="thumbnail-last-error">{state.lastError || 'None recorded'}</dd>
        <dt>Cache status</dt><dd>{state.cache}</dd><dt>Image rendering status</dt><dd>{state.rendering}</dd>
        <dt>Final thumbnail URI</dt><dd className="thumbnail-final-uri">{state.uri || 'No thumbnail obtained'}</dd>
      </dl>
      {state.uri && <img className="thumbnail-diagnostic-preview" src={state.uri} alt={`Thumbnail of ${entry.name}`} onLoad={() => service.diagnostics.update(entry, { rendering: 'Rendered in diagnostics preview' })} onError={() => service.diagnostics.update(entry, { rendering: 'Preview image failed', lastError: 'ImageLoadError: diagnostics preview rejected final URI' })} />}
      <ol className="thumbnail-attempts">{state.attempts.map((attempt, i) => <li key={i}>{attempt.method}{attempt.error ? `: ${attempt.error}` : ': attempted'}</li>)}</ol>
      </div>
    </>}
  </section>;
}
