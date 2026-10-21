import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PlatformAdapter } from '../platform/PlatformAdapter';
import type { MediaEntry } from '../types/media';
import type { RemoteKey } from '../navigation/remote';
import { FocusButton } from '../components/FocusButton';

function TrackIcon() {
  return <svg className="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m10 10 23 14-23 14zM38 10v28" /></svg>;
}

export interface PlayerHandle { input(key: NonNullable<RemoteKey>, focused: string): boolean }
export function mediaTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
interface Props { platform: PlatformAdapter; entry: MediaEntry; focused: string; focus(id: string): void; close(): void; next(automatic?: boolean): void; previous(): void; hasNext: boolean; hasPrevious: boolean; autoplay: boolean; automatic: boolean }
export const VideoPlayer = forwardRef<PlayerHandle, Props>(function VideoPlayer({ platform, entry, focused, focus, close, next, previous, hasNext, hasPrevious, autoplay, automatic }, ref) {
  const controller = platform.player;
  const [snapshot, setSnapshot] = useState(controller.get);
  const [visible, setVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [resolveError, setResolveError] = useState('');
  const [transition, setTransition] = useState(false);
  const [cancelledNext, setCancelledNext] = useState(false);
  const [feedback, setFeedback] = useState('');
  const nextAction = useRef(next); nextAction.current = next;
  const closeAction = useRef(close); closeAction.current = close;
  useEffect(() => { if (snapshot.status === 'playing') { setCancelledNext(false); setTransition(false); } }, [snapshot.status]);
  useEffect(() => { setCancelledNext(false); setTransition(false); }, [entry.id]);
  useEffect(() => {
    // A failed automatic candidate can be skipped, but is never recorded as EOS.
    const failedCandidate = automatic && (snapshot.status === 'error' || !!resolveError) && !snapshot.busy;
    if (!autoplay || !hasNext || cancelledNext || (snapshot.status !== 'ended' && !failedCandidate)) return;
    setTransition(true);
    const timer = setTimeout(() => { setTransition(false); nextAction.current(true); }, 1600);
    return () => { clearTimeout(timer); setTransition(false); };
  }, [snapshot.status, snapshot.busy, resolveError, autoplay, automatic, hasNext, cancelledNext, entry.id]);
  useEffect(() => { if (!feedback) return; const timer = setTimeout(() => setFeedback(''), 1000); return () => clearTimeout(timer); }, [feedback]);
  const reveal = () => { setVisible(true); setActivity(value => value + 1); };
  const seekBy = (delta: number) => {
    reveal();
    if (controller.seek(controller.get().position + delta)) setFeedback(`${delta > 0 ? '+' : '-'}${Math.abs(delta) / 1000}s`);
  };
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
    void start();
    return () => { cancelled = true; controller.close(); };
  }, [controller, platform, entry]);
  useEffect(() => {
    const leave = () => { controller.close(); closeAction.current(); };
    const visibility = () => { if (document.hidden) { leave(); } };
    window.addEventListener('pagehide', leave); document.addEventListener('visibilitychange', visibility);
    document.documentElement.classList.add('native-playback');
    return () => { window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', visibility); document.documentElement.classList.remove('native-playback'); };
  }, [controller]);
  useEffect(() => {
    if (snapshot.status !== 'playing' || snapshot.busy || snapshot.buffering || resolveError) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [snapshot.status, snapshot.busy, snapshot.buffering, resolveError, activity]);
  useImperativeHandle(ref, () => ({ input(key, current) {
    if (key === 'back') { if (transition && (controller.get().status === 'ended' || automatic && (controller.get().status === 'error' || !!resolveError))) { setCancelledNext(true); setTransition(false); return true; } return false; }
    const wasHidden = !visible;
    reveal();
    if (key.startsWith('media-')) {
      if (key === 'media-toggle') controller.toggle();
      else if (key === 'media-play') controller.play();
      else if (key === 'media-pause') controller.pause();
      else if (key === 'media-stop') close();
      else if (key === 'media-next' && hasNext && !snapshot.busy) next();
      else if (key === 'media-previous' && hasPrevious && !snapshot.busy) previous();
      else if (key === 'media-skip-forward' || key === 'media-skip-back') seekBy(key === 'media-skip-forward' ? 30000 : -30000);
      else if (key === 'media-volume-forward' || key === 'media-volume-back') seekBy(key === 'media-volume-forward' ? 20000 : -20000);
      else if (key === 'media-forward' || key === 'media-rewind') seekBy(key === 'media-forward' ? 10000 : -10000);
      return true;
    }
    if (wasHidden && key === 'select') { controller.toggle(); return true; }
    if (wasHidden) return true;
    if ((key === 'left' || key === 'right') && current === 'player-seek') { seekBy(key === 'right' ? 30000 : -30000); return true; }
    return false;
  } }));
  const error = resolveError || snapshot.error;
  const exhausted = automatic && !hasNext && (snapshot.status === 'error' || !!resolveError);
  const percent = snapshot.duration > 0 ? Math.min(100, snapshot.position / snapshot.duration * 100) : 0;
  const blocked = snapshot.busy || !['playing', 'paused', 'ended'].includes(snapshot.status);
  const title = entry.extension && entry.name.toLowerCase().endsWith(`.${entry.extension.toLowerCase()}`)
    ? entry.name.slice(0, -(entry.extension.length + 1)) : entry.name;
  return <section className={`video-player${visible ? ' controls-visible' : ''}${controller.available ? '' : ' player-unavailable'}`} role="dialog" aria-modal="true" aria-label={`Video player: ${entry.name}`} onMouseMove={reveal} onClick={() => { if (!visible) reveal(); }}>
    {platform.player.available && <object className="native-video-surface" type="application/avplayer" aria-label="Native video surface" />}
    <header className="player-top"><h1>{title}</h1></header>
    {!exhausted && (error || snapshot.buffering || snapshot.status === 'preparing' || snapshot.status === 'closed') && <div className="player-message" role="status">{error || (snapshot.buffering ? `Buffering ${Math.round(snapshot.percent)}%` : 'Preparing video…')}</div>}
    {feedback && <div className="player-skip-feedback" role="status">{feedback}</div>}
    {transition && <div className="player-next-transition" role="status">Playing next episode<span>Back to cancel</span></div>}
    {(snapshot.status === 'ended' || exhausted) && !transition && <div className="player-ended" role="status">Video finished{!hasNext && <span>{exhausted ? 'No more playable videos in this folder' : 'End of this folder’s playback list'}</span>}</div>}
    <div className="player-bottom" aria-hidden={!visible || undefined}>
      <FocusButton id="player-seek" focused={focused} onFocused={focus} className="player-timeline" role="slider" aria-label="Playback position" aria-valuemin={0} aria-valuemax={snapshot.duration} aria-valuenow={snapshot.position} aria-valuetext={`${mediaTime(snapshot.position)} of ${mediaTime(snapshot.duration)}`} aria-disabled={blocked} onClick={() => { reveal(); controller.toggle(); }}><span className="player-track"><span className="player-fill" style={{ width: `${percent}%` }} /><span className="player-knob" style={{ left: `${percent}%` }} /></span></FocusButton>
      <div className="player-time">{mediaTime(snapshot.position)} <span>/ {mediaTime(snapshot.duration)}</span></div>
      <div className="player-controls">
        <FocusButton id="player-previous" focused={focused} onFocused={focus} className="player-button" aria-label="Previous" aria-disabled={!hasPrevious || snapshot.busy} onClick={() => { reveal(); if (hasPrevious && !snapshot.busy) previous(); }}><TrackIcon /></FocusButton>
        <FocusButton id="player-rewind" focused={focused} onFocused={focus} className="player-button" aria-label="Rewind 10 seconds" aria-disabled={blocked} onClick={() => seekBy(-10000)}><span className="player-skip-label" aria-hidden="true">−10</span></FocusButton>
        <FocusButton id="player-toggle" focused={focused} onFocused={focus} className="player-button player-toggle" aria-label={snapshot.status === 'playing' ? 'Pause' : snapshot.status === 'ended' ? 'Replay' : 'Play'} aria-disabled={blocked} onClick={() => { reveal(); controller.toggle(); }}><svg className="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">{snapshot.status === 'playing' ? <path d="M17 10v28M31 10v28" /> : <path d="m16 10 23 14-23 14z" />}</svg></FocusButton>
        <FocusButton id="player-forward" focused={focused} onFocused={focus} className="player-button" aria-label="Forward 10 seconds" aria-disabled={blocked} onClick={() => seekBy(10000)}><span className="player-skip-label" aria-hidden="true">+10</span></FocusButton>
        <FocusButton id="player-next" focused={focused} onFocused={focus} className="player-button" aria-label="Next" aria-disabled={!hasNext || snapshot.busy} onClick={() => { reveal(); if (hasNext && !snapshot.busy) next(); }}><TrackIcon /></FocusButton>
      </div>
    </div>
  </section>;
});
