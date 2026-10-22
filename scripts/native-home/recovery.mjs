import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TARGET, MAIN, HOME, FIELDS } from './spec.mjs';

const fail = message => { throw Error(message); };
export const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\0') !== [...expected].sort().join('\0')) fail(`Partial/unknown ${label} fields.`);
};
export function assertIdentity(identity, expected = TARGET) {
  exactKeys(identity, Object.keys(TARGET), 'identity');
  for (const key of Object.keys(TARGET)) if (identity[key] !== expected[key]) fail(`Device ${key} mismatch; stop for review.`);
}
export function validateSnapshot(snapshot, { allowMock = false } = {}) {
  if (snapshot?.format !== 'frameos.native-home.snapshot' || snapshot.version !== 1 || !['device-read', 'mock'].includes(snapshot.kind)) fail('Unsupported native snapshot format/version.');
  if (snapshot.kind === 'mock' && !allowMock) fail('Mock data cannot be used as a device baseline.');
  assertIdentity(snapshot.identity);
  if (!Number.isFinite(Date.parse(snapshot.capturedAt)) || !snapshot.capture || snapshot.capture.readOnly !== true || typeof snapshot.capture.method !== 'string' || !snapshot.capture.method || !/^[a-f\d]{64}$/.test(snapshot.capture.rawEvidenceSha256 || '')) fail('Missing capture provenance.');
  if (!/^[a-f\d]{64}$/.test(snapshot.capture.deviceFingerprint || '') || snapshot.capture.firmwareSource !== (snapshot.kind === 'mock' ? 'mock' : 'permitted-device-read')) fail('A stable device fingerprint and permitted live firmware reading are required; IP/model or an owner-entered firmware string are insufficient for native recovery.');
  exactKeys(snapshot.values, Object.keys(FIELDS), 'native value');
  for (const [key, type] of Object.entries(FIELDS)) {
    const field = snapshot.values[key];
    exactKeys(field, ['type', 'state', 'value'], key);
    if (field.type !== type || field.state !== 'value') fail(`Native read incomplete/absent/ambiguous: ${key}. Never substitute a default.`);
    if (type === 'int' ? !Number.isInteger(field.value) || field.value < -2147483648 || field.value > 2147483647 : typeof field.value !== 'string' || field.value.length > 4096 || /[\x00-\x1f]/.test(field.value)) fail(`Invalid typed value: ${key}.`);
  }
  for (const key of [MAIN, HOME]) if (!/^[a-z\d][a-z\d_.-]{0,255}$/i.test(snapshot.values[key].value)) fail(`Original ${key} is not an unambiguous app ID.`);
  const boot = snapshot.bootEligibility;
  if (!boot || boot.appId !== TARGET.appId || !['verified', 'unverified'].includes(boot.status) || (boot.status === 'verified' && typeof boot.supported !== 'boolean')) fail('Invalid/missing boot eligibility record.');
  return structuredClone(snapshot);
}
export function envelope(snapshot, options) {
  const payload = validateSnapshot(snapshot, options);
  return { format: 'frameos.native-home.baseline', version: 1, sha256: digest(payload), payload };
}
export function verifyEnvelope(value, options) {
  exactKeys(value, ['format', 'version', 'sha256', 'payload'], 'baseline envelope');
  if (value.format !== 'frameos.native-home.baseline' || value.version !== 1 || value.sha256 !== digest(value.payload)) fail('Baseline checksum/format mismatch.');
  return validateSnapshot(value.payload, options);
}
async function location(file) {
  if (!path.isAbsolute(file)) fail('Use absolute PC paths for recovery copies.');
  const parent = await realpath(path.dirname(file));
  try { const info = await lstat(file); if (info.isSymbolicLink() || info.nlink > 1) fail('Recovery copy cannot be a symlink or hard link.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return path.join(parent, path.basename(file));
}
async function distinctCopies(first, second) {
  const files = await Promise.all([location(first), location(second)]);
  if (files[0].toLowerCase() === files[1].toLowerCase() || path.dirname(files[0]).toLowerCase() === path.dirname(files[1]).toLowerCase()) fail('Recovery copies must be in two distinct PC directories.');
  return files;
}
async function readEnvelope(file) {
  const content = await readFile(file, 'utf8');
  if (Buffer.byteLength(content) > 65536) fail('Recovery record exceeds 64 KiB.');
  return JSON.parse(content.replace(/^\uFEFF/, ''));
}
export async function saveCopies(snapshot, first, second, options) {
  const data = envelope(snapshot, options), files = await distinctCopies(first, second);
  for (const file of files) {
    const handle = await open(file, 'wx');
    try { await handle.writeFile(canonical(data) + '\n'); await handle.sync(); } finally { await handle.close(); }
    const readback = await readEnvelope(file); verifyEnvelope(readback, options);
    if (canonical(readback) !== canonical(data)) fail('Recovery copy readback mismatch.');
  }
  // A failure leaves any first copy intact but does not produce a verified pair.
  return verifyCopies(first, second, options);
}
export async function verifyCopies(first, second, options) {
  const files = await distinctCopies(first, second), values = await Promise.all(files.map(readEnvelope));
  for (const value of values) verifyEnvelope(value, options);
  if (canonical(values[0]) !== canonical(values[1])) fail('Recovery copies disagree.');
  return { payload: values[0].payload, sha256: values[0].sha256, copies: files, verified: true, scope: 'PC schema/checksum/readback only; device provenance and physical recovery are not established by importing JSON.' };
}
const equal = (left, right) => canonical(left) === canonical(right);
export function restorePlan(baseline, current, options) {
  baseline = validateSnapshot(baseline, options); current = validateSnapshot(current, options);
  assertIdentity(current.identity, baseline.identity);
  if (baseline.capture.deviceFingerprint !== current.capture.deviceFingerprint) fail('Stable device fingerprint mismatch; the same IP/model is not sufficient.');
  if (baseline.kind !== current.kind) fail('Cannot mix mock and device snapshots.');
  if (baseline.capture.runtimeVerified !== true || baseline.capture.abiVerified !== true || current.capture.runtimeVerified !== true || current.capture.abiVerified !== true) fail('Runtime/ABI verification missing; no restore plan.');
  for (const key of Object.keys(FIELDS).filter(key => ![MAIN, HOME].includes(key))) if (!equal(baseline.values[key], current.values[key])) fail(`Unexpected startup/preference change: ${key}; Home-only recovery must not overwrite it.`);
  const steps = [];
  for (const key of [MAIN, HOME]) {
    if (![baseline.values[key].value, TARGET.appId].includes(current.values[key].value)) fail(`Unexpected Home owner/value: ${key}; refuse to overwrite a third-party change.`);
    if (!equal(baseline.values[key], current.values[key])) steps.push({ key, expectedBefore: current.values[key], restore: baseline.values[key] });
  }
  return { format: 'frameos.native-home.restore-plan', version: 1, baselineSha256: digest(baseline), target: baseline.identity, steps, startupWrites: 0, frameosRequired: false, executableOnTV: false };
}
/** Exercises the restore algorithm only against an explicitly mocked transport.
 * No production writer, helper loader, command transport or CLI write switch exists. */
export async function simulateRestore(baseline, adapter, { journal = async () => {}, timeoutMs = 1000 } = {}) {
  if (adapter.kind !== 'mock' || baseline.kind !== 'mock') fail('Restore execution is mock-only. Live native writes are not implemented/authorized.');
  const bounded = work => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Connection/operation timed out; outcome may be uncertain.')), timeoutMs);
    Promise.resolve().then(work).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
  const log = { state: 'preflight', mockOnly: true, baselineSha256: digest(baseline), entries: [] };
  try {
    const first = await bounded(() => adapter.read());
    const plan = restorePlan(baseline, first, { allowMock: true });
    for (const step of plan.steps) {
      const live = await bounded(() => adapter.read());
      restorePlan(baseline, live, { allowMock: true });
      if (!equal(live.values[step.key], step.expectedBefore)) fail('State changed since planning; stop without replay.');
      const entry = { key: step.key, state: 'intent', restore: step.restore }; log.entries.push(entry);
      await bounded(() => journal(structuredClone(log)));
      entry.state = 'sent-unconfirmed';
      await bounded(() => adapter.write(step.key, structuredClone(step.restore)));
      const readback = await bounded(() => adapter.read());
      const remaining = restorePlan(baseline, readback, { allowMock: true });
      if (!equal(readback.values[step.key], step.restore)) fail('Restore readback differs; stop.');
      entry.state = 'verified'; log.remainingSteps = remaining.steps.length;
      await bounded(() => journal(structuredClone(log)));
    }
    const final = await bounded(() => adapter.read());
    if (restorePlan(baseline, final, { allowMock: true }).steps.length) fail('Final restoration readback incomplete.');
    log.state = 'mock-complete'; await bounded(() => journal(structuredClone(log))); return log;
  } catch (error) { log.state = 'stopped-requires-fresh-inspection'; log.error = error.message; try { await bounded(() => journal(structuredClone(log))); } catch { /* No further native action on journal failure. */ } const failure = Error(error.message); failure.journal = log; throw failure; }
}
export function trialReadiness(snapshot, recoveryEvidence) {
  const blockers = [];
  const baselineHash = snapshot ? digest(snapshot) : null;
  try { validateSnapshot(snapshot); } catch (error) { blockers.push(error.message); }
  if (snapshot?.capture?.runtimeVerified !== true || snapshot?.capture?.abiVerified !== true) blockers.push('Exact-firmware runtime/native ABI and permissions remain unverified.');
  if (snapshot?.bootEligibility?.status !== 'verified' || snapshot?.bootEligibility?.supported !== true) blockers.push('FrameOS boot eligibility is not verified.');
  if (!recoveryEvidence?.physicalRestoreVerified || recoveryEvidence?.frameosClosed !== true || recoveryEvidence?.requiresFrameos !== false || recoveryEvidence?.baselineSha256 !== baselineHash || recoveryEvidence?.firmware !== TARGET.firmware) blockers.push('Independent exact-firmware restoration has not been physically verified.');
  blockers.push('No reviewed live native transport is registered. Separate native-write approval and implementation are required.');
  return { ready: false, blockers };
}
