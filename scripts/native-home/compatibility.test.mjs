import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectWebSdk, assessCompatibility, inspectCompatibility } from './compatibility.mjs';
import { TARGET, LIBRARIES, FIELDS } from './spec.mjs';

const run = promisify(execFile);
const base = fileURLToPath(new URL('../../artifacts/native-home-v050/tests/', import.meta.url));
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const xml = '[NoInterfaceObject] interface ApplicationManager {\n void launch();\n void launchAppControl();\n void findAppControl();\n void getAppsInfo();\n};';
function history() { return { format: 'frameos.native-home.inspection', version: 1, capturedAt: '2026-10-22T05:31:27.776Z', target: { ...TARGET }, capabilities: { platform_version: '5.5', cpu_arch: 'armv7', intershell_support: 'disabled', netcoredbg_support: 'enabled' } }; }
async function directory(t) {
  await mkdir(base, { recursive: true }); const value = await mkdtemp(path.join(base, 'run-'));
  t.after(async () => { assert.ok(path.resolve(value).startsWith(path.resolve(base) + path.sep)); await rm(value, { recursive: true }); });
  return value;
}

test('SDK inspection distinguishes launch/match methods from native exports and current owner reads', () => {
  const result = inspectWebSdk(xml, '<module/>');
  assert.deepEqual(result.applicationManagerMethods, ['findAppControl', 'getAppsInfo', 'launch', 'launchAppControl']);
  assert.ok(Object.values(result.referenceNativeSymbols).every(value => !value.mentionedInReviewedWebSdk && value.exportedOnTV === 'unverified'));
  assert.ok(Object.values(result.nativeFields).every(value => value.valueOnTV === 'unread'));
  const mentioned = inspectWebSdk(xml, 'aul_get_default_app');
  assert.equal(mentioned.referenceNativeSymbols.aul_get_default_app.mentionedInReviewedWebSdk, true);
  assert.equal(mentioned.referenceNativeSymbols.aul_get_default_app.exportedOnTV, 'unverified');
});
test('missing/malformed SDK information cannot pass as a complete public interface inventory', () => {
  assert.throws(() => inspectWebSdk('', ''), /missing/);
  assert.throws(() => inspectWebSdk(xml.replace('void getAppsInfo();', ''), ''), /incomplete/);
});
test('exact device identity is required for historical evidence and mock claims cannot enable execution', () => {
  for (const field of Object.keys(TARGET)) {
    const prior = history(); prior.target[field] = 'another-device';
    assert.throws(() => assessCompatibility({ sdk: {}, priorInspection: prior }), /mismatch/);
  }
  const prior = history(); prior.runtime = { verified: true }; prior.bootEligibility = { status: 'verified', supported: true };
  const result = assessCompatibility({ sdk: { status: 'verified', nativeSymbols: Object.values(LIBRARIES).flat() }, priorInspection: prior });
  assert.equal(result.decision, 'blocked'); assert.equal(result.liveApplyAvailable, false); assert.equal(result.liveRestoreAvailable, false);
  assert.equal(result.nativeQueryBuildSupported, false); assert.equal(result.liveQueryAvailable, false);
  assert.deepEqual(result.physicalActivity, { queries: 0, uploads: 0, launches: 0, nativeWrites: 0, powerOperations: 0 });
  assert.deepEqual(Object.keys(result.nativeValues), Object.keys(FIELDS));
  assert.ok(Object.values(result.nativeValues).every(value => value.value === null && value.state === 'unread'));
  assert.equal(result.bootEligibility.supported, null); assert.equal(result.proposedWrites, null);
});
test('offline integration hashes actual SDK/evidence inputs and retains historical timestamps', async t => {
  const root = await directory(t), evidenceDirectory = path.join(root, 'evidence'); await mkdir(evidenceDirectory);
  await writeFile(path.join(evidenceDirectory, 'inspection.json'), JSON.stringify(history()));
  await writeFile(path.join(evidenceDirectory, 'native-library-pull.json'), JSON.stringify({ capturedAt: '2026-10-22T05:32:28.103Z', result: { code: 1, output: 'access refused' }, verifiedElf: null }));
  for (const [profile, name, content] of [['tv', 'tizen', xml], ['tv-samsung', 'product', '<module/>']]) {
    const folder = path.join(root, 'platforms/tizen-5.5', profile, 'widlprocxmls'); await mkdir(folder, { recursive: true }); await writeFile(path.join(folder, `${name}.widlprocxml`), content);
  }
  const result = await inspectCompatibility({ sdkRoot: root, evidenceDirectory });
  assert.equal(result.sdk.status, 'inspected'); assert.equal(result.evidence.length, 4);
  assert.ok(result.evidence.every(value => /^[a-f\d]{64}$/.test(value.sha256)));
  assert.equal(result.priorDeviceEvidence.capturedAt, history().capturedAt);
  assert.equal(result.priorDeviceEvidence.liveFirmwareVerified, false); assert.equal(result.liveApplyAvailable, false);
  assert.equal(JSON.parse(await readFile(path.join(evidenceDirectory, 'inspection.json'), 'utf8')).capturedAt, history().capturedAt);
});
test('missing SDK or ignored evidence files produce an honest blocked result without attempting a TV query', async t => {
  const root = await directory(t), result = await inspectCompatibility({ sdkRoot: root, evidenceDirectory: root });
  assert.equal(result.sdk.status, 'unavailable'); assert.equal(result.priorDeviceEvidence.available, false);
  assert.equal(result.priorDeviceEvidence.capabilities, null); assert.equal(result.decision, 'blocked'); assert.equal(result.evidence.length, 0);
});
test('production CLI refuses apply and restore in separate processes, including force/approval-like arguments', async () => {
  for (const mode of ['apply', 'restore']) {
    await assert.rejects(run(process.execPath, [cli, mode, '--force', '--approve', 'invented-baseline.json'], { timeout: 5000 }), error => {
      assert.equal(error.code, 1); assert.match(error.stderr, /BLOCKED/); assert.match(error.stderr, /No TV command was sent/); return true;
    });
  }
});
