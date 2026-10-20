import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../components/Stage';
import { useRemote } from '../navigation/useRemote';
import { homeRows, settingsRows } from '../navigation/layout';
import { createPlatform } from '../platform';
import { Home } from '../screens/Home';
import { NoticePanel } from '../screens/NoticePanel';
import { SettingsPanel } from '../screens/SettingsPanel';
import { browserStorage, loadSettings, saveSettings } from '../services/settings';
import { wallpapers } from '../services/wallpapers';
import type { ActionResult, IconName, LauncherItem } from '../types/launcher';
import type { Settings } from '../types/settings';

type Panel = { kind: 'settings'; origin: string } | { kind: 'notice'; origin: string; result: ActionResult; icon: IconName; label: string };

export function App() {
  const platform = useMemo(() => createPlatform(), []);
  const storage = useMemo(browserStorage, []);
  const [settings, setSettings] = useState(() => loadSettings(storage));
  const [saved, setSaved] = useState(true);
  const [focused, setFocused] = useState('hero-usb');
  const [panel, setPanel] = useState<Panel | null>(null);
  const busy = useRef(false);
  const focus = useCallback((id: string) => {
    setFocused(id);
    document.getElementById(id)?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => { document.getElementById(focused)?.focus({ preventScroll: true }); }, [focused, panel]);
  const close = () => {
    if (panel) { setPanel(null); setFocused(panel.origin); }
    else focus('hero-usb');
  };
  const personalise = (origin: string, wallpaper = false) => {
    setPanel({ kind: 'settings', origin });
    setFocused(wallpaper ? `wallpaper-${settings.wallpaper}` : `theme-${settings.theme}`);
  };
  const open = async (item: LauncherItem, origin: string) => {
    if (item.action.type === 'settings') { personalise(origin); return; }
    if (busy.current) return;
    busy.current = true;
    let result: ActionResult;
    try {
      result = item.availability === 'unavailable'
        ? { status: 'unavailable', title: 'Unavailable on this device', message: 'This feature is not available on your television.' }
        : await platform.perform(item.action);
    } catch {
      result = { status: 'error', title: 'That couldn’t be opened.', message: 'Return home and try again. Your settings are safe.' };
    } finally { busy.current = false; }
    setPanel({ kind: 'notice', origin, result, icon: item.icon, label: item.name });
    setFocused('notice-close');
  };
  const change = (next: Settings) => { setSettings(next); setSaved(saveSettings(storage, next)); };
  const rows = panel?.kind === 'settings' ? settingsRows : panel ? [[{ id: 'notice-close', x: 0 }]] : homeRows;
  useRemote({ rows, current: focused, focus, back: close });
  const wallpaper = wallpapers.find((item) => item.id === settings.wallpaper)!;
  return <Stage><div className={`frameos theme-${settings.theme} motion-${settings.motion}`}>
    <div className="wallpaper" style={{ backgroundImage: `url("${wallpaper.src}")` }} />
    <div className="ambient-wallpaper" style={{ backgroundImage: `url("${wallpaper.ambient}")` }} />
    <div className="wallpaper-shade" />
    <Home focused={focused} focus={focus} open={open} personalise={personalise} wallpaper={wallpaper.name} platform={platform.kind} inactive={!!panel} />
    {panel?.kind === 'settings' && <SettingsPanel settings={settings} focused={focused} focus={focus} change={change} close={close} saved={saved} />}
    {panel?.kind === 'notice' && <NoticePanel {...panel} focused={focused} focus={focus} close={close} />}
  </div></Stage>;
}
