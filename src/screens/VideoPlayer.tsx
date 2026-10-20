import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import type { MediaEntry } from '../types/media';
import type { RemoteKey } from '../navigation/remote';
import { FocusButton } from '../components/FocusButton';
import { Icon } from '../components/Icon';

export interface PlayerHandle { input(key: NonNullable<RemoteKey>, focused: string): boolean }
export function mediaTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
interface Props { platform: PlatformAdapter; entry: MediaEntry; focused: string; focus(id: string): void; close(): void; next(): void; previous(): void; hasNext: boolean; hasPrevious: boolean }
export const VideoPlayer = forwardRef<PlayerHandle, Props>(function VideoPlayer({ platform, entry, focused, focus, close, next, previous, hasNext, hasPrevious }, ref) {
  const controller = platform.player;
  const [snapshot, setSnapshot] = useState(controller.get);
  const [visible, setVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [resolveError, setResolveError] = useState('');
  const reveal = () => { setVisible(true); setActivity(value => value + 1); };
  useEffect(() => controller.subscribe(() => setSnapshot(controller.get())), [controller]);
  useEffect(() => {
    let cancelled = false;
    setResolveError(''); setVisible(true);
    const start = async () => {
      // StrictMode can clean up its first effect before native work starts.
      await Promise.resolve();
      if (cancelled) return;
      try { const resolved = platform.media.resolveFile ? await platform.media.resolveFile(entry) : entry; if (!cancelled) controller.open(resolved); }
      catch (error) { if (!cancelled) setResolveError(error instanceof Error ? error.message : 'The selected USB video is unavailable.'); }
    };
    const unregister = platform.registerMediaKeys();
    void start();
    return () => { cancelled = true; unregister(); controller.close(); };
  }, [controller, platform, entry]);
  useEffect(() => {
    const leave = () => { controller.close(); };
    const visibility = () => { if (document.hidden) { leave(); close(); } };
    window.addEventListener('pagehide', leave); document.addEventListener('visibilitychange', visibility);
    document.documentElement.classList.add('native-playback');
    return () => { window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', visibility); document.documentElement.classList.remove('native-playback'); };
  }, [controller, close]);
  useEffect(() => {
    if (snapshot.status !== 'playing' || snapshot.busy || snapshot.buffering || resolveError) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [snapshot.status, snapshot.busy, snapshot.buffering, resolveError, activity]);
  useImperativeHandle(ref, () => ({ input(key, current) {
    if (key === 'back') return false;
    const wasHidden = !visible;
    reveal();
    if (key.startsWith('media-')) {
      if (key === 'media-toggle') controller.toggle();
      else if (key === 'media-play') controller.play();
      else if (key === 'media-pause') controller.pause();
      else if (key === 'media-stop') close();
      else if (key === 'media-next' && hasNext && !snapshot.busy) next();
      else if (key === 'media-previous' && hasPrevious && !snapshot.busy) previous();
      else if (key === 'media-forward' || key === 'media-rewind') controller.seek(snapshot.position + (key === 'media-forward' ? 10000 : -10000));
      return true;
    }
    if (wasHidden) return true;
    if ((key === 'left' || key === 'right') && current === 'player-seek') { controller.seek(snapshot.position + (key === 'right' ? 10000 : -10000)); return true; }
    return false;
  } }));
  const error = resolveError || snapshot.error;
  const percent = snapshot.duration > 0 ? Math.min(100, snapshot.position / snapshot.duration * 100) : 0;
  const blocked = snapshot.busy || !['playing', 'paused', 'ended'].includes(snapshot.status);
  return <section className={`video-player${visible ? ' controls-visible' : ''}${controller.available ? '' : ' player-unavailable'}`} role="dialog" aria-modal="true" aria-label={`Video player: ${entry.name}`} onMouseMove={reveal} onClick={() => { if (!visible) reveal(); }}>
    {platform.player.available && <object className="native-video-surface" type="application/avplayer" aria-label="Native video surface" />}
    <header className="player-top"><FocusButton id="player-back" focused={focused} onFocused={focus} className="round-button" aria-label="Back to folder" onClick={close}><Icon name="arrow" /></FocusButton><h1>{entry.name}</h1></header>
    {(error || snapshot.buffering || snapshot.status === 'preparing' || snapshot.status === 'closed') && <div className="player-message" role="status">{error || (snapshot.buffering ? `Buffering ${Math.round(snapshot.percent)}%` : 'Preparing video…')}</div>}
    {snapshot.status === 'ended' && <div className="player-ended" role="status">Video finished{!hasNext && <span>End of this folder’s playback list</span>}</div>}
    <div className="player-bottom" aria-hidden={!visible || undefined}>
      <FocusButton id="player-seek" focused={focused} onFocused={focus} className="player-timeline" role="slider" aria-label="Playback position" aria-valuemin={0} aria-valuemax={snapshot.duration} aria-valuenow={snapshot.position} aria-valuetext={`${mediaTime(snapshot.position)} of ${mediaTime(snapshot.duration)}`} aria-disabled={blocked} onClick={() => { reveal(); controller.toggle(); }}><span className="player-track"><span style={{ width: `${percent}%` }} /></span></FocusButton>
      <div className="player-controls"><span className="player-time">{mediaTime(snapshot.position)} <span>/ {mediaTime(snapshot.duration)}</span></span>
        <FocusButton id="player-previous" focused={focused} onFocused={focus} className="player-button" aria-disabled={!hasPrevious || snapshot.busy} onClick={() => { reveal(); if (hasPrevious && !snapshot.busy) previous(); }}>Previous</FocusButton>
        <FocusButton id="player-toggle" focused={focused} onFocused={focus} className="player-button player-toggle" aria-disabled={blocked} onClick={() => { reveal(); controller.toggle(); }}>{snapshot.status === 'playing' ? 'Pause' : snapshot.status === 'ended' ? 'Replay' : 'Play'}</FocusButton>
        <FocusButton id="player-next" focused={focused} onFocused={focus} className="player-button" aria-disabled={!hasNext || snapshot.busy} onClick={() => { reveal(); if (hasNext && !snapshot.busy) next(); }}>Play Next</FocusButton>
      </div>
      <p className="player-hint">Left / right on the timeline seeks 10 seconds · Back returns to your folder</p>
    </div>
  </section>;
});
