import { expect, type Page } from '@playwright/test';
import type { AvPlayListener } from '../src/platform/AvPlayController';
declare global {
  interface Window {
    __playerFixture: { calls: string[]; keys: string[]; releasedKeys: string[]; thumbnails: number; reads: string[]; listener?: AvPlayListener; finishSeek(): void; remove(): void; reinsert(): void; failDirectory: string; delayDirectory: boolean; finishDirectory(): void };
  }
}
export async function nativeFixture(page: Page, options: { apps?: boolean; videoNames?: string[]; delayDirectory?: boolean; youtube?: 'success' | 'missing' | 'denied'; delaySeek?: boolean; failPrepare?: boolean; thumbnail?: string; missingPlayer?: boolean; channels?: boolean; volumeKeys?: boolean; count?: number; missing?: string; failPrepareFor?: string; folderName?: string; offline?: { name: string; size: number; modified: number; image: string; imageUri: string; sourceUri?: string } } = {}) {
  await page.addInitScript(options => {
    const root = 'removable_sdc7';
    const folderName = options.folderName || 'Series';
    const series = options.videoNames || (options.offline ? [options.offline.name] : options.count ? Array.from({ length: options.count }, (_, i) => `Episode ${i + 1}.mp4`) : ['Series.Name.S01E10.1080p.mkv', 'Series.Name.S01E02.1080p.MKV', 'Series.Name.S01E01.1080p.mp4']);
    let mounted = true, state = 'NONE', gate = false, currentPath = '';
    let pendingRead = () => {};
    let change: ((value: unknown) => void) | undefined;
    const test = { failDirectory: '', delayDirectory: !!options.delayDirectory, finishDirectory: () => pendingRead(), calls: [] as string[], keys: [] as string[], releasedKeys: [] as string[], thumbnails: 0, reads: [] as string[], listener: undefined as AvPlayListener | undefined, finishSeek: () => {}, remove() { mounted = false; change?.({ label: root, type: 'EXTERNAL', state: 'REMOVED' }); }, reinsert() { mounted = true; change?.({ label: root, type: 'EXTERNAL', state: 'MOUNTED' }); } };
    const uri = (path: string) => `file:///media/${path.split('/').map(encodeURIComponent).join('/')}`;
    const describe = (path: string, name: string, folder = false) => ({ name, fullPath: `/opt/storage/${path}/${name}`, isDirectory: folder, fileSize: folder ? undefined : options.offline?.name === name ? options.offline.size : 12000000, modified: options.offline?.name === name ? new Date(options.offline.modified) : undefined, toURI: () => options.offline?.name === name && options.offline.sourceUri ? options.offline.sourceUri : uri(`${path}/${name}`) });
    const storage = () => ({ label: root, type: 'EXTERNAL', state: 'MOUNTED' });
    const filesystem = {
      listStorages(success: (items: unknown[]) => void) { queueMicrotask(() => success(mounted ? [storage()] : [])); },
      resolve(path: string, success: (file: unknown) => void, failure: (error: unknown) => void, mode: string) {
        if (mode !== 'r') throw Error('Write access is forbidden');
        if (options.offline && path.endsWith('/.frameos-thumbnails.json')) { const text = JSON.stringify({ version: 1, files: { [options.offline.name]: { image: options.offline.image, size: options.offline.size, modified: options.offline.modified } } }); success({ isDirectory: false, fileSize: text.length, readAsText(done: (text: string) => void) { done(text); } }); return; }
        if (options.offline && path.endsWith('/' + options.offline.image)) { success({ isDirectory: false, toURI: () => options.offline!.imageUri }); return; }
        if (path.endsWith('.jpg')) { failure({ name: 'NotFoundError' }); return; }
        if (!mounted) { failure({ name: 'NotFoundError' }); return; }
        if (/\.(?:mp4|mkv)$/i.test(path)) { if (options.missing && path.endsWith(options.missing)) { failure({ name: 'NotFoundError' }); return; } const slash = path.lastIndexOf('/'); success(describe(path.slice(0, slash), path.slice(slash + 1))); return; }
        success({ name: path.split('/').pop(), fullPath: `/opt/storage/${path}`, isDirectory: true, toURI: () => uri(path), listFiles(done: (files: unknown[]) => void, failure: (error: unknown) => void) {
          test.reads.push(path);
          pendingRead = () => { if (test.failDirectory) { failure({ name: test.failDirectory }); return; } done(path === root ? [describe(path, folderName, true), describe(path, 'Film 10.mp4'), describe(path, 'Film 2.MP4'), describe(path, 'notes.txt')] : path === `${root}/${folderName}` ? [describe(path, 'Extras', true), ...series.map(name => describe(path, name))] : []); }; if (!test.delayDirectory) queueMicrotask(pendingRead);
        } });
      },
      addStorageStateChangeListener(callback: (value: unknown) => void) { change = callback; return 1; }, removeStorageStateChangeListener() { change = undefined; },
    };
    const call = (name: string) => { test.calls.push(name); if (gate) throw Error(`VIOLATION during native operation: ${name}`); };
    const avplay = {
      getState() { call('state'); return state; }, open(path: string) { call(`open:${path}`); if (state !== 'NONE') throw Error('open state'); state = 'IDLE'; currentPath = path; },
      setListener(listener: AvPlayListener) { call('listener'); test.listener = listener; }, setDisplayRect() { call('fullscreen'); }, setDisplayMethod() { call('letterbox'); },
      prepareAsync(success: () => void, failure: (error: unknown) => void) { call('prepare'); gate = true; queueMicrotask(() => { gate = false; if (options.failPrepare || options.failPrepareFor && currentPath.endsWith(options.failPrepareFor)) failure({ name: 'UnsupportedCodec' }); else { state = 'READY'; success(); } }); },
      getDuration() { call('duration'); return 180000; }, play() { call('play'); if (!['READY', 'PAUSED'].includes(state)) throw Error('play state'); state = 'PLAYING'; },
      pause() { call('pause'); if (state !== 'PLAYING') throw Error('pause state'); state = 'PAUSED'; },
      seekTo(position: number, success: () => void) { call(`seek:${position}`); gate = true; test.finishSeek = () => { gate = false; success(); }; if (!options.delaySeek) queueMicrotask(test.finishSeek); },
      stop() { call('stop'); state = 'IDLE'; }, close() { call('close'); state = 'NONE'; },
    };
    class AttributeFilter { constructor(public field: string, public match: string, public value: string) {} }
    Object.assign(window, { __playerFixture: test, webapis: options.missingPlayer ? undefined : { avplay }, tizen: { application: options.youtube || options.apps ? {
      getAppsInfo(done: (apps: unknown[]) => void) { done(options.youtube === 'missing' ? [] : options.apps ? [{ id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube' }, { id: '73iTZRTc34.Stan', name: 'Stan' }, { id: 'org.tizen.primevideo-dummy', name: 'Prime Video' }, { id: 'org.tizen.primevideo', name: 'Prime Video' }, { id: 'com.samsung.tv.gallery', name: 'Gallery' }, { id: 'com.samsung.tv.knox-browser', name: 'Internet' }, { id: 'org.tizen.art-app', name: 'ArtApp' }] : [{ id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube' }]); },
      launch(id: string, done: () => void, fail: (error: unknown) => void) { test.calls.push(`launch:${id}`); if (options.youtube === 'denied') fail({ name: 'SecurityError' }); else done(); },
    } : {}, filesystem, AttributeFilter,
      content: { find(done: (items: unknown[]) => void, _failure: unknown, _directory: unknown, filter: AttributeFilter) { test.thumbnails++; queueMicrotask(() => done(options.thumbnail ? [{ contentURI: filter.value, thumbnailURIs: [options.thumbnail] }] : [])); } },
      tvinputdevice: { registerKey(name: string) { test.keys.push(name); }, unregisterKey(name: string) { test.releasedKeys.push(name); }, getSupportedKeys() { return [{ name: 'MediaTrackNext', code: 9001 }, { name: 'MediaPlayPause', code: 9002 }, ...(options.channels ? [{ name: 'ChannelUp', code: 9101 }, { name: 'ChannelDown', code: 9102 }] : []), ...(options.volumeKeys ? [{ name: 'VolumeUp', code: 9201 }, { name: 'VolumeDown', code: 9202 }, { name: 'VolumeMute', code: 449 }] : [])]; } },
    } });
  }, options);
}
export async function openSeries(page: Page) {
  await page.goto('/'); await expect(page.locator('#app-youtube')).toBeFocused(); await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#media-entry-0')).toHaveText(/Extras/);
}
