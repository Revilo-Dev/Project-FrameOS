import { test, expect, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { contentSecurityPolicy } from '../scripts/tv-policy.mjs';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const wallpapers = JSON.parse(readFileSync(resolve('src/services/wallpaper-catalog.json'), 'utf8')) as { id: string; src: string; thumbnail: string; ambient: string }[];

declare global {
  interface Window {
    __testUsb: { reads: string[]; listener?: (storage: unknown) => void; drives: string[]; removeCount: number };
    __testUsbChange(label: string, mounted: boolean): void;
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T08:23:00Z') });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: {
      timezone: query.get('timezone'),
      current: { temperature_2m: 23.6, weather_code: 2, is_day: 1, time: '2026-10-20T18:00' },
      hourly: { time: ['2026-10-20T18:00','2026-10-20T19:00','2026-10-20T20:00','2026-10-20T21:00','2026-10-20T22:00','2026-10-20T23:00','2026-10-21T00:00'], weather_code: [2,0,3,61,2,3,0], temperature_2m: [23.6,23,22,21,20,20,19], is_day: [1,0,0,0,0,0,0], precipitation_probability: [0,0,10,70,20,10,0] },
    } });
  });
});

async function usbFixture(page: Page, options: { count: number; drives: string[]; fail?: 'discover' | 'resolve' | 'enumerate' } = { count: 3, drives: ['USB A', 'USB B'] }) {
  await page.addInitScript(({ count, drives, fail }) => {
    const state = { reads: [] as string[], drives: drives.slice(), listener: undefined as ((storage: unknown) => void) | undefined, removeCount: 0 };
    const describe = (path: string, name: string, directory = false) => ({ name, fullPath: `/opt/storage/usb/${path}/${name}`, isDirectory: directory, fileSize: directory ? undefined : 1024 * 1024 * 12 });
    const filesystem = {
      listStorages(success: (storages: unknown[]) => void, failure: (error: unknown) => void) { if (fail === 'discover') { failure({ name: 'SecurityError', message: 'Read privilege missing' }); return; } success(state.drives.map(label => Object.create({ get label() { return label; }, get type() { return 'EXTERNAL'; }, get state() { return 'MOUNTED'; } }))); },
      resolve(path: string, success: (directory: unknown) => void, failure: (error: unknown) => void, mode: string) {
        if (mode !== 'r') throw new Error('Fixture refuses write access');
        if (fail === 'resolve') { failure({ name: 'NotFoundError', message: 'Root cannot be resolved' }); return; }
        if (!state.drives.some((root) => path === root || path.startsWith(`${root}/`))) { failure({ name: 'NotFoundError' }); return; }
        success({ name: path.split('/').pop(), fullPath: path, isDirectory: true, toURI: () => `file:///media/${path.replace(/ /g, '%20')}`,
          listFiles(done: (files: unknown[]) => void, failure: (error: unknown) => void) {
            if (fail === 'enumerate') { failure({ name: 'IOError', message: 'Directory read failed' }); return; }
            state.reads.push(path);
            done(path.endsWith('/Empty folder') ? [] : path.includes('/') ? [describe(path, 'Empty folder', true), describe(path, 'A very long video filename for a quiet evening in the living room.MKV'), describe(path, 'photo.jpg'), describe(path, 'music.flac')] : [describe(path, 'Movies', true), ...Array.from({ length: count }, (_, index) => describe(path, `Video ${index + 1}.${index % 2 ? 'mkv' : 'mp4'}`)), describe(path, 'notes.txt')]);
          },
        });
      },
      addStorageStateChangeListener(listener: (storage: unknown) => void) { state.listener = listener; return 7; },
      removeStorageStateChangeListener() { state.listener = undefined; state.removeCount++; },
    };
    Object.assign(window, { tizen: { application: {}, filesystem }, __testUsb: state,
      __testUsbChange(label: string, mounted: boolean) { state.drives = mounted ? [...state.drives.filter((value) => value !== label), label] : state.drives.filter((value) => value !== label); state.listener?.({ label, type: 'EXTERNAL', state: mounted ? 'MOUNTED' : 'REMOVED' }); },
    });
  }, options);
}

