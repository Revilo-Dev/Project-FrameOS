import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { Clock } from '../components/Clock';
import { WeatherWidget } from '../components/WeatherWidget';
import { FpsCounter } from '../components/FpsCounter';
import { launcherItems } from '../services/catalog';
import type { LauncherItem } from '../types/launcher';
import type { WeatherCity, TimeFormat } from '../types/settings';

interface Props {
  focused: string; focus(id: string): void; open(item: LauncherItem, origin: string): void;
  personalise(origin: string): void; showMedia(origin: string): void;
  network(): void; power(): void; online: boolean; showFps: boolean;
  weatherCity: WeatherCity; inactive: boolean; hidden: boolean;
  timeFormat: TimeFormat; timeZone: string;
}
const appIcons: Record<string, string> = { youtube: './assets/yt.svg', gallery: './assets/gallery.svg', settings: './assets/settings.svg' };
export function Home({ focused, focus, open, personalise, weatherCity, inactive, hidden, showMedia, network, power, online, showFps, timeFormat, timeZone }: Props) {
  return <main className={`home${hidden ? ' home-away' : ''}`} aria-hidden={inactive || hidden || undefined}>
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src="./assets/frameos.svg" alt="FrameOS" />{showFps && !hidden && <FpsCounter />}</div>
      <div className="topbar-controls"><FocusButton id="top-settings" focused={focused} onFocused={focus} className="round-button" aria-label="Open settings" onClick={() => personalise('top-settings')}><img src="./assets/settings.svg" alt="" /></FocusButton><FocusButton id="top-network" focused={focused} onFocused={focus} className={`round-button${online ? '' : ' network-offline'}`} aria-label="Network status" onClick={network}><svg className="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 17a28 28 0 0 1 36 0M12 25a19 19 0 0 1 24 0M19 32a8 8 0 0 1 10 0" /><circle cx="24" cy="39" r="1.5" />{!online && <path d="M7 7l34 34" />}</svg></FocusButton><FocusButton id="top-power" focused={focused} onFocused={focus} className="round-button" aria-label="Exit FrameOS" onClick={power}><svg className="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M24 5v20M14 11a18 18 0 1 0 20 0" /></svg></FocusButton></div>
    </header>
    <div className="home-centre"><Clock timeFormat={timeFormat} timeZone={timeZone} /><WeatherWidget city={weatherCity} timeFormat={timeFormat} /></div>
    <div className="dock-section"><nav className="app-dock" aria-label="Applications">{launcherItems.map(item => <FocusButton key={item.id} id={`app-${item.id}`} focused={focused} onFocused={focus} className={`app-tile tile-${item.id}`} aria-label={item.name} onClick={() => open(item, `app-${item.id}`)}><span className="app-icon-centre">{appIcons[item.id] ? <img src={appIcons[item.id]} alt="" /> : <Icon name={item.icon} />}</span><span className="app-name">{item.name}</span></FocusButton>)}</nav></div>
    <FocusButton id="home-media" focused={focused} onFocused={focus} className="media-prompt" onClick={() => showMedia('home-media')}><span>Media</span><svg viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 11 10L25 3" /></svg></FocusButton>
  </main>;
}
