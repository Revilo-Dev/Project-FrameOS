import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { formatSize, mediaWindow, type MediaFilter } from '../navigation/mediaLayout';
import type { MediaAdapter, MediaEntry } from '../types/media';
import type { useMediaHub } from './useMediaHub';

export function MediaGlyph({ type }: { type: MediaEntry['type'] }) {
  if (type === 'folder') return <svg className="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 14a4 4 0 0 1 4-4h11l5 5h14a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" /><path d="M6 21h36" /></svg>;
  return <Icon name={type === 'video' ? 'play' : type === 'image' ? 'gallery' : type === 'audio' ? 'music' : 'file'} />;
}

export function MediaHub({ hub, adapter, focused, focus, close, openFile, columns, inactive, hidden }: {
  hub: ReturnType<typeof useMediaHub>; adapter: MediaAdapter; focused: string; focus(id: string): void; close(): void;
  openFile(entry: MediaEntry, origin: string): void; columns: number; inactive: boolean; hidden: boolean;
}) {
  const window = mediaWindow(hub.entries.length, focused, columns);
  const filters: { id: MediaFilter; name: string }[] = [{ id: 'all', name: 'All Files' }, { id: 'video', name: 'Videos' }, { id: 'image', name: 'Photos' }, { id: 'folder', name: 'Folders' }];
  return <section className="media-hub" aria-label="Media Hub" aria-hidden={inactive || hidden || undefined}>
    <header className="media-header"><FocusButton id="media-home" focused={focused} onFocused={focus} className="round-button" aria-label="Back to Home" onClick={close}><Icon name="arrow" /></FocusButton><h1>Media Hub</h1>
      {adapter.kind === 'mock' && <span className="mock-label">Development preview</span>}
      <FocusButton id="media-refresh" focused={focused} onFocused={focus} className="text-button" onClick={hub.refresh}>Refresh</FocusButton>
    </header>
    {hub.storages.length > 0 && <>
      <nav className="drive-row" aria-label="USB drives">{hub.storages.map((drive, i) => <FocusButton key={drive.id} id={`drive-${i}`} focused={focused} onFocused={focus} className={`drive-button${hub.storage?.id === drive.id ? ' is-selected' : ''}`} aria-pressed={hub.storage?.id === drive.id} onClick={() => hub.selectDrive(drive)}><Icon name="usb" /><span>{drive.label}</span></FocusButton>)}</nav>
      <nav className="media-filters" aria-label="File types">{filters.map((item) => <FocusButton key={item.id} id={`filter-${item.id}`} focused={focused} onFocused={focus} className={`filter-button${hub.filter === item.id ? ' is-selected' : ''}`} aria-pressed={hub.filter === item.id} onClick={() => hub.changeFilter(item.id)}>{item.name}</FocusButton>)}</nav>
      <nav className="breadcrumbs" aria-label="Folder breadcrumbs">{hub.breadcrumbs.map((crumb, i) => <span key={crumb.path}>{i > 0 && <span className="crumb-divider">/</span>}<FocusButton id={`crumb-${i}`} focused={focused} onFocused={focus} className="crumb-button" onClick={() => hub.breadcrumb(crumb.path)}>{crumb.name}</FocusButton></span>)}</nav>
    </>}
    {hub.error && <div className="media-error" role="status">{hub.error}</div>}
    {hub.loading ? <div className="media-empty" role="status"><Icon name="usb" /><h2>Reading folder…</h2></div> : !hub.storages.length ? <div className="media-empty"><Icon name="usb" /><h2>{hub.error ? 'USB scan failed' : adapter.available ? 'Connect a USB device' : 'USB browsing unavailable'}</h2><p>{hub.error ? 'Open Settings → USB diagnostics for the native error, then try Rescan USB.' : adapter.available ? 'Insert a USB drive to browse your media.' : 'Read-only USB browsing requires the Tizen filesystem API on your TV.'}</p></div> : !hub.entries.length ? <div className="media-empty"><MediaGlyph type="folder" /><h2>{hub.error ? 'This folder could not be opened' : hub.directoryCount === 0 ? 'This folder is empty' : 'No matching files'}</h2><p>{hub.error ? 'Refresh to retry, or check USB diagnostics in Settings.' : hub.directoryCount === 0 ? 'There are no files to display here.' : 'Try All Files or open another folder.'}</p></div> : <>
      <div className="media-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }} aria-label="Folder contents" onWheel={(event) => { if (Math.abs(event.deltaY) > 3) focus(`media-entry-${Math.max(0, Math.min(hub.entries.length - 1, window.start + (event.deltaY > 0 ? columns * 3 : -columns * 3)))}`); }}>
        {hub.entries.slice(window.start, window.end).map((entry, offset) => <FocusButton key={entry.id} id={`media-entry-${window.start + offset}`} focused={focused} onFocused={focus} className={`media-tile media-type-${entry.type}`} title={entry.name} onClick={() => entry.isDirectory ? hub.enter(entry) : openFile(entry, `media-entry-${window.start + offset}`)}>
          <MediaGlyph type={entry.type} /><span className="media-filename">{entry.name}</span><span className="media-file-meta">{entry.isDirectory ? 'Folder' : `${entry.extension.toUpperCase() || 'File'}${entry.size !== undefined ? ` · ${formatSize(entry.size)}` : ''}`}</span>
        </FocusButton>)}
      </div><div className="media-position">{window.start + 1}–{window.end} of {hub.entries.length}<span>Sorted by name</span></div>
    </>}
  </section>;
}
