import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import { FocusButton } from './FocusButton';
import { LauncherIcon } from './LauncherIcon';
import { launcherItems } from '../services/catalog';
import type { LauncherItem } from '../types/launcher';

type OpenApp = (item: LauncherItem, origin: string) => void;
const DockTile = memo(function DockTile({ item, active, focus, open, moving }: { item: LauncherItem; active: boolean; focus(id: string): void; open: OpenApp; moving: boolean }) {
  const id = `app-${item.id}`;
  return <FocusButton id={id} focused={active ? id : ''} onFocused={focus} className={`app-tile tile-${item.action.type === 'installed-app' ? 'native' : item.id}${moving ? ' is-moving' : ''}`} aria-label={item.name} aria-pressed={moving || undefined} onClick={() => open(item, id)}>
    <span className="app-icon-centre"><LauncherIcon item={item} /></span>
    <span className="app-name" aria-hidden="true">{item.name}</span>
  </FocusButton>;
});
export function AppDock({ focused, focus, open, items = launcherItems, moving }: { focused: string; focus(id: string): void; open: OpenApp; items?: LauncherItem[]; moving?: string }) {
  const action = useRef(open); action.current = open;
  const invoke = useCallback<OpenApp>((item, origin) => action.current(item, origin), []);
  const nav = useRef<HTMLElement>(null), positions = useRef(new Map<string, number>());
  const activeFocus = useRef(focused); activeFocus.current = focused;
  const order = items.map(item => item.id).join('\0');
  const rememberPositions = useCallback(() => {
    const nodes = Array.from(nav.current?.children || []) as HTMLElement[];
    positions.current = new Map(nodes.map(node => [node.dataset.dockId!, node.offsetLeft]));
  }, []);
  const keepFocusVisible = useCallback(() => {
    const container = nav.current, tile = document.getElementById(activeFocus.current)?.parentElement;
    if (!container || tile?.parentElement !== container) return;
    const left = tile.offsetLeft, right = left + tile.offsetWidth;
    const target = left < container.scrollLeft ? left : right > container.scrollLeft + container.clientWidth ? right - container.clientWidth : container.scrollLeft;
    container.scrollTo({ left: target, behavior: container.closest('.motion-off') ? 'auto' : 'smooth' });
  }, []);
  useLayoutEffect(() => {
    const nodes = Array.from(nav.current?.children || []) as HTMLElement[];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!nav.current?.closest('.motion-off');
    for (const node of nodes) {
      const id = node.dataset.dockId!, previous = positions.current.get(id), next = node.offsetLeft;
      if (previous !== undefined && previous !== next && !reduced) node.animate?.([{ transform: `translateX(${previous - next}px)` }, { transform: 'translateX(0)' }], { duration: 180, easing: 'ease-out' });
    }
    rememberPositions();
  }, [order, rememberPositions]);
  useLayoutEffect(() => {
    keepFocusVisible();
  }, [focused, order, keepFocusVisible]);
  return <div className="dock-section"><nav ref={nav} className="app-dock" aria-label="Applications" onTransitionEnd={event => { if (event.propertyName === 'width') { rememberPositions(); keepFocusVisible(); } }}>{items.map(item => <div className="dock-cell" data-dock-id={item.id} key={item.id}><DockTile item={item} active={focused === `app-${item.id}`} focus={focus} open={invoke} moving={moving === item.id} /></div>)}</nav></div>;
}
