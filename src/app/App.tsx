import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../components/Stage';
import { useRemote } from '../navigation/useRemote';
import { homeLayout, settingsLayout, type SettingsTab } from '../navigation/layout';
import { FocusButton } from '../components/FocusButton';
import { createPlatform } from '../platform';
import { Home } from '../screens/Home';
import { NoticePanel } from '../screens/NoticePanel';
import { SettingsPanel } from '../screens/SettingsPanel';
import { MediaHub } from '../screens/MediaHub';
import { MediaDetails } from '../screens/MediaDetails';
import { useMediaHub } from '../screens/useMediaHub';
import { browserStorage, loadSettings, saveSettings } from '../services/settings';
import { wallpapers, wallpaperPageItems } from '../services/wallpapers';
import { launcherItems } from '../services/catalog';
import type { ActionResult, IconName, LauncherItem } from '../types/launcher';
import type { MediaEntry } from '../types/media';
import type { Settings } from '../types/settings';

type Panel = { kind: 'settings'; origin: string } | { kind: 'exit'; origin: string } | { kind: 'notice'; origin: string; result: ActionResult; icon: IconName; label: string } | { kind: 'details'; origin: string; entry: MediaEntry };

export function App() {
  const platform = useMemo(() => createPlatform(), []);
  const storage = useMemo(browserStorage, []);
  const [settings, setSettings] = useState(() => loadSettings(storage));
  const [saved, setSaved] = useState(true);
  const [focused, setFocused] = useState('app-youtube');
  const [screen, setScreen] = useState<'home' | 'media'>('home');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [compact, setCompact] = useState(() => window.innerWidth < 1000);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [wallpaperPage, setWallpaperPage] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const origin = useRef('app-youtube');
  const busy = useRef(false);
  const focus = useCallback((id: string) => {
    setFocused(id);
    document.getElementById(id)?.focus({ preventScroll: true });
  }, []);
  const hub = useMediaHub(platform.media, screen === 'media', compact ? 4 : 6, focus);
  useEffect(() => {
    const resize = () => setCompact(window.innerWidth < 1000);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useLayoutEffect(() => { document.getElementById(focused)?.focus({ preventScroll: true }); }, [focused, panel, screen, hub.entries]);
  useEffect(() => {
    if (panel?.kind === 'details' && !hub.storages.some((drive) => drive.id === panel.entry.storageId)) {
      setPanel(null); setFocused('media-home');
    }
  }, [hub.storages, panel]);
  const close = () => {
    if (panel) { setPanel(null); setFocused(panel.origin); }
    else if (screen === 'media') {
      if (!hub.parent()) { setScreen('home'); setFocused(origin.current); }
    } else focus('app-youtube');
  };
  const showMedia = (from: string) => { origin.current = from; setScreen('media'); setFocused('media-home'); };
  const personalise = (from: string) => { setSettingsTab('appearance'); setWallpaperPage(Math.max(0, Math.floor(wallpapers.findIndex(item => item.id === settings.wallpaper) / 12))); setPanel({ kind: 'settings', origin: from }); setFocused(`theme-${settings.theme}`); };
  const open = async (item: LauncherItem, from: string) => {
    if (item.action.type === 'settings') { personalise(from); return; }
    if (item.action.type === 'usb') { showMedia(from); return; }
    if (busy.current) return;
    busy.current = true;
    let result: ActionResult;
    try {
      result = item.availability === 'unavailable'
        ? { status: 'unavailable', title: 'Unavailable on this device', message: 'This feature is not available on your television.' }
        : await platform.perform(item.action);
    } catch { result = { status: 'error', title: 'That couldn’t be opened.', message: 'Return home and try again.' }; }
    finally { busy.current = false; }
    setPanel({ kind: 'notice', origin: from, result, icon: item.icon, label: item.name }); setFocused('notice-close');
  };
  const change = (next: Settings) => { setSettings(next); setSaved(saveSettings(storage, next)); };
  const rows = panel?.kind === 'settings' ? settingsLayout(settingsTab, wallpaperPage) : panel?.kind === 'exit' ? [[{ id: 'exit-cancel', x: 0 }, { id: 'exit-confirm', x: 1 }]] : panel ? [[{ id: panel.kind === 'details' ? 'details-close' : 'notice-close', x: 0 }]] : screen === 'media' ? hub.rows : homeLayout(compact);
  useRemote({ rows, current: focused, focus, back: close, direction: (direction, current) => {
    if (!panel && screen === 'home' && current === 'home-media' && direction === 'down') { showMedia(current); return true; }
    if (panel || screen !== 'home' || !current.startsWith('app-')) return false;
    const index = launcherItems.findIndex(item => `app-${item.id}` === current);
    if (direction === 'down' && (!compact || index >= 4)) { showMedia(current); return true; }
    if (direction === 'up' && (!compact || index < 4)) return 'top-settings';
    if (compact) {
      if (direction === 'left' || direction === 'right') return `app-${launcherItems[Math.max(0, Math.min(launcherItems.length - 1, index + (direction === 'left' ? -1 : 1)))].id}`;
    }
    return false;
  } });
  const wallpaper = wallpapers.find((item) => item.id === settings.wallpaper) || wallpapers[0];
  return <Stage><div className={`frameos theme-${settings.theme} motion-${settings.motion}${compact ? ' compact' : ''}`}>
    <div className="wallpaper" key={wallpaper.id} style={{ backgroundImage: `url("${wallpaper.src}")` }} />
    <div className={`ambient-wallpaper${screen === 'media' ? ' media-ambient' : ''}`} style={{ backgroundImage: `url("${wallpaper.ambient}")` }} />
    <div className="wallpaper-shade" />
    <div className="page-window"><div className={`page-stack${screen === 'media' ? ' page-stack-media' : ''}`} onWheel={event => { if (screen === 'home' && !panel && event.deltaY > 20) showMedia(focused); }}>
      <Home focused={screen === 'home' && !panel ? focused : ''} focus={focus} open={open} personalise={personalise} weatherCity={settings.weatherCity} timeFormat={settings.timeFormat} timeZone={settings.timeZone} inactive={!!panel} hidden={screen !== 'home'} showMedia={showMedia} showFps={settings.showFps} online={online} network={() => { setPanel({ kind: 'notice', origin: 'top-network', icon: 'browser', label: 'Network', result: { status: 'unavailable', title: online ? 'Network available' : 'You’re offline', message: online ? 'The device reports a network connection. Weather updates confirm internet access. Manage Wi-Fi in Samsung TV settings.' : 'The device reports no network connection. Saved weather remains available. Manage Wi-Fi in Samsung TV settings.' } }); setFocused('notice-close'); }} power={() => { setPanel({ kind: 'exit', origin: 'top-power' }); setFocused('exit-cancel'); }} />
      <MediaHub hub={hub} adapter={platform.media} focused={screen === 'media' && !panel ? focused : ''} focus={focus} close={close} columns={compact ? 4 : 6} inactive={!!panel} hidden={screen !== 'media'} openFile={(entry, from) => { setPanel({ kind: 'details', entry, origin: from }); setFocused('details-close'); }} />
    </div></div>
    {panel?.kind === 'settings' && <SettingsPanel settings={settings} focused={focused} focus={focus} change={change} close={close} saved={saved} tab={settingsTab} selectTab={tab => { setSettingsTab(tab); setFocused(`settings-tab-${tab}`); }} page={wallpaperPage} selectPage={page => { setWallpaperPage(page); setFocused(`wallpaper-${wallpaperPageItems(page)[0].id}`); }} media={platform.media} />}
    {panel?.kind === 'notice' && <NoticePanel {...panel} focused={focused} focus={focus} close={close} />}
    {panel?.kind === 'details' && <MediaDetails entry={panel.entry} focused={focused} focus={focus} close={close} />}
    {panel?.kind === 'exit' && <div className="notice-scrim"><section className="notice-panel" role="dialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Close FrameOS?</h2><p>Return to Samsung Home. Use your TV remote’s power button to turn off the television.</p><div className="exit-actions"><FocusButton id="exit-cancel" focused={focused} onFocused={focus} className="text-button" onClick={close}>Stay here</FocusButton><FocusButton id="exit-confirm" focused={focused} onFocused={focus} className="primary-button" onClick={async () => { const result = await platform.exit(); if (result) { setPanel({ kind: 'notice', origin: 'top-power', result, icon: 'home', label: 'FrameOS' }); setFocused('notice-close'); } }}>Close FrameOS</FocusButton></div></section></div>}
  </div></Stage>;
}
