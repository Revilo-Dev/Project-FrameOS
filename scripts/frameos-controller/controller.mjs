import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runProcess } from '../tv.mjs';
import { atomicWrite } from '../tv-stage.mjs';

export const TARGET = Object.freeze({ serial: '192.168.0.23:26101', model: 'QA32LS03TBWXXY', firmware: 'T-KSU2FUABC-2743.0', tizen: '5.5', architecture: 'armv7', appId: 'TdjFk7yyVS.frameos', packageId: 'TdjFk7yyVS' });
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaults = { sdb: 'C:\\samsungdev\\tizen-studio\\tools\\sdb.exe', tizen: 'C:\\samsungdev\\tizen-studio\\tools\\ide\\bin\\tizen.bat' };
export function capabilities(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([a-z_]+):([^\r\n]+)$/.exec(line.trim());
    if (!match) continue;
    if (Object.hasOwn(values, match[1])) throw Error(`Ambiguous capability: ${match[1]}`);
    values[match[1]] = match[2];
  }
  if (!values.platform_version || !values.cpu_arch) throw Error('Capability response is incomplete; platform/architecture are unknown.');
  return values;
}
function device(output) {
  const matches = output.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => parts[0] === TARGET.serial);
  if (matches.length > 1) throw Error('Ambiguous target in SDB inventory.');
  if (!matches.length) return { connected: false, state: 'not-listed' };
  const [, state, model] = matches[0];
  if (model !== TARGET.model) throw Error(`Device model mismatch; expected ${TARGET.model}.`);
  return { connected: state === 'device', state, model };
}
const clean = value => String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[^\S\r\n]+/g, ' ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 12000);
export function createController({ run = runProcess, logRoot = path.join(root, 'artifacts/frameos-controller'), tools = defaults } = {}) {
  async function command(executable, args, timeout) {
    const result = await run(executable, args, { cwd: root, timeout });
    if (result.code !== 0) throw Error(`SDK command failed (${result.code}): ${clean(result.output)}`);
    return clean(result.output);
  }
  async function status() {
    const inventory = await command(tools.sdb, ['devices'], 8000);
    return { target: TARGET, ...device(inventory), installedApp: 'Not queried', runningApp: 'Unknown', foregroundApp: 'Unknown', firmware: { expected: TARGET.firmware, live: null }, capturedAt: new Date().toISOString() };
  }
  async function diagnose({ connect = false } = {}) {
    if (connect) await command(tools.sdb, ['connect', TARGET.serial], 10000);
    const result = await status();
    if (!result.connected) return { ...result, hint: 'Run Diagnostics with explicit Connect to establish the developer connection. No power/launch is sent.' };
    const output = await command(tools.sdb, ['-s', TARGET.serial, 'capability'], 8000);
    return { ...result, capabilities: capabilities(output), capabilityOutput: output };
  }
  async function manualLaunch({ confirmed = false } = {}) {
    if (!confirmed) throw Error('Manual launch requires --confirm-launch. Confirm the TV is available and you are watching first.');
    await mkdir(logRoot, { recursive: true });
    const lockPath = path.join(logRoot, 'launch.lock');
    let lock;
    try { lock = await open(lockPath, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw Error('A launch is active or was interrupted. Inspect launch.lock and logs; no retry was sent.'); throw error; }
    const id = randomUUID(), file = path.join(logRoot, `launch-${id}.json`);
    const record = { id, target: TARGET, startedAt: new Date().toISOString(), launchAttempts: 0, state: 'preflight', cli: null, visible: { status: 'unconfirmed' } };
    let keepLock = false;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, id, startedAt: record.startedAt }));
      const inspected = await diagnose();
      if (!inspected.connected) throw Error('The exact TV is not connected. No launch sent.');
      if (inspected.capabilities.platform_version !== TARGET.tizen || inspected.capabilities.cpu_arch !== TARGET.architecture) throw Error('TV platform/architecture changed. Stop for compatibility review.');
      record.launchAttempts = 1; record.state = 'request-sent';
      // Durable intent precedes the single command. No reconnect/retry path follows it.
      await writeFile(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
      const response = await run(tools.tizen, ['run', '-s', TARGET.serial, '-p', TARGET.appId], { cwd: root, timeout: 20000 });
      record.cli = { code: response.code, output: clean(response.output) };
      record.state = response.code === 0 && /successfully launched/i.test(response.output) && !/\b(error|failed|failure)\b/i.test(response.output) ? 'CLI accepted; display unconfirmed' : 'Launch failed or result unrecognized; no retry';
      record.completedAt = new Date().toISOString();
      await atomicWrite(file, JSON.stringify(record, null, 2) + '\n');
      return { ...record, logPath: file };
    } catch (error) {
      record.state = record.launchAttempts ? 'Launch outcome uncertain; do not automatically retry' : 'Preflight failed; no launch sent';
      record.error = clean(error.message); record.completedAt = new Date().toISOString();
      keepLock = record.launchAttempts > 0;
      await atomicWrite(file, JSON.stringify(record, null, 2) + '\n');
      throw Error(`${record.state}: ${record.error}. Log: ${file}`);
    } finally { await lock.close(); if (!keepLock) await unlink(lockPath); }
  }
  return { status, diagnose, manualLaunch };
}

export async function main(args = process.argv.slice(2)) {
  const controller = createController();
  const [operation, ...flags] = args;
  if (!['status', 'diagnose', 'launch'].includes(operation) || flags.some(flag => !['--connect', '--confirm-launch', '--json'].includes(flag)) || new Set(flags).size !== flags.length || (flags.includes('--connect') && operation !== 'diagnose') || (flags.includes('--confirm-launch') && operation !== 'launch')) throw Error('Usage: controller.mjs status | diagnose [--connect] | launch --confirm-launch [--json]');
  const result = operation === 'status' ? await controller.status() : operation === 'diagnose' ? await controller.diagnose({ connect: flags.includes('--connect') }) : await controller.manualLaunch({ confirmed: flags.includes('--confirm-launch') });
  console.log(JSON.stringify(result, null, 2));
  if (operation === 'launch' && !result.state.startsWith('CLI accepted')) process.exitCode = 1;
  return result;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