test('refreshed home has the supplied logo/icons, one serif clock, hourly weather and seven gradient tiles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-youtube')).toBeFocused();
  await expect(page.locator('.clock time')).toHaveCount(1);
  await expect(page.locator('.clock time')).toHaveText('6:23 PM');
  await expect(page.locator('.clock > span')).toHaveText(/Tuesday,? 20 October/);
  const clock = await page.locator('.clock time').boundingBox();
  expect(clock!.x + clock!.width / 2).toBeCloseTo(960, 0);
  await expect(page.locator('.weather-hour')).toHaveCount(6);
  await expect(page.locator('.weather-temperature')).toContainText('24');
  await expect(page.getByText('Your home, reimagined')).toHaveCount(0);
  await expect(page.getByText('Coming soon', { exact: false })).toHaveCount(0);
  for (const name of ['YouTube', 'Stan', 'Foxtel', 'Gallery', 'Art Mode', 'Browser', 'Settings']) await expect(page.getByRole('button', { name, exact: true })).toContainText(name);
  await expect(page.getByRole('button', { name: 'USB Media', exact: true })).toHaveCount(0);
  await expect(page.locator('.brand-logo')).toHaveAttribute('src', './assets/frameos.svg');
  await expect(page.locator('.fps-counter')).toBeVisible();
  await expect(page.locator('#app-gallery img')).toHaveAttribute('src', './assets/gallery.svg');
  await expect(page.locator('#app-youtube')).toHaveCSS('background-image', /linear-gradient/);
  await expect(page.locator('.home .weather-attribution')).toHaveCount(0);
  await expect(page.locator('#home-media')).toContainText('Media');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 24px "Libre Caslon"'))).toBe(true);
});

