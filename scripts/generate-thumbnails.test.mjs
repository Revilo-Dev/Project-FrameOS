import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateDirectory, snapshotArguments, writeManifest } from './generate-thumbnails.mjs';
import { manifestBucket } from '../src/services/thumbnailManifest.mjs';

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

test('recursive generation handles Unicode, changed media, missing images and extraction failures without changing videos', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'frameos-recursive-'));
  const nested = path.join(root, 'Nested folder é'); await mkdir(nested);
  await writeFile(path.join(nested, 'Episode é 1.mkv'), 'original');
  await writeFile(path.join(root, 'broken.mp4'), 'bad');
  let calls = 0;
  const execute = async (executable, args) => {
    if (executable === 'ffprobe') return '100';
    calls++;
    if (args.includes(path.join(root, 'broken.mp4'))) throw Error('Invalid video');
    await writeFile(args.at(-1), 'JPEG test payload'); return '';
  };
  const report = { generated: 0, skipped: 0, failed: [] };
  await generateDirectory(root, { recursive: true, execute, report, log() {} });
  assert.equal(report.generated, 1); assert.equal(report.failed.length, 1);
  assert.match(report.failed[0].path, /broken.mp4$/);
  const before = calls;
  const again = { generated: 0, skipped: 0, failed: [] };
  await generateDirectory(root, { recursive: true, execute, report: again, log() {} });
  assert.equal(again.skipped, 1); assert.equal(again.generated, 0);
  assert(calls > before); // Failed media are reported independently on each run.
  await writeFile(path.join(nested, 'Episode é 1.mkv'), 'changed size');
  const changed = { generated: 0, skipped: 0, failed: [] };
  await generateDirectory(root, { recursive: true, execute, report: changed, log() {} });
  assert.equal(changed.generated, 1);
  assert.equal(await readFile(path.join(root, 'broken.mp4'), 'utf8'), 'bad');
  assert.equal(await readFile(path.join(nested, 'Episode é 1.mkv'), 'utf8'), 'changed size');
  assert(snapshotArguments('in', 'out', 60).includes('0:v:0'));
  assert(snapshotArguments('in', 'out', 60).some(arg => arg.includes('blackframe')));
});

test('large folders publish a small shard index, bound every read, and preserve exact Unicode names', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'frameos-manifest-large-'));
  const files = Object.fromEntries(Array.from({ length: 10000 }, (_, index) => [`Nested é episode ${index}.mkv`, { image: '.frameos-thumbnails/0123456789abcdef01234567.jpg', size: index, modified: 1000 }]));
  await writeManifest(root, files);
  const descriptor = JSON.parse(await readFile(path.join(root, '.frameos-thumbnails.json'), 'utf8'));
  assert.equal(descriptor.version, 2);
  const shards = await readdir(path.join(root, '.frameos-thumbnails'));
  const restored = {};
  for (const shard of shards) {
    const text = await readFile(path.join(root, '.frameos-thumbnails', shard), 'utf8');
    assert(Buffer.byteLength(text) < 256 * 1024);
    const { files: entries } = JSON.parse(text); Object.assign(restored, entries);
    for (const name of Object.keys(entries)) assert.equal(shard, `manifest-${manifestBucket(name)}.json`);
  }
  assert.deepEqual(restored, files);
});
