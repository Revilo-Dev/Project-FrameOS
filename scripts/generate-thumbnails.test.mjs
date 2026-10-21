import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
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

test('selected snapshots can be written separately while source files remain untouched', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'frameos-thumbnail-output-test-'));
  const source = path.join(directory, 'source'), output = path.join(directory, 'output');
  await mkdir(source); await writeFile(path.join(source, 'Selected.mp4'), 'original media');
  await writeFile(path.join(source, 'Other.mkv'), 'other media');
  await generateDirectory(source, { output, include: ['Selected.mp4'], log() {}, execute: async (executable, args) => {
    if (executable === 'ffprobe') return '60';
    assert.equal(args[8], path.join(source, 'Selected.mp4'));
    await writeFile(args.at(-1), 'simulated JPEG'); return '';
  } });
  assert.deepEqual((await readdir(source)).sort(), ['Other.mkv', 'Selected.mp4']);
  assert.equal(await readFile(path.join(source, 'Selected.mp4'), 'utf8'), 'original media');
  const manifest = JSON.parse(await readFile(path.join(output, '.frameos-thumbnails.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.files), ['Selected.mp4']);
  assert.equal(manifest.files['Selected.mp4'].relativePath, 'Selected.mp4');
  assert.deepEqual(JSON.parse(manifest.files['Selected.mp4'].identity).slice(0, 2), ['Selected.mp4', 14]);
});