test('Down from dock opens genuine no-USB state and Back restores the selected tile', async ({ page }) => {
  await usbFixture(page, { count: 0, drives: [] });
  await page.goto('/');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible();
  await expect(page.getByText('Insert a USB drive to browse your media.')).toBeVisible();
  await expect(page.locator('.media-tile')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-stan')).toBeFocused();
  expect(await page.evaluate(() => window.__testUsb.removeCount)).toBeGreaterThan(0);
});

test('native insertion, root/nested browsing, details, multiple drives, cache and removal work', async ({ page }) => {
  await usbFixture(page, { count: 3, drives: [] });
  await page.goto('/'); await page.keyboard.press('ArrowDown');
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__testUsbChange('USB A', true));
  await expect(page.locator('#media-entry-0')).toBeFocused();
  await expect(page.locator('#media-entry-0')).toContainText('Movies');
  expect(await page.evaluate(() => window.__testUsb.reads)).toEqual(['USB A']);
  await page.keyboard.press('Enter');
  await expect(page.locator('#media-entry-1')).toContainText('.MKV');
  expect(await page.evaluate(() => window.__testUsb.reads)).toEqual(['USB A', 'USB A/Movies']);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.media-details')).toContainText('USB A/Movies/');
  await expect(page.locator('.media-details')).toContainText('12.0 MB');
  await expect(page.locator('.media-details')).toContainText('file:///media/');
  await expect(page.locator('.media-details')).toContainText('v0.3');
  await page.keyboard.press('Escape');
  await expect(page.locator('#media-entry-1')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#media-entry-0')).toContainText('Movies');
  expect(await page.evaluate(() => window.__testUsb.reads.length)).toBe(2);
  await page.evaluate(() => window.__testUsbChange('USB B', true));
  await expect(page.locator('#drive-1')).toContainText('USB B');
  await page.locator('#drive-1').click();
  await expect(page.locator('#media-entry-0')).toBeFocused();
  expect(await page.evaluate(() => window.__testUsb.reads)).toContain('USB B');
  await page.locator('#media-refresh').click();
  await expect(page.locator('#media-entry-0')).toBeFocused();
  expect((await page.evaluate(() => window.__testUsb.reads)).filter((path) => path === 'USB B')).toHaveLength(2);
  await page.evaluate(() => { window.__testUsbChange('USB A', false); window.__testUsbChange('USB B', false); });
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible();
  await expect(page.locator('#media-home')).toBeFocused();
});

test('filters keep folders accessible, empty folders are clear and disconnect closes stale details', async ({ page }) => {
  await usbFixture(page, { count: 3, drives: ['USB A'] });
  await page.goto('/'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#media-entry-0')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#media-entry-0')).toContainText('Empty folder');
  await page.locator('#filter-video').click(); await expect(page.locator('.media-tile')).toHaveCount(2);
  await page.locator('#filter-image').click(); await expect(page.locator('.media-tile')).toHaveCount(2);
  await expect(page.locator('#media-entry-1')).toContainText('photo.jpg');
  await page.locator('#filter-folder').click(); await expect(page.locator('.media-tile')).toHaveCount(1);
  await page.locator('#media-entry-0').click(); await expect(page.getByText('This folder is empty', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.locator('#filter-all').click(); await page.locator('#media-entry-1').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => window.__testUsbChange('USB A', false));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible();
  await expect(page.locator('#media-home')).toBeFocused();
});

test('large folders render at most 18 cards while arrows reach other pages and restore details focus', async ({ page }) => {
  await usbFixture(page, { count: 5000, drives: ['USB A'] });
  await page.goto('/'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#media-entry-0')).toBeFocused();
  await expect(page.locator('.media-tile')).toHaveCount(18);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#media-entry-18')).toBeFocused();
  await expect(page.locator('.media-tile')).toHaveCount(18);
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-18')).toBeFocused();
  expect(await page.evaluate(() => window.__testUsb.reads)).toEqual(['USB A']);
});

test('settings migrate removed wallpapers, preserve preferences, and persist new wallpaper/location choices', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('frameos.settings.v1')) localStorage.setItem('frameos.settings.v1', JSON.stringify({ version: 1, theme: 'warm', wallpaper: 'dune', motion: 'off' })); });
  await page.goto('/');
  await expect(page.locator('.frameos')).toHaveClass(/theme-warm/);
  await expect(page.locator('.wallpaper')).toHaveCSS('background-image', /dark-mount\.jpg/);
  await page.locator('#top-settings').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.media-hub')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#theme-midnight').click();
  await page.locator('#settings-tab-weather').click(); await page.locator('#city-perth').click();
  await expect(page.locator('.weather-credits')).toContainText('Open-Meteo');
  await page.locator('#settings-tab-wallpapers').click(); await page.locator('#wallpaper-forrestclean').click();
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 10009, bubbles: true, cancelable: true })));
  await expect(page.locator('#top-settings')).toBeFocused();
  await expect(page.locator('.weather-city')).toHaveText('Perth');
  await page.reload();
  await expect(page.locator('.frameos')).toHaveClass(/theme-midnight/);
  await expect(page.locator('.wallpaper')).toHaveCSS('background-image', /forrestclean\.jpg/);
  await expect(page.locator('.weather-city')).toHaveText('Perth');
});

test('cached weather survives offline and an uncached city shows an honest unavailable state', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.weather-hour')).toHaveCount(6);
  await page.evaluate(() => { const key = 'frameos.weather.v2.brisbane'; const value = JSON.parse(localStorage.getItem(key)!); value.weather.fetchedAt -= 2 * 60 * 60 * 1000; localStorage.setItem(key, JSON.stringify(value)); });
  await page.route('https://api.open-meteo.com/**', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.weather-status')).toContainText('Saved');
  await expect(page.locator('.weather-hour')).toHaveCount(6);
  await page.locator('#top-settings').click(); await page.locator('#settings-tab-weather').click(); await page.locator('#city-hobart').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.weather-condition')).toHaveText('Weather unavailable');
  await expect(page.locator('.weather-hour')).toHaveCount(0);
});

test('all shortcuts remain reachable and unavailable integrations do not claim success', async ({ page }) => {
  await page.goto('/');
  for (const id of ['youtube', 'stan', 'foxtel', 'gallery', 'art', 'browser', 'settings']) {
    if (id !== 'youtube') await page.keyboard.press('ArrowRight');
    await expect(page.locator(`#app-${id}`)).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
    if (id !== 'settings') await expect(page.getByText(/planned for a future version/)).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator(`#app-${id}`)).toBeFocused();
  }
});

