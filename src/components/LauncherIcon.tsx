import { useState } from 'react';
import { Icon } from './Icon';
import type { LauncherItem } from '../types/launcher';

const artwork: Record<string, string> = { youtube: './assets/yt.svg', gallery: './assets/gallery.svg', settings: './assets/settings.svg' };
export function LauncherIcon({ item }: { item: LauncherItem }) {
  const [failed, setFailed] = useState('');
  const path = item.iconPath || (item.action.type !== 'installed-app' ? artwork[item.id] : undefined);
  return path && failed !== path ? <img src={path} alt="" onError={() => setFailed(path)} /> : <Icon name={item.icon} />;
}
