import { useLayoutEffect, useRef, useState } from 'react';
import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { formatSize, mediaWindow, mediaSorts } from '../navigation/mediaLayout';
import { MediaOptions } from '../components/MediaOptions';
import type { MediaAdapter, MediaEntry } from '../types/media';
import type { useMediaHub } from './useMediaHub';
import { MediaThumbnail } from '../components/MediaThumbnail';
import type { ThumbnailService } from '../services/thumbnails';
import { detectEpisode, videoDisplayTitle } from '../services/episodes';
import { type MediaGridSize, isMediaHidden } from '../services/mediaPreferences';

export function MediaGlyph({ type }: { type: MediaEntry['type'] }) {
  if (type === 'folder') return <svg className="icon folder-icon" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" opacity=".6" d="M8 13a5 5 0 0 1 5-5h13l7 7h18a5 5 0 0 1 5 5v27a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7z" /><path fill="currentColor" d="M7 27a6 6 0 0 1 6-6h38a6 6 0 0 1 6 7l-3 20a7 7 0 0 1-7 6H17a7 7 0 0 1-7-6z" /><path d="M18 29h27" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" /></svg>;
  return <Icon name={type === 'video' ? 'play' : type === 'image' ? 'gallery' : type === 'audio' ? 'music' : 'file'} />;
}