test('packaged file origin and production CSP load without remote scripts or security overrides', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://127.0.0.1:4173/', async (route) => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': contentSecurityPolicy } }); });
  await page.goto('/'); await expect(page.locator('#app-youtube')).toBeFocused();
  await expect(page.locator('.weather-hour')).toHaveCount(6);
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await expect(page.locator('#app-youtube')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.getByText('USB browsing unavailable', { exact: true })).toBeInViewport();
  await page.keyboard.press('Escape'); await expect(page.locator('#app-youtube')).toBeFocused();
  expect(errors).toEqual([]);
});

test('narrow arrangement, rapid input, modal Tab and reduced motion remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/'); await expect(page.locator('.frameos')).toHaveClass(/compact/);
  await page.evaluate(() => { for (let index = 0; index < 40; index++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true })); });
  await expect(page.locator('#app-settings')).toBeFocused();
  await page.keyboard.press('Enter'); await page.locator('#settings-tab-weather').click(); await page.locator('#city-hobart').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#settings-close')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#app-settings')).toBeFocused();
  await expect(page.locator('#app-settings')).toHaveCSS('transition-duration', '0s, 0s, 0s');
  const dock = await page.locator('.app-dock').boundingBox();
  expect(dock!.x).toBeGreaterThanOrEqual(0); expect(dock!.x + dock!.width).toBeLessThanOrEqual(801);
});

test('capture home, settings and Media Hub for visual review', async ({ page }) => {
  await usbFixture(page); await page.goto('/'); await expect(page.locator('.weather-hour')).toHaveCount(6);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'artifacts/v02-home.png' });
  await page.locator('#top-settings').click(); await page.screenshot({ path: 'artifacts/v02-settings.png' });
  await page.keyboard.press('Escape'); await page.locator('#home-media').click(); await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.screenshot({ path: 'artifacts/v02-media.png' });
});

