import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createController } from '../frameos-controller/controller.mjs';
import { TARGET, FIELDS, LIBRARIES, REFERENCES } from './spec.mjs';
import { restorePlan, saveCopies, trialReadiness, verifyCopies, verifyEnvelope } from './recovery.mjs';

async function json(file) {
  const content = await readFile(file, 'utf8'); if (Buffer.byteLength(content) > 65536) throw Error('Input exceeds 64 KiB.');
  return JSON.parse(content.replace(/^\uFEFF/, ''));
}
export async function inspectNative({ controller = createController(), historical = true } = {}) {
  const device = await controller.diagnose();
  const match = device.connected && device.capabilities?.platform_version === TARGET.tizen && device.capabilities?.cpu_arch === TARGET.architecture;
  const reason = device.capabilities?.intershell_support === 'disabled' ? 'Device advertises no interactive shell. Earlier ordinary shell reads were empty and protected file pulls were refused. No supported native-read backend is available; do not try command workarounds.' : 'No reviewed read-only native adapter exists for this exact firmware; shell availability alone does not establish native permissions or ABI.';
  return {
    format: 'frameos.native-home.inspection', version: 1, capturedAt: new Date().toISOString(), target: TARGET,
    connected: device.connected, platformArchitectureMatch: !!match, capabilities: device.capabilities || null,
    firmware: { expected: TARGET.firmware, source: 'Owner About-page readout', deviceReadVerified: false },
    runtime: { verified: false, bits: null, framework: null, uid: null, reason: 'Debugger capability is not runtime evidence.' },
    libraries: Object.fromEntries(Object.entries(LIBRARIES).map(([library, exports]) => [library, { status: 'unverified', exports: Object.fromEntries(exports.map(symbol => [symbol, 'unverified'])) }])),
    values: Object.fromEntries(Object.entries(FIELDS).map(([key, type]) => [key, { type, state: 'unread', value: null, reason }])),
    bootEligibility: { appId: TARGET.appId, status: 'unverified', supported: null },
    historicalRestrictions: historical ? ['artifacts/home-feasibility/read-only-shell.json', 'artifacts/home-feasibility/firmware-file.json', 'artifacts/home-feasibility/os-file.json', 'artifacts/home-feasibility/native-library-list.json'] : [],
    references: REFERENCES, nativeHelperCreated: false, nativeWrites: 0,
    recovery: { viableOnDevice: false, baselineAvailable: false, independentRestoreVerified: false },
    trial: trialReadiness(null, null), blocker: reason,
  };
}
export async function main(args = process.argv.slice(2)) {
  const [command, ...files] = args;
  let result;
  if (command === 'inspect' && files.length === 0) result = await inspectNative();
  else if (command === 'verify-baseline' && files.length === 1) { const payload = verifyEnvelope(await json(files[0])); result = { validFormatAndChecksum: true, identity: payload.identity, deviceProvenanceVerified: false, liveRestorationAvailable: false }; }
  else if (command === 'save-baseline' && files.length === 3) result = await saveCopies(await json(files[0]), ...files.slice(1));
  else if (command === 'restore-plan' && files.length === 3) { const baseline = await verifyCopies(files[0], files[1]); result = { ...restorePlan(baseline.payload, await json(files[2])), copies: baseline.copies, warning: 'Offline plan only. Imported JSON does not prove native reads or recovery. No execution transport exists.' }; }
  else if (command === 'restore' || command === 'apply') throw Error('BLOCKED: native writes are unavailable. No reviewed live transport, verified recovery or native-write approval exists. No TV command was sent.');
  else throw Error('Usage: cli.mjs inspect | verify-baseline <envelope.json> | save-baseline <captured-snapshot.json> <absolute-copy1> <absolute-copy2> | restore-plan <copy1> <copy2> <current-snapshot.json>. There is no live apply/restore command.');
  console.log(JSON.stringify(result, null, 2)); return result;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
