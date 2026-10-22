export const FRAMEOS_APP_ID = 'TdjFk7yyVS.frameos';
export const SAMSUNG_HOME_ID = 'com.samsung.tv.csfs';
export interface InstalledApp { id: string; name: string; show?: boolean; version?: string }
export interface ApplicationApi {
  getAppsInfo?(success: (apps: InstalledApp[]) => void, failure: (error: unknown) => void): void;
  getCurrentApplication?(): { appInfo: { id: string } };
  launch?(id: string, success: () => void, failure: (error: unknown) => void): void;
  launchAppControl?(control: unknown, id: string, success: () => void, failure: (error: unknown) => void): void;
}
export function applicationApi(runtime: unknown): ApplicationApi | undefined {
  try { return (runtime as { tizen?: { application?: ApplicationApi } })?.tizen?.application; } catch { return undefined; }
}
export function validAppId(value: unknown): value is string { return typeof value === 'string' && /^[a-z\d][a-z\d_.-]{0,255}$/i.test(value); }
export function normaliseInstalledApps(values: unknown): InstalledApp[] {
  if (!Array.isArray(values)) throw Error('Invalid application list returned by the TV.');
  const apps = new Map<string, InstalledApp>();
  for (const item of values.slice(0, 4096)) {
    // Native WebIDL fields can be inherited getters rather than own properties.
    try {
      if (!validAppId(item.id) || typeof item.name !== 'string' || !item.name.trim() || apps.has(item.id)) continue;
      apps.set(item.id, { id: item.id, name: item.name.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 120), ...(typeof item.show === 'boolean' ? { show: item.show } : {}), ...(typeof item.version === 'string' ? { version: item.version.slice(0, 60) } : {}) });
    } catch { /* A malformed native record must not hide other installed apps. */ }
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function queryInstalledApps(runtime: unknown, timeoutMs = 4000): Promise<InstalledApp[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (work: () => void) => { if (!done) { done = true; clearTimeout(timer); work(); } };
    const timer = setTimeout(() => finish(() => reject(Error('TimeoutError: installed-app discovery did not respond.'))), timeoutMs);
    try {
      const api = applicationApi(runtime);
      if (!api?.getAppsInfo) { finish(() => reject(Error('Installed-app discovery is available on the Samsung TV only.'))); return; }
      api.getAppsInfo(values => finish(() => { try { resolve(normaliseInstalledApps(values)); } catch (error) { reject(error); } }), error => finish(() => reject(error)));
    } catch (error) { finish(() => reject(error)); }
  });
}
const consumerIds = new Set(['9Ur5IzDKqV.TizenYouTube', 'com.samsung.tv.cobalt-yt', '73iTZRTc34.Stan', 'org.tizen.primevideo', 'com.samsung.tv.gallery', 'com.samsung.tv.knox-browser', 'org.tizen.browser', 'org.tizen.netflix-app', 'org.tizen.apple.apple-music', 'com.samsung.tv.aria-video']);
const reserved = new Set([FRAMEOS_APP_ID, SAMSUNG_HOME_ID, 'org.tizen.art-app', 'com.samsung.tv.coba.art', 'com.samsung.tv.coba.setting']);
export function selectableApps(apps: InstalledApp[], selfId = FRAMEOS_APP_ID) {
  return apps.filter(app => app.id !== selfId && !reserved.has(app.id) && !/dummy|companion|service|background|worker|preview|promotion|plugin|factory|daemon|agent|security|privacy|account|e-?manual|^ep[.-]/i.test(`${app.id} ${app.name}`)
    && (consumerIds.has(app.id) || app.show === true || app.show !== false && /^[a-z\d]{10}\./i.test(app.id)));
}
