import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, link } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET, MAIN, HOME, FIELDS } from './spec.mjs';
import { canonical, digest, envelope, restorePlan, saveCopies, simulateRestore, trialReadiness, validateSnapshot, verifyCopies, verifyEnvelope } from './recovery.mjs';
import { inspectNative, main } from './cli.mjs';
const base = fileURLToPath(new URL('../../artifacts/native-home-phase1/recovery-tests/', import.meta.url));
function fixture() {
  return { format: 'frameos.native-home.snapshot', version: 1, kind: 'mock', identity: { ...TARGET }, capturedAt: new Date().toISOString(), capture: { method: 'mock-only-unit-fixture', readOnly: true, rawEvidenceSha256: 'a'.repeat(64), deviceFingerprint: 'b'.repeat(64), firmwareSource: 'mock', runtimeVerified: true, abiVerified: true }, values: Object.fromEntries(Object.entries(FIELDS).map(([key, type]) => [key, { type, state: 'value', value: type === 'int' ? 0 : key === MAIN || key === HOME ? 'mock.original.Home' : '' }])), bootEligibility: { appId: TARGET.appId, status: 'verified', supported: true } };
}
function changed(original = fixture()) { const value = structuredClone(original); value.values[MAIN].value = TARGET.appId; value.values[HOME].value = TARGET.appId; return value; }
function mock(state, overrides = {}) {
  const writes = [];
  return { kind: 'mock', writes, frameosInstalled: false, read: async () => structuredClone(state), write: async (key, value) => { writes.push(key); state.values[key] = value; }, ...overrides };
}
async function directories(t) {
  await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, 'run-'));
  t.after(async () => { assert.ok(path.resolve(directory).startsWith(path.resolve(base) + path.sep)); await rm(directory, { recursive: true }); });
  const a = path.join(directory, 'primary'), b = path.join(directory, 'second'); await mkdir(a); await mkdir(b);
  return [path.join(a, 'baseline.json'), path.join(b, 'baseline.json')];
}
test('native inspection records unknown runtime/exports/values and cannot equate SDB to recovery', async () => {
  const evidence = await inspectNative({ controller: { diagnose: async () => ({ connected: true, capabilities: { platform_version: '5.5', cpu_arch: 'armv7', intershell_support: 'disabled' } }) } });
  assert.equal(evidence.platformArchitectureMatch, true); assert.equal(evidence.runtime.verified, false); assert.equal(evidence.nativeHelperCreated, false); assert.equal(evidence.recovery.viableOnDevice, false);
  assert.ok(Object.values(evidence.values).every(field => field.value === null && field.state === 'unread')); assert.equal(evidence.trial.ready, false);
});
test('failed, absent, partial and incorrectly typed reads are rejected with no guessed Samsung values', () => {
  for (const mutation of [s => { delete s.values[HOME]; }, s => { s.values[HOME].state = 'error'; }, s => { s.values[HOME].state = 'absent'; }, s => { s.values['db/menu/smart_hub/ontvsetting/auto_start'].value = '0'; }, s => { s.values.unexpected = { type: 'int', state: 'value', value: 0 }; }]) {
    const snapshot = fixture(); mutation(snapshot); assert.throws(() => validateSnapshot(snapshot, { allowMock: true }));
  }
  const snapshot = fixture(); assert.equal(validateSnapshot(snapshot, { allowMock: true }).values['db/first_screen/type'].value, '');
  assert.throws(() => validateSnapshot(snapshot), /Mock/);
});
test('model, firmware, app identity and unknown schema mismatches fail closed', () => {
  for (const key of ['model', 'firmware', 'appId', 'architecture']) { const snapshot = fixture(); snapshot.identity[key] = 'different'; assert.throws(() => validateSnapshot(snapshot, { allowMock: true }), /mismatch/); }
  const snapshot = fixture(); snapshot.version = 2; assert.throws(() => envelope(snapshot, { allowMock: true }), /version/);
});
test('envelopes detect changed contents and are stable across JSON property order', () => {
  const snapshot = fixture(), value = envelope(snapshot, { allowMock: true });
  assert.equal(digest(snapshot), digest(Object.fromEntries(Object.entries(snapshot).reverse())));
  value.payload.values[HOME].value = 'tampered.Home'; assert.throws(() => verifyEnvelope(value, { allowMock: true }), /checksum/);
});
test('saves and verifies two exclusive copies with exact types, refusing overwrites or same-directory aliases', async t => {
  const [a, b] = await directories(t); const snapshot = fixture(); const saved = await saveCopies(snapshot, a, b, { allowMock: true });
  assert.equal(saved.verified, true); assert.equal(canonical(saved.payload), canonical(snapshot));
  await assert.rejects(saveCopies(snapshot, a, b, { allowMock: true }), /EEXIST/);
  await assert.rejects(verifyCopies(a, path.join(path.dirname(a), 'other.json'), { allowMock: true }), /distinct/);
  const value = JSON.parse(await readFile(b, 'utf8')); value.payload.values[HOME].value = 'bad.Home'; await writeFile(b, JSON.stringify(value)); await assert.rejects(verifyCopies(a, b, { allowMock: true }), /checksum/);
});
test('interrupted second-copy creation cannot be reported as a verified pair', async t => {
  const [a, b] = await directories(t); await writeFile(b, 'unrelated-original');
  await assert.rejects(saveCopies(fixture(), a, b, { allowMock: true }), /EEXIST/); assert.equal(await readFile(b, 'utf8'), 'unrelated-original');
  await assert.rejects(verifyCopies(a, b, { allowMock: true }));
});
test('rejects hard-linked recovery copies as one underlying file', async t => {
  const [a, b] = await directories(t); await writeFile(a, canonical(envelope(fixture(), { allowMock: true }))); await link(a, b);
  await assert.rejects(verifyCopies(a, b, { allowMock: true }), /hard link/);
});
test('restore simulation restores only Home ownership and Home ID with FrameOS absent and no startup writes', async () => {
  const original = fixture(), current = changed(original), adapter = mock(current), journal = [];
  current.bootEligibility = { appId: TARGET.appId, status: 'unverified', supported: null };
  const result = await simulateRestore(original, adapter, { journal: async record => { journal.push(record); } });
  assert.equal(result.state, 'mock-complete'); assert.deepEqual(adapter.writes, [MAIN, HOME]); assert.deepEqual(current.values, original.values); assert.equal(adapter.frameosInstalled, false);
  assert.equal(journal[0].entries[0].state, 'intent'); assert.ok(journal.every(record => record.mockOnly));
});
test('firmware changes or unexpected owners/startup values prevent restore before any write', async () => {
  for (const mutation of [s => { s.identity.firmware = 'T-KSU2FUABC-9999.0'; }, s => { s.values[HOME].value = 'third.party.Home'; }, s => { s.values['db/menu/smart_hub/ontvsetting/auto_start'].value = 1; }, s => { s.capture.runtimeVerified = false; }]) {
    const original = fixture(), state = changed(original); mutation(state); const adapter = mock(state);
    await assert.rejects(simulateRestore(original, adapter)); assert.equal(adapter.writes.length, 0);
  }
});
test('partial apply states generate only the necessary restore step', () => {
  const original = fixture(), state = changed(original); state.values[HOME] = structuredClone(original.values[HOME]);
  assert.deepEqual(restorePlan(original, state, { allowMock: true }).steps.map(step => step.key), [MAIN]);
});
test('a different physical device or owner-entered firmware cannot inherit a baseline at the same IP/model', async () => {
  const original = fixture(), state = changed(original); state.capture.deviceFingerprint = 'c'.repeat(64); const adapter = mock(state);
  await assert.rejects(simulateRestore(original, adapter), /fingerprint mismatch/); assert.equal(adapter.writes.length, 0);
  const claimed = fixture(); claimed.kind = 'device-read'; claimed.capture.firmwareSource = 'owner-reported'; assert.throws(() => validateSnapshot(claimed), /firmware reading/);
});
test('connection failure during a partial restoration preserves uncertainty and does not repeat writes', async () => {
  const original = fixture(), state = changed(original); const adapter = mock(state);
  adapter.write = async (key, value) => { adapter.writes.push(key); state.values[key] = value; if (key === HOME) throw Error('connection interrupted after write'); };
  let failure; try { await simulateRestore(original, adapter); } catch (error) { failure = error; }
  assert.equal(failure.journal.state, 'stopped-requires-fresh-inspection'); assert.equal(failure.journal.entries[1].state, 'sent-unconfirmed'); assert.deepEqual(adapter.writes, [MAIN, HOME]);
});
test('changed firmware between readbacks aborts further operations', async () => {
  const original = fixture(), state = changed(original), adapter = mock(state);
  adapter.write = async (key, value) => { adapter.writes.push(key); state.values[key] = value; state.identity.firmware = 'changed'; };
  await assert.rejects(simulateRestore(original, adapter), /firmware/); assert.deepEqual(adapter.writes, [MAIN]);
});
test('failed journal persistence stops before writes; stalled writes are bounded and never replayed', async () => {
  const original = fixture(), first = mock(changed(original));
  await assert.rejects(simulateRestore(original, first, { journal: async () => { throw Error('disk full'); } }), /disk full/); assert.equal(first.writes.length, 0);
  const second = mock(changed(original)); second.write = async key => { second.writes.push(key); return new Promise(() => {}); };
  await assert.rejects(simulateRestore(original, second, { timeoutMs: 10 }), /timed out/); assert.deepEqual(second.writes, [MAIN]);
});
test('readback failure after a write is not a successful restore', async () => {
  const original = fixture(), state = changed(original), adapter = mock(state);
  adapter.write = async key => { adapter.writes.push(key); }; await assert.rejects(simulateRestore(original, adapter), /readback differs/); assert.deepEqual(adapter.writes, [MAIN]);
});
test('no live restore/apply CLI or transport exists, even with valid-looking input', async () => {
  await assert.rejects(main(['restore', '--approve']), /BLOCKED/); await assert.rejects(main(['apply']), /BLOCKED/);
  await assert.rejects(simulateRestore(fixture(), { kind: 'live' }), /mock-only/);
  const readiness = trialReadiness(fixture(), { physicalRestoreVerified: true, frameosClosed: true, requiresFrameos: false, baselineSha256: digest(fixture()), firmware: TARGET.firmware });
  assert.equal(readiness.ready, false); assert.ok(readiness.blockers.some(reason => /transport/.test(reason)));
});
