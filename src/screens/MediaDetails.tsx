import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { formatSize } from '../navigation/mediaLayout';
import type { MediaEntry } from '../types/media';

export function MediaDetails({ entry, focused, focus, close }: { entry: MediaEntry; focused: string; focus(id: string): void; close(): void }) {
  return <div className="notice-scrim"><section className="media-details" role="dialog" aria-modal="true" aria-labelledby="media-details-title">
    <header><span>File details</span><FocusButton id="details-close" focused={focused} onFocused={focus} className="round-button" aria-label="Close file details" onClick={close}><Icon name="close" /></FocusButton></header>
    <h2 id="media-details-title">{entry.name}</h2>
    <dl><dt>Type</dt><dd>{entry.type} · {entry.extension.toUpperCase() || 'Unknown extension'}</dd><dt>Size</dt><dd>{formatSize(entry.size)}</dd><dt>Storage</dt><dd>{entry.storageId}</dd><dt>Folder</dt><dd>{entry.parentPath}</dd><dt>Full path</dt><dd>{entry.path}</dd>{entry.uri && <><dt>URI</dt><dd>{entry.uri}</dd></>}</dl>
    <p>{entry.type === 'video' ? 'Open this file to play it using Samsung AVPlay. Playback depends on the video and audio codecs supported by your TV.' : 'Preview is not available for this file type.'}</p>
  </section></div>;
}
