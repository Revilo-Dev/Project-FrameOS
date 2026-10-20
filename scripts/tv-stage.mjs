import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listFiles, localPath } from './tv-assets.mjs';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const fileHash = async (file) => digest(await readFile(file));
export async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export async function atomicWrite(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.frameos-${randomUUID()}.tmp`);
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, file); }
  finally { if (await exists(temporary)) await unlink(temporary); }
}

export async function snapshot(directory) {
  const files = Object.create(null);
  for (const relative of await listFiles(directory)) files[relative] = await fileHash(path.join(directory, relative));
  return files;
}

function protectedFile(relative, metadata) {
  const lower = relative.toLowerCase();
  return lower === 'config.xml' || lower === 'icon.png' || lower.split('/').some((part) => part.startsWith('.'))
    || /\.(?:wgt|p12|pfx|pem|key|crt|cer)$/i.test(lower)
    || /(?:^|\/)(?:profiles\.xml|author-signature\.xml|signature\d*\.xml)$/i.test(lower)
    || metadata.resources.some((resource) => lower === resource.toLowerCase());
}

function validateOwned(files, metadata) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Invalid deployment ownership ledger.');
  for (const [relative, hash] of Object.entries(files)) {
    localPath(relative);
    // Only these deliberately chosen frontend namespaces may ever be managed.
    if (relative !== 'index.html' && !relative.startsWith('assets/') && !relative.startsWith('wallpapers/')) throw new Error(`Unapproved managed asset: ${relative}`);
    if (protectedFile(relative, metadata) || !/^[a-f\d]{64}$/.test(hash)) throw new Error(`Invalid managed asset record: ${relative}`);
  }
}

async function readRecord(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`Cannot read deployment record ${file}: ${error.message}`); }
}

export async function ensureBackup(project, stateRoot, current) {
  const pointer = path.join(stateRoot, 'original.json');
  const original = await readRecord(pointer);
  if (original) {
    if (original.version !== 1 || !samePath(original.project, project) || !/^original-[a-f\d-]+$/.test(original.folder)) throw new Error('Original backup record is invalid or belongs to another project.');
    const directory = path.join(stateRoot, 'backups', original.folder);
    if (JSON.stringify(await snapshot(directory)) !== JSON.stringify(original.files)) throw new Error('Original backup is missing or has changed. Restore it before deploying.');
    return directory;
  }
  const folder = `original-${randomUUID()}`;
  const directory = path.join(stateRoot, 'backups', folder);
  await mkdir(directory, { recursive: true });
  for (const relative of Object.keys(current)) {
    const destination = path.join(directory, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(project, relative), destination);
  }
  if (JSON.stringify(await snapshot(directory)) !== JSON.stringify(current)) throw new Error('Original backup verification failed; no frontend files were changed.');
  await writeFile(pointer, JSON.stringify({ version: 1, project, folder, files: current }, null, 2), { flag: 'wx' });
  return directory;
}

export async function stageProject({ project, dist, stateRoot, files, metadata, onFile = () => {} }) {
  project = await realpath(project);
  if (metadata.entry !== 'index.html') throw new Error('Only an existing index.html entry is supported; config.xml will not be changed.');
  for (const resource of metadata.resources) localPath(resource);
  if (await exists(path.join(stateRoot, 'pending.json'))) throw new Error(`A previous stage was interrupted. Inspect ${path.join(stateRoot, 'pending.json')} and its recovery files before retrying.`);
  const before = await snapshot(project);
  const statePath = path.join(stateRoot, 'managed.json');
  const previous = await readRecord(statePath);
  if (previous && (previous.version !== 1 || !samePath(previous.project, project))) throw new Error('Deployment ledger belongs to another project or version.');
  const owned = previous?.files || {};
  validateOwned(owned, metadata);
  const next = {};
  for (const relative of files) next[relative] = await fileHash(path.join(dist, relative));
  validateOwned(next, metadata);
  if (!next['index.html']) throw new Error('Cannot stage without a production index.html.');
  for (const [relative, hash] of Object.entries(owned)) {
    if (before[relative] && before[relative] !== hash) throw new Error(`Managed frontend file was edited outside the pipeline: ${relative}. Preserve the edit before retrying.`);
  }
  for (const relative of files) {
    if (before[relative] && !owned[relative] && !(relative === 'index.html' && !previous)) throw new Error(`Refusing to overwrite an unrelated project file: ${relative}`);
    // Check case-insensitive collisions as Windows paths are case-insensitive.
    if (Object.keys(before).some((existing) => existing !== relative && existing.toLowerCase() === relative.toLowerCase())) throw new Error(`Case-conflicting asset: ${relative}`);
  }
  if (previous && !(await exists(path.join(stateRoot, 'original.json')))) throw new Error('Original backup record is missing; refusing to back up an already staged project as the original.');
  const backup = await ensureBackup(project, stateRoot, before);
  const removed = Object.keys(owned).filter((relative) => !next[relative] && before[relative]);
  const changed = files.filter((relative) => before[relative] !== next[relative]);
  const touched = [...changed, ...removed];
  const run = path.join(stateRoot, 'runs', `stage-${randomUUID()}`);
  await mkdir(run, { recursive: true });
  for (const relative of touched.filter((name) => before[name])) {
    const recovery = path.join(run, 'before', relative);
    await mkdir(path.dirname(recovery), { recursive: true });
    await copyFile(path.join(project, relative), recovery);
  }
  const journal = path.join(stateRoot, 'pending.json');
  await writeFile(journal, JSON.stringify({ project, recovery: run, changed, removed, before: Object.fromEntries(touched.map((name) => [name, before[name] || null])) }, null, 2), { flag: 'wx' });
  try {
    // Refuse concurrent manual edits made while the backup was being copied.
    if (JSON.stringify(await snapshot(project)) !== JSON.stringify(before)) throw new Error('Tizen project changed while staging was being prepared.');
    for (const relative of changed) {
      await atomicWrite(path.join(project, relative), await readFile(path.join(dist, relative)));
      await onFile(relative);
    }
    for (const relative of removed) {
      if (await fileHash(path.join(project, relative)) !== owned[relative]) throw new Error(`Stale asset changed before cleanup: ${relative}`);
      await unlink(path.join(project, relative));
    }
    const after = await snapshot(project);
    for (const [relative, hash] of Object.entries(before)) {
      if (!touched.includes(relative) && after[relative] !== hash) throw new Error(`Preserved project resource changed: ${relative}`);
    }
    for (const [relative, hash] of Object.entries(next)) {
      if (after[relative] !== hash) throw new Error(`Staged asset failed hash verification: ${relative}`);
    }
    await atomicWrite(statePath, JSON.stringify({ version: 1, project, files: next }, null, 2));
  } catch (error) {
    try {
      for (const relative of touched) {
        const target = path.join(project, relative);
        const current = await exists(target) ? await fileHash(target) : null;
        if (current && current !== before[relative] && current !== next[relative]) throw new Error(`Concurrent edit prevents rollback: ${relative}`);
        if (before[relative]) await atomicWrite(target, await readFile(path.join(run, 'before', relative)));
        else if (current) await unlink(target);
      }
      await unlink(journal);
    } catch { throw new Error(`${error.message} Automatic recovery could not finish; inspect ${journal}.`); }
    throw error;
  }
  await unlink(journal);
  return { backup, changed, removed, files: next, manifestHash: before['config.xml'], resources: metadata.resources };
}

export async function withLock(stateRoot, operation) {
  await mkdir(stateRoot, { recursive: true });
  const lock = path.join(stateRoot, 'deploy.lock');
  try { await writeFile(lock, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Another pipeline may be running. Inspect ${lock}; remove it only after confirming its process has stopped.`); throw error; }
  try { return await operation(); }
  finally { await unlink(lock); }
}
