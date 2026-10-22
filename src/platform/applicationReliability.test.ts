import { it } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMEOS_APP_ID, SAMSUNG_HOME_ID, normaliseInstalledApps, queryInstalledApps, selectableApps, type InstalledApp } from './installedApps';
import { LaunchDiagnostics } from './LaunchDiagnostics';
import { launchTvApp, TvApplications } from './launchTvApp';
const app: InstalledApp = { id: 'Abcdef1234.Player', name: 'Player', show: true };
it('reads inherited native application getters, rejects malformed records and excludes system/service destinations', () => {
  const native = Object.create({ get id() { return app.id; }, get name() { return app.name; }, get show() { return true; } });
  const throwing = Object.create({ get id() { throw Error('native'); } });
  const apps = normaliseInstalledApps([null, throwing, native, app, { id: 'bad id', name: 'Bad' }, { id: FRAMEOS_APP_ID, name: 'FrameOS', show: true }, { id: SAMSUNG_HOME_ID, name: 'Home', show: true }, { id: 'org.tizen.art-app', name: 'Art', show: true }, { id: 'Abcdef1234.service', name: 'Service', show: true }, { id: 'com.test.other', name: 'Hidden', show: false }]);
  assert.deepEqual(selectableApps(apps), [app]);
});
it('bounds discovery time and ignores callbacks after timeout', async () => {
  let callback!: (apps: InstalledApp[]) => void;
  const request = queryInstalledApps({ tizen: { application: { getAppsInfo(done: typeof callback) { callback = done; } } } }, 5);
  await assert.rejects(request, /TimeoutError/); callback([app]);
  await assert.rejects(queryInstalledApps(undefined), /TV only/);
});
it('shares discovery, refreshes after expiry and invalidates stale in-flight caching on resume', async () => {
  let reads = 0, now = 0;
  const callbacks: ((apps: InstalledApp[]) => void)[] = [];
  const apps = new TvApplications({ tizen: { application: { getAppsInfo(done: (apps: InstalledApp[]) => void) { reads++; callbacks.push(done); } } } }, () => now);
  const first = apps.discover(); assert.equal(apps.discover(), first); callbacks.shift()!([app]); await first;
  await apps.discover(); assert.equal(reads, 1);
  now = 60001; const expired = apps.discover(); callbacks.shift()!([app]); await expired; assert.equal(reads, 2);
  const stale = apps.discover(true); apps.visibility(false); const fresh = apps.discover(); assert.equal(reads, 4);
  callbacks.shift()!([]); await stale; callbacks.shift()!([app]); await fresh;
  assert.deepEqual(await apps.discover(), [app]);
});
it('revalidates exact pinned IDs and reports missing apps without attempting a different destination', async () => {
  const calls: string[] = [];
  const apps = new TvApplications({ tizen: { application: { getAppsInfo(done: (apps: InstalledApp[]) => void) { done([]); }, launch(id: string) { calls.push(id); } } } });
  assert.equal((await apps.launchInstalled(app))?.status, 'unavailable'); assert.deepEqual(calls, []);
  assert.equal(apps.diagnostics.get()[0].state, 'Failed');
});
it('cancels an unsent launch when FrameOS becomes hidden, without replaying on resume', async () => {
  let callback!: (apps: InstalledApp[]) => void;
  const calls: string[] = [];
  const apps = new TvApplications({ tizen: { application: { getAppsInfo(done: typeof callback) { callback = done; }, launch(id: string) { calls.push(id); } } } });
  const request = apps.launchInstalled(app); apps.visibility(true); apps.visibility(false); callback([app]);
  assert.match((await request)!.message, /CancelledError/); assert.deepEqual(calls, []);
});
it('bounds a stalled launch, ignores late success and never retries permission failures', async () => {
  const diagnostics = new LaunchDiagnostics(); let late!: () => void; let calls = 0;
  const result = await launchTvApp({ tizen: { application: { launch(_id: string, done: () => void) { late = done; } } } }, 'youtube', { diagnostics, timeoutMs: 5 });
  assert.match(result!.message, /TimeoutError/); late(); assert.equal(diagnostics.get()[0].state, 'Failed');
  await launchTvApp({ tizen: { application: { launch(_id: string, _done: unknown, fail: (e: unknown) => void) { calls++; fail({ name: 'SecurityError' }); } } } }, 'browser');
  assert.equal(calls, 1);
});
it('records the AppControl fallback and ignores a late ACK from a failed attempt', async () => {
  const diagnostics = new LaunchDiagnostics();
  let old!: () => void, next!: (e: unknown) => void;
  const result = launchTvApp({ tizen: { ApplicationControl: class {}, application: {
    launch(_id: string, done: () => void, fail: (e: unknown) => void) { old = done; fail({ name: 'NotSupportedError' }); },
    launchAppControl(_control: unknown, _id: string, _done: () => void, fail: (e: unknown) => void) { next = fail; },
  } } }, 'youtube', { diagnostics });
  old(); assert.equal(diagnostics.get()[0].state, 'Launch requested'); next({ name: 'SecurityError' }); await result;
  assert.equal(diagnostics.get()[0].method, 'launchAppControl'); assert.equal(diagnostics.get()[0].state, 'Failed');
});
it('uses only this TV’s recorded Samsung Home component even when it is omitted from the catalogue', async () => {
  const calls: string[] = [];
  assert.equal(await launchTvApp({ tizen: { application: { getAppsInfo(done: (a: unknown[]) => void) { done([]); }, launch(id: string, done: () => void) { calls.push(id); done(); } } } }, 'samsung-home'), null);
  assert.deepEqual(calls, [SAMSUNG_HOME_ID]);
});
it('keeps bounded ACK/visibility evidence without equating it to successful on-screen launch', () => {
  let now = 0; const diagnostics = new LaunchDiagnostics(() => now);
  for (let i = 0; i < 25; i++) diagnostics.begin(`App ${i}`);
  const id = diagnostics.get()[0].sequence; diagnostics.update(id, { state: 'API accepted' }); diagnostics.visibility(true); diagnostics.visibility(false);
  assert.equal(diagnostics.get().length, 20); assert.equal(diagnostics.get()[0].returned, true); assert.equal(diagnostics.get()[0].state, 'API accepted');
  diagnostics.get()[0].name = 'mutated'; assert.notEqual(diagnostics.get()[0].name, 'mutated');
  now = 31000; diagnostics.visibility(true); assert.equal(diagnostics.get()[0].state, 'API accepted');
});
