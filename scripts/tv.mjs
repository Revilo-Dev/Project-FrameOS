import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listFiles, localPath, validateProduction } from './tv-assets.mjs';
import { atomicWrite, exists, fileHash, stageProject, withLock } from './tv-stage.mjs';

const repository = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export async function runProcess(executable, args, { cwd, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    let verbatim = false;
    if (/\.bat$/i.test(executable)) {
      [executable, ...args].forEach(safeArgument);
      const command = `"${[executable, ...args].map((value) => `"${value}"`).join(' ')}"`;
      executable = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
      args = ['/d', '/s', '/c', command];
      verbatim = true;
    }
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, windowsVerbatimArguments: verbatim });
    let output = '';
    let failure;
    const stop = (reason) => {
      failure = reason;
      if (process.platform === 'win32' && child.pid) {
        // Only this pipeline's child process tree is terminated, without elevation.
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill('SIGTERM');
    };
    const timer = setTimeout(() => stop(`Command timed out after ${timeout / 1000}s.`), timeout);
    const capture = (chunk) => {
      output += chunk.toString();
      if (output.length > 2 * 1024 * 1024 && !failure) stop('Command exceeded its output limit.');
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`Cannot start command: ${error.message}`)); });
    child.on('close', (code) => { clearTimeout(timer); if (failure) reject(new Error(failure)); else resolve({ code, output: output.trim() }); });
  });
}

function safeArgument(value) {
  if (typeof value !== 'string' || /[\r\n"&|<>^%!`]/.test(value)) throw new Error('A tool argument contains unsupported Windows shell characters.');
  return value;
}

export function assertConnected(output, config) {
  const device = output.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((parts) => parts[0] === config.serial);
  if (!device || device[1] !== 'device') throw new Error(`TV ${config.serial} is not connected and authorized. Use the configured sdb.exe to connect it, then rerun check:tv.`);
  if (device[2] !== config.model) throw new Error(`Connected device model does not match ${config.model}. Refusing deployment.`);
}

export async function createContext(root = repository, overrides = {}) {
  const config = overrides.config || JSON.parse(await readFile(path.join(root, 'scripts', 'tv.config.json'), 'utf8'));
  const context = {
    root, config, project: config.project, dist: path.join(root, 'dist'), stateRoot: path.join(root, 'artifacts', 'tv'),
    tizen: path.join(config.sdk, 'tools', 'ide', 'bin', 'tizen.bat'),
    sdb: path.join(config.sdk, 'tools', 'sdb.exe'), log: console.log, run: runProcess, ...overrides,
  };
  context.sdk = overrides.sdk || (async (request) => {
    if (request.action === 'command') {
      const result = await context.run(request.executable, request.arguments, { cwd: context.root, timeout: 300000 });
      // Suppress all signer diagnostics, even on failure, rather than risk exposing credentials.
      const output = request.arguments[0] === 'package' ? '' : result.output.replace(/(password|passwd|pwd|secret)\s*[:=].*$/gim, '$1=[redacted]');
      return { exitCode: result.code, output };
    }
    if (request.action === 'archive') {
      const result = await context.run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(context.root, 'scripts', 'tv-verify-package.ps1'), '-PackagePath', request.package, '-ExpectedPath', request.expected, '-ExpectedAuthorSha256', request.authorSha256], { cwd: context.root, timeout: 30000 });
      if (result.code !== 0) throw new Error(`Signed package verification failed (exit ${result.code}). ${result.output} Installation was not started.`);
      try { return JSON.parse(result.output); } catch { throw new Error('Signed package verification returned invalid output.'); }
    }
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(context.root, 'scripts', 'tv-metadata.ps1'), '-ManifestPath', path.join(request.project, 'config.xml')];
    if (request.certificate) {
      const profiles = await context.run(request.tizen, ['security-profiles', 'list'], { cwd: context.root, timeout: 30000 });
      if (profiles.code !== 0) throw new Error('Unable to list existing Tizen security profiles.');
      const location = /Loaded in '([^']+)'/.exec(profiles.output)?.[1];
      if (!location) throw new Error('Tizen CLI did not report the existing profiles.xml location.');
      args.push('-ProfilesPath', location, '-ProfileName', request.profile, '-ReferencePackage', request.referencePackage);
    }
    const result = await context.run('powershell.exe', args, { cwd: context.root, timeout: 30000 });
    if (result.code !== 0) throw new Error(`Metadata inspection failed (exit ${result.code}). ${result.output}`);
    try { return JSON.parse(result.output.replace(/^\uFEFF/, '')); } catch { throw new Error('SDK helper returned invalid output; no later deployment steps were run.'); }
  });
  return context;
}

