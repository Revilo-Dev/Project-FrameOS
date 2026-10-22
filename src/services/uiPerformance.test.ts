import { it } from 'node:test';
import assert from 'node:assert/strict';
import { timingSummary, UiPerformance } from './uiPerformance';
import { recoverFocus } from '../navigation/focusRecovery';
it('calculates useful timing percentiles without accepting invalid values', () => {
  assert.deepEqual(timingSummary([10, 20, 30, 40, NaN, -1]), { samples: 4, medianMs: 20, p95Ms: 40, worstMs: 40 });
});
it('measures live callback/handler timing only during an explicit bounded capture and cancels cleanly', () => {
  let now = 0, callback = (_time: number) => {}, requests = 0, cancels = 0;
  const capture = new UiPerformance({ now: () => now, request: fn => { callback = fn; return ++requests; }, cancel: () => { cancels++; } });
  capture.measure(() => { now += 2; }); assert.equal(requests, 0);
  now = 0;
  capture.start('Home', { viewport: '1920x1080', runtime: 'test', visibleStage: true }, 1000);
  now = 500; callback(now); capture.measure(() => { now += 4; }); now = 520; callback(now);
  for (now = 540; now <= 1000; now += 20) callback(now);
  const report = capture.get().report!; assert.equal(capture.get().running, false); assert.equal(report.status, 'Complete'); assert.equal(report.frames.medianMs, 20); assert.equal(report.callbackFps, 50); assert.equal(report.handlers.medianMs, 4); assert.equal(report.inputToCallback.medianMs, 20);
  const count = requests; callback(now); assert.equal(requests, count);
  capture.start('Home', { viewport: '', runtime: '', visibleStage: true }); capture.cancel(); assert.equal(capture.get().report?.status, 'Cancelled'); assert.ok(cancels >= 2);
});
it('restores remembered focus only if it remains available in the current navigation graph', () => {
  const rows = [[{ id: 'a', x: 0 }, { id: 'b', x: 1 }]];
  assert.equal(recoverFocus(rows, 'b', () => true), 'b'); assert.equal(recoverFocus(rows, 'removed', () => true), 'a'); assert.equal(recoverFocus(rows, 'b', id => id === 'a'), 'a'); assert.equal(recoverFocus(rows, 'b', () => false), undefined);
});
