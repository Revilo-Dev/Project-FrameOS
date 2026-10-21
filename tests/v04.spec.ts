import { mediaOption } from './mediaOptions';
import { test, expect } from '@playwright/test';
import { nativeFixture, openSeries } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.open-meteo.com/**', route => route.abort());
});

test('natural completion autoplays in episode order, Back cancels, and the final episode finishes once', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted());
  await expect(page.locator('.player-next-transition')).toContainText('Playing next episode');
  await page.keyboard.press('Escape'); await page.clock.runFor(2000);
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Replay');
  await expect(page.locator('.player-top h1')).toContainText('S01E01');
  await page.locator('#player-toggle').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(1700);
  await expect(page.locator('.player-top h1')).toContainText('S01E02'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(1700);
  await expect(page.locator('.player-top h1')).toContainText('S01E10'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(4000);
  await expect(page.locator('.player-ended')).toContainText('End of this folder'); await expect(page.locator('.player-next-transition')).toHaveCount(0);
});

for (const failed of ['missing', 'unsupported'] as const) test(`automatic playback skips a ${failed} next episode without looping`, async ({ page }) => {
  await page.clock.install();
  await nativeFixture(page, failed === 'missing' ? { missing: 'S01E02.1080p.MKV' } : { failPrepareFor: 'S01E02.1080p.MKV' });
  await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(1700);
  await expect(page.locator('.player-top h1')).toContainText('S01E02');
  await expect(page.locator('.player-message')).toBeVisible(); await expect(page.locator('.player-next-transition')).toBeVisible(); await page.clock.runFor(1700);
  await expect(page.locator('.player-top h1')).toContainText('S01E10'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
});

test('paused completion, playback errors and manual stop do not trigger autoplay; preference OFF persists', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('MediaPlayPause'); await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(2000);
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play'); await expect(page.locator('.player-top h1')).toContainText('S01E01');
  await page.evaluate(() => window.__playerFixture.listener!.onerror('UnsupportedCodec')); await page.clock.runFor(2000);
  await expect(page.locator('.player-message')).toContainText('UnsupportedCodec'); await expect(page.locator('.player-next-transition')).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaStop', bubbles: true })));  await expect(page.locator('.video-player')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.locator('#app-settings').click(); await page.locator('#settings-tab-media').click();
  await page.locator('#autoplay-toggle').click(); await expect(page.locator('#autoplay-toggle')).toContainText('OFF');
  await page.reload(); await page.locator('#app-settings').click(); await page.locator('#settings-tab-media').click(); await expect(page.locator('#autoplay-toggle')).toContainText('OFF');
  await page.keyboard.press('Escape'); await page.keyboard.press('ArrowDown'); await page.locator('#media-entry-0').click(); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(3000); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Replay');
});

test('supported channel keys skip 30 seconds, preserve pause, clamp endpoints, and serialize rapid seeks', async ({ page }) => {
  await nativeFixture(page, { channels: true, delaySeek: true }); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  expect(await page.evaluate(() => window.__playerFixture.keys)).toContain('ChannelUp');
  await page.evaluate(() => { for (let i = 0; i < 15; i++) document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9101, bubbles: true, cancelable: true })); });
  await expect(page.locator('.player-skip-feedback')).toHaveText('+30s');
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual(['seek:30000']);
  await page.evaluate(() => window.__playerFixture.finishSeek()); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
  await page.keyboard.press('MediaPlayPause'); await page.keyboard.press('PageDown'); await page.evaluate(() => window.__playerFixture.finishSeek());
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '1'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('MediaPlayPause'); await page.evaluate(() => window.__playerFixture.listener!.oncurrentplaytime(175000));
  await page.keyboard.press('PageUp'); await page.evaluate(() => window.__playerFixture.finishSeek()); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '179000');
  await expect(page.locator('.player-next-transition')).toHaveCount(0);
});

test('continuous remote scrolling keeps focus visible with thousands of files and bounded DOM', async ({ page }) => {
  await nativeFixture(page, { count: 2000 }); await openSeries(page);
  for (let row = 0; row < 18; row++) await page.keyboard.press('ArrowDown');
  const focused = page.locator('.media-tile.is-focused'); await expect(focused).toBeFocused();
  expect(await page.locator('.media-tile').count()).toBeLessThanOrEqual(31);
  expect(await page.locator('.media-viewport').evaluate(element => element.scrollTop)).toBeGreaterThan(3000);
  const card = await focused.boundingBox(), viewport = await page.locator('.media-viewport').boundingBox();
  expect(card!.y).toBeGreaterThanOrEqual(viewport!.y); expect(card!.y + card!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
  expect(card!.width).toBeGreaterThanOrEqual(240); expect(card!.width).toBeLessThanOrEqual(300);
  await expect(focused).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'artifacts/v04-media.png' });
});

test('recoverable updating state retries once, permission errors stay distinct, removal shows disconnected USB', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  await page.evaluate(() => { window.__playerFixture.failDirectory = 'UnknownError'; }); await mediaOption(page, 'media-refresh');
  await expect(page.getByText('Home hub is updating try again soon', { exact: true })).toBeVisible();
  await expect(page.locator('#media-recovery-refresh')).toBeFocused();
  await page.evaluate(() => { window.__playerFixture.failDirectory = ''; window.__playerFixture.delayDirectory = true; });
  const before = await page.evaluate(() => window.__playerFixture.reads.length);
  await page.locator('#media-recovery-refresh').click();
  await page.locator('#media-options').click();
  await page.evaluate(() => { for (let i = 0; i < 10; i++) document.getElementById('media-refresh')!.click(); });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__playerFixture.reads.length)).toBe(before + 1);
  await page.evaluate(() => { window.__playerFixture.delayDirectory = false; window.__playerFixture.finishDirectory(); }); await expect(page.locator('#media-entry-1')).toBeVisible();
  await page.evaluate(() => { window.__playerFixture.failDirectory = 'SecurityError'; }); await mediaOption(page, 'media-refresh');
  await expect(page.locator('.media-error')).toContainText('denied'); await expect(page.locator('.media-recovery')).toHaveCount(0);
  await page.evaluate(() => window.__playerFixture.remove()); await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible();
});

test('persistent cached root appears before a delayed reconciliation and clearing cache retains preferences', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await mediaOption(page, 'media-hidden');
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-0')).toContainText('Series');
  await page.reload(); await page.evaluate(() => { window.__playerFixture.delayDirectory = true; }); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#media-entry-0')).toContainText('Series');
  await page.evaluate(() => { window.__playerFixture.delayDirectory = false; window.__playerFixture.finishDirectory(); });
  await page.keyboard.press('Escape'); await page.locator('#app-settings').click(); await page.locator('#settings-tab-media').click(); await page.locator('#media-cache-clear').click();
  await expect(page.locator('.settings-content').getByText('Media cache cleared.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('frameos.media.v1')!).showHidden)).toBe(true);
});

test('visibility resume revalidates the folder and does not resume video or request foreground ownership', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.video-player')).toHaveCount(0);
  const before = await page.evaluate(() => window.__playerFixture.calls.filter(call => call === 'play').length);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#media-entry-1')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call === 'play').length)).toBe(before);
});

test('background reconciliation keeps player controls focused', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  const before = await page.evaluate(() => window.__playerFixture.reads.length);
  await page.evaluate(() => { window.__playerFixture.delayDirectory = true; }); await mediaOption(page, 'media-refresh');
  await expect.poll(() => page.evaluate(() => window.__playerFixture.reads.length)).toBe(before + 1);
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toBeFocused();
  await page.evaluate(() => { window.__playerFixture.delayDirectory = false; window.__playerFixture.finishDirectory(); });
  await expect(page.locator('#player-toggle')).toBeFocused(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
});

test('a missing final candidate leaves a finished state without looping', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page, { missing: 'S01E10.1080p.mkv' }); await openSeries(page);
  await page.locator('#media-entry-2').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onstreamcompleted()); await page.clock.runFor(1700);
  await expect(page.locator('.player-ended')).toContainText('No more playable videos'); await page.clock.runFor(5000);
  await expect(page.locator('.player-next-transition')).toHaveCount(0);
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('open:'))).toHaveLength(1);
});

test('USB removal during a delayed refresh clears cached playback paths immediately', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  const before = await page.evaluate(() => window.__playerFixture.reads.length);
  await page.evaluate(() => { window.__playerFixture.delayDirectory = true; }); await mediaOption(page, 'media-refresh');
  await expect.poll(() => page.evaluate(() => window.__playerFixture.reads.length)).toBe(before + 1);
  await page.evaluate(() => window.__playerFixture.remove());
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible(); await expect(page.locator('.media-tile')).toHaveCount(0);
  await page.evaluate(() => { window.__playerFixture.delayDirectory = false; window.__playerFixture.finishDirectory(); });
  await expect(page.locator('#media-home')).toBeFocused();
  await page.evaluate(() => window.__playerFixture.reinsert()); await expect(page.locator('#media-entry-0')).toBeFocused();
});
