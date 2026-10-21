import { it } from 'node:test';
import assert from 'node:assert/strict';
import { launchYouTube, YOUTUBE_APP_ID } from './launchYouTube';

it('launches the actual installed YouTube only after a request and returns no success notice', async () => {
  const calls: string[] = [];
  const runtime = { tizen: { application: {
    getAppsInfo(done: (apps: unknown[]) => void) { calls.push('list'); done([{ id: 'kids', name: 'YouTube Kids' }, { id: YOUTUBE_APP_ID, name: 'YouTube' }]); },
    launch(id: string, done: () => void) { calls.push(id); done(); },
  } } };
  assert.deepEqual(calls, []); assert.equal(await launchYouTube(runtime), null);
  assert.deepEqual(calls, ['list', YOUTUBE_APP_ID]);
});
it('reports missing apps and permission denial without pretending to launch', async () => {
  const application = { getAppsInfo(done: (apps: unknown[]) => void) { done([]); }, launch() { throw Error('Must not launch'); } };
  assert.equal((await launchYouTube({ tizen: { application } }))?.status, 'unavailable');
  assert.match((await launchYouTube({ tizen: { application: { launch(_id: string, _done: unknown, fail: (error: unknown) => void) { fail({ name: 'SecurityError' }); } } } }))?.message || '', /permission/);
});
