import { it } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteHoldEvidence } from './RemoteHoldEvidence';
const event = (type: string, timeStamp: number, repeat = false) => ({ type, timeStamp, repeat, key: 'Unidentified', keyCode: 13 });
it('keeps editing disabled without actual measured holds and requires two clean sustained release pairs', () => {
  const evidence = new RemoteHoldEvidence(); assert.equal(evidence.get().status, 'disabled');
  assert.equal(evidence.observe(event('keydown', 0)), false);
  evidence.start(); evidence.observe(event('keydown', 10)); evidence.observe(event('keyup', 810)); assert.equal(evidence.get().status, 'testing');
  evidence.observe(event('keydown', 1010)); evidence.observe(event('keydown', 1100, true)); evidence.observe(event('keyup', 1810)); assert.equal(evidence.get().status, 'supported');
  assert.equal(evidence.get().samples, 2); evidence.cancel();
});
it('unreliable/orphan repeats, short holds or lost focus disable editing without an alternate shortcut', () => {
  for (const broken of ['repeat', 'short', 'blur']) {
    const evidence = new RemoteHoldEvidence(); evidence.start();
    if (broken === 'repeat') evidence.observe(event('keydown', 0, true));
    else if (broken === 'short') { evidence.observe(event('keydown', 0)); evidence.observe(event('keyup', 50)); }
    else evidence.suspend();
    assert.equal(evidence.get().status, 'unsupported'); evidence.start(); assert.equal(evidence.get().status, 'unsupported'); evidence.cancel();
  }
});
