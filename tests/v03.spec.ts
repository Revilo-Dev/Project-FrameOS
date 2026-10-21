import { mediaOption } from './mediaOptions';
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { contentSecurityPolicy } from '../scripts/tv-policy.mjs';

import { nativeFixture, openSeries } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {
    timezone: 'Australia/Brisbane', current: { temperature_2m: 25, weather_code: 0, is_day: 1, time: '2026-10-20T12:00' },
    hourly: { time: Array.from({ length: 7 }, (_, i) => `2026-10-20T${12 + i}:00`), weather_code: [0,0,0,0,0,0,0], temperature_2m: [25,25,25,25,25,25,25], is_day: [1,1,1,1,1,1,1], precipitation_probability: [0,0,0,0,0,0,0] },
  } }));
});

test('episode cards show full title on focus, native playback controls and ordered Next/Previous restore folder focus', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.focused-media-title')).toHaveText('Series.Name.S01E01.1080p.mp4');
  await expect(page.locator('#media-entry-1 .media-filename')).toHaveText('Episode 01');
  await expect(page.locator('#media-entry-2 .media-filename')).toHaveText('Episode 02');
  await expect(page.locator('#media-entry-3 .media-filename')).toHaveText('Episode 10');
  await expect(page.locator('[aria-label*="trash" i]')).toHaveCount(0);
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E01.1080p');
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#player-seek')).toBeFocused(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9001, bubbles: true, cancelable: true })));
  await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E02.1080p');
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E10.1080p');
  await expect(page.locator('#player-next')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('MediaTrackPrevious'); await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E02.1080p');
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
  await mediaOption(page, 'media-hidden'); await expect(page.locator('.media-tile')).toHaveCount(4); await expect(page.locator('#media-entry-1')).toHaveClass(/media-hidden-item/);
  await page.locator('#media-entry-1').focus(); await page.keyboard.press('ContextMenu'); await expect(page.locator('#context-hide')).toHaveText('Unhide');
  await page.keyboard.press('Enter'); await expect(page.locator('.media-hidden-item')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-0')).toContainText('Series');
  await page.locator('#media-entry-0').click({ button: 'right' }); await page.locator('#context-hide').click();
  await expect(page.locator('#media-entry-0')).toHaveClass(/media-hidden-item/); await mediaOption(page, 'media-hidden');
  await expect(page.locator('.media-tile')).toHaveCount(3); await page.reload(); await page.keyboard.press('ArrowDown'); await expect(page.locator('.media-tile')).toHaveCount(3);
  await mediaOption(page, 'media-hidden'); await page.locator('#media-entry-0').click();
  await expect(page.locator('.media-hidden-item')).toHaveCount(4); await page.locator('#media-entry-1').focus(); await mediaOption(page, 'media-item-options');
  await expect(page.locator('#context-hide')).toHaveText('Unhide'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('frameos.media.v1')!).showHidden)).toBe(true);
});
test('hidden videos are excluded from Next, and empty native thumbnail metadata uses placeholders', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  await page.locator('#media-entry-2').click({ button: 'right' }); await page.locator('#context-hide').click();
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toHaveText('Series.Name.S01E10.1080p');
  await page.keyboard.press('Escape'); await expect(page.locator('.media-thumbnail img')).toHaveCount(0);
  // Two root videos + three series videos; at most four targeted index
  // queries each (URI, native path, decoded path, exact name), never a scan.
  expect(await page.evaluate(() => window.__playerFixture.thumbnails)).toBeLessThanOrEqual(20);
});
test('controls hide after four seconds, first directional input reveals them, paused controls stay visible', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause'); await page.clock.runFor(4100); await expect(page.locator('.video-player')).not.toHaveClass(/controls-visible/);
  await page.keyboard.press('ArrowRight'); await expect(page.locator('.video-player')).toHaveClass(/controls-visible/); await expect(page.locator('#player-toggle')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play'); await page.clock.runFor(6000); await expect(page.locator('.video-player')).toHaveClass(/controls-visible/);
  // Desktop Chromium has no Samsung video plane. Review overlays against a dark
  // test surface; this screenshot is not evidence of native video decoding.
  await page.screenshot({ path: 'artifacts/v03-player.png', style: '.native-video-surface{visibility:hidden}.video-player{background:#0b1017}' });
});
test('USB removal during a seek closes the UI immediately and defers native cleanup safely', async ({ page }) => {
  await nativeFixture(page, { delaySeek: true }); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
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
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('MediaPlayPause'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play'); await page.keyboard.press('MediaPlayPause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Replay'); await page.keyboard.press('Escape');
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause'); await page.keyboard.press('Escape');
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
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
});
test('New Beith uses verified coordinates, persists and keeps Brisbane available; Settings dock label stays hidden until focused', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('api.open-meteo.com')) requests.push(request.url()); });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible(); await expect(page.locator('#app-settings .app-name')).toHaveCSS('opacity', '0');
  await page.locator('#app-settings').click(); await page.locator('#settings-tab-weather').click(); await expect(page.locator('#city-brisbane')).toBeVisible(); await page.locator('#city-new-beith').click();
  await page.keyboard.press('Escape'); await expect(page.locator('.weather-city')).toHaveText('New Beith'); await expect(page.locator('.weather-hour')).toHaveCount(6);
  const url = new URL(requests.find(url => url.includes('latitude=-27.766'))!); expect(url.searchParams.get('longitude')).toBe('152.942');
  await page.reload(); await expect(page.locator('.weather-city')).toHaveText('New Beith');
});