async function inspect(context, certificates) {
  const { config, project, tizen, sdb } = context;
  for (const value of [project, tizen, sdb, config.profile, config.serial]) safeArgument(value);
  if (!/^[a-z\d_.-]+$/i.test(config.profile) || !/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(config.serial)) throw new Error('Invalid configured profile or TV address.');
  if ((await lstat(project)).isSymbolicLink() || (await realpath(project)).toLowerCase() !== path.resolve(project).toLowerCase()) throw new Error('Tizen project must be a real directory, not a junction or symlink.');
  for (const file of [tizen, sdb, path.join(project, 'config.xml')]) {
    if (!(await exists(file)) || !(await lstat(file)).isFile()) throw new Error(`Required SDK/project file is missing: ${file}`);
  }
  if (certificates) {
    localPath(config.referencePackage);
    if (!/^[a-f\d]{64}$/i.test(config.authorSha256 || '')) throw new Error('Configure the verified known-good author SHA-256 fingerprint before signing or deployment.');
  }
  const metadata = await context.sdk({ action: 'metadata', project, tizen, profile: config.profile, certificate: certificates, referencePackage: certificates ? path.join(project, config.referencePackage) : undefined });
  if (!/^[a-z\d_.-]+$/i.test(metadata.appId || '') || !/^[a-z\d_.-]+$/i.test(metadata.packageId || '') || !metadata.version) throw new Error('config.xml contains an invalid or missing application ID, package ID, or version.');
  if (metadata.entry !== 'index.html') throw new Error('Existing manifest entry must be index.html. The pipeline will not modify config.xml.');
  metadata.resources = Array.isArray(metadata.resources) ? metadata.resources : [];
  for (const resource of metadata.resources) {
    localPath(resource);
    if (!(await exists(path.join(project, resource)))) throw new Error(`Manifest resource is missing: ${resource}`);
  }
  context.log(`Application ${metadata.appId}; package ${metadata.packageId}; version ${metadata.version}.`);
  if (certificates) {
    if (metadata.referenceAuthorSha256 !== config.authorSha256.toLowerCase()) throw new Error('Known-good reference package author does not match the pinned fingerprint. Deployment stopped before building.');
    if (metadata.authorSha256 !== config.authorSha256.toLowerCase()) throw new Error(`Author certificate mismatch: profile ${config.profile} cannot update the known-good application. Select the existing profile with the matching author; no certificates or installed apps were changed.`);
    context.log(`Profile ${config.profile}: ${metadata.certificateCount} certificate files available. Global active profile: ${metadata.activeProfile || '(none)'}; unchanged.`);
    context.log(`Author certificate matches the known-good ${config.referencePackage} (${config.authorSha256.slice(0, 12)}...).`);
  }
  return metadata;
}

async function tool(context, executable, args, label) {
  safeArgument(executable); args.forEach(safeArgument);
  const result = await context.sdk({ action: 'command', executable, arguments: args });
  if (result.exitCode !== 0 || /\b(?:error|failed|failure)\b/i.test(result.output || '')) {
    const detail = args[0] === 'package' ? `SDK signing output is suppressed to protect certificate credentials. Check the existing ${context.config.profile} profile and certificate validity.` : (result.output || '').slice(-3000);
    throw new Error(`${label} failed (exit ${result.exitCode}). ${detail}`);
  }
  context.log(`${label}: OK.`);
  return result.output;
}

async function connectivity(context) {
  const output = await tool(context, context.sdb, ['devices'], 'SDB device check');
  assertConnected(output, context.config);
  context.log(`TV ${context.config.serial}: connected (${context.config.model}).`);
}

async function buildAndStage(context, metadata) {
  context.log('Building the production UI with the existing Chromium 69 configuration...');
  const result = await context.run(process.execPath, [process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'run', 'build'], { cwd: context.root, timeout: 600000 });
  if (result.code !== 0) throw new Error(`Production build failed (exit ${result.code}). ${result.output.slice(-4000)}`);
  const files = await validateProduction(context.dist);
  const stage = await stageProject({ ...context, files, metadata });
  context.log(`Staged ${files.length} verified production files (${stage.changed.length} changed, ${stage.removed.length} previously managed stale files removed).`);
  context.log(`Original project backup: ${stage.backup}`);
  context.log('config.xml, icon, signing material and unrelated project resources preserved.');
  return stage;
}

