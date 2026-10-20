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
import { VideoPlayer, type PlayerHandle } from '../screens/VideoPlayer';
import { loadMediaPreferences, saveMediaPreferences, toggleMediaHidden, isMediaHidden, type MediaPreferences } from '../services/mediaPreferences';
import { playbackQueue } from '../services/episodes';

type Panel = { kind: 'settings'; origin: string } | { kind: 'exit'; origin: string } | { kind: 'notice'; origin: string; result: ActionResult; icon: IconName; label: string } | { kind: 'details' | 'context'; origin: string; entry: MediaEntry };
interface Playback { entry: MediaEntry; queue: MediaEntry[] }

export function App() {
  const platform = useMemo(() => createPlatform(), []);
  const storage = useMemo(browserStorage, []);
  const [settings, setSettings] = useState(() => loadSettings(storage));
  const [saved, setSaved] = useState(true);
  const [mediaPreferences, setMediaPreferences] = useState(() => loadMediaPreferences(storage));
  const [mediaMessage, setMediaMessage] = useState('');
  const [playback, setPlayback] = useState<Playback | null>(null);
  const player = useRef<PlayerHandle>(null);
  const lastEntry = useRef<string>('');
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
    if (id.startsWith('media-entry-')) lastEntry.current = id;
    setFocused(id);
    document.getElementById(id)?.focus({ preventScroll: true });
  }, []);
  const hub = useMediaHub(platform.media, screen === 'media', compact ? 4 : 6, focus, mediaPreferences, (storageId, selected) => {
    platform.thumbnails.invalidate(storageId);
    if (!selected) return;
    platform.player.close(); setPlayback(null); setPanel(null); setMediaMessage('USB drive disconnected.');
  });
  useEffect(() => {
    if (hub.storage) setMediaMessage(message => message === 'USB drive disconnected.' ? '' : message);
  }, [hub.storage?.id]);
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
    if ((panel?.kind === 'details' || panel?.kind === 'context') && !hub.storages.some((drive) => drive.id === panel.entry.storageId)) {
      setPanel(null); setFocused('media-home');
    }
  }, [hub.storages, panel]);
  useEffect(() => {
    if (playback && !hub.storages.some(drive => drive.id === playback.entry.storageId)) {
      platform.player.close(); setPlayback(null); setMediaMessage('USB drive disconnected.'); setFocused('media-home');
    }
  }, [hub.storages, playback, platform]);
  const closePlayer = () => {
    platform.player.close();
    const index = hub.entries.findIndex(entry => entry.id === playback?.entry.id);
    setPlayback(null); setFocused(index >= 0 ? `media-entry-${index}` : 'media-refresh');
  };
  const close = () => {
    if (playback) closePlayer();
    else if (panel) { setPanel(null); setFocused(panel.origin); }
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
  const updateMedia = (next: MediaPreferences) => { setMediaPreferences(next); setMediaMessage(saveMediaPreferences(storage, next) ? '' : 'Preferences are saved for this session only. Local storage is unavailable.'); };
  const context = (entry: MediaEntry, from: string) => { setPanel({ kind: 'context', entry, origin: from }); setFocused('context-hide'); };
  const contextFromFocus = (id: string) => { const entry = hub.entries[Number(id.slice(12))]; if (entry) context(entry, id); };
  const openFile = (entry: MediaEntry, from: string) => {
    if (entry.type === 'video') { setPlayback({ entry, queue: playbackQueue(hub.allEntries, entry) }); setFocused('player-toggle'); }
    else { setPanel({ kind: 'details', entry, origin: from }); setFocused('details-close'); }
  };
  const playbackIndex = playback?.queue.findIndex(entry => entry.id === playback.entry.id) ?? -1;
  const movePlayback = (offset: number) => { if (!playback || platform.player.get().busy) return; const entry = playback.queue[playbackIndex + offset]; if (entry) { setPlayback({ ...playback, entry }); setFocused('player-toggle'); } };
  const rows = playback ? [[{ id: 'player-back', x: 60 }], [{ id: 'player-seek', x: 960 }], ['previous', 'toggle', 'next'].map((id, i) => ({ id: `player-${id}`, x: 900 + i * 280 }))] : panel?.kind === 'settings' ? settingsLayout(settingsTab, wallpaperPage) : panel?.kind === 'exit' ? [[{ id: 'exit-cancel', x: 0 }, { id: 'exit-confirm', x: 1 }]] : panel?.kind === 'context' ? ['hide', 'details', 'cancel'].map(id => [{ id: `context-${id}`, x: 960 }]) : panel ? [[{ id: panel.kind === 'details' ? 'details-close' : 'notice-close', x: 0 }]] : screen === 'media' ? hub.rows : homeLayout(compact);
  useRemote({ rows, current: focused, focus, back: close, input: (key, current) => playback ? player.current?.input(key, current) || false : false,
    longPress: { eligible: id => screen === 'media' && !panel && !playback && id.startsWith('media-entry-'), open: contextFromFocus }, direction: (direction, current) => {
    if (playback) return false;
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
  return <Stage><div className={`frameos theme-${settings.theme} motion-${settings.motion}${compact ? ' compact' : ''}${playback ? ' player-open' : ''}`}>
    <div className="wallpaper" key={wallpaper.id} style={{ backgroundImage: `url("${wallpaper.src}")` }} />
    <div className={`ambient-wallpaper${screen === 'media' ? ' media-ambient' : ''}`} style={{ backgroundImage: `url("${wallpaper.ambient}")` }} />
    <div className="wallpaper-shade" />
    <div className="page-window"><div className={`page-stack${screen === 'media' ? ' page-stack-media' : ''}`} onWheel={event => { if (screen === 'home' && !panel && event.deltaY > 20) showMedia(focused); }}>
      <Home focused={screen === 'home' && !panel ? focused : ''} focus={focus} open={open} personalise={personalise} weatherCity={settings.weatherCity} timeFormat={settings.timeFormat} timeZone={settings.timeZone} inactive={!!panel} hidden={screen !== 'home'} showMedia={showMedia} showFps={settings.showFps} online={online} network={() => { setPanel({ kind: 'notice', origin: 'top-network', icon: 'browser', label: 'Network', result: { status: 'unavailable', title: online ? 'Network available' : 'You’re offline', message: online ? 'The device reports a network connection. Weather updates confirm internet access. Manage Wi-Fi in Samsung TV settings.' : 'The device reports no network connection. Saved weather remains available. Manage Wi-Fi in Samsung TV settings.' } }); setFocused('notice-close'); }} power={() => { setPanel({ kind: 'exit', origin: 'top-power' }); setFocused('exit-cancel'); }} />
      <MediaHub hub={hub} adapter={platform.media} thumbnails={platform.thumbnails} focused={screen === 'media' && !panel && !playback ? focused : ''} selected={lastEntry.current} focus={focus} close={close} columns={compact ? 4 : 6} inactive={!!panel || !!playback} hidden={screen !== 'media'} openFile={openFile} context={context} showHidden={mediaPreferences.showHidden} toggleHidden={() => { updateMedia({ ...mediaPreferences, showHidden: !mediaPreferences.showHidden }); setFocused('media-hidden'); }} message={mediaMessage} />
    </div></div>
    {panel?.kind === 'settings' && <SettingsPanel settings={settings} focused={focused} focus={focus} change={change} close={close} saved={saved} tab={settingsTab} selectTab={tab => { setSettingsTab(tab); setFocused(`settings-tab-${tab}`); }} page={wallpaperPage} selectPage={page => { setWallpaperPage(page); setFocused(`wallpaper-${wallpaperPageItems(page)[0].id}`); }} media={platform.media} />}
    {panel?.kind === 'notice' && <NoticePanel {...panel} focused={focused} focus={focus} close={close} />}
    {panel?.kind === 'details' && <MediaDetails entry={panel.entry} focused={focused} focus={focus} close={close} />}
    {panel?.kind === 'context' && <div className="notice-scrim"><section className="media-context" role="dialog" aria-modal="true" aria-labelledby="context-title"><h2 id="context-title">{panel.entry.name}</h2><p>FrameOS visibility only. Your USB files stay unchanged.</p>
      <FocusButton id="context-hide" focused={focused} onFocused={focus} className="context-action" onClick={() => { try { updateMedia(toggleMediaHidden(mediaPreferences, panel.entry)); setPanel(null); setFocused('media-options'); } catch (error) { setMediaMessage(error instanceof Error ? error.message : 'The preference could not be saved.'); setPanel(null); setFocused('media-options'); } }}>{isMediaHidden(panel.entry, hub.hidden) ? 'Unhide' : 'Hide'}</FocusButton>
      {isMediaHidden(panel.entry, hub.hidden) && <p className="context-note">Restoring this item also restores any hidden parent folders.</p>}
      <FocusButton id="context-details" focused={focused} onFocused={focus} className="context-action" onClick={() => { setPanel({ ...panel, kind: 'details' }); setFocused('details-close'); }}>Details</FocusButton><FocusButton id="context-cancel" focused={focused} onFocused={focus} className="context-action" onClick={close}>Cancel</FocusButton>
    </section></div>}
    {playback && <VideoPlayer ref={player} platform={platform} entry={playback.entry} focused={focused} focus={focus} close={closePlayer} previous={() => movePlayback(-1)} next={() => movePlayback(1)} hasPrevious={playbackIndex > 0} hasNext={playbackIndex >= 0 && playbackIndex < playback.queue.length - 1} />}
    {panel?.kind === 'exit' && <div className="notice-scrim"><section className="notice-panel" role="dialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Close FrameOS?</h2><p>Return to Samsung Home. Use your TV remote’s power button to turn off the television.</p><div className="exit-actions"><FocusButton id="exit-cancel" focused={focused} onFocused={focus} className="text-button" onClick={close}>Stay here</FocusButton><FocusButton id="exit-confirm" focused={focused} onFocused={focus} className="primary-button" onClick={async () => { const result = await platform.exit(); if (result) { setPanel({ kind: 'notice', origin: 'top-power', result, icon: 'home', label: 'FrameOS' }); setFocused('notice-close'); } }}>Close FrameOS</FocusButton></div></section></div>}
  </div></Stage>;
}
