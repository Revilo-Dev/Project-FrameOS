import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertIdentity } from './recovery.mjs';
import { TARGET, FIELDS, LIBRARIES } from './spec.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = data => createHash('sha256').update(data).digest('hex');
export const REVIEWED_SOURCES = Object.freeze({
  arn0: { revision: 'b35c292e5bc63648cb8fef576bf5eacd9ea488d1', runtime: 'netcoreapp3.1', firmware: 'T-PTMDEUC-1720.7', publicRunnerSupplied: false },
  cleanFrame: { revision: 'fa537d1892b71d2de2bf94c24cbff3812e9f70d5', runtime: 'net6.0', firmware: 'T-PTMDUABC-0090-2130.0', transport: 'package-name command injection; excluded by owner' },
  tizen55Launcher: { repository: 'djwalks/B1ackha7TV', revision: 'aa7dfdd7e69a83e87c64ab98acc3ee3edb8e10a1', nativeHomeImplementation: false },
  launcherGuide: { repository: 'rad10wave/tizen-custom-launcher-guide', revision: 'b31a454b3f3caa05de04fe2c1b319fdd1b6278a5', transport: 'documents the same excluded package-name workaround' },
  samsungDotnetPolicy: 'https://developer.samsung.com/smarttv/develop/faq/tizen-net-tv.html#q3',
  samsungPlatformTable: 'https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html',
});

export function inspectWebSdk(xml, productXml) {
  const body = xml.match(/\binterface ApplicationManager\s*\{([\s\S]*?)\n\s*\};/)?.[1];
  if (!body) throw Error('ApplicationManager interface missing; SDK inspection incomplete.');
  const declarations = body.replace(/<[^>]+>/g, '');
  const methods = [...new Set([...declarations.matchAll(/^\s*[\w?\[\]]+\s+(\w+)\s*\(/gm)].map(match => match[1]))].sort();
  for (const name of ['getAppsInfo', 'launch', 'findAppControl', 'launchAppControl']) {
    if (!methods.includes(name)) throw Error(`ApplicationManager.${name} missing; SDK inspection incomplete.`);
  }
  const combined = xml + '\n' + productXml;
  return {
    status: 'inspected', scope: 'Local Tizen 5.5 public Web SDK descriptions; not TV ELF exports or native permissions.',
    applicationManagerMethods: methods,
    referenceNativeSymbols: Object.fromEntries(Object.values(LIBRARIES).flat().map(symbol => [symbol, {
      mentionedInReviewedWebSdk: combined.includes(symbol), exportedOnTV: 'unverified',
    }])),
    nativeFields: Object.fromEntries(Object.keys(FIELDS).map(key => [key, {
      mentionedInReviewedWebSdk: combined.includes(key), valueOnTV: 'unread',
    }])),
  };
}

export function assessCompatibility({ sdk, priorInspection, evidence = [] }) {
  if (priorInspection != null) {
    if (priorInspection.format !== 'frameos.native-home.inspection' || priorInspection.version !== 1) throw Error('Prior inspection format/version is unsupported.');
    assertIdentity(priorInspection.target);
  }
  return {
    format: 'frameos.native-home.compatibility', version: 1, assessedAt: new Date().toISOString(), target: TARGET,
    decision: 'blocked', scope: 'Offline source/SDK review and explicitly historical TV evidence. No TV query was performed.',
    sdk, evidence, reviewedSources: REVIEWED_SOURCES,
    priorDeviceEvidence: {
      available: priorInspection != null, capturedAt: priorInspection?.capturedAt ?? null,
      capabilities: priorInspection?.capabilities ?? null,
      liveFirmwareVerified: false, runtimeVerified: false, nativeExportsVerified: false,
      warning: 'Capabilities describe the earlier capture, not the current TV state. Debugger support does not identify a runtime.',
    },
    nativeValues: Object.fromEntries(Object.entries(FIELDS).map(([key, type]) => [key, { type, state: 'unread', value: null }])),
    bootEligibility: { appId: TARGET.appId, status: 'unverified', supported: null },
    blockers: [
      { id: 'permitted-native-execution', reason: 'No permitted exact-firmware execution route to the required native calls has been established. Prior SDB intershell support was disabled and the library pull was refused; neither check was repeated.' },
      { id: 'public-dotnet-interop', reason: 'Samsung documents that app DllImport into framework native libraries is restricted; signed app-local native libraries require Seller Office partner access. This supplies no approved AUL/vconf/app-operation route for the present developer app.' },
      { id: 'runtime-abi-permissions', reason: 'The published 2020 .NET 2.1 baseline does not establish the installed runtime, SDK-user execution identity, native exports or permissions. Retargeting 3.1/6.0 helpers would not resolve access.' },
      { id: 'original-values', reason: 'No genuine complete typed original main/Home/startup/boot-backup/first-screen/autostart baseline exists.' },
      { id: 'boot-eligibility', reason: 'The native eligibility result for TdjFk7yyVS.frameos has not been obtained.' },
      { id: 'independent-recovery', reason: 'No permitted independent native restore transport or physical restore/readback demonstration exists. Mock recovery is not physical recovery.' },
    ],
    nativeQueryBuildSupported: false, liveQueryAvailable: false, liveApplyAvailable: false, liveRestoreAvailable: false,
    proposedWrites: null, originalBaselineCreated: false,
    physicalActivity: { queries: 0, uploads: 0, launches: 0, nativeWrites: 0, powerOperations: 0 },
    nextRequirement: 'A Samsung-authorized interface/execution entitlement for these native reads and exact-value restoration on this firmware. Ordinary staging permission alone cannot establish that interface. Any later temporary staging still needs separate owner approval.',
  };
}

/** Offline only: no SDB, process execution, network requests, uploads or adapter loading. */
export async function inspectCompatibility({ sdkRoot = 'C:/samsungdev/tizen-studio', evidenceDirectory = path.join(repository, 'artifacts/native-home-phase1') } = {}) {
  const evidence = [];
  const input = async file => {
    const data = await readFile(file);
    if (data.length > 32 * 1024 * 1024) throw Error('Inspection input exceeds 32 MiB.');
    evidence.push({ file: path.resolve(file), bytes: data.length, sha256: sha256(data) });
    return data.toString('utf8').replace(/^\uFEFF/, '');
  };
  const historicalJson = async name => {
    try { return JSON.parse(await input(path.join(evidenceDirectory, name))); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const priorInspection = await historicalJson('inspection.json');
  const libraryPull = await historicalJson('native-library-pull.json');
  let sdk;
  try {
    const xml = await input(path.join(sdkRoot, 'platforms/tizen-5.5/tv/widlprocxmls/tizen.widlprocxml'));
    const product = await input(path.join(sdkRoot, 'platforms/tizen-5.5/tv-samsung/widlprocxmls/product.widlprocxml'));
    sdk = inspectWebSdk(xml, product);
  } catch (error) { sdk = { status: 'unavailable', error: error.message, scope: 'Local SDK only; no native compatibility inferred.' }; }
  const report = assessCompatibility({ sdk, priorInspection, evidence });
  report.priorDeviceEvidence.libraryPull = libraryPull ? { capturedAt: libraryPull.capturedAt, result: libraryPull.result, verifiedElf: libraryPull.verifiedElf } : null;
  return report;
}
