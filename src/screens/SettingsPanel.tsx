import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import { wallpapers } from '../services/wallpapers';
import type { Settings, Theme, Motion } from '../types/settings';

interface Props {
  settings: Settings;
  focused: string;
  focus(id: string): void;
  change(settings: Settings): void;
  close(): void;
  saved: boolean;
}

const themes: { id: Theme; name: string }[] = [{ id: 'slate', name: 'Slate' }, { id: 'midnight', name: 'Midnight' }, { id: 'warm', name: 'Warm' }];
const motions: { id: Motion; name: string }[] = [{ id: 'full', name: 'Fluid' }, { id: 'subtle', name: 'Subtle' }, { id: 'off', name: 'Off' }];

export function SettingsPanel({ settings, focused, focus, change, close, saved }: Props) {
  return <div className="panel-scrim"><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header className="panel-header"><span className="eyebrow">A SPACE THAT FEELS LIKE YOU</span><FocusButton id="settings-close" focused={focused} onFocused={focus} className="round-button" aria-label="Close settings" onClick={close}><Icon name="close" /></FocusButton></header>
    <h2 id="settings-title">Make yourself<br />at home.</h2><p className="panel-intro">The little details make it yours.</p>
    <div className="setting-section"><div className="setting-label"><h3>Theme</h3><span>The tone of your space</span></div><div className="option-row">
      {themes.map((theme) => <FocusButton key={theme.id} id={`theme-${theme.id}`} focused={focused} onFocused={focus} className={`option theme-option ${settings.theme === theme.id ? 'is-selected' : ''}`} aria-pressed={settings.theme === theme.id} onClick={() => change({ ...settings, theme: theme.id })}><span className={`theme-swatch swatch-${theme.id}`} /><span>{theme.name}</span>{settings.theme === theme.id && <Icon name="check" />}</FocusButton>)}
    </div></div>
    <div className="setting-section"><div className="setting-label"><h3>Wallpaper</h3><span>A fresh perspective</span></div><div className="option-row">
      {wallpapers.map((wallpaper) => <FocusButton key={wallpaper.id} id={`wallpaper-${wallpaper.id}`} focused={focused} onFocused={focus} className={`option wallpaper-option ${settings.wallpaper === wallpaper.id ? 'is-selected' : ''}`} aria-pressed={settings.wallpaper === wallpaper.id} onClick={() => change({ ...settings, wallpaper: wallpaper.id })}><img src={wallpaper.src} alt="" /><span>{wallpaper.name}</span>{settings.wallpaper === wallpaper.id && <Icon name="check" />}</FocusButton>)}
    </div></div>
    <div className="setting-section"><div className="setting-label"><h3>Motion</h3><span>At your pace</span></div><div className="option-row">
      {motions.map((motion) => <FocusButton key={motion.id} id={`motion-${motion.id}`} focused={focused} onFocused={focus} className={`option motion-option ${settings.motion === motion.id ? 'is-selected' : ''}`} aria-pressed={settings.motion === motion.id} onClick={() => change({ ...settings, motion: motion.id })}><span>{motion.name}</span>{settings.motion === motion.id && <Icon name="check" />}</FocusButton>)}
    </div><p className="setting-note">Your device’s reduced motion preference is always respected.</p></div>
    <div className={`save-status ${saved ? '' : 'save-error'}`} role="status"><Icon name={saved ? 'check' : 'close'} /><span>{saved ? 'Changes saved automatically' : 'Changes apply for this session. Storage is unavailable.'}</span></div>
    <div className="panel-footer"><kbd>↶</kbd> Back to your home<span>FRAMEOS / PERSONALISE</span></div>
  </section></div>;
}
