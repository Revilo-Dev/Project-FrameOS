export const weatherOrigin: string;
export const readOnlyPrivileges: readonly string[];
export const contentSecurityPolicy: string;
export function createPackagingManifest(original: Buffer, policy: unknown): { manifest: Buffer; originalSha256: string; packagedSha256: string; additions: string };