export function MediaHub({ hub, adapter, thumbnails, focused, selected, focus, openFile, columns, inactive, hidden, context, showHidden, toggleHidden, message, optionsOpen, openOptions, closeOptions, refresh, changeColumns }: {
  hub: ReturnType<typeof useMediaHub>; adapter: MediaAdapter; focused: string; focus(id: string): void; home(): void;
  openFile(entry: MediaEntry, origin: string): void; columns: MediaGridSize; changeColumns(columns: MediaGridSize): void; inactive: boolean; hidden: boolean;
  thumbnails: ThumbnailService; selected: string; context(entry: MediaEntry, origin: string): void; showHidden: boolean; toggleHidden(): void; message: string;
  optionsOpen: boolean; openOptions(): void; closeOptions(): void; refresh(): void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = columns <= 4 ? 340 : 280;
  const window = mediaWindow(hub.entries.length, `media-entry-${Math.floor(scrollTop / rowHeight) * columns}`, columns, 5);
  const focusedIndex = focused.startsWith('media-entry-') ? Number(focused.slice(12)) : -1;
  const indices = Array.from({ length: window.end - window.start }, (_, offset) => window.start + offset);
  if (focusedIndex >= 0 && focusedIndex < hub.entries.length && !indices.includes(focusedIndex)) indices.push(focusedIndex);
  useLayoutEffect(() => { if (viewport.current) viewport.current.scrollTop = 0; setScrollTop(0); }, [hub.path, hub.storage?.id, hub.filter, columns]);
  useLayoutEffect(() => {
    const view = viewport.current; if (!view || focusedIndex < 0) return;
    const top = Math.floor(focusedIndex / columns) * rowHeight;
    if (top < view.scrollTop) view.scrollTop = top;
    else if (top + rowHeight > view.scrollTop + view.clientHeight) {
      const visibleRows = Math.max(1, Math.floor(view.clientHeight / rowHeight));
      view.scrollTop = Math.max(0, top - (visibleRows - 1) * rowHeight);
    }
    setScrollTop(view.scrollTop);
  }, [focusedIndex, columns, rowHeight]);
  const current = focused.startsWith('media-entry-') ? hub.entries[Number(focused.slice(12))] : undefined;
  const selectedEntry = hub.entries[Number(selected.slice(12))];
  return <section className="media-hub" aria-label="Media Hub" aria-hidden={inactive || hidden || undefined}>
    <header className="media-header"><span className="media-home-indicator"><svg viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 13 11-10 11 10" /></svg><span>Home</span></span>
      <nav className="breadcrumbs" aria-label="Folder breadcrumbs">{hub.breadcrumbs.map((crumb, i) => <span key={crumb.path}>{i > 0 && <span className="crumb-divider">/</span>}<span className="crumb-button" title={crumb.name} aria-current={i === hub.breadcrumbs.length - 1 ? 'location' : undefined}>{crumb.name}</span></span>)}</nav>
      {adapter.kind === 'mock' && <span className="mock-label">Development preview</span>}
      <FocusButton id="media-options" focused={focused} onFocused={focus} className="text-button" aria-haspopup="menu" aria-expanded={optionsOpen} onClick={optionsOpen ? closeOptions : openOptions}>Options <span aria-hidden="true">⌄</span></FocusButton>
    </header>
    {hub.storages.length > 0 && <>
      {hub.storages.length > 1 && <nav className="drive-row" aria-label="USB drives">{hub.storages.map((drive, i) => <FocusButton key={drive.id} id={`drive-${i}`} focused={focused} onFocused={focus} className={`drive-button${hub.storage?.id === drive.id ? ' is-selected' : ''}`} aria-pressed={hub.storage?.id === drive.id} onClick={() => hub.selectDrive(drive)}><Icon name="usb" /><span>{drive.label}</span></FocusButton>)}</nav>}
    </>}
    {message && <div className="media-message" role="status">{message}</div>}
    <div className="focused-media-title" aria-live="polite" title={current?.name}>{current ? <span key={current.id}>{current.type === 'video' ? videoDisplayTitle(current.name) : current.name}</span> : '\u00a0'}</div>
    {hub.error && !hub.recovery && <div className="media-error" role="status">{hub.error}</div>}
    {hub.errorCode === 'removed' ? <div className="media-empty" role="status"><Icon name="usb" /><h2>USB disconnected</h2><p>Reconnect your USB drive to browse your media.</p></div> : hub.recovery ? <div className="media-empty media-recovery" role="status"><span className="updating-indicator" /><h2>Home hub is updating try again soon</h2><FocusButton id="media-recovery-refresh" focused={focused} onFocused={focus} className="primary-button" aria-disabled={hub.scanning || hub.loading} onClick={hub.refresh}>Refresh</FocusButton></div> : hub.loading ? <div className="media-empty" role="status"><Icon name="usb" /><h2>Reading folder…</h2></div> : !hub.storages.length ? <div className="media-empty"><Icon name="usb" /><h2>{hub.error ? 'USB scan failed' : adapter.available ? 'Connect a USB device' : 'USB browsing unavailable'}</h2><p>{hub.error ? 'Open Settings → USB diagnostics for the native error, then try Rescan USB.' : adapter.available ? 'Insert a USB drive to browse your media.' : 'Read-only USB browsing requires the Tizen filesystem API on your TV.'}</p></div> : !hub.entries.length ? <div className="media-empty"><MediaGlyph type="folder" /><h2>{hub.error ? 'This folder could not be opened' : hub.directoryCount === 0 ? 'This folder is empty' : 'No matching files'}</h2><p>{hub.error ? 'Refresh to retry, or check USB diagnostics in Settings.' : hub.directoryCount === 0 ? 'There are no files to display here.' : 'Try All Files or open another folder.'}</p></div> : <>
      <div ref={viewport} className="media-viewport" aria-hidden={optionsOpen || undefined} onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="media-grid" style={{ height: Math.ceil(hub.entries.length / columns) * rowHeight }} aria-label="Folder contents">
        {indices.map(index => { const entry = hub.entries[index]; return <FocusButton key={entry.id} id={`media-entry-${index}`} focused={focused} onFocused={focus} style={{ height: rowHeight - 16, position: 'absolute', top: Math.floor(index / columns) * rowHeight, left: `${index % columns * 100 / columns}%`, width: `calc(${100 / columns}% - 16px)` }} className={`media-tile media-type-${entry.type}${isMediaHidden(entry, hub.hidden) ? ' media-hidden-item' : ''}`} title={entry.name} aria-label={entry.name} onContextMenu={event => { event.preventDefault(); context(entry, `media-entry-${index}`); }} onClick={() => entry.isDirectory ? hub.enter(entry) : openFile(entry, `media-entry-${index}`)}>
          {entry.type === 'video' ? <MediaThumbnail entry={entry} service={thumbnails} focused={index === focusedIndex} active={!hidden && !inactive} /> : entry.isDirectory ? <span className="folder-surface"><MediaGlyph type="folder" /></span> : <MediaGlyph type={entry.type} />}<span className="media-filename">{entry.type === 'video' ? detectEpisode(entry.name)?.label || videoDisplayTitle(entry.name) : entry.name}</span><span className="media-file-meta">{isMediaHidden(entry, hub.hidden) && <span className="hidden-badge">Hidden · </span>}{entry.isDirectory ? 'Folder' : `${entry.extension.toUpperCase() || 'File'}${entry.size !== undefined ? ` · ${formatSize(entry.size)}` : ''}`}</span>
        </FocusButton>; })}
      </div></div><div className="media-position">{window.start + 1}–{window.end} of {hub.entries.length}<span>{mediaSorts.find(item => item.id === hub.sort)?.name} · Hold OK for item actions</span></div>
    </>}
    {optionsOpen && <MediaOptions columns={columns} changeColumns={changeColumns} focused={focused} focus={focus} close={closeOptions} filter={hub.filter} changeFilter={hub.changeFilter} sort={hub.sort} changeSort={hub.changeSort} showHidden={showHidden} toggleHidden={toggleHidden} refresh={refresh} busy={hub.scanning || hub.loading} itemOptions={selectedEntry ? () => { closeOptions(); context(selectedEntry, selected); } : undefined} />}
  </section>;
}
