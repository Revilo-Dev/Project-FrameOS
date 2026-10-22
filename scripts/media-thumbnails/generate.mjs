import { generateDirectory, verifyTools } from '../generate-thumbnails.mjs';
import { approveWrites } from './approval.mjs';

const args = process.argv.slice(2), directory = args.shift();
try {
  if (!directory || directory.startsWith('--')) throw Error('Usage: node scripts/media-thumbnails/generate.mjs <USB-drive-or-directory> [--approve-write] [--ffmpeg <exe>] [--ffprobe <exe>]');
  const options = { recursive: true }, report = { generated: 0, skipped: 0, failed: [] };
  let approved = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--approve-write') approved = true;
    else if (['--ffmpeg', '--ffprobe'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i];
    else throw Error(`Unknown/incomplete option: ${args[i]}`);
  }
  await verifyTools(options);
  if (await approveWrites(directory, undefined, approved)) {
    await generateDirectory(directory, { ...options, report });
    console.log(JSON.stringify(report, null, 2));
    if (report.failed.length) process.exitCode = 1;
  } else console.log('Cancelled. No files written.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
