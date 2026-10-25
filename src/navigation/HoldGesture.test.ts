import { it } from 'node:test';
import assert from 'node:assert/strict';
import { HoldGesture } from './HoldGesture';
it('fires short Enter only on release; a 750ms hold fires once without a click, repeats or stale timers', () => {
  let callback = () => {}; let short = 0, long = 0, delay = 0;
  const timers = { set: ((fn: () => void, milliseconds: number) => { callback = fn; delay = milliseconds; return 1; }) as unknown as typeof setTimeout, clear: (() => { callback = () => {}; }) as typeof clearTimeout };
  const gesture = new HoldGesture(750, timers);
  gesture.down('file', () => short++, () => long++); assert.equal(delay, 750); assert.equal(short, 0);
  gesture.release(); assert.equal(short, 1); callback(); assert.equal(long, 0);
  gesture.down('file', () => short++, () => long++); gesture.down('file', () => short++, () => long++);
  callback(); assert.equal(gesture.isDown(), true); gesture.release(); assert.equal(long, 1); assert.equal(short, 1);
  gesture.down('file', () => short++, () => long++); gesture.cancel(); callback(); gesture.release(); assert.equal(short, 1); assert.equal(long, 1);
});
it('requires real repeat evidence for a dock hold; missing keyup/repeats never open an app', () => {
  let callback = () => {}, short = 0, long = 0;
  const timers = { set: ((fn: () => void) => { callback = fn; return 1; }) as unknown as typeof setTimeout, clear: (() => {}) as typeof clearTimeout };
  const gesture = new HoldGesture(600, timers, true);
  gesture.down('dock', () => short++, () => long++); callback(); assert.equal(long, 0);
  gesture.release(); assert.equal(short, 0);
  gesture.down('dock', () => short++, () => long++); gesture.repeat(); callback(); gesture.repeat(); gesture.release();
  assert.equal(long, 1); assert.equal(short, 0);
  gesture.down('dock', () => short++, () => long++); gesture.release(); assert.equal(short, 1);
});
it('a verified release-only hold opens editing once on release, never also the app', () => {
  let callback = () => {}, short = 0, long = 0;
  const timers = { set: ((fn: () => void) => { callback = fn; return 1; }) as unknown as typeof setTimeout, clear: (() => {}) as typeof clearTimeout };
  const gesture = new HoldGesture(700, timers, false, true);
  gesture.down('app', () => short++, () => long++); callback(); assert.equal(long, 0); gesture.repeat(); gesture.release();
  assert.equal(long, 1); assert.equal(short, 0); gesture.release(); assert.equal(long, 1);
  gesture.down('app', () => short++, () => long++); gesture.release(); assert.equal(short, 1);
});