export async function packageProject(context, stage) {
  const output = path.join(context.stateRoot, 'packages', `package-${Date.now()}-${process.pid}`);
  const source = path.join(output, 'project');
  await mkdir(source, { recursive: true });
  for (const relative of await listFiles(context.project)) {
    if (relative.split('/').some((part) => ['.git', '.sign', '.build', '.buildResult', '.package'].includes(part))
        || /\.(?:wgt|p12|pfx|pem|key|crt|cer)$/i.test(relative)
        || /(?:^|\/)(?:profiles\.xml|author-signature\.xml|signature\d*\.xml)$/i.test(relative)) continue;
    const destination = path.join(source, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(context.project, relative), destination);
  }
  if (await fileHash(path.join(source, 'config.xml')) !== stage.manifestHash) throw new Error('Manifest changed before packaging; deployment stopped.');
  for (const [relative, hash] of Object.entries(stage.files)) {
    if (await fileHash(path.join(source, relative)) !== hash) throw new Error(`Frontend changed before packaging: ${relative}`);
  }
  await tool(context, context.tizen, ['build-web', '--', source], 'Tizen web build');
  const built = path.join(source, '.buildResult');
  await tool(context, context.tizen, ['package', '-t', 'wgt', '-s', context.config.profile, '--', built], 'Signing and packaging');
  const packages = (await readdir(built)).filter((file) => file.endsWith('.wgt'));
  if (packages.length !== 1 || (await lstat(path.join(built, packages[0]))).size === 0) throw new Error('Signing did not produce exactly one non-empty WGT package.');
  if (await fileHash(path.join(built, 'config.xml')) !== stage.manifestHash) throw new Error('Tizen build changed config.xml; refusing installation.');
  const expected = { ...stage.files, 'config.xml': stage.manifestHash };
  for (const resource of stage.resources) expected[resource] = await fileHash(path.join(source, resource));
  const expectedPath = path.join(output, 'expected-assets.json');
  await atomicWrite(expectedPath, JSON.stringify(expected));
  const verification = await context.sdk({ action: 'archive', package: path.join(built, packages[0]), expected: expectedPath, authorSha256: context.config.authorSha256 });
  if (!verification.verified || verification.authorSha256 !== context.config.authorSha256.toLowerCase()) throw new Error('Signed package author or integrity verification failed; installation was not started.');
  context.log(`Signed package: ${path.join(built, packages[0])}`);
  return { directory: built, name: packages[0] };
}

export async function pipeline(mode, context) {
  if (!['check', 'stage', 'package', 'deploy'].includes(mode)) throw new Error('Usage: node scripts/tv.mjs check|stage|package|deploy');
  const operation = async () => {
    const metadata = await inspect(context, mode !== 'stage');
    if (mode === 'check' || mode === 'deploy') await connectivity(context);
    if (mode === 'check') return;
    const stage = await buildAndStage(context, metadata);
    if (mode === 'stage') return stage;
    const packaged = await packageProject(context, stage);
    if (mode === 'package') return packaged;
    // Recheck the exact device immediately before installation, after signing.
    await connectivity(context);
    const current = await inspect(context, false);
    if (current.appId !== metadata.appId || await fileHash(path.join(context.project, 'config.xml')) !== stage.manifestHash) throw new Error('Application metadata changed during deployment; refusing installation.');
    await tool(context, context.tizen, ['install', '-s', context.config.serial, '-n', packaged.name, '--', packaged.directory], 'TV installation');
    await tool(context, context.tizen, ['run', '-s', context.config.serial, '-p', metadata.appId], 'TV launch');
    context.log(`FrameOS deployed and launched: ${metadata.appId}.`);
    return packaged;
  };
  return mode === 'check' ? operation() : withLock(context.stateRoot, operation);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.platform !== 'win32') throw new Error('This deployment pipeline requires Windows and the existing Tizen SDK.');
    if (process.argv.length !== 3) throw new Error('Pass exactly one operation: check, stage, package, or deploy.');
    await pipeline(process.argv[2], await createContext());
  } catch (error) { console.error(`FrameOS TV pipeline stopped: ${error.message}`); process.exitCode = 1; }
}
