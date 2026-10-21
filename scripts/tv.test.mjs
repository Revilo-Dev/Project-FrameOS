import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, pipeline, runProcess } from './tv.mjs';
import { listFiles, localPath, validateProduction } from './tv-assets.mjs';
import { digest, exists, snapshot, stageProject, withLock } from './tv-stage.mjs';
import { contentSecurityPolicy, createPackagingManifest, readOnlyPrivileges } from './tv-policy.mjs';
import { samsungRuntimeScript } from './samsung-runtime.mjs';

const scratch = path.resolve(fileURLToPath(new URL('../artifacts/tv-tests/', import.meta.url)));
const roots = [];
after(async () => {
  for (const root of roots) {
    const relative = path.relative(scratch, path.resolve(root));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await rm(root, { recursive: true, force: true });
  }
});

async function put(root, file, text = file) {
  const destination = path.join(root, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, text);
}

async function fixture() {
  const root = path.join(scratch, randomUUID()); roots.push(root);
  const project = path.join(root, 'original TV project');
  const dist = path.join(root, 'dist');
  const stateRoot = path.join(root, 'artifacts', 'tv');
  const config = { project, sdk: path.join(root, 'SDK with spaces'), serial: '192.168.0.23:26101', model: 'QA32LS03TBWXXY', profile: 'revilodev-frameos', referencePackage: 'original.wgt', authorSha256: 'a'.repeat(64) };
  const metadata = { appId: 'ExistingID.actualApp', packageId: 'ExistingID', version: '7.8.9', entry: 'index.html', resources: ['icon.png'], certificateCount: 2, activeProfile: 'another-profile', authorSha256: config.authorSha256, referenceAuthorSha256: config.authorSha256 };
  await put(project, 'config.xml', '<existing metadata="must remain byte-identical"/>');
  for (const file of ['icon.png', 'index.html', 'js/legacy.js', 'assets/unrelated.txt', '.sign/keep.txt', 'original.wgt', '__proto__']) await put(project, file, `original ${file}`);
  await put(dist, 'index.html', '<script data-src="./assets/app.js"></script>');
  await put(dist, 'assets/app.js', 'var wallpaper="./wallpapers/default.jpg";var css="body{background:url(./wallpapers/soft.jpg)}";');
  await put(dist, 'wallpapers/default.jpg'); await put(dist, 'wallpapers/soft.jpg');
  await put(dist, 'unused.svg');
  await put(config.sdk, 'tools/ide/bin/tizen.bat'); await put(config.sdk, 'tools/sdb.exe');
  return { root, project, dist, stateRoot, config, metadata };
}

async function stage(f, extra = {}) {
  return stageProject({ ...f, files: await validateProduction(f.dist), ...extra });
}

test('asset validation follows HTML, legacy entry, embedded CSS and runtime wallpapers; skips unused source art', async () => {
  const f = await fixture();
  assert.deepEqual(await validateProduction(f.dist), ['assets/app.js', 'index.html', 'wallpapers/default.jpg', 'wallpapers/soft.jpg']);
  await rm(path.join(f.dist, 'wallpapers/soft.jpg'));
  await assert.rejects(validateProduction(f.dist), /Missing referenced production asset/);
  for (const file of ['../outside', '/absolute', 'C:/absolute', 'assets\\bad.js', 'assets/../config.xml', 'assets/file.']) assert.throws(() => localPath(file));
});

