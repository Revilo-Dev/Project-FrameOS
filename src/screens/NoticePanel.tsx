import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';
import type { ActionResult, IconName } from '../types/launcher';

export function NoticePanel({ result, icon, label, focused, focus, close }: {
  result: ActionResult; icon: IconName; label: string; focused: string; focus(id: string): void; close(): void;
}) {
  return <div className="notice-scrim"><section className="notice-panel" role="dialog" aria-modal="true" aria-labelledby="notice-title" aria-describedby="notice-description">
    <span className="notice-icon"><Icon name={icon} /></span><span className="eyebrow">{label}</span>
    <h2 id="notice-title">{result.title}</h2><p id="notice-description">{result.message}</p>
    <FocusButton id="notice-close" focused={focused} onFocused={focus} className="primary-button" onClick={close}>Back to home <Icon name="arrow" /></FocusButton>
    <span className="notice-version">FRAMEOS 0.2</span>
  </section></div>;
}
