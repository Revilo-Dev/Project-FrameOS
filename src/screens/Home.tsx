import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { Clock } from '../components/Clock';
import { launcherItems } from '../services/catalog';
import type { LauncherItem } from '../types/launcher';

interface Props {
  focused: string;
  focus(id: string): void;
  open(item: LauncherItem, origin: string): void;
  personalise(origin: string, wallpaper?: boolean): void;
  wallpaper: string;
  platform: string;
  inactive: boolean;
}

export function Home({ focused, focus, open, personalise, wallpaper, platform, inactive }: Props) {
  return <main className="home" aria-hidden={inactive || undefined}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><i /><i /></span><span>frame<span className="brand-light">os</span><sup>01</sup></span></div>
      <div className="home-label"><span className="tiny-dot" /> Your home, reimagined</div>
      <div className="topbar-end"><Clock /><span className="topbar-divider" />
        <FocusButton id="top-settings" focused={focused} onFocused={focus} className="round-button" aria-label="Open settings" onClick={() => personalise('top-settings')}><Icon name="settings" /></FocusButton>
      </div>
    </header>
    <section className="hero" aria-labelledby="hero-title">
      <div className="eyebrow"><span className="short-rule" /> WELCOME HOME</div>
      <h1 id="hero-title">Your screen.<br /><span>Your space.</span></h1>
      <p>A little entertainment. A little inspiration.<br />Everything you love, right at home.</p>
      <div className="hero-actions">
        <FocusButton id="hero-usb" focused={focused} onFocused={focus} className="primary-button" onClick={() => open(launcherItems[0], 'hero-usb')}><Icon name="usb" /><span>USB Media</span><Icon name="arrow" /></FocusButton>
        <FocusButton id="hero-personalise" focused={focused} onFocused={focus} className="quiet-button" onClick={() => personalise('hero-personalise', true)}>Make it yours <Icon name="arrow" /></FocusButton>
      </div>
      <div className="wallpaper-caption"><span className="caption-line" /><span>{wallpaper}<small>THE FRAMEOS COLLECTION</small></span><span className="wallpaper-index">0{['Tidal', 'Dune', 'Dusk'].indexOf(wallpaper) + 1} / 03</span></div>
    </section>
    <section className="favourites" aria-labelledby="favourites-title">
      <div className="section-heading"><div><span className="eyebrow">A FEW OF YOUR FAVOURITES</span><h2 id="favourites-title">Settle into something good.</h2></div><span className="section-aside">A space for every kind of evening.</span></div>
      <div className="app-row">
        {launcherItems.map((item) => <FocusButton key={item.id} id={`app-${item.id}`} focused={focused} onFocused={focus}
          className={`app-tile tile-${item.id}`} aria-label={`${item.name}${item.availability === 'planned' ? ', coming in a future version' : ''}`} onClick={() => open(item, `app-${item.id}`)}>
          <span className="app-art"><Icon name={item.icon} />{item.availability === 'planned' && <span className="planned-dot" aria-hidden="true" />}</span>
          <span className="app-name">{item.name}</span><span className="app-category">{item.availability === 'planned' ? 'COMING SOON' : 'PERSONALISE'}</span>
        </FocusButton>)}
      </div>
    </section>
    <footer className="footer"><div className="remote-hints"><span><kbd>↔</kbd><kbd>↕</kbd> Navigate</span><span><kbd>OK</kbd> Select</span><span><kbd>↶</kbd> Back</span></div><span className="version"><span className="tiny-dot" /> {platform === 'browser' ? 'Browser preview' : 'Tizen'}<span className="footer-separator">/</span>FrameOS 0.1</span></footer>
  </main>;
}