test('asset validation includes Vite JSON.parse wallpaper catalogs and SystemJS-relative font URLs', async () => {
  const f = await fixture();
  const catalog = [{ src: './wallpapers/photo.jpg', thumbnail: './wallpapers/photo-thumb.jpg', ambient: './wallpapers/photo-soft.jpg' }];
  await put(f.dist, 'assets/app.js', `var catalog=JSON.parse(${JSON.stringify(JSON.stringify(catalog))});var font=new URL("fonts/clock.ttf",context.meta.url);`);
  for (const file of ['wallpapers/photo.jpg', 'wallpapers/photo-thumb.jpg', 'wallpapers/photo-soft.jpg', 'assets/fonts/clock.ttf']) await put(f.dist, file);
  assert.deepEqual(await validateProduction(f.dist), ['assets/app.js', 'assets/fonts/clock.ttf', 'index.html', 'wallpapers/photo-soft.jpg', 'wallpapers/photo-thumb.jpg', 'wallpapers/photo.jpg']);
  await rm(path.join(f.dist, 'wallpapers/photo-thumb.jpg'));
  await assert.rejects(validateProduction(f.dist), /Missing referenced production asset/);
});

test('only the exact Samsung runtime SDK script is exempt from packaged asset checks', async () => {
  const f = await fixture();
  await put(f.dist, 'index.html', `<script src="${samsungRuntimeScript}"></script><script src="./assets/app.js"></script>`);
  assert((await validateProduction(f.dist)).includes('assets/app.js'));
  for (const html of ['<script src="$WEBAPIS/webapis/other.js"></script>', `<img src="${samsungRuntimeScript}">`]) {
    await put(f.dist, 'index.html', html); await assert.rejects(validateProduction(f.dist), /Missing referenced production asset/);
  }
});

test('first stage makes a verified immutable full backup and preserves all non-frontend resources', async () => {
  const f = await fixture(); const before = await snapshot(f.project);
  const result = await stage(f);
  assert.deepEqual(await snapshot(result.backup), before);
  const after = await snapshot(f.project);
  for (const file of Object.keys(before).filter((name) => name !== 'index.html')) assert.equal(after[file], before[file]);
  assert.equal(await exists(path.join(f.project, 'unused.svg')), false);
  assert.equal(await exists(path.join(f.project, '.frameos')), false);
});

test('repeat staging is idempotent and only hash-tracked stale files are removed', async () => {
  const f = await fixture(); const first = await stage(f); const backup = await snapshot(first.backup);
  const repeated = await stage(f);
  assert.deepEqual(repeated.changed, []); assert.deepEqual(repeated.removed, []);
  await put(f.dist, 'assets/new.js', 'var image="./wallpapers/default.jpg";');
  await put(f.dist, 'index.html', '<script src="./assets/new.js"></script>');
  const updated = await stage(f);
  assert.deepEqual(updated.removed.sort(), ['assets/app.js', 'wallpapers/soft.jpg']);
  assert.equal(await exists(path.join(f.project, 'assets/unrelated.txt')), true);
  assert.deepEqual(await snapshot(first.backup), backup);
});

test('modified managed files and unrelated collisions are refused without deleting them', async () => {
  const f = await fixture(); await stage(f);
  await put(f.project, 'assets/app.js', 'user edit');
  await assert.rejects(stage(f), /edited outside the pipeline/);
  assert.equal(await readFile(path.join(f.project, 'assets/app.js'), 'utf8'), 'user edit');
  const other = await fixture(); await put(other.project, 'assets/app.js', 'unrelated');
  await assert.rejects(stage(other), /unrelated project file/);
  assert.equal(await exists(path.join(other.stateRoot, 'original.json')), false);
});

test('a partial staging failure rolls frontend files back and retains the original backup', async () => {
  const f = await fixture(); const before = await snapshot(f.project);
  await assert.rejects(stage(f, { onFile() { throw new Error('simulated disk failure'); } }), /simulated disk failure/);
  assert.deepEqual(await snapshot(f.project), before);
  assert.equal(await exists(path.join(f.stateRoot, 'pending.json')), false);
  assert.equal(await exists(path.join(f.stateRoot, 'original.json')), true);
  await stage(f);
});

