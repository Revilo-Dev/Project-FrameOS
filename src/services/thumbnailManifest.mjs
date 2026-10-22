// Shared by the Windows generator and TV; UTF-16 handles the exact filesystem
// name without depending on drive letters, encodings, WebCrypto or locale.
export function manifestBucket(name) {
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = (Math.imul(hash, 31) + name.charCodeAt(index)) | 0;
  return (hash & 255).toString(16).padStart(2, '0');
}
