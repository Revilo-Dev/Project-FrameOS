import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FocusButton } from '../components/FocusButton';
import { LauncherIcon } from '../components/LauncherIcon';
import type { LauncherItem } from '../types/launcher';
import type { TvApplications } from '../platform/launchTvApp';
import { launchError } from '../platform/LaunchDiagnostics';
import type { InstalledApp } from '../platform/installedApps';
import { sourceLabel, SOURCE_FALLBACK, type SourceChoice, type TvSources } from '../platform/tvSources';
import { addDockItem, appBrowserItems, configuredDock, defaultDock, moveDockItem, nativeIdentity, pinnedItem, protectedDockIds, removeDockItem, type LauncherPreferences } from '../services/launcherPreferences';
import type { Direction, FocusRows, RemoteKey } from '../navigation/remote';

interface Props {
  preferences: LauncherPreferences; change(next: LauncherPreferences): void;
  apps: TvApplications; sources: TvSources; focused: string; focus(id: string): void;
  open(item: LauncherItem, origin: string): void; enabled: boolean;
}
type View = 'apps' | 'context' | 'info' | 'sources' | 'reset' | null;
interface Menu { item: LauncherItem; origin: string; browser: boolean }
const row = (...ids: string[]) => ids.map((id, i) => ({ id, x: 150 + i * 320 }));
export function useLauncherDock(props: Props) {
  const [view, setView] = useState<View>(null), [menu, setMenu] = useState<Menu>();
  const [moving, setMoving] = useState<{ id: string; draft: LauncherPreferences }>();
  const [apps, setApps] = useState<InstalledApp[]>([]), [loaded, setLoaded] = useState(false);
  const [infoApps, setInfoApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(false), [status, setStatus] = useState('');
  const [sourceList, setSourceList] = useState<SourceChoice[]>([]), [currentSource, setCurrentSource] = useState<string>();
  const [sourceStatus, setSourceStatus] = useState(''), [sourceBusy, setSourceBusy] = useState(false), [sourceViewing, setSourceViewing] = useState(false);
  const origin = useRef('app-all-apps'), sourceGeneration = useRef(0), sourcePending = useRef(false);
  const dock = useMemo(() => configuredDock(moving?.draft || props.preferences), [moving, props.preferences]);
  const entries = useMemo(() => appBrowserItems(apps), [apps]);
  const grid = useRef<HTMLDivElement>(null);
  const loadApps = async (refresh = false) => {
    if (loading || loaded && !refresh) return;
    setLoading(true); setStatus('Reading installed applications...');
    try { const values = await props.apps.choices(refresh); setApps(values); setLoaded(true); setStatus(`${values.length} installed consumer apps. FrameOS destinations are also available.`); }
    catch (error) { setStatus(`${launchError(error)} Saved dock shortcuts are kept. Use Refresh to retry.`); }
    finally { setLoading(false); }
  };
  const showApps = (from: string) => { origin.current = from; setMenu(undefined); setView('apps'); setMoving(undefined); props.focus('all-apps-refresh'); void loadApps(); };
  const readSources = async () => {
    const generation = ++sourceGeneration.current; setSourceBusy(true); setSourceStatus('Reading television inputs...');
    try { const result = await props.sources.read(); if (generation !== sourceGeneration.current) return; setSourceList(result.sources); setCurrentSource(result.current); setSourceStatus(result.note || (result.sources.length ? 'Inputs reported by this television.' : 'The TV returned no inputs.')); }
    catch (error) { if (generation === sourceGeneration.current) setSourceStatus(`${launchError(error)} ${SOURCE_FALLBACK}`); }
    finally { if (generation === sourceGeneration.current) setSourceBusy(false); }
  };
  const showSources = (from: string) => { origin.current = from; setView('sources'); setMenu(undefined); props.focus('sources-refresh'); void readSources(); };
  const sourceHome = async () => {
    sourceGeneration.current++; sourcePending.current = false;
    try { await props.sources.hide(); setSourceViewing(false); } catch (error) { setSourceStatus(launchError(error)); }
    setSourceBusy(false);
    props.open({ id: 'tv', name: 'TV', icon: 'tv', action: { type: 'samsung-home' }, availability: 'available' }, 'sources-home');
  };
  const selectSource = async (item: SourceChoice) => {
    if (sourceBusy) return;
    const generation = ++sourceGeneration.current;
    sourcePending.current = true; setSourceBusy(true); setSourceStatus(`Requesting ${sourceLabel(item)}...`);
    try {
      const message = await props.sources.select(item);
      if (generation !== sourceGeneration.current) return;
      setSourceStatus(message); setSourceViewing(true);
      // Only a fresh getSource result can change the current-input highlight.
      try { const reported = await props.sources.read(); if (generation === sourceGeneration.current) { setCurrentSource(reported.current); setSourceList(reported.sources); } } catch { setCurrentSource(undefined); }
    } catch (error) { if (generation === sourceGeneration.current) setSourceStatus(`${launchError(error)} ${SOURCE_FALLBACK}`); }
    finally { if (generation === sourceGeneration.current) { sourcePending.current = false; setSourceBusy(false); } }
  };
  const context = (item: LauncherItem, from: string, browser = false) => { setMenu({ item, origin: from, browser }); setView('context'); props.focus('dock-option-open'); };
  const startMove = (id: string) => {
    if (id === 'art') { setStatus('Art Mode stays first.'); return; }
    setView(null); setMenu(undefined); setMoving({ id, draft: props.preferences }); props.focus(`app-${id}`);
  };
  const dismiss = () => { setView(null); setMenu(undefined); setMoving(undefined); };
  const close = (): boolean => {
    if (moving) { setMoving(undefined); props.focus(`app-${moving.id}`); return true; }
    if (view === 'info') { setView('context'); props.focus('dock-option-info'); return true; }
    if (view === 'context' && menu) { setView(menu.browser ? 'apps' : null); props.focus(menu.origin); return true; }
    if (view === 'reset') { setView(origin.current === 'all-apps-restore' ? 'apps' : null); props.focus(origin.current); return true; }
    if (view === 'sources' && (sourceViewing || sourcePending.current || props.sources.active)) {
      sourceGeneration.current++; sourcePending.current = false; setSourceBusy(true);
      void props.sources.hide().then(() => { setSourceViewing(false); setSourceBusy(false); setSourceStatus('TVWindow hidden. Select another source or press Back to close.'); props.focus('sources-refresh'); }, error => { setSourceBusy(false); setSourceStatus(`${launchError(error)} ${SOURCE_FALLBACK}`); });
      return true;
    }
    if (view === 'sources' && origin.current.startsWith('all-app-')) { sourceGeneration.current++; setSourceBusy(false); setView('apps'); props.focus(origin.current); return true; }
    if (view) { sourceGeneration.current++; setSourceBusy(false); dismiss(); props.focus(origin.current); return true; }
    return false;
  };
  const run = (item: LauncherItem, from: string) => {
    // Internal navigation leaves the browser cleanly; native launch keeps its return context.
    if (['art-mode', 'usb'].includes(item.action.type)) { dismiss(); props.open(item, view ? origin.current : from); }
    else {
      if (view === 'context') { setView(menu?.browser ? 'apps' : null); props.focus(from); }
      props.open(item, from);
    }
  };
  const reset = (from: string) => { origin.current = from; setView('reset'); props.focus('dock-reset-cancel'); };
  const menuPin = menu ? pinnedItem(props.preferences, menu.item, apps) : undefined;
  const removable = !!menuPin && !protectedDockIds.includes(menuPin.id);
  const options = menu ? [
    { id: 'open', label: 'Open', act: () => run(menu.item, menu.origin) },
    ...(menu.browser && !menuPin ? [{ id: 'add', label: 'Add to Dock', act: () => { props.change(addDockItem(props.preferences, menu.item, apps)); setStatus(`${menu.item.name} added to Dock.`); setView('apps'); props.focus(menu.origin); } }] : []),
    ...(!menu.browser && menuPin && menuPin.id !== 'art' ? [{ id: 'move', label: 'Move', act: () => startMove(menuPin.id) }] : []),
    ...(removable ? [{ id: 'remove', label: 'Remove from Dock', act: () => {
      const index = props.preferences.order.indexOf(menuPin!.id), next = removeDockItem(props.preferences, menuPin!.id);
      props.change(next); setStatus(`${menu.item.name} removed from Dock.`); setView(menu.browser ? 'apps' : null);
      props.focus(menu.browser ? menu.origin : `app-${next.order[Math.min(index, next.order.length - 1)]}`);
    } }] : []),
    { id: 'info', label: 'App information', act: () => { setView('info'); props.focus('dock-info-back'); void props.apps.discover().then(setInfoApps, () => {}); } },
    { id: 'settings', label: 'FrameOS Settings gear', act: () => { dismiss(); props.focus('top-settings'); } },
    { id: 'cancel', label: 'Back', act: close },
  ] : [];
  let rows: FocusRows | undefined;
  if (view === 'apps') rows = [row('all-apps-close', 'all-apps-refresh', 'all-apps-restore'), ...Array.from({ length: Math.ceil(entries.length / 5) }, (_, i) => row(...entries.slice(i * 5, i * 5 + 5).map(item => `all-app-${item.id}`)))];
  if (view === 'context') rows = options.map(option => row(`dock-option-${option.id}`));
  if (view === 'info') rows = [row('dock-info-back')];
  if (view === 'sources') rows = [row('sources-close', 'sources-refresh', 'sources-home'), ...sourceList.map(item => row(`source-${item.id}`))];
  if (view === 'reset') rows = [row('dock-reset-cancel', 'dock-reset-confirm')];
  useLayoutEffect(() => {
    if (view === 'apps' && props.focused.startsWith('all-app-') && !entries.some(item => `all-app-${item.id}` === props.focused)) props.focus('all-apps-refresh');
    if (view === 'apps' && props.focused.startsWith('all-app-')) document.getElementById(props.focused)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (view === 'sources' && props.focused.startsWith('source-') && !sourceList.some(item => `source-${item.id}` === props.focused)) props.focus('sources-refresh');
    if (view === 'sources' && props.focused.startsWith('source-')) document.getElementById(props.focused)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [props.focused, view, entries, sourceList]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) { sourceGeneration.current++; sourcePending.current = false; setSourceBusy(false); setMoving(undefined); void props.sources.hide().then(() => setSourceViewing(false), () => {}); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); sourceGeneration.current++; void props.sources.hide().catch(() => {}); };
  }, [props.sources]);
  const isDock = (id: string) => props.enabled && !view && !moving && id.startsWith('app-');
  const direction = (key: Direction, id: string) => {
    if (moving) {
      if (key === 'left' || key === 'right') setMoving(value => value ? { ...value, draft: moveDockItem(value.draft, value.id, key === 'left' ? -1 : 1) } : value);
      return true;
    }
    if (view === 'context' && id === 'dock-option-open' && key === 'up') { dismiss(); props.focus('top-settings'); return true; }
    if (isDock(id) && key === 'up') { const item = dock.find(item => `app-${item.id}` === id); if (item) context(item, id); return true; }
    return false;
  };
  const input = (key: NonNullable<RemoteKey>, id: string) => {
    if (moving && key === 'select') { props.change({ ...moving.draft, lastFocused: moving.id }); setMoving(undefined); return true; }
    if (moving && (key === 'tab' || key === 'context')) return true;
    if (view === 'apps' && key === 'context' && id.startsWith('all-app-')) { const item = entries.find(item => `all-app-${item.id}` === id); if (item) context(item, id, true); return true; }
    return false;
  };
  const selectedInfo = menu ? [...infoApps, ...apps].find(app => app.id === nativeIdentity(menu.item, [...infoApps, ...apps]) || menu.item.action.type === 'system-settings' && app.id === 'com.samsung.tv.coba.setting') : undefined;
  const button = (id: string, label: string, onClick: () => void, className = 'text-button') => <FocusButton key={id} id={id} focused={props.focused} onFocused={props.focus} className={className} onClick={onClick}>{label}</FocusButton>;
  const element = <>
    {moving && <div className="dock-move-hint" role="status">Move {dock.find(item => item.id === moving.id)?.name}: Left / Right · Select to save · Back to cancel</div>}
    {view === 'apps' && <div className="notice-scrim launcher-scrim"><section className="all-apps-panel" role="dialog" aria-modal="true" aria-labelledby="all-apps-title">
      <header><div><h2 id="all-apps-title">All Apps</h2><p>Select an app for options. Pinned apps show a check.</p></div><div className="launcher-actions">{button('all-apps-close', 'Back', close)}{button('all-apps-refresh', loading ? 'Refreshing...' : 'Refresh', () => { void loadApps(true); })}{button('all-apps-restore', 'Restore Default Dock', () => reset('all-apps-restore'))}</div></header>
      <p role="status">{status}</p><div className="all-apps-grid" ref={grid}>{entries.map(item => <FocusButton key={item.id} id={`all-app-${item.id}`} focused={props.focused} onFocused={props.focus} className="all-app-card" onClick={() => context(item, `all-app-${item.id}`, true)}><span className={`all-app-art tile-${item.id}`}><LauncherIcon item={item} /></span><span>{item.name}</span>{pinnedItem(props.preferences, item, apps) && <small className="pinned-label">✓ Pinned</small>}</FocusButton>)}</div>
    </section></div>}
    {view === 'context' && menu && <div className="notice-scrim launcher-scrim"><section className="media-context dock-options" role="dialog" aria-modal="true" aria-labelledby="dock-options-title"><h2 id="dock-options-title">{menu.item.name}</h2><p>Options · Up again for the FrameOS Settings gear</p>{options.map(option => button(`dock-option-${option.id}`, option.label, option.act, 'context-action'))}</section></div>}
    {view === 'info' && menu && <div className="notice-scrim launcher-scrim"><section className="notice-panel" role="dialog" aria-modal="true" aria-labelledby="dock-info-title"><h2 id="dock-info-title">{menu.item.name}</h2><p>{menu.item.action.type === 'installed-app' ? 'Installed Tizen application' : menu.item.kind || menu.item.action.type}</p>{selectedInfo && <p>Application ID: {selectedInfo.id}<br />{selectedInfo.version ? `Version: ${selectedInfo.version}` : 'Version not reported'}</p>}{!selectedInfo && <p>{menu.item.metadata?.description || 'No additional installed-app information is available.'}</p>}{button('dock-info-back', 'Back to Options', close)}</section></div>}
    {view === 'sources' && <div className="notice-scrim launcher-scrim"><section className="all-apps-panel sources-panel" role="dialog" aria-modal="true" aria-labelledby="sources-title"><h2 id="sources-title">Sources</h2><p>Full-screen playback needs physical verification. Press Back to hide the TVWindow and return.</p><div className="launcher-actions">{button('sources-close', 'Back', close)}{button('sources-refresh', 'Refresh inputs', () => { if (!sourceBusy) void readSources(); })}{button('sources-home', 'Open Samsung Home', () => { void sourceHome(); })}</div><p role="status">{sourceStatus}</p><p>{SOURCE_FALLBACK}</p><div className="source-list">{sourceList.map(item => <FocusButton key={item.id} id={`source-${item.id}`} focused={props.focused} onFocused={props.focus} className="context-action" aria-current={currentSource === item.id ? 'true' : undefined} aria-disabled={sourceBusy} onClick={() => { void selectSource(item); }}>{sourceLabel(item)}{currentSource === item.id ? ' · Current (TV reported)' : ''}<small>{item.connected === true ? 'Connected' : item.connected === false ? 'Disconnected' : 'Connection unknown'}{typeof item.signal === 'boolean' ? item.signal ? ' · Signal present' : ' · No signal' : ''}</small></FocusButton>)}</div></section></div>}
    {view === 'reset' && <div className="notice-scrim launcher-scrim"><section className="notice-panel" role="dialog" aria-modal="true" aria-labelledby="dock-reset-title"><h2 id="dock-reset-title">Restore Default Dock?</h2><p>This replaces dock order and shortcuts. Other FrameOS preferences stay saved.</p><div className="launcher-actions">{button('dock-reset-cancel', 'Cancel', () => { setView(origin.current === 'all-apps-restore' ? 'apps' : null); props.focus(origin.current); })}{button('dock-reset-confirm', 'Restore Default Dock', () => { props.change(defaultDock()); setView(null); props.focus('app-youtube'); })}</div></section></div>}
  </>;
  return { active: !!view, moving: moving?.id, dock, rows, element, close, dismiss, showApps, showSources, reset, direction, input,
    longPress: { eligible: isDock, thresholdMs: 600, requireRepeat: true, open: (id: string) => startMove(id.slice(4)), context: (id: string) => { const item = dock.find(item => `app-${item.id}` === id); if (item) context(item, id); } },
  };
}
