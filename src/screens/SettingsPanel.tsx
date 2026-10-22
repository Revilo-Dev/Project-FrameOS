import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { wallpapers, wallpaperPages, wallpaperPageItems } from '../services/wallpapers';
import type { Settings, Theme, Motion } from '../types/settings';
import { WEATHER_LOCATIONS } from '../services/weather';
import { settingsTabs, type SettingsTab } from '../navigation/layout';
import type { ThumbnailService } from '../services/thumbnails';
import { ThumbnailDiagnosticsPanel } from './ThumbnailDiagnosticsPanel';
import type { MediaEntry, MediaAdapter } from '../types/media';
import { UsbDiagnosticsPanel } from './UsbDiagnosticsPanel';
import { CLOCK_TIME_ZONES } from '../services/clock';
import { CLOCK_FONTS } from '../services/clockFonts';
import { WidgetsSettings } from '../components/WidgetsSettings';
import type { WidgetPreferences } from '../services/widgets';

interface Props {
  toolActive?: boolean; launcherTools?: ReactNode;
  thumbnails: ThumbnailService; thumbnailEntries: MediaEntry[]; selectedThumbnail?: MediaEntry;
  autoplay: boolean; toggleAutoplay(): void; clearMediaCache(): Promise<void>;
  settings: Settings; focused: string; focus(id: string): void;
  change(settings: Settings): void; close(): void; saved: boolean;
  tab: SettingsTab; selectTab(tab: SettingsTab): void;
  page: number; selectPage(page: number): void; media: MediaAdapter;
  closing: boolean; wallpaper: string;
  widgets: WidgetPreferences; changeWidgets(value: WidgetPreferences): void;
}
const themes: { id: Theme; name: string }[] = [{ id: 'slate', name: 'Slate' }, { id: 'midnight', name: 'Midnight' }, { id: 'warm', name: 'Warm' }];
const motions: { id: Motion; name: string }[] = [{ id: 'full', name: 'All animations' }, { id: 'subtle', name: 'Subtle' }, { id: 'off', name: 'Off' }];

