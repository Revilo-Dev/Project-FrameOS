import type { ActionResult } from '../types/launcher';
import { applicationApi, FRAMEOS_APP_ID, SAMSUNG_HOME_ID, normaliseInstalledApps, queryInstalledApps, selectableApps, type InstalledApp } from './installedApps';
import { LaunchDiagnostics, launchError } from './LaunchDiagnostics';

export const TV_APPS = {
  youtube: { name: 'YouTube', ids: ['9Ur5IzDKqV.TizenYouTube', 'com.samsung.tv.cobalt-yt'], names: ['youtube'] },
  stan: { name: 'Stan', ids: ['73iTZRTc34.Stan'], names: ['stan'] },
  prime: { name: 'Prime Video', ids: ['org.tizen.primevideo'], names: ['prime video', 'amazon prime video'] },
  gallery: { name: 'Gallery', ids: ['com.samsung.tv.gallery'], names: ['gallery'] },
  browser: { name: 'Browser', ids: ['com.samsung.tv.knox-browser', 'org.tizen.browser'], names: ['internet', 'browser'] },
  art: { name: 'Art Mode', ids: ['org.tizen.art-app', 'com.samsung.tv.coba.art'], names: ['artapp', 'art mode'] },
  'samsung-home': { name: 'Samsung Home', ids: [SAMSUNG_HOME_ID], names: [] },
} as const;
export type TvApp = keyof typeof TV_APPS;
type ApplicationInfo = InstalledApp;
interface Applications {
  getAppsInfo?(success: (apps: ApplicationInfo[]) => void, failure: (error: unknown) => void): void;
  launch?(id: string, success: () => void, failure: (error: unknown) => void): void;
  launchAppControl?(control: unknown, id: string, success: () => void, failure: (error: unknown) => void): void;
}
export function tvAppCandidates(app: TvApp, installed?: ApplicationInfo[]): string[] {
  const spec = TV_APPS[app];
  // This exact component was identified on the owner's TV. System apps can be
  // omitted from the public catalogue; do not guess an alternate Home ID.
  if (app === 'samsung-home') return [SAMSUNG_HOME_ID];
  if (!installed) return [...spec.ids];
  const exact = spec.ids.filter(id => installed.some(item => item.id === id));
  const names = installed.filter(item => (spec.names as readonly string[]).includes(item.name.trim().toLowerCase()) && !/dummy|companion|service|background/i.test(item.id)).map(item => item.id);
  return [...new Set([...exact, ...names])].slice(0, 4);
}
/** Runs only on launcher selection. IDs were read from the configured TV. */
interface LaunchOptions { diagnostics?: LaunchDiagnostics; discover?(): Promise<InstalledApp[]>; timeoutMs?: number; exact?: InstalledApp; permitted?(): boolean }
export function launchTvApp(runtime: unknown, app: TvApp, options: LaunchOptions = {}): Promise<ActionResult | null> {
  const spec = options.exact || TV_APPS[app];
  const record = options.diagnostics?.begin(spec.name);
  const mark = (value: Parameters<LaunchDiagnostics['update']>[1]) => { if (record !== undefined) options.diagnostics!.update(record, value); };
  const tizen = (runtime as { tizen?: { application?: Applications; ApplicationControl?: new (operation: string) => unknown } })?.tizen;
  const application = tizen?.application;
  if (!application?.launch && !(application?.launchAppControl && tizen?.ApplicationControl)) { mark({ state: 'Failed', error: 'Application API unavailable' }); return Promise.resolve({ status: 'unavailable', title: `${spec.name} is unavailable`, message: 'The TV application launcher is not available in this environment.' }); }
  return new Promise(resolve => {
    let done = false, listed = false, attempt = 0;
    const finish = (result: ActionResult | null) => { if (done) return; done = true; clearTimeout(timer); mark(result ? { state: 'Failed', error: result.message } : { state: 'API accepted', error: '' }); resolve(result); };
    const fail = (error: unknown) => {
      const value = error as { name?: string; message?: string };
      finish({ status: value?.name === 'NotFoundError' ? 'unavailable' : 'error', title: `Unable to open ${spec.name}`, message: value?.name === 'SecurityError' ? 'The TV denied permission to launch this app. Check the installed package’s application.launch privilege and the target app’s launch restrictions.' : `${value?.name || 'LaunchError'}: ${value?.message || `The television could not launch ${spec.name}.`}`.slice(0, 400) });
    };
    const timer = setTimeout(() => fail({ name: 'TimeoutError', message: 'The TV app launcher did not respond.' }), options.timeoutMs ?? 10000);
    const launch = (ids: string[], index = 0, control = false) => {
      if (done) return;
      if (options.permitted && !options.permitted()) { fail({ name: 'CancelledError', message: 'FrameOS became hidden before the launch could be sent. Select the app again when ready.' }); return; }
      const id = ids[index];
      if (!id) { finish({ status: 'unavailable', title: `${spec.name} is not installed`, message: options.exact ? 'Refresh installed apps in FrameOS Settings. If the app was removed, restore it using its usual installation method.' : `Open Samsung Apps to install or update ${spec.name}, then try again.` }); return; }
      const token = ++attempt;
      mark({ state: 'Launch requested', appId: id, method: control || !application.launch ? 'launchAppControl' : 'launch' });
      const accepted = () => { if (token === attempt) finish(null); };
      const failure = (error: unknown) => {
        if (done || token !== attempt) return;
        const name = (error as { name?: string })?.name;
        if (name === 'NotSupportedError' && !control && application.launchAppControl && tizen?.ApplicationControl) launch(ids, index, true);
        else if (['NotFoundError', 'NotSupportedError'].includes(name || '') && index + 1 < ids.length) launch(ids, index + 1);
        else fail(error);
      };
      try {
        if (application.launch && !control) application.launch(id, accepted, failure);
        else application.launchAppControl!(new tizen!.ApplicationControl!('http://tizen.org/appcontrol/operation/default'), id, accepted, failure);
      } catch (error) { failure(error); }
    };
    const select = (apps?: ApplicationInfo[], discoveryError?: unknown) => {
      if (listed || done) return; listed = true;
      try {
        mark({ discovery: apps ? 'Installed list read' : `Discovery unavailable${discoveryError ? ` (${launchError(discoveryError)})` : ''}; ${options.exact ? 'exact ID cannot be verified' : 'using known destination IDs'}` });
        if (options.exact) {
          if (!apps) { fail({ name: 'DiscoveryError', message: 'The installed app could not be verified. Refresh the installed-app list and try again.' }); return; }
          launch(apps.some(item => item.id === options.exact!.id) ? [options.exact.id] : []);
        } else launch(tvAppCandidates(app, apps));
      } catch (error) { fail(error); }
    };
    try {
      if (options.discover) void options.discover().then(select, error => select(undefined, error));
      else if (application.getAppsInfo) application.getAppsInfo(values => { try { select(normaliseInstalledApps(values)); } catch (error) { select(undefined, error); } }, error => select(undefined, error));
      else select();
    }
    catch (error) { select(undefined, error); }
  });
}