test('all 47 wallpapers are reachable in bounded pages and every photo/thumbnail/ambient image loads', async ({ page }) => {
  await page.goto('/'); await page.locator('#top-settings').click(); await page.locator('#settings-tab-wallpapers').click();
  const names: string[] = [];
  for (let index = 0; index < 4; index++) {
    const choices = page.locator('.wallpaper-choice');
    expect(await choices.count()).toBeLessThanOrEqual(12);
    names.push(...await choices.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')!)));
    if (index < 3) await page.locator('#wallpapers-next').click();
    expect(await page.locator('.frameos').evaluate(element => element.scrollTop)).toBe(0);
  }
  expect(new Set(names).size).toBe(47);
  await page.locator('.wallpaper-choice').last().click();
  await expect(page.locator('.wallpaper-choice').last()).toBeFocused();
  await expect(page.locator('.wallpaper-choice').last()).toHaveClass(/is-focused/);
  await expect(page.locator('.wallpaper')).toHaveCSS('background-image', new RegExp(wallpapers[46].id));
  await page.screenshot({ path: 'artifacts/v02-wallpapers.png' });
  const failures = await page.evaluate(async wallpapers => {
    const failures: string[] = [];
    // Sequential decoding avoids creating 141 full-resolution image surfaces.
    for (const wallpaper of wallpapers) for (const source of [wallpaper.src, wallpaper.thumbnail, wallpaper.ambient]) {
      const image = new Image(); image.src = source;
      try { await image.decode(); } catch { failures.push(source); }
    }
    return failures;
  }, wallpapers);
  expect(failures).toEqual([]);
});

test('native diagnostics read the packaged privilege and enumerate genuine native-shaped storage objects', async ({ page }) => {
  await usbFixture(page);
  await page.route('**/config.xml', async route => route.fulfill({ contentType: 'application/xml', body: await readFile('tizen/config.xml.v0.2.preview', 'utf8') }));
  await page.goto('/'); await page.locator('#top-settings').click(); await page.locator('#settings-tab-usb').click();
  await page.locator('#usb-rescan').click();
  expect(await page.locator('.frameos').evaluate(element => element.scrollTop)).toBe(0);
  await expect(page.locator('#usb-rescan')).toHaveClass(/is-focused/);
  await expect(page.locator('.diagnostic-status')).toContainText('USB detected: 2 drives');
  await expect(page.locator('.diagnostic-facts')).toContainText('2 mounted external');
  await expect(page.locator('.diagnostic-facts dd').nth(2)).toHaveText('Yes');
  await expect(page.locator('.diagnostic-records')).toContainText('USB A');
  await expect(page.locator('.diagnostic-records')).toContainText('5 entries');
  expect(await page.evaluate(() => window.__testUsb.reads)).toEqual(['USB A', 'USB B']);
  await page.screenshot({ path: 'artifacts/v02-usb-diagnostics.png' });
});

for (const fail of ['discover', 'resolve', 'enumerate'] as const) test(`native ${fail} failures remain errors and are never presented as no USB or empty directories`, async ({ page }) => {
  await usbFixture(page, { count: 3, drives: ['removable_sdc7'], fail });
  await page.goto('/'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.media-error')).toBeInViewport();
  await expect(page.getByText('Connect a USB device', { exact: true })).toHaveCount(0);
  await expect(page.getByText('This folder is empty', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.locator('#top-settings').click(); await page.locator('#settings-tab-usb').click();
  await page.locator('#usb-rescan').click();
  await expect(page.locator('.diagnostic-error')).toContainText(fail === 'discover' ? 'SecurityError' : fail === 'resolve' ? 'NotFoundError' : 'IOError');
});

test('network and exit controls are remote accessible, and animation/FPS preferences work', async ({ page }) => {
  await page.goto('/'); await page.locator('#top-network').click();
  await expect(page.getByRole('dialog')).toContainText('Network available'); await page.keyboard.press('Escape');
  await expect(page.locator('#top-network')).toBeFocused(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Close FrameOS?'); await page.keyboard.press('Escape');
  await expect(page.locator('#top-power')).toBeFocused();
  await page.locator('#top-settings').click(); await page.locator('#motion-full').click();
  await expect(page.locator('.frameos')).toHaveClass(/motion-full/);
  await page.locator('#fps-toggle').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.fps-counter')).toHaveCount(0);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.page-stack')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -1080)');
  await expect(page.locator('.home')).toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('Escape'); await expect(page.locator('#app-settings')).toBeFocused();
});

test('Clock settings default to 12-hour time, support remote controls, and persist the selected format and zone', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-20T13:30:00Z'));
  await page.goto('/');
  await expect(page.locator('.clock time')).toHaveText('11:30 PM');
  await expect(page.locator('.clock > span')).toHaveText(/Tuesday,? 20 October/);
  await page.locator('#top-settings').click(); await page.locator('#settings-tab-clock').click();
  await expect(page.locator('#time-format-12h')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Brisbane', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#time-format-12h')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('#time-format-24h')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.clock time')).toHaveText('23:30');
  await expect(page.locator('.weather-hour time').first()).toHaveText('19:00');
  await page.getByRole('button', { name: 'UTC', exact: true }).click();
  await expect(page.locator('.clock time')).toHaveText('13:30');
  await page.getByRole('button', { name: 'Device local time', exact: true }).click();
  await expect(page.locator('.clock time')).toHaveText('23:30');
  await page.getByRole('button', { name: 'Sydney', exact: true }).click();
  await expect(page.locator('.clock time')).toHaveText('00:30');
  await expect(page.locator('.clock > span')).toHaveText(/Wednesday,? 21 October/);
  const choices = await page.locator('.clock-zone-options').boundingBox();
  expect(choices!.y + choices!.height).toBeLessThan(940);
  expect(await page.locator('.frameos').evaluate(element => element.scrollTop)).toBe(0);
  await page.screenshot({ path: 'artifacts/v02-clock-settings.png' });
  await page.keyboard.press('Escape'); await expect(page.locator('#top-settings')).toBeFocused();
  await page.reload(); await expect(page.locator('.clock time')).toHaveText('00:30');
  await page.locator('#top-settings').click(); await page.locator('#settings-tab-clock').click();
  await expect(page.locator('#time-format-24h')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Sydney', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#time-format-12h').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.clock time')).toHaveText('12:30 AM');
  await expect(page.locator('.weather-hour time').first()).toHaveText('7 pm');
});