export function SettingsPanel({ toolActive, launcherTools, settings, focused, focus, change, close, saved, tab, selectTab, page, selectPage, media, autoplay, toggleAutoplay, clearMediaCache, closing, wallpaper, widgets, changeWidgets, thumbnails, thumbnailEntries, selectedThumbnail }: Props) {
  const [cacheStatus, setCacheStatus] = useState('');
  const content = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Partial<Record<SettingsTab, number>>>({});
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = scrollPositions.current[tab] || 0; }, [tab]);
  useLayoutEffect(() => {
    const element = document.getElementById(focused), view = content.current;
    if (!element || !view?.contains(element)) return;
    const target = element.closest('.thumbnail-diagnostic-overview') || element;
    const rect = target.getBoundingClientRect(), bounds = view.getBoundingClientRect();
    const scale = bounds.height / view.clientHeight || 1;
    if (rect.top < bounds.top + 8) view.scrollTop -= (bounds.top + 8 - rect.top) / scale;
    else if (rect.bottom > bounds.bottom - 8) view.scrollTop += (rect.bottom - bounds.bottom + 8) / scale;
  }, [focused, tab]);
  return <div className={`panel-scrim${closing ? ' is-closing' : ''}`}><div className="settings-wallpaper" style={{ backgroundImage: `url("${wallpaper}")` }} /><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header className="panel-header"><div><span className="panel-kicker">MAKE IT YOURS</span><h2 id="settings-title">Settings</h2></div><FocusButton id="settings-close" focused={focused} onFocused={focus} className="round-button" aria-label="Close settings" onClick={close}><Icon name="close" /></FocusButton></header>
    <nav className="settings-tabs" aria-label="Settings sections">{settingsTabs.map(item => <FocusButton key={item.id} id={`settings-tab-${item.id}`} focused={focused} onFocused={focus} className={`settings-tab${tab === item.id ? ' is-selected' : ''}`} aria-pressed={tab === item.id} onClick={() => selectTab(item.id)}>{item.name}</FocusButton>)}</nav>
    <div ref={content} className={`settings-content settings-content-${tab}`} key={tab} onScroll={event => { scrollPositions.current[tab] = event.currentTarget.scrollTop; }}>
      {tab === 'widgets' && <WidgetsSettings preferences={widgets} change={changeWidgets} focused={focused} focus={focus} />}
      {tab === 'clock' && <>
        <div className="setting-label"><h3>Time format</h3><span>12-hour is the default</span></div>
        <div className="clock-format-options">{(['12h', '24h'] as const).map(format => <FocusButton key={format} id={`time-format-${format}`} focused={focused} onFocused={focus} className={`option clock-format-option${settings.timeFormat === format ? ' is-selected' : ''}`} aria-pressed={settings.timeFormat === format} onClick={() => change({ ...settings, timeFormat: format })}>{format === '12h' ? '12-hour · 6:30 PM' : '24-hour · 18:30'}{settings.timeFormat === format && <Icon name="check" />}</FocusButton>)}</div>
        <div className="setting-label clock-font-label"><h3>Clock Font</h3><span>Preview changes immediately</span></div>
        <div className="clock-font-options">{CLOCK_FONTS.map(font => <FocusButton key={font.id} id={`clock-font-${font.id}`} focused={focused} onFocused={focus} className={`clock-font-option clock-font-${font.id}${settings.clockFont === font.id ? ' is-selected' : ''}`} aria-pressed={settings.clockFont === font.id} aria-label={font.name} onClick={() => change({ ...settings, clockFont: font.id })}><span className="clock-font-sample">12:48</span><span>{font.name}</span>{settings.clockFont === font.id && <Icon name="check" />}</FocusButton>)}</div>
        <div className="setting-label clock-zone-label"><h3>Time zone</h3><span>Clock and date</span></div>
        <div className="clock-zone-options">{CLOCK_TIME_ZONES.map(zone => <FocusButton key={zone.id} id={`timezone-${zone.id}`} focused={focused} onFocused={focus} className={`clock-zone-option${settings.timeZone === zone.id ? ' is-selected' : ''}`} aria-pressed={settings.timeZone === zone.id} onClick={() => change({ ...settings, timeZone: zone.id })}>{zone.name}</FocusButton>)}</div>
        <p className="setting-note clock-note">Daylight saving adjusts automatically. Device local time follows your TV. Weather times follow the selected weather city. <a href="./assets/fonts/clock-LICENSES.txt" tabIndex={-1}>Clock font licenses</a>.</p>
      </>}
      {tab === 'appearance' && !toolActive && <>
        <div className="setting-section"><div className="setting-label"><h3>Theme</h3><span>The tone of your space</span></div><div className="option-row">{themes.map(theme => <FocusButton key={theme.id} id={`theme-${theme.id}`} focused={focused} onFocused={focus} className={`option theme-option${settings.theme === theme.id ? ' is-selected' : ''}`} aria-pressed={settings.theme === theme.id} onClick={() => change({ ...settings, theme: theme.id })}><span className={`theme-swatch swatch-${theme.id}`} /><span>{theme.name}</span>{settings.theme === theme.id && <Icon name="check" />}</FocusButton>)}</div></div>
        <div className="setting-section"><div className="setting-label"><h3>Animations</h3><span>Your pace</span></div><div className="option-row">{motions.map(motion => <FocusButton key={motion.id} id={`motion-${motion.id}`} focused={focused} onFocused={focus} className={`option motion-option${settings.motion === motion.id ? ' is-selected' : ''}`} aria-pressed={settings.motion === motion.id} onClick={() => change({ ...settings, motion: motion.id })}>{motion.name}{settings.motion === motion.id && <Icon name="check" />}</FocusButton>)}</div><p className="setting-note">All animations adds staggered entrances, smooth page scrolling and focus movement. Reduced motion is always respected.</p></div>
        <div className="setting-section"><div className="setting-label"><h3>Performance overlay</h3><span>Temporary testing tool</span></div><FocusButton id="fps-toggle" focused={focused} onFocused={focus} className="text-button" aria-pressed={settings.showFps} onClick={() => change({ ...settings, showFps: !settings.showFps })}>FPS counter {settings.showFps ? 'On' : 'Off'}</FocusButton><p className="setting-note">Shown below the FrameOS logo. Updates once per second. Clock set in Libre Caslon Text, <a href="./assets/fonts/OFL.txt" tabIndex={-1}>SIL Open Font License</a>.</p></div>
      </>}
      {tab === 'appearance' && launcherTools}
      {tab === 'wallpapers' && <><div className="setting-label"><h3>Your collection</h3><span>{wallpapers.length} wallpapers · page {page + 1} of {wallpaperPages}</span></div><div className="wallpaper-picker" key={page}>{wallpaperPageItems(page).map(wallpaper => <FocusButton key={wallpaper.id} id={`wallpaper-${wallpaper.id}`} focused={focused} onFocused={focus} className={`wallpaper-choice${settings.wallpaper === wallpaper.id ? ' is-selected' : ''}`} aria-label={wallpaper.name} aria-pressed={settings.wallpaper === wallpaper.id} onClick={() => change({ ...settings, wallpaper: wallpaper.id })}><img src={wallpaper.thumbnail} alt="" /><span>{wallpaper.name}</span>{settings.wallpaper === wallpaper.id && <Icon name="check" />}</FocusButton>)}</div><div className="wallpaper-pagination">{page > 0 && <FocusButton id="wallpapers-prev" focused={focused} onFocused={focus} className="text-button" onClick={() => selectPage(page - 1)}>← Previous</FocusButton>}<span>{page * 12 + 1}–{Math.min(wallpapers.length, (page + 1) * 12)} of {wallpapers.length}</span>{page < wallpaperPages - 1 && <FocusButton id="wallpapers-next" focused={focused} onFocused={focus} className="text-button" onClick={() => selectPage(page + 1)}>Next →</FocusButton>}</div></>}
      {tab === 'weather' && <><div className="setting-label"><h3>Weather location</h3><span>No location permission needed</span></div><div className="city-options">{WEATHER_LOCATIONS.map(city => <FocusButton key={city.id} id={`city-${city.id}`} focused={focused} onFocused={focus} className={`option city-option${settings.weatherCity === city.id ? ' is-selected' : ''}`} aria-pressed={settings.weatherCity === city.id} onClick={() => change({ ...settings, weatherCity: city.id })}>{city.name}{settings.weatherCity === city.id && <Icon name="check" />}</FocusButton>)}</div><p className="setting-note weather-about">Current conditions and the next six hours. Updated every 45 minutes, with the latest valid forecast saved for offline use.</p><div className="weather-credits">Weather data: <a href="https://open-meteo.com/" tabIndex={-1}>Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" tabIndex={-1}>CC BY 4.0</a>. Temperatures rounded for display. Free API used for personal, non-commercial use.</div></>}
      {tab === 'media' && <>
        <div className="setting-label"><h3>Playback</h3><span>Your USB library</span></div>
        <FocusButton id="autoplay-toggle" focused={focused} onFocused={focus} className="option toggle-option" aria-pressed={autoplay} onClick={toggleAutoplay}>Autoplay Next Episode: {autoplay ? 'ON' : 'OFF'}<span className={`ui-toggle${autoplay ? ' is-on' : ''}`} aria-hidden="true" /></FocusButton>
        <p className="setting-note">Play the next episode after a video finishes. Press Back during the transition to cancel.</p>
        <div className="setting-label"><h3>Media cache</h3><span>Private app storage</span></div>
        <FocusButton id="media-cache-clear" focused={focused} onFocused={focus} className="option" aria-disabled={cacheStatus === 'Clearing...'} onClick={() => { if (cacheStatus === 'Clearing...') return; setCacheStatus('Clearing...'); void clearMediaCache().then(() => setCacheStatus('Media cache cleared.'), () => setCacheStatus('Cache cleared for this session.')); }}>Clear Media Cache</FocusButton>
        <p className="setting-note" role="status">{cacheStatus || 'Clears directory metadata and thumbnails. Hidden-file and playback preferences are kept.'}</p>
      </>}
      {tab === 'usb' && <><UsbDiagnosticsPanel adapter={media} focused={focused} focus={focus} /><ThumbnailDiagnosticsPanel entries={thumbnailEntries} selected={selectedThumbnail} service={thumbnails} focused={focused} focus={focus} /></>}
    </div>
    <div className={`save-status${saved ? '' : ' save-error'}`} role="status"><Icon name={saved ? 'check' : 'close'} /><span>{saved ? 'Changes saved automatically' : 'Changes apply for this session. Storage is unavailable.'}</span></div>
    <div className="panel-footer"><kbd>↶</kbd> Back to close<span>CH + / − · Switch tabs · D-pad to browse</span></div>
  </section></div>;
}
