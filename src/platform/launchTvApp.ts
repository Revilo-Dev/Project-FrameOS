import type { ActionResult } from '../types/launcher';

export const TV_APPS = {
  youtube: { name: 'YouTube', ids: ['9Ur5IzDKqV.TizenYouTube', 'com.samsung.tv.cobalt-yt'], names: ['youtube'] },
  stan: { name: 'Stan', ids: ['73iTZRTc34.Stan'], names: ['stan'] },
  prime: { name: 'Prime Video', ids: ['org.tizen.primevideo'], names: ['prime video', 'amazon prime video'] },
  gallery: { name: 'Gallery', ids: ['com.samsung.tv.gallery'], names: ['gallery'] },
  browser: { name: 'Browser', ids: ['com.samsung.tv.knox-browser', 'org.tizen.browser'], names: ['internet', 'browser'] },
  art: { name: 'Art Mode', ids: ['org.tizen.art-app', 'com.samsung.tv.coba.art'], names: ['artapp', 'art mode'] },
} as const;
export type TvApp = keyof typeof TV_APPS;
interface ApplicationInfo { id: string; name: string }
interface Applications {
  getAppsInfo?(success: (apps: ApplicationInfo[]) => void, failure: (error: unknown) => void): void;
  launch?(id: string, success: () => void, failure: (error: unknown) => void): void;
  launchAppControl?(control: unknown, id: string, success: () => void, failure: (error: unknown) => void): void;
}
export function tvAppCandidates(app: TvApp, installed?: ApplicationInfo[]): string[] {
  const spec = TV_APPS[app];
  if (!installed) return [...spec.ids];
  const exact = spec.ids.filter(id => installed.some(item => item.id === id));
  const names = installed.filter(item => (spec.names as readonly string[]).includes(item.name.trim().toLowerCase()) && !/dummy|companion|service|background/i.test(item.id)).map(item => item.id);
  return [...new Set([...exact, ...names])].slice(0, 4);
}
/** Runs only on launcher selection. IDs were read from the configured TV. */
export function launchTvApp(runtime: unknown, app: TvApp): Promise<ActionResult | null> {
  const spec = TV_APPS[app];
  const tizen = (runtime as { tizen?: { application?: Applications; ApplicationControl?: new (operation: string) => unknown } })?.tizen;
  const application = tizen?.application;
  if (!application?.launch && !(application?.launchAppControl && tizen?.ApplicationControl)) return Promise.resolve({ status: 'unavailable', title: `${spec.name} is unavailable`, message: 'The TV application launcher is not available in this environment.' });
  return new Promise(resolve => {
    let done = false, listed = false;
    const finish = (result: ActionResult | null) => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
    const fail = (error: unknown) => {
      const value = error as { name?: string; message?: string };
      finish({ status: value?.name === 'NotFoundError' ? 'unavailable' : 'error', title: `Unable to open ${spec.name}`, message: value?.name === 'SecurityError' ? 'The installed FrameOS package does not have permission to launch TV apps. Install the approved launch-enabled build.' : `${value?.name || 'LaunchError'}: ${value?.message || `The television could not launch ${spec.name}.`}`.slice(0, 400) });
    };
    const timer = setTimeout(() => fail({ name: 'TimeoutError', message: 'The TV app launcher did not respond.' }), 10000);
    const launch = (ids: string[], index = 0, control = false) => {
      if (done) return;
      const id = ids[index];
      if (!id) { finish({ status: 'unavailable', title: `${spec.name} is not installed`, message: `Open Samsung Apps to install or update ${spec.name}, then try again.` }); return; }
      const failure = (error: unknown) => {
        if (done) return;
        const name = (error as { name?: string })?.name;
        if (name === 'NotSupportedError' && !control && application.launchAppControl && tizen?.ApplicationControl) launch(ids, index, true);
        else if (['NotFoundError', 'NotSupportedError'].includes(name || '') && index + 1 < ids.length) launch(ids, index + 1);
        else fail(error);
      };
      try {
        if (application.launch && !control) application.launch(id, () => finish(null), failure);
        else application.launchAppControl!(new tizen!.ApplicationControl!('http://tizen.org/appcontrol/operation/default'), id, () => finish(null), failure);
      } catch (error) { failure(error); }
    };
    const select = (apps?: ApplicationInfo[]) => { if (listed || done) return; listed = true; try { launch(tvAppCandidates(app, apps)); } catch (error) { fail(error); } };
    try { if (application.getAppsInfo) application.getAppsInfo(select, () => select()); else select(); }
    catch { select(); }
  });
}
