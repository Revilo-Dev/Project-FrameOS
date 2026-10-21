import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateDirectory, snapshotArguments } from './generate-thumbnails.mjs';

test('PC snapshot workflow creates a bounded import manifest, skips unchanged files and does not traverse folders by default', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'frameos-thumbnail-test-'));
  await writeFile(path.join(directory, 'Episode 1.mkv'), 'fixture'); await mkdir(path.join(directory, 'Nested'));
  await writeFile(path.join(directory, 'Nested', 'Episode 2.mp4'), 'fixture');
  let calls = 0;
  const options = { log() {}, execute: async (executable, args) => { calls++; if (executable === 'ffprobe') return '5'; await writeFile(args.at(-1), 'simulated JPEG'); return ''; } };
  await generateDirectory(directory, options); assert.equal(calls, 2);
  const manifest = JSON.parse(await readFile(path.join(directory, '.frameos-thumbnails.json'), 'utf8'));
  assert.equal(manifest.version, 1); assert.deepEqual(Object.keys(manifest.files), ['Episode 1.mkv']);
  assert.match(manifest.files['Episode 1.mkv'].image, /^\.frameos-thumbnails\/[a-f0-9]{24}\.jpg$/);
  await generateDirectory(directory, options); assert.equal(calls, 2);
  assert.equal(snapshotArguments('in', 'out', 5)[6], '1');
});
