import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AvPlayController, avPlayApi, type AvPlayApi, type AvPlayListener } from './AvPlayController';
import { video } from '../../tests/mediaFixture';

function native() {
  const calls: string[] = []; let state = 'NONE', listener: AvPlayListener;
  let prepare: () => void = () => {}, seek: () => void = () => {}, failure: (error: unknown) => void = () => {};
  const api: AvPlayApi = {
    open(path) { calls.push(`open:${path}`); assert.equal(state, 'NONE'); state = 'IDLE'; },
    setListener(value) { calls.push('listener'); listener = value; },
    setDisplayRect(...rect) { calls.push(`rect:${rect.join(',')}`); }, setDisplayMethod(method) { calls.push(method); },
    getState() { calls.push('state'); return state; }, getDuration() { calls.push('duration'); return 120000; },
    prepareAsync(success, error) { calls.push('prepare'); assert.equal(state, 'IDLE'); prepare = () => { state = 'READY'; success(); }; failure = error; },
    play() { calls.push('play'); assert(['READY', 'PAUSED'].includes(state)); state = 'PLAYING'; },
    pause() { calls.push('pause'); assert.equal(state, 'PLAYING'); state = 'PAUSED'; },
    seekTo(position, success, error) { calls.push(`seek:${position}`); assert(['PLAYING', 'PAUSED'].includes(state)); seek = success; failure = error; },
    stop() { calls.push('stop'); state = 'IDLE'; }, close() { calls.push('close'); state = 'NONE'; },
  };
  return { api, calls, prepare: () => prepare(), seek: () => seek(), fail: (error: unknown) => failure(error), get listener() { return listener; }, get state() { return state; } };
}
describe('single-owner Samsung AVPlay lifecycle', () => {
  it('opens validated MP4/MKV paths, prepares asynchronously then sets fullscreen, plays, pauses and resumes', () => {
    const n = native(), player = new AvPlayController(n.api); player.open(video());
    assert.equal(player.get().status, 'preparing'); assert.equal(player.get().busy, true);
    assert(n.calls.includes('open:/media/usb-a/Series/Episode 1.MKV')); assert.equal(n.calls.includes('play'), false);
    n.prepare(); assert.equal(player.get().status, 'playing'); assert.equal(player.get().duration, 120000);
    assert.deepEqual(n.calls.slice(-4), ['duration', 'rect:0,0,1920,1080', 'PLAYER_DISPLAY_MODE_LETTER_BOX', 'play']);
    player.toggle(); assert.equal(n.state, 'PAUSED'); player.play(); assert.equal(n.state, 'PLAYING');
    n.listener.onbufferingstart(); n.listener.onbufferingprogress(42); assert.equal(player.get().percent, 42); n.listener.onbufferingcomplete(); assert.equal(player.get().buffering, false);
    player.close(); assert.equal(n.state, 'NONE');
  });
  it('never overlaps commands during seek and defers USB removal/Back cleanup until the native callback', () => {
    const n = native(), player = new AvPlayController(n.api); player.open(video()); n.prepare();
    player.seek(10000); const calls = n.calls.length;
    player.seek(20000); player.pause(); player.play(); player.close();
    assert.equal(n.calls.length, calls); assert.equal(player.get().status, 'closed'); assert.equal(player.get().busy, true);
    n.seek(); assert.equal(n.state, 'NONE'); assert.equal(player.get().busy, false); assert.equal(player.get().status, 'closed');
  });
  it('retains pause through seeking, clamps positions and ignores invalid state transitions', () => {
    const n = native(), player = new AvPlayController(n.api); player.pause(); player.seek(1); assert.equal(n.calls.length, 0);
    player.open(video()); n.prepare(); player.pause(); player.seek(999999); n.seek();
    assert.equal(player.get().position, 119999); assert.equal(player.get().status, 'paused'); assert.equal(n.state, 'PAUSED');
    player.seek(-20); n.seek(); assert.equal(player.get().position, 0); player.close();
  });
  it('handles EOS/replay, file changes, late events, preparation/seek failures and unsupported codecs', () => {
    const n = native(), player = new AvPlayController(n.api); player.open(video()); n.prepare(); const stale = n.listener;
    n.listener.onstreamcompleted(); assert.equal(player.get().status, 'ended'); assert.equal(n.state, 'NONE'); player.play(); n.prepare();
    player.open(video('Episode 2.mp4')); n.prepare(); stale.onerror('STALE'); assert.equal(player.get().status, 'playing');
    n.listener.onerror('PLAYER_ERROR_NOT_SUPPORTED_FILE'); assert.equal(player.get().status, 'error'); assert.match(player.get().error, /unsupported/); assert.equal(n.state, 'NONE');
    player.open(video()); n.fail({ name: 'PrepareError' }); assert.match(player.get().error, /PrepareError/);
    player.open(video()); n.prepare(); player.seek(500); n.fail({ name: 'SeekError' }); assert.equal(player.get().status, 'error'); assert.equal(n.state, 'NONE');
  });
  it('does not start playback after exit during prepare or after an overlapping open attempt', () => {
    const n = native(), player = new AvPlayController(n.api); player.open(video()); player.close(); n.prepare(); assert.equal(n.state, 'NONE'); assert.equal(n.calls.includes('play'), false);
    player.open(video()); player.open(video('Episode 2.mp4')); n.prepare(); assert.equal(player.get().status, 'error'); assert.equal(n.state, 'NONE');
  });
  it('reports unavailable APIs, invalid paths and timeout without violating the asynchronous gate', async () => {
    assert.equal(avPlayApi({ webapis: { avplay: {} } }), undefined);
    const absent = new AvPlayController(); absent.open(video()); assert.match(absent.get().error, /requires Samsung AVPlay/);
    const n = native(), player = new AvPlayController(n.api, 10); player.open({ ...video(), uri: 'blob:bad' }); assert.equal(n.calls.some(call => call.startsWith('open:')), false);
    player.open(video()); await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(player.get().status, 'error'); assert.match(player.get().error, /too long/);
    const calls = n.calls.length; player.close(); assert.equal(n.calls.length, calls); n.prepare(); assert.equal(n.state, 'NONE');
  });
});