test('corrupt ownership, missing backup and interrupted runs fail closed', async () => {
  const f = await fixture(); await stage(f);
  const ledger = path.join(f.stateRoot, 'managed.json');
  const record = JSON.parse(await readFile(ledger, 'utf8'));
  await writeFile(ledger, JSON.stringify({ ...record, files: { 'config.xml': 'a'.repeat(64) } }));
  await assert.rejects(stage(f), /Unapproved managed asset/);
  await writeFile(ledger, JSON.stringify(record));
  await rm(path.join(f.stateRoot, 'original.json'));
  await assert.rejects(stage(f), /Original backup record is missing/);
  await put(f.stateRoot, 'pending.json', '{}');
  await assert.rejects(stage(f), /previous stage was interrupted/);
});

test('a concurrent deployment lock prevents another writer', async () => {
  const f = await fixture();
  await withLock(f.stateRoot, async () => {
    await assert.rejects(withLock(f.stateRoot, () => assert.fail('must not run')), /Another pipeline may be running/);
  });
  assert.equal(await exists(path.join(f.stateRoot, 'deploy.lock')), false);
});

test('Windows batch invocation preserves tool and argument paths containing spaces', { skip: process.platform !== 'win32' }, async () => {
  const f = await fixture();
  const batch = 'tools/argument check.bat';
  await put(f.config.sdk, batch, '@echo off\r\nif not "%~1"=="value with spaces" exit /b 2\r\nif not "%~2"=="C:\\folder with spaces\\file.xml" exit /b 3\r\necho success\r\n');
  const result = await runProcess(path.join(f.config.sdk, batch), ['value with spaces', 'C:\\folder with spaces\\file.xml']);
  assert.equal(result.code, 0);
  assert.equal(result.output, 'success');
});

async function fakePipeline(f, failure) {
  const calls = [];
  const context = await createContext(f.root, {
    ...f, log() {},
    run: async () => { calls.push('vite-build'); return { code: failure === 'vite-build' ? 1 : 0, output: 'build result' }; },
    sdk: async (request) => {
      if (request.action === 'metadata') return f.metadata;
      if (request.action === 'archive') {
        calls.push('verify-package');
        return { verified: failure !== 'verify-package', authorSha256: failure === 'signed-author' ? 'b'.repeat(64) : f.config.authorSha256 };
      }
      const [command, ...args] = request.arguments; calls.push(command);
      if (command === failure) return { exitCode: 1, output: 'password=NEVER_PRINT_THIS' };
      if (command === 'devices') return { exitCode: 0, output: failure === 'offline' ? 'List of devices attached' : `${f.config.serial} device ${f.config.model}` };
      if (command === 'build-web') {
        const source = args[1]; const files = await listFiles(source);
        for (const relative of files) {
          const destination = path.join(source, '.buildResult', relative);
          await mkdir(path.dirname(destination), { recursive: true }); await copyFile(path.join(source, relative), destination);
        }
      }
      if (command === 'package') {
        const built = args.at(-1);
        for (const file of ['frameos.wgt', 'author-signature.xml', 'signature1.xml']) await put(built, file, 'signed fixture');
      }
      return { exitCode: 0, output: 'success' };
    },
  });
  return { context, calls };
}

test('check verifies the exact device; stage never packages, installs, or launches', async () => {
  const f = await fixture(); const { context, calls } = await fakePipeline(f);
  const before = await snapshot(f.project);
  await pipeline('check', context); assert.deepEqual(await snapshot(f.project), before);
  assert.deepEqual(calls, ['devices']);
  calls.length = 0; await pipeline('stage', context);
  assert.deepEqual(calls, ['vite-build']);
});

test('deploy uses the manifest application ID and the configured matching author profile', async () => {
  const f = await fixture(); const { context, calls } = await fakePipeline(f);
  const original = context.sdk;
  context.sdk = async (request) => {
    if (request.arguments?.[0] === 'run') assert.equal(request.arguments.at(-1), f.metadata.appId);
    if (request.arguments?.[0] === 'package') assert.deepEqual(request.arguments.slice(0, 5), ['package', '-t', 'wgt', '-s', f.config.profile]);
    return original(request);
  };
  await pipeline('deploy', context);
  assert.deepEqual(calls, ['devices', 'vite-build', 'build-web', 'package', 'verify-package', 'devices', 'install', 'run']);
});

