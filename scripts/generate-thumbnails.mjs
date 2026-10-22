import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, stat, lstat, mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { manifestBucket } from '../src/services/thumbnailManifest.mjs';

export function snapshotArguments(input, output, duration, seek) {
  const offset = seek ?? (Number.isFinite(duration) && duration > 0 ? Math.min(15, duration * .2) : 0);
  // Sample eight seconds at low resolution, discard >95% black frames, then
  // select a representative frame. Bound both decoder time and filter memory.
  const filter = 'scale=320:180:force_original_aspect_ratio=decrease,fps=1,blackframe=amount=0:threshold=32,metadata=select:key=lavfi.blackframe.pblack:value=95:function=less,thumbnail=8,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1';
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(offset), '-i', input, '-t', '8', '-map', '0:v:0', '-an', '-sn', '-dn', '-frames:v', '1', '-vf', filter, '-q:v', '5', output];
}
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true }); let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${executable} timed out`)); }, 30000);
    child.stdout.on('data', chunk => { if (output.length < 10000) output += chunk; });
    child.stderr.on('data', chunk => { if (output.length < 10000) output += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(`${executable} failed (${code}): ${output.slice(-500)}`)); });
  });
}
export async function verifyTools({ ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' } = {}) {
  try { await Promise.all([run(ffmpeg, ['-version']), run(ffprobe, ['-version'])]); }
  catch (error) { throw Error(`FFmpeg/FFprobe are required before writing thumbnails. Put both on PATH or pass --ffmpeg and --ffprobe. ${error.message}`); }
}
export async function generateDirectory(directory, { ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', recursive = false, output, include, execute = run, log = console.log, report = { generated: 0, skipped: 0, failed: [] } } = {}) {
  directory = path.resolve(directory);
  const destination = path.resolve(output || directory);
  if ((await lstat(directory)).isSymbolicLink()) throw Error('Select a real media directory, not a link/junction.');
  await mkdir(destination, { recursive: true });
  if ((await lstat(destination)).isSymbolicLink()) throw Error('Thumbnail output must not be a link/junction.');
  const entries = await readdir(directory, { withFileTypes: true });
  const files = Object.create(null); let old = {};
  try {
    const value = JSON.parse(await readFile(path.join(destination, '.frameos-thumbnails.json'), 'utf8'));
    if (value.version === 1) old = value.files || {};
    else if (value.version === 2 && value.buckets === 256 && value.algorithm === 'name31-utf16-v1') {
      old = Object.create(null);
      for (let bucket = 0; bucket < 256; bucket++) {
        try { const shard = JSON.parse(await readFile(path.join(destination, '.frameos-thumbnails', `manifest-${bucket.toString(16).padStart(2, '0')}.json`), 'utf8')); if (shard.version === 1 && shard.files) Object.assign(old, shard.files); } catch { /* Missing shard: regenerate its images as necessary. */ }
      }
    }
  } catch { /* First generation. */ }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || ['.frameos-thumbnails', '$RECYCLE.BIN', 'System Volume Information'].includes(entry.name)) continue;
    const input = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive && path.resolve(input) !== destination && (!output || !path.resolve(input).startsWith(destination + path.sep))) {
        try { await generateDirectory(input, { ffmpeg, ffprobe, recursive, output: output ? path.join(destination, entry.name) : undefined, include, execute, log, report }); }
        catch (error) { report.failed.push({ path: input, error: error.message }); log(`FAILED ${input}: ${error.message}`); }
      }
      continue;
    }
    if (!entry.isFile() || !/\.(mp4|mkv|m4v|webm|avi|mov|wmv|ts|m2ts|mts|mpg|mpeg|vob|3gp)$/i.test(entry.name)) continue;
    if (include && !include.includes(entry.name)) continue;
    let metadata;
    try { metadata = await stat(input); }
    catch (error) { report.failed.push({ path: input, error: error.message }); log(`FAILED ${input}: ${error.message}`); continue; }
    const hash = createHash('sha256').update(JSON.stringify([entry.name, metadata.size, metadata.mtimeMs])).digest('hex').slice(0, 24);
    const image = `.frameos-thumbnails/${hash}.jpg`;
    try {
      if (old[entry.name]?.image === image && (await stat(path.join(destination, image))).size > 0) { files[entry.name] = old[entry.name]; report.skipped++; continue; }
    } catch { /* Missing snapshot must be regenerated. */ }
    await mkdir(path.join(destination, '.frameos-thumbnails'), { recursive: true });
    if ((await lstat(path.join(destination, '.frameos-thumbnails'))).isSymbolicLink()) throw Error('Refusing a thumbnail directory link/junction.');
    const temporaryImage = path.join(destination, '.frameos-thumbnails', `${hash}-${randomUUID()}.tmp.jpg`);
    try {
      const duration = Number(await execute(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input]));
      const offsets = [...new Set([Math.min(15, duration * .2), duration * .5, duration * .8, 0].filter(Number.isFinite))];
      let extracted = false, failure;
      for (const seek of offsets) {
        try {
          await execute(ffmpeg, snapshotArguments(input, temporaryImage, duration, Math.max(0, seek)));
          if (!(await stat(temporaryImage)).size) throw Error('No nonblack frame in sampled interval');
          extracted = true; break;
        } catch (error) { failure = error; await unlink(temporaryImage).catch(() => {}); }
      }
      if (!extracted) throw failure || Error('No representative frame');
      const after = await stat(input);
      if (after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs) throw Error('Video changed during extraction; retry when the copy finishes');
      await rename(temporaryImage, path.join(destination, image));
      files[entry.name] = { image, relativePath: entry.name, identity: JSON.stringify([entry.name, metadata.size, Math.round(metadata.mtimeMs)]), size: metadata.size, modified: Math.round(metadata.mtimeMs) }; log(`Snapshot: ${entry.name}`);
      report.generated++;
    } catch (error) { report.failed.push({ path: input, error: error.message }); log(`FAILED ${input}: ${error.message}`); }
    finally { await unlink(temporaryImage).catch(() => {}); }
  }
  if (Object.keys(files).length || Object.keys(old).length) {
    await writeManifest(destination, files);
  }
  return files;
}
export async function writeManifest(destination, files) {
  const atomicJson = async (target, value) => {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 256 * 1024) throw Error('Thumbnail manifest shard exceeds 256 KiB; no unbounded manifest will be loaded on TV.');
    const temporary = `${target}-${randomUUID()}.tmp`;
    try { await writeFile(temporary, text); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => {}); }
  };
  if (Buffer.byteLength(JSON.stringify({ version: 1, files })) <= 256 * 1024) await atomicJson(path.join(destination, '.frameos-thumbnails.json'), { version: 1, files });
  else {
    const shards = new Map();
    for (const [name, item] of Object.entries(files)) {
      const bucket = manifestBucket(name);
      if (!shards.has(bucket)) shards.set(bucket, Object.create(null));
      shards.get(bucket)[name] = item;
    }
    await mkdir(path.join(destination, '.frameos-thumbnails'), { recursive: true });
    for (const [bucket, items] of shards) await atomicJson(path.join(destination, '.frameos-thumbnails', `manifest-${bucket}.json`), { version: 1, files: items });
    // Publish index after all referenced shards are complete.
    await atomicJson(path.join(destination, '.frameos-thumbnails.json'), { version: 2, buckets: 256, algorithm: 'name31-utf16-v1' });
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  try {
    if (!args[0] || args[0].startsWith('--')) throw new Error('Usage: node scripts/generate-thumbnails.mjs <PC-media-folder> [--output <folder>] [--file <filename>] [--ffmpeg <exe>] [--ffprobe <exe>] [--recursive]');
    const options = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--recursive') options.recursive = true;
      else if (['--output', '--ffmpeg', '--ffprobe', '--file'].includes(args[i]) && args[i + 1]) {
        const key = args[i].slice(2), value = args[++i]; if (key === 'file') options.include = [...(options.include || []), value]; else options[key] = value;
      } else throw new Error(`Unknown/incomplete option: ${args[i]}`);
    }
    // Legacy entry point uses the same explicit consent as the Windows utility.
    const { approveWrites } = await import('./media-thumbnails/approval.mjs');
    await verifyTools(options);
    if (await approveWrites(args[0], options.output)) {
      const report = { generated: 0, skipped: 0, failed: [] };
      await generateDirectory(args[0], { ...options, report });
      console.log(JSON.stringify(report, null, 2));
      if (report.failed.length) process.exitCode = 1;
    } else console.log('Cancelled. No files written.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