/** Shared discovery cache; launch is exclusively user initiated, never retried
 * after reconnect/resume. Native ACK and visibility are separate evidence. */
export class TvApplications {
  readonly diagnostics = new LaunchDiagnostics();
  private cached?: { apps: InstalledApp[]; until: number };
  private pending?: Promise<InstalledApp[]>;
  private epoch = 0;
  private busy = false;
  private visibilityEpoch = 0;
  constructor(private runtime?: unknown, private now = Date.now, private timeoutMs = 4000) {}
  discover = (refresh = false): Promise<InstalledApp[]> => {
    if (this.pending) return this.pending;
    if (!refresh && this.cached && this.cached.until > this.now()) return Promise.resolve(this.cached.apps);
    const epoch = this.epoch;
    const operation = queryInstalledApps(this.runtime, this.timeoutMs).then(apps => { if (epoch === this.epoch) this.cached = { apps, until: this.now() + 60000 }; return apps; });
    this.pending = operation;
    void operation.then(() => { if (this.pending === operation) this.pending = undefined; }, () => { if (this.pending === operation) this.pending = undefined; });
    return operation;
  };
  async choices(refresh = false) {
    const apps = await this.discover(refresh);
    let self = FRAMEOS_APP_ID;
    try { self = applicationApi(this.runtime)?.getCurrentApplication?.().appInfo.id || self; } catch { /* Known identity remains excluded. */ }
    return selectableApps(apps, self);
  }
  invalidate() { this.epoch++; this.cached = undefined; this.pending = undefined; }
  visibility(hidden: boolean) { this.diagnostics.visibility(hidden); if (hidden) this.visibilityEpoch++; else this.invalidate(); }
  private async request(work: () => Promise<ActionResult | null>) {
    if (this.busy) return { status: 'unavailable' as const, title: 'Opening an application', message: 'Wait for the current launch request to finish.' };
    this.busy = true;
    try { return await work(); } catch (error) { return { status: 'error' as const, title: 'Unable to open application', message: launchError(error) }; }
    finally { this.busy = false; }
  }
  launch(app: TvApp) { const epoch = this.visibilityEpoch; return this.request(() => launchTvApp(this.runtime, app, { diagnostics: this.diagnostics, discover: () => this.discover(), permitted: () => epoch === this.visibilityEpoch })); }
  launchInstalled(app: InstalledApp) {
    const epoch = this.visibilityEpoch;
    return this.request(() => launchTvApp(this.runtime, 'youtube', { exact: app, diagnostics: this.diagnostics, permitted: () => epoch === this.visibilityEpoch, discover: async () => selectableApps(await this.discover(true)) }));
  }
}
