import { memo, useCallback, useRef } from 'react';
import { FocusButton } from './FocusButton';
import { Icon } from './Icon';
import { launcherItems } from '../services/catalog';
import type { LauncherItem } from '../types/launcher';

const appIcons: Record<string, string> = { youtube: './assets/yt.svg', gallery: './assets/gallery.svg', settings: './assets/settings.svg' };
type OpenApp = (item: LauncherItem, origin: string) => void;
const DockTile = memo(function DockTile({ item, active, focus, open }: { item: LauncherItem; active: boolean; focus(id: string): void; open: OpenApp }) {
  const id = `app-${item.id}`;
  return <FocusButton id={id} focused={active ? id : ''} onFocused={focus} className={`app-tile tile-${item.id}`} aria-label={item.name} onClick={() => open(item, id)}>
    <span className="app-icon-centre">{appIcons[item.id] ? <img src={appIcons[item.id]} alt="" /> : <Icon name={item.icon} />}</span>
    <span className="app-name" aria-hidden="true">{item.name}</span>
  </FocusButton>;
});
export function AppDock({ focused, focus, open }: { focused: string; focus(id: string): void; open: OpenApp }) {
  const action = useRef(open); action.current = open;
  const invoke = useCallback<OpenApp>((item, origin) => action.current(item, origin), []);
  return <div className="dock-section"><nav className="app-dock" aria-label="Applications">{launcherItems.map(item => <DockTile key={item.id} item={item} active={focused === `app-${item.id}`} focus={focus} open={invoke} />)}</nav></div>;
}