test('profile author mismatch stops before building, staging or contacting the TV', async () => {
  const f = await fixture(); f.metadata.authorSha256 = 'b'.repeat(64);
  const { context, calls } = await fakePipeline(f);
  const before = await snapshot(f.project);
  await assert.rejects(pipeline('deploy', context), /Author certificate mismatch/);
  assert.deepEqual(calls, []);
  assert.deepEqual(await snapshot(f.project), before);
});

test('a changed reference author or missing pinned identity stops before signing', async () => {
  const f = await fixture(); f.metadata.referenceAuthorSha256 = 'b'.repeat(64);
  const { context, calls } = await fakePipeline(f);
  await assert.rejects(pipeline('check', context), /reference package author/);
  assert.deepEqual(calls, []);
  delete f.config.authorSha256;
  await assert.rejects(pipeline('check', context), /known-good author SHA-256/);
});

test('actual signed author mismatch stops even when other archive integrity checks pass', async () => {
  const f = await fixture(); const { context, calls } = await fakePipeline(f, 'signed-author');
  await assert.rejects(pipeline('deploy', context), /Signed package author or integrity/);
  assert.equal(calls.at(-1), 'verify-package');
  assert(!calls.includes('install'));
});

for (const failure of ['offline', 'vite-build', 'build-web', 'package', 'verify-package', 'install', 'run']) {
  test(`deployment stops immediately at ${failure} failure`, async () => {
    const f = await fixture(); const { context, calls } = await fakePipeline(f, failure);
    const error = await pipeline('deploy', context).then(() => assert.fail('failure expected'), (error) => error);
    if (failure === 'package') assert(!error.message.includes('NEVER_PRINT_THIS'));
    const final = failure === 'offline' ? 'devices' : failure;
    assert.equal(calls.at(-1), final);
    if (!['install', 'run'].includes(failure)) assert(!calls.includes('install'));
    if (failure === 'install') assert(!calls.includes('run'));
  });
}

const policyManifest = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\r\n<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://original/app" version="7.8.9">\r\n    <tizen:application id="ExistingID.actualApp" package="ExistingID" required_version="2.3"/>\r\n    <content src="index.html"/>\r\n    <icon src="icon.png"/>\r\n    <name>Original app</name>\r\n    <tizen:setting background-support="disable"/>\r\n</widget>\r\n');
const reviewedPolicy = (manifest = policyManifest) => ({ version: 1, release: '0.3.0', originalManifestSha256: digest(manifest) });

test('v0.3 packaging policy inserts only documented read-only media/weather declarations and preserves every original byte', () => {
  const before = Buffer.from(policyManifest);
  const result = createPackagingManifest(before, reviewedPolicy());
  assert.deepEqual(before, policyManifest);
  assert.equal(result.originalSha256, digest(policyManifest));
  assert.equal(result.packagedSha256, digest(result.manifest));
  assert.equal(result.manifest.toString().replace(result.additions, ''), policyManifest.toString());
  assert.equal((result.additions.match(/<tizen:privilege/g) || []).length, readOnlyPrivileges.length);
  for (const privilege of readOnlyPrivileges) assert(result.additions.includes(`name="${privilege}"`));
  assert(result.additions.includes('<access origin="https://api.open-meteo.com" subdomains="false"/>'));
  assert(!result.additions.includes('filesystem.write'));
  assert(!result.additions.includes('geolocation'));
  assert(!contentSecurityPolicy.includes('unsafe-eval'));
  assert.equal(contentSecurityPolicy.split('connect-src ')[1].split(';')[0], "'self' https://api.open-meteo.com");
  assert.deepEqual(createPackagingManifest(before, reviewedPolicy()).manifest, result.manifest);
});

