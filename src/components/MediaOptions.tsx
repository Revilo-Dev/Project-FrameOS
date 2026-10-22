import { FocusButton } from './FocusButton';
import { Icon } from './Icon';
import { mediaGridSizes, type MediaGridSize } from '../services/mediaPreferences';
import { mediaFilters, mediaSorts, type MediaFilter, type MediaSort } from '../navigation/mediaLayout';

interface Props {
  focused: string; focus(id: string): void; close(): void;
  filter: MediaFilter; changeFilter(filter: MediaFilter): void;
  sort: MediaSort; changeSort(sort: MediaSort): void;
  showHidden: boolean; toggleHidden(): void; refresh(): void; busy: boolean;
  itemOptions?: () => void;
  columns: MediaGridSize; changeColumns(columns: MediaGridSize): void;
}
export function MediaOptions({ focused, focus, close, filter, changeFilter, sort, changeSort, showHidden, toggleHidden, refresh, busy, itemOptions, columns, changeColumns }: Props) {
  return <div className="media-options-layer" onClick={close}><section className="media-options-menu" role="menu" aria-label="Media options" onClick={event => event.stopPropagation()}>
    <div className="menu-section-label">File type</div>
    {mediaFilters.map(item => <FocusButton key={item.id} id={`filter-${item.id}`} focused={focused} onFocused={focus} className={`menu-option${filter === item.id ? ' is-selected' : ''}`} role="menuitemradio" aria-checked={filter === item.id} onClick={() => changeFilter(item.id)}><span>{item.name}</span>{filter === item.id && <Icon name="check" />}</FocusButton>)}
    <div className="menu-section-label">Sort by</div>
    {mediaSorts.map(item => <FocusButton key={item.id} id={`sort-${item.id}`} focused={focused} onFocused={focus} className={`menu-option${sort === item.id ? ' is-selected' : ''}`} role="menuitemradio" aria-checked={sort === item.id} onClick={() => changeSort(item.id)}><span>{item.name}</span>{sort === item.id && <Icon name="check" />}</FocusButton>)}
    <div className="menu-section-label">Library</div>
    <div className="menu-section-label">Grid columns</div>
    <div className="media-grid-options">{mediaGridSizes.map(size => <FocusButton key={size} id={`grid-${size}`} focused={focused} onFocused={focus} className={`menu-option${size === columns ? ' is-selected' : ''}`} role="menuitemradio" aria-checked={size === columns} onClick={() => changeColumns(size)}>{size}</FocusButton>)}</div>
    <FocusButton id="media-hidden" focused={focused} onFocused={focus} className="menu-option" role="menuitemcheckbox" aria-checked={showHidden} onClick={toggleHidden}><span>Show Hidden Files</span><span className={`ui-toggle${showHidden ? ' is-on' : ''}`} aria-hidden="true" /></FocusButton>
    <FocusButton id="media-refresh" focused={focused} onFocused={focus} className="menu-option" role="menuitem" aria-disabled={busy} onClick={() => { if (!busy) refresh(); }}>Refresh</FocusButton>
    {itemOptions && <FocusButton id="media-item-options" focused={focused} onFocused={focus} className="menu-option" role="menuitem" onClick={itemOptions}>Selected item actions</FocusButton>}
    <div className="menu-hint">↑ ↓ Browse · Back to close</div>
  </section></div>;
}
