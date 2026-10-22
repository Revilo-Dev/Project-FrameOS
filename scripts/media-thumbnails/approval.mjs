import { createInterface } from 'node:readline/promises';
import path from 'node:path';

export async function approveWrites(directory, output, approved = false) {
  console.log(`Read videos from: ${path.resolve(directory)}`);
  console.log(`Create .frameos-thumbnails directories and .frameos-thumbnails.json manifests under: ${path.resolve(output || directory)}`);
  console.log('Original videos will only be read. Existing FrameOS thumbnails/manifests may be updated.');
  if (approved) return true;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await prompt.question('Type YES to approve these writes: ')).trim() === 'YES'; }
  finally { prompt.close(); }
}
