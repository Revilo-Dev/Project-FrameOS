import { it } from 'node:test';
import assert from 'node:assert/strict';
import { TvSources } from './tvSources';
function fixture(failure = '') {
  const calls: unknown[][] = [], hdmi = { type: 'HDMI', number: 2 };
  const runtime = { tizen: {
    systeminfo: { getPropertyValue(property: string, ok: (value: unknown) => void) { calls.push([property]); ok({ connected: [hdmi], disconnected: [{ type: 'HDMI', number: 1 }] }); } },
    tvwindow: {
      getSource() { return { ...hdmi, signal: true }; },
      setSource(source: unknown, ok: (source: unknown) => void, fail: (error: unknown) => void, type: string) { calls.push(['setSource', source, type]); failure === 'set' ? fail({ name: 'SecurityError' }) : ok(source); },
      show(ok: (rect: string[]) => void, fail: (error: unknown) => void, rect: string[], type: string, z: string) { calls.push(['show', rect, type, z]); failure === 'show' ? fail({ name: 'NotSupportedError' }) : ok(rect); },
      hide(ok: () => void) { calls.push(['hide']); ok(); },
    },
  } };
  return { runtime, calls, service: new TvSources(runtime, 15) };
}
it('lists only TV-reported ports, connection status and current input evidence', async () => {
  const { service } = fixture(); const value = await service.read();
  assert.deepEqual(value.sources.map(item => [item.id, item.connected]), [['HDMI:1', false], ['HDMI:2', true]]);
  assert.equal(value.current, 'HDMI:2'); assert.equal(value.sources[0].signal, undefined); assert.equal(value.sources[1].signal, true);
});
it('distinguishes setSource acceptance from show FRONT full-screen and visible playback; Back hides', async () => {
  const { service, calls } = fixture(); const source = (await service.read()).sources[1];
  assert.match(await service.select(source), /Verify the picture/);
  assert.deepEqual(calls.find(call => call[0] === 'show'), ['show', ['0', '0', '100%', '100%'], 'MAIN', 'FRONT']);
  assert.match(service.diagnostics[1], /setSource accepted.*visible picture unverified/);
  await service.hide(); assert.deepEqual(calls.at(-1), ['hide']);
});
it('does not show a window on denied setSource and cleans up failed show', async () => {
  const denied = fixture('set'), show = fixture('show');
  await assert.rejects(denied.service.select((await denied.service.read()).sources[1]), /SecurityError/);
  assert.ok(!denied.calls.some(call => call[0] === 'show'));
  await assert.rejects(show.service.select((await show.service.read()).sources[1]), /Samsung Home/);
  assert.deepEqual(show.calls.at(-1), ['hide']);
});
it('keeps discovery useful when getSource is denied and rejects invented ports', async () => {
  const { service, runtime, calls } = fixture(); runtime.tizen.tvwindow.getSource = () => { throw { name: 'SecurityError' }; };
  const value = await service.read(); assert.equal(value.current, undefined); assert.match(value.note, /SecurityError/); assert.equal(value.sources.length, 2);
  await assert.rejects(service.select({ type: 'HDMI', number: 99, id: 'HDMI:99' }), /no longer reported/);
  assert.ok(!calls.some(call => call[0] === 'setSource'));
});
it('bounds missing native callbacks and provides a manual fallback without fabricated sources', async () => {
  await assert.rejects(new TvSources().read(), /Samsung Home/);
  const service = new TvSources({ tizen: { systeminfo: { getPropertyValue() {} } } }, 10);
  await assert.rejects(service.read(), /TimeoutError/);
});
it('hides a late show callback again after Back so a cancelled input cannot cover FrameOS', async () => {
  const { service, runtime, calls } = fixture(); let shown!: (rectangle: string[]) => void;
  runtime.tizen.tvwindow.show = (ok, _fail, rect, type, z) => { calls.push(['show', rect, type, z]); shown = ok; };
  const pending = service.select((await service.read()).sources[1]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof shown, 'function'); await service.hide(); shown(['0', '0', '100%', '100%']);
  assert.match(await pending, /cancelled/); assert.equal(service.active, false);
  assert.ok(calls.filter(call => call[0] === 'hide').length >= 2);
});
