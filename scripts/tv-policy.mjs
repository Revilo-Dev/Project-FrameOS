import { createHash } from 'node:crypto';

export const weatherOrigin = 'https://api.open-meteo.com';
export const readOnlyPrivileges = Object.freeze([
  'http://tizen.org/privilege/filesystem.read',
  'http://tizen.org/privilege/externalstorage',
  'http://tizen.org/privilege/internet',
]);
// Vite's classic SystemJS entry and injected local CSS require inline script/style.
// No eval, remote scripts, geolocation, write access, frames or media playback.
export const contentSecurityPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.open-meteo.com; object-src 'none'; base-uri 'none'; frame-src 'none'";
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function createPackagingManifest(original, policy) {
  if (!Buffer.isBuffer(original)) throw new Error('Policy overlay requires the original manifest bytes.');
  if (!policy || policy.version !== 1 || policy.release !== '0.2.0'
      || !/^[a-f\d]{64}$/.test(policy.originalManifestSha256 || '')
      || Object.keys(policy).sort().join(',') !== 'originalManifestSha256,release,version') {
    throw new Error('Invalid v0.2 manifest policy; arbitrary metadata/policy changes are not supported.');
  }
  if (hash(original) !== policy.originalManifestSha256) throw new Error('Original config.xml differs from the reviewed policy baseline; no manifest was written.');
  const xml = original.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY|<(?:tizen:)?(?:privilege|access|content-security-policy)\b/i.test(xml)
      || !/<widget\b[^>]*xmlns="http:\/\/www\.w3\.org\/ns\/widgets"[^>]*xmlns:tizen="http:\/\/tizen\.org\/ns\/widgets"/.test(xml)
      || (xml.match(/<\/widget>/g) || []).length !== 1 || !/<\/widget>\s*$/.test(xml)) {
    throw new Error('Manifest layout/policy differs from the reviewed baseline; manual policy review is required.');
  }
  const newline = xml.includes('\r\n') ? '\r\n' : '\n';
  const additions = [
    ...readOnlyPrivileges.map((privilege) => `    <tizen:privilege name="${privilege}"/>`),
    `    <access origin="${weatherOrigin}" subdomains="false"/>`,
    `    <tizen:content-security-policy>${contentSecurityPolicy}</tizen:content-security-policy>`,
  ].join(newline) + newline;
  const offset = original.indexOf(Buffer.from('</widget>'));
  const manifest = Buffer.concat([original.subarray(0, offset), Buffer.from(additions), original.subarray(offset)]);
  return { manifest, originalSha256: hash(original), packagedSha256: hash(manifest), additions };
}
