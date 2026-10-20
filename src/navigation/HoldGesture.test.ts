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
