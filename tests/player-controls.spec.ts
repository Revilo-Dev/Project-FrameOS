import { test, expect } from '@playwright/test';
import { nativeFixture, openSeries } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.open-meteo.com/**', route => route.abort());
});

test('Previous mirrors Next, changes episodes, and leaves remote Back available to exit', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.locator('#player-previous')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#player-back')).toHaveCount(0);
  expect(await page.locator('#player-previous path').getAttribute('d')).toBe(await page.locator('#player-next path').getAttribute('d'));
  await expect(page.locator('#player-previous .icon')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await page.locator('#player-previous').focus(); await page.keyboard.press('Enter'); await expect(page.locator('.player-top h1')).toContainText('S01E01');
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toContainText('S01E02');
  await expect(page.locator('#player-previous')).toHaveAttribute('aria-disabled', 'false');
  await page.locator('#player-previous').click(); await expect(page.locator('.player-top h1')).toContainText('S01E01');
  await page.keyboard.press('Escape'); await expect(page.locator('.video-player')).toHaveCount(0);
  await expect(page.locator('#media-entry-1')).toBeFocused();
});

test('remote focus reaches the 10-second actions and timeline arrows seek 30 seconds without changing pause', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.oncurrentplaytime(50000));
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#player-rewind')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '40000');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await expect(page.locator('#player-forward')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '50000');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '80000');
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '50000');
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#player-toggle')).toBeFocused();
});

test('Volume seeks 20 seconds while controls are hidden, serializes repeats, preserves pause and clamps endpoints', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page, { volumeKeys: true, delaySeek: true }); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  expect(await page.evaluate(() => window.__playerFixture.keys)).toEqual(expect.arrayContaining(['VolumeUp', 'VolumeDown']));
  expect(await page.evaluate(() => window.__playerFixture.keys)).not.toContain('VolumeMute');
  await page.clock.runFor(4100); await expect(page.locator('.video-player')).not.toHaveClass(/controls-visible/);
  await page.evaluate(() => { for (let i = 0; i < 15; i++) document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9201, bubbles: true, cancelable: true })); });
  await expect(page.locator('.player-skip-feedback')).toHaveText('+20s');
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual(['seek:20000']);
  await page.evaluate(() => window.__playerFixture.finishSeek()); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '20000');
  await page.keyboard.press('MediaPlayPause');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'AudioVolumeDown', bubbles: true, cancelable: true })));
  await page.evaluate(() => window.__playerFixture.finishSeek());
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '1'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.evaluate(() => window.__playerFixture.listener!.oncurrentplaytime(175000));
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9201, bubbles: true, cancelable: true })));
  await page.evaluate(() => window.__playerFixture.finishSeek()); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '179000');
});

test('volume capture is absent in Settings and the library and is released after playback', async ({ page }) => {
  await nativeFixture(page, { channels: true, volumeKeys: true }); await page.goto('/'); await page.locator('#top-settings').click();
  expect(await page.evaluate(() => window.__playerFixture.keys)).not.toContain('VolumeUp');
  const untouched = await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'VolumeUp', keyCode: 9201, bubbles: true, cancelable: true })));
  expect(untouched).toBe(true);
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-clock')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await expect(page.locator('#top-settings')).toBeFocused();
  await page.locator('#home-media').click(); await expect(page.locator('#media-entry-0')).toBeFocused(); await page.keyboard.press('Enter');
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-1')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.releasedKeys)).toEqual(expect.arrayContaining(['VolumeUp', 'VolumeDown']));
  expect(await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9201, bubbles: true, cancelable: true })))).toBe(true);
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual([]);
});
