import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createController, capabilities, TARGET } from './controller.mjs';
import { runProcess } from '../tv.mjs';
const base = fileURLToPath(new URL('../../artifacts/native-home-phase1/controller-tests/', import.meta.url));
const inventory = `List of devices attached\n${TARGET.serial}\tdevice\t${TARGET.model}`;
const caps = 'platform_version:5.5\ncpu_arch:armv7\nintershell_support:disabled\nnetcoredbg_support:enabled';
async function fixture(t, handle) {
  await mkdir(base, { recursive: true }); const directory = await mkdtemp(path.join(base, 'run-'));
  t.after(async () => { assert.ok(path.resolve(directory).startsWith(path.resolve(base) + path.sep)); await rm(directory, { recursive: true }); });
  const calls = [];
  const controller = createController({ logRoot: directory, tools: { sdb: 'sdb.exe', tizen: 'tizen.bat' }, run: async (executable, args, options) => {
    calls.push({ executable, args, timeout: options.timeout });
    const value = await handle?.(args, calls.length);
    if (value) return value;
    return { code: 0, output: args[0] === 'devices' ? inventory : args.includes('capability') ? caps : 'Tizen application is successfully launched.' };
  } }); return { controller, directory, calls };
}
test('status and diagnostics are one-shot queries and never claim foreground, firmware or installed-app evidence', async t => {
  const f = await fixture(t); const state = await f.controller.status();
  assert.equal(state.connected, true); assert.equal(state.foregroundApp, 'Unknown'); assert.equal(state.firmware.live, null);
  const diagnosed = await f.controller.diagnose(); assert.equal(diagnosed.capabilities.intershell_support, 'disabled');
  assert.ok(f.calls.every(call => call.args[0] === 'devices' || call.args.includes('capability')));
});
test('requires explicit launch intent and exact device model/platform before any application command', async t => {
  const f = await fixture(t); await assert.rejects(f.controller.manualLaunch(), /confirm-launch/); assert.equal(f.calls.length, 0);
  for (const replacement of ['other-model', 'offline', 'wrong-platform']) {
    const g = await fixture(t, args => args[0] === 'devices' ? { code: 0, output: replacement === 'offline' ? 'List of devices attached' : inventory.replace(TARGET.model, replacement === 'other-model' ? 'DifferentTV' : TARGET.model) } : args.includes('capability') && replacement === 'wrong-platform' ? { code: 0, output: caps.replace('5.5', '9.0') } : null);
    await assert.rejects(g.controller.manualLaunch({ confirmed: true })); assert.equal(g.calls.filter(call => call.args[0] === 'run').length, 0);
  }
});
test('launch sends the full app ID once with bounded timeouts, retains readable evidence and leaves display unconfirmed', async t => {
  const f = await fixture(t); const result = await f.controller.manualLaunch({ confirmed: true });
  assert.equal(result.launchAttempts, 1); assert.equal(result.visible.status, 'unconfirmed'); assert.match(result.state, /CLI accepted/);
  const launch = f.calls.find(call => call.args[0] === 'run'); assert.deepEqual(launch.args, ['run', '-s', TARGET.serial, '-p', TARGET.appId]); assert.equal(launch.timeout, 20000);
  assert.ok(f.calls.every(call => call.timeout <= 20000)); assert.equal(JSON.parse(await readFile(result.logPath, 'utf8')).cli.code, 0);
});
test('failed or unrecognized CLI replies do not trigger fallback launches', async t => {
  for (const response of [{ code: 1, output: 'SecurityError' }, { code: 0, output: 'closed' }]) {
    const f = await fixture(t, args => args[0] === 'run' ? response : null); const result = await f.controller.manualLaunch({ confirmed: true });
    assert.match(result.state, /failed or result unrecognized/); assert.equal(f.calls.filter(call => call.args[0] === 'run').length, 1);
  }
});
test('network interruption after send is uncertain and leaves a lock preventing automatic or accidental replay', async t => {
  const f = await fixture(t, args => { if (args[0] === 'run') throw Error('Connection reset'); });
  await assert.rejects(f.controller.manualLaunch({ confirmed: true }), /uncertain/);
  await assert.rejects(f.controller.manualLaunch({ confirmed: true }), /interrupted/);
  assert.equal(f.calls.filter(call => call.args[0] === 'run').length, 1);
  const log = (await readdir(f.directory)).find(file => file.startsWith('launch-'));
  assert.equal(JSON.parse(await readFile(path.join(f.directory, log), 'utf8')).launchAttempts, 1);
});
test('concurrent manual launches are serialized without sending a second request', async t => {
  let entered, release; const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture(t, async args => { if (args[0] === 'run') { entered(); return new Promise(resolve => { release = () => resolve({ code: 0, output: 'successfully launched' }); }); } });
  const first = f.controller.manualLaunch({ confirmed: true }); await ready;
  await assert.rejects(f.controller.manualLaunch({ confirmed: true }), /active/); release(); await first;
  assert.equal(f.calls.filter(call => call.args[0] === 'run').length, 1);
});
test('connect is explicit, diagnostic-only and never follows a launch failure', async t => {
  const f = await fixture(t); await f.controller.diagnose({ connect: true });
  assert.deepEqual(f.calls[0].args, ['connect', TARGET.serial]); assert.equal(f.calls.some(call => call.args[0] === 'run'), false);
});
test('ambiguous or incomplete capabilities are rejected instead of implying compatibility', () => {
  assert.throws(() => capabilities('cpu_arch:armv7'), /incomplete/);
  assert.throws(() => capabilities(caps + '\ncpu_arch:aarch64'), /Ambiguous/);
});
test('the shared Windows process runner actually terminates a stalled local child at its deadline', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeout: 100 }), /timed out/);
});