test('changed baselines, existing policies and arbitrary policy keys fail closed without a write', () => {
  assert.throws(() => createPackagingManifest(Buffer.concat([policyManifest, Buffer.from(' ')]), reviewedPolicy()), /differs from the reviewed policy baseline/);
  assert.throws(() => createPackagingManifest(policyManifest, { ...reviewedPolicy(), applicationId: 'new identity' }), /Invalid manifest policy/);
  assert.throws(() => createPackagingManifest(policyManifest, { ...reviewedPolicy(), originalManifestSha256: undefined }), /Invalid manifest policy/);
  for (const declaration of ['<access origin="*"/>', '<tizen:privilege name="http://tizen.org/privilege/filesystem.write"/>', '<tizen:content-security-policy>default-src *</tizen:content-security-policy>', '<!DOCTYPE widget>']) {
    const original = Buffer.from(policyManifest.toString().replace('</widget>', declaration + '</widget>'));
    assert.throws(() => createPackagingManifest(original, reviewedPolicy(original)), /manual policy review is required/);
  }
});

test('local package uses dist and patched expected manifest while every external project byte remains unchanged', async () => {
  const f = await fixture();
  await put(f.project, 'config.xml', policyManifest);
  f.config.packagingPolicy = 'tizen/policy-v0.3.json';
  await put(f.root, f.config.packagingPolicy, JSON.stringify(reviewedPolicy()));
  await stage(f);
  const before = await snapshot(f.project);
  // A new local frontend package does not stage or delete the old external assets.
  await put(f.dist, 'assets/new.js', 'var wallpaper="./wallpapers/default.jpg";');
  await put(f.dist, 'index.html', '<script src="./assets/new.js"></script>');
  const { context, calls } = await fakePipeline(f);
  const original = context.sdk;
  let packagingCopy;
  context.sdk = async (request) => {
    if (request.arguments?.[0] === 'build-web') {
      packagingCopy = request.arguments.at(-1);
      assert.equal(await readFile(path.join(packagingCopy, 'config.xml'), 'utf8'), createPackagingManifest(policyManifest, reviewedPolicy()).manifest.toString());
      assert.equal(await exists(path.join(packagingCopy, 'assets/app.js')), false);
      assert.equal(await exists(path.join(packagingCopy, 'wallpapers/soft.jpg')), false);
      assert.equal(await exists(path.join(packagingCopy, 'assets/new.js')), true);
      assert.equal(await exists(path.join(packagingCopy, 'assets/unrelated.txt')), true);
    }
    if (request.action === 'archive') {
      const expected = JSON.parse(await readFile(request.expected, 'utf8'));
      assert.equal(expected['config.xml'], createPackagingManifest(policyManifest, reviewedPolicy()).packagedSha256);
      assert.equal(expected['icon.png'], before['icon.png']);
    }
    return original(request);
  };
  await pipeline('package', context);
  assert(packagingCopy.startsWith(f.stateRoot + path.sep));
  assert.deepEqual(await snapshot(f.project), before);
  assert.deepEqual(calls, ['vite-build', 'build-web', 'package', 'verify-package']);
});

test('check validates reviewed manifest policy before building or contacting the TV', async () => {
  const f = await fixture();
  f.config.packagingPolicy = 'tizen/policy-v0.3.json';
  await put(f.root, f.config.packagingPolicy, JSON.stringify(reviewedPolicy()));
  const before = await snapshot(f.project);
  const { context, calls } = await fakePipeline(f);
  await assert.rejects(pipeline('check', context), /differs from the reviewed policy baseline/);
  assert.deepEqual(calls, []);
  assert.deepEqual(await snapshot(f.project), before);
});


test('v0.4 permits only the documented native thumbnail creation privilege in addition to the existing media policy', () => {
  const result = createPackagingManifest(policyManifest, { ...reviewedPolicy(), release: '0.4.0' });
  assert(result.additions.includes('http://tizen.org/privilege/content.write'));
  assert(result.additions.includes("media-src 'self' file:"));
  assert(!result.additions.includes('filesystem.write'));
  assert.equal(result.manifest.toString().replace(result.additions, ''), policyManifest.toString());
});
