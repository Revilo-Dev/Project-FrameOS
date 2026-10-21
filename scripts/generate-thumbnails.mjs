import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, stat, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function snapshotArguments(input, output, duration) {
  const offset = Number.isFinite(duration) && duration > 0 ? Math.min(15, duration * .2) : 0;
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(offset), '-i', input, '-frames:v', '1', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2', '-q:v', '5', output];
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
export async function generateDirectory(directory, { ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', recursive = false, execute = run, log = console.log } = {}) {
  directory = path.resolve(directory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = Object.create(null); let old = {};
  try { const value = JSON.parse(await readFile(path.join(directory, '.frameos-thumbnails.json'), 'utf8')); if (value.version === 1) old = value.files || {}; } catch { /* First generation. */ }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    const input = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (recursive) await generateDirectory(input, { ffmpeg, ffprobe, recursive, execute, log }); continue; }
    if (!entry.isFile() || !/\.(mp4|mkv|m4v|webm)$/i.test(entry.name)) continue;
    const metadata = await stat(input);
    const hash = createHash('sha256').update(JSON.stringify([entry.name, metadata.size, metadata.mtimeMs])).digest('hex').slice(0, 24);
    const image = `.frameos-thumbnails/${hash}.jpg`;
    try {
      if (old[entry.name]?.image === image && (await stat(path.join(directory, image))).size > 0) { files[entry.name] = old[entry.name]; continue; }
    } catch { /* Missing snapshot must be regenerated. */ }
    await mkdir(path.join(directory, '.frameos-thumbnails'), { recursive: true });
    try {
      const duration = Number(await execute(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', input]));
      await execute(ffmpeg, snapshotArguments(input, path.join(directory, image), duration));
      if (!(await stat(path.join(directory, image))).size) throw new Error('Empty snapshot');
      files[entry.name] = { image, size: metadata.size, modified: Math.round(metadata.mtimeMs) }; log(`Snapshot: ${entry.name}`);
    } catch (error) { log(`Skipped ${entry.name}: ${error.message}`); }
  }
  if (Object.keys(files).length) {
    const manifest = JSON.stringify({ version: 1, files });
    if (Buffer.byteLength(manifest) > 256 * 1024) throw new Error('Manifest exceeds TV safety limit. Split this directory into smaller folders.');
    const temporary = path.join(directory, `.frameos-thumbnails-${randomUUID()}.tmp`);
    await writeFile(temporary, manifest); await rename(temporary, path.join(directory, '.frameos-thumbnails.json'));
  }
  return files;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (!args[0] || args.some(arg => arg.startsWith('--') && arg !== '--recursive')) { console.error('Usage: node scripts/generate-thumbnails.mjs <PC-media-folder> [--recursive] (FFmpeg and FFprobe on PATH)'); process.exitCode = 1; }
  else { try { await generateDirectory(args[0], { recursive: args.includes('--recursive') }); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
