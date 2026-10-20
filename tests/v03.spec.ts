import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AvPlayListener } from '../src/platform/AvPlayController';
import { contentSecurityPolicy } from '../scripts/tv-policy.mjs';

declare global {
  interface Window {
    __playerFixture: { calls: string[]; keys: string[]; thumbnails: number; reads: string[]; listener?: AvPlayListener; finishSeek(): void; remove(): void; reinsert(): void };
  }
}
async function nativeFixture(page: Page, options: { delaySeek?: boolean; failPrepare?: boolean; thumbnail?: string; missingPlayer?: boolean } = {}) {
  await page.addInitScript(options => {
    const root = 'removable_sdc7';
    const series = ['Series.Name.S01E10.1080p.mkv', 'Series.Name.S01E02.1080p.MKV', 'Series.Name.S01E01.1080p.mp4'];
    let mounted = true, state = 'NONE', gate = false;
    let change: ((value: unknown) => void) | undefined;
    const test = { calls: [] as string[], keys: [] as string[], thumbnails: 0, reads: [] as string[], listener: undefined as AvPlayListener | undefined, finishSeek: () => {}, remove() { mounted = false; change?.({ label: root, type: 'EXTERNAL', state: 'REMOVED' }); }, reinsert() { mounted = true; change?.({ label: root, type: 'EXTERNAL', state: 'MOUNTED' }); } };
    const uri = (path: string) => `file:///media/${path.split('/').map(encodeURIComponent).join('/')}`;
    const describe = (path: string, name: string, folder = false) => ({ name, fullPath: `/opt/storage/${path}/${name}`, isDirectory: folder, fileSize: folder ? undefined : 12000000, toURI: () => uri(`${path}/${name}`) });
    const storage = () => ({ label: root, type: 'EXTERNAL', state: 'MOUNTED' });
    const filesystem = {
      listStorages(success: (items: unknown[]) => void) { queueMicrotask(() => success(mounted ? [storage()] : [])); },
      resolve(path: string, success: (file: unknown) => void, failure: (error: unknown) => void, mode: string) {
        if (mode !== 'r') throw Error('Write access is forbidden');
        if (!mounted) { failure({ name: 'NotFoundError' }); return; }
        if (/\.(?:mp4|mkv)$/i.test(path)) { const slash = path.lastIndexOf('/'); success(describe(path.slice(0, slash), path.slice(slash + 1))); return; }
        success({ name: path.split('/').pop(), fullPath: `/opt/storage/${path}`, isDirectory: true, toURI: () => uri(path), listFiles(done: (files: unknown[]) => void) {
          test.reads.push(path);
          queueMicrotask(() => done(path === root ? [describe(path, 'Series', true), describe(path, 'Film 10.mp4'), describe(path, 'Film 2.MP4'), describe(path, 'notes.txt')] : path === `${root}/Series` ? [describe(path, 'Extras', true), ...series.map(name => describe(path, name))] : []));
        } });
      },
      addStorageStateChangeListener(callback: (value: unknown) => void) { change = callback; return 1; }, removeStorageStateChangeListener() { change = undefined; },
    };
    const call = (name: string) => { test.calls.push(name); if (gate) throw Error(`VIOLATION during native operation: ${name}`); };
    const avplay = {
      getState() { call('state'); return state; }, open(path: string) { call(`open:${path}`); if (state !== 'NONE') throw Error('open state'); state = 'IDLE'; },
      setListener(listener: AvPlayListener) { call('listener'); test.listener = listener; }, setDisplayRect() { call('fullscreen'); }, setDisplayMethod() { call('letterbox'); },
      prepareAsync(success: () => void, failure: (error: unknown) => void) { call('prepare'); gate = true; queueMicrotask(() => { gate = false; if (options.failPrepare) failure({ name: 'UnsupportedCodec' }); else { state = 'READY'; success(); } }); },
      getDuration() { call('duration'); return 180000; }, play() { call('play'); if (!['READY', 'PAUSED'].includes(state)) throw Error('play state'); state = 'PLAYING'; },
      pause() { call('pause'); if (state !== 'PLAYING') throw Error('pause state'); state = 'PAUSED'; },
      seekTo(position: number, success: () => void) { call(`seek:${position}`); gate = true; test.finishSeek = () => { gate = false; success(); }; if (!options.delaySeek) queueMicrotask(test.finishSeek); },
      stop() { call('stop'); state = 'IDLE'; }, close() { call('close'); state = 'NONE'; },
    };
    class AttributeFilter { constructor(public field: string, public match: string, public value: string) {} }
    Object.assign(window, { __playerFixture: test, webapis: options.missingPlayer ? undefined : { avplay }, tizen: { application: {}, filesystem, AttributeFilter,
      content: { find(done: (items: unknown[]) => void, _failure: unknown, _directory: unknown, filter: AttributeFilter) { test.thumbnails++; queueMicrotask(() => done(options.thumbnail ? [{ contentURI: filter.value, thumbnailURIs: [options.thumbnail] }] : [])); } },
      tvinputdevice: { registerKey(name: string) { test.keys.push(name); }, unregisterKey() {}, getSupportedKeys() { return [{ name: 'MediaTrackNext', code: 9001 }, { name: 'MediaPlayPause', code: 9002 }]; } },
    } });
  }, options);
}
test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {
    timezone: 'Australia/Brisbane', current: { temperature_2m: 25, weather_code: 0, is_day: 1, time: '2026-10-20T12:00' },
    hourly: { time: Array.from({ length: 7 }, (_, i) => `2026-10-20T${12 + i}:00`), weather_code: [0,0,0,0,0,0,0], temperature_2m: [25,25,25,25,25,25,25], is_day: [1,1,1,1,1,1,1], precipitation_probability: [0,0,0,0,0,0,0] },
  } }));
});
async function openSeries(page: Page) {
  await page.goto('/'); await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#media-entry-0')).toHaveText(/Extras/);
}
test('episode cards show full title on focus, native playback controls and ordered Next/Previous restore folder focus', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.focused-media-title')).toHaveText('Series.Name.S01E01.1080p.mp4');
  await expect(page.locator('#media-entry-1 .media-filename')).toHaveText('Episode 01');
  await expect(page.locator('#media-entry-2 .media-filename')).toHaveText('Episode 02');
  await expect(page.locator('#media-entry-3 .media-filename')).toHaveText('Episode 10');
  await expect(page.locator('[aria-label*="trash" i]')).toHaveCount(0);
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveText('Pause');
  await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E01.1080p.mp4');
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveText('Play');
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveText('Pause');
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#player-seek')).toBeFocused(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '10000');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9001, bubbles: true, cancelable: true })));
  await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E02.1080p.MKV');
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E10.1080p.mkv');
  await expect(page.locator('#player-next')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('#player-previous').click(); await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E02.1080p.MKV');
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-2')).toBeFocused();
  const calls = await page.evaluate(() => window.__playerFixture.calls);
  expect(calls.some(call => call === 'open:/media/removable_sdc7/Series/Series.Name.S01E02.1080p.MKV')).toBe(true);
  expect(calls.filter(call => call === 'stop')).toHaveLength(4);
  expect(await page.evaluate(() => window.__playerFixture.reads)).toEqual(['removable_sdc7', 'removable_sdc7/Series']);
  await page.screenshot({ path: 'artifacts/v03-media.png' });
});
test('long OK hides without opening, Options restores hidden files, toggle and folder preferences persist', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page); await openSeries(page); await page.keyboard.press('ArrowRight');
  await page.keyboard.down('Enter'); await page.clock.runFor(760); await expect(page.locator('#context-hide')).toHaveText('Hide');
  await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.locator('#context-hide')).toBeFocused(); expect(await page.evaluate(() => window.__playerFixture.calls.some(call => call.startsWith('open:')))).toBe(false);
  await page.keyboard.press('Enter'); await expect(page.locator('.media-tile')).toHaveCount(3);
  await page.locator('#media-hidden').click(); await expect(page.locator('.media-tile')).toHaveCount(4); await expect(page.locator('#media-entry-1')).toHaveClass(/media-hidden-item/);
  await page.locator('#media-entry-1').focus(); await page.keyboard.press('ContextMenu'); await expect(page.locator('#context-hide')).toHaveText('Unhide');
  await page.keyboard.press('Enter'); await expect(page.locator('.media-hidden-item')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-0')).toContainText('Series');
  await page.locator('#media-entry-0').click({ button: 'right' }); await page.locator('#context-hide').click();
  await expect(page.locator('#media-entry-0')).toHaveClass(/media-hidden-item/); await page.locator('#media-hidden').click();
  await expect(page.locator('.media-tile')).toHaveCount(3); await page.reload(); await page.keyboard.press('ArrowDown'); await expect(page.locator('.media-tile')).toHaveCount(3);
  await page.locator('#media-hidden').click(); await page.locator('#media-entry-0').click();
  await expect(page.locator('.media-hidden-item')).toHaveCount(4); await page.locator('#media-entry-1').focus(); await page.locator('#media-options').click();
  await expect(page.locator('#context-hide')).toHaveText('Unhide'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('frameos.media.v1')!).showHidden)).toBe(true);
});
test('hidden videos are excluded from Next, and empty native thumbnail metadata uses placeholders', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  await page.locator('#media-entry-2').click({ button: 'right' }); await page.locator('#context-hide').click();
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveText('Pause');
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E10.1080p.mkv');
  await page.keyboard.press('Escape'); await expect(page.locator('.media-thumbnail img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__playerFixture.thumbnails)).toBeLessThanOrEqual(5);
});
test('controls hide after four seconds, first directional input reveals them, paused controls stay visible', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveText('Pause'); await page.clock.runFor(4100); await expect(page.locator('.video-player')).not.toHaveClass(/controls-visible/);
  await page.keyboard.press('ArrowRight'); await expect(page.locator('.video-player')).toHaveClass(/controls-visible/); await expect(page.locator('#player-toggle')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveText('Play'); await page.clock.runFor(6000); await expect(page.locator('.video-player')).toHaveClass(/controls-visible/);
  // Desktop Chromium has no Samsung video plane. Review overlays against a dark
  // test surface; this screenshot is not evidence of native video decoding.
  await page.screenshot({ path: 'artifacts/v03-player.png', style: '.native-video-surface{visibility:hidden}.video-player{background:#0b1017}' });
});
test('USB removal during a seek closes the UI immediately and defers native cleanup safely', async ({ page }) => {
  await nativeFixture(page, { delaySeek: true }); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveText('Pause');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight');
  await page.evaluate(() => window.__playerFixture.remove()); await expect(page.locator('.video-player')).toHaveCount(0);
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible(); await expect(page.locator('.media-message')).toContainText('disconnected');
  const before = await page.evaluate(() => window.__playerFixture.calls.length); await page.evaluate(() => window.__playerFixture.finishSeek());
  expect((await page.evaluate(() => window.__playerFixture.calls)).slice(before)).toEqual(['state', 'stop', 'state', 'close']);
  await expect(page.locator('#media-home')).toBeFocused();
  await page.evaluate(() => window.__playerFixture.reinsert()); await expect(page.locator('#media-entry-0')).toBeFocused();
  await expect(page.locator('.media-message')).toHaveCount(0);
});
test('unsupported codecs display an error and Back keeps the current folder', async ({ page }) => {
  await nativeFixture(page, { failPrepare: true }); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('.player-message')).toContainText('UnsupportedCodec'); await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-1')).toBeFocused();
  await page.reload(); await page.keyboard.press('ArrowDown'); await page.locator('#media-entry-0').click();
  await page.locator('#media-entry-1').click(); await expect(page.locator('.player-message')).toContainText('UnsupportedCodec');
});
test('missing AVPlay reports capability unavailable and does not pretend to play video', async ({ page }) => {
  await nativeFixture(page, { missingPlayer: true }); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('.player-message')).toContainText('requires Samsung AVPlay'); await expect(page.locator('.native-video-surface')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-1')).toBeFocused();
});
test('native EOS and media PlayPause keys preserve the launcher and cleanup on Back', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveText('Pause');
  await page.keyboard.press('MediaPlayPause'); await expect(page.locator('#player-toggle')).toHaveText('Play'); await page.keyboard.press('MediaPlayPause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await expect(page.locator('#player-toggle')).toHaveText('Replay');
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveText('Pause'); await page.keyboard.press('Escape');
  await expect(page.locator('#media-entry-1')).toBeFocused(); expect(await page.evaluate(() => window.__playerFixture.keys.every(key => key.startsWith('Media')))).toBe(true);
});
test('an existing native-index thumbnail loads on a file origin, is cached, and has bounded visible requests', async ({ page }) => {
  const catalog = JSON.parse(readFileSync(resolve('src/services/wallpaper-catalog.json'), 'utf8'));
  const thumbnail = pathToFileURL(resolve('dist', catalog[0].thumbnail)).href;
  await nativeFixture(page, { thumbnail }); await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.evaluate(csp => { const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = csp; document.head.appendChild(meta); }, contentSecurityPolicy);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.media-thumbnail img')).toHaveCount(2);
  expect(await page.locator('.media-thumbnail img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const reads = await page.evaluate(() => window.__playerFixture.thumbnails);
  await page.keyboard.press('Escape'); await page.keyboard.press('ArrowDown'); await expect(page.locator('.media-thumbnail img')).toHaveCount(2);
  expect(await page.evaluate(() => window.__playerFixture.thumbnails)).toBe(reads);
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveText('Pause');
});
test('New Beith uses verified coordinates, persists and keeps Brisbane available; Settings dock icon has no visible label', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('api.open-meteo.com')) requests.push(request.url()); });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible(); await expect(page.locator('#app-settings')).toHaveText('');
  await page.locator('#app-settings').click(); await page.locator('#settings-tab-weather').click(); await expect(page.locator('#city-brisbane')).toBeVisible(); await page.locator('#city-new-beith').click();
  await page.keyboard.press('Escape'); await expect(page.locator('.weather-city')).toHaveText('New Beith'); await expect(page.locator('.weather-hour')).toHaveCount(6);
  const url = new URL(requests.find(url => url.includes('latitude=-27.766'))!); expect(url.searchParams.get('longitude')).toBe('152.942');
  await page.reload(); await expect(page.locator('.weather-city')).toHaveText('New Beith');
});
