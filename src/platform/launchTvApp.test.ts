import { it } from 'node:test';
import assert from 'node:assert/strict';
import { launchTvApp, tvAppCandidates, TV_APPS, type TvApp } from './launchTvApp';

it('launches each actual TV destination and never selects Prime dummy/companion apps', async () => {
  const installed: { id: string; name: string }[] = Object.values(TV_APPS).flatMap(spec => spec.ids.map(id => ({ id, name: spec.name })));
  installed.unshift({ id: 'org.tizen.primevideo-dummy', name: 'Prime Video' }, { id: 'org.tizen.primevideo_companionapp', name: 'Prime Video' });
  assert.deepEqual(tvAppCandidates('prime', installed), ['org.tizen.primevideo']);
  for (const app of Object.keys(TV_APPS) as TvApp[]) {
    const calls: string[] = [];
    assert.equal(await launchTvApp({ tizen: { application: {
      getAppsInfo(done: (apps: typeof installed) => void) { done(installed); },
      launch(id: string, done: () => void) { calls.push(id); done(); },
    } } }, app), null);
    assert.deepEqual(calls, [TV_APPS[app].ids[0]]);
  }
});
it('tries the second actual browser when the first is unavailable and preserves permission failures', async () => {
  const calls: string[] = [];
  const runtime = { tizen: { application: { launch(id: string, done: () => void, fail: (e: unknown) => void) { calls.push(id); id === TV_APPS.browser.ids[0] ? fail({ name: 'NotFoundError' }) : done(); } } } };
  assert.equal(await launchTvApp(runtime, 'browser'), null); assert.deepEqual([...calls], [...TV_APPS.browser.ids]);
  calls.length = 0;
  const denied = await launchTvApp({ tizen: { application: { launch(id: string, _done: unknown, fail: (e: unknown) => void) { calls.push(id); fail({ name: 'SecurityError' }); } } } }, 'browser');
  assert.match(denied!.message, /permission/); assert.equal(calls.length, 1);
});
