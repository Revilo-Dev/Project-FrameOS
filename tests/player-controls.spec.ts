import { test, expect } from '@playwright/test';
import { nativeFixture, openSeries } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
});

test('five controls precede the right-aligned time and progress, with black Play/Pause focus and D-pad seeking', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toBeFocused();
  await expect(page.locator('#player-toggle')).toHaveCSS('border-top-color', 'rgb(0, 0, 0)');
  await expect(page.locator('#player-toggle')).toHaveCSS('border-top-width', '3px');
  const buttons = await page.locator('.player-controls').boundingBox(), bar = await page.locator('#player-seek').boundingBox(), time = await page.locator('.player-time').boundingBox();
  expect(buttons!.y + buttons!.height).toBeLessThanOrEqual(time!.y); expect(time!.y + time!.height).toBeLessThan(bar!.y + bar!.height / 2); expect(time!.x + time!.width).toBeCloseTo(bar!.x + bar!.width, 0);
  expect(time!.y + time!.height).toBeLessThan(1040);
  await page.keyboard.press('Enter'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#player-seek')).toBeFocused(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#player-toggle')).toBeFocused();
  await expect(page.locator('.player-controls > button')).toHaveCount(5);
  await expect(page.locator('#player-rewind')).toHaveText('−10');
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#player-rewind')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '20000');
  await page.locator('#player-forward').click(); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toContainText('S01E02');
  await page.locator('#player-previous').click(); await expect(page.locator('.player-top h1')).toContainText('S01E01');
  await expect(page.locator('#player-previous .icon')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await page.locator('#player-seek').focus(); await expect(page.locator('#player-seek')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('#player-seek')).toHaveCSS('outline-style', 'none'); await expect(page.locator('#player-seek')).toHaveCSS('box-shadow', 'none');
  await expect(page.locator('.player-knob')).toHaveCSS('border-top-color', 'rgb(114, 181, 255)');
  await page.screenshot({ path: 'artifacts/v038/player.png', style: '.native-video-surface{visibility:hidden}.video-player{background:#0b1017}' });
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-1')).toBeFocused();
});

test('volume/mute and held volume pass through with visible, hidden and paused controls; channels still seek', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page, { channels: true, volumeKeys: true, delaySeek: true }); await openSeries(page); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  expect(await page.evaluate(() => window.__playerFixture.keys)).not.toEqual(expect.arrayContaining(['VolumeUp', 'VolumeDown']));
  const sendVolume = async () => expect(await page.evaluate(() => {
    const untouched: boolean[] = [];
    for (const [key, keyCode] of [['VolumeUp', 447], ['VolumeDown', 448], ['VolumeMute', 449], ['AudioVolumeUp', 9201], ['Unidentified', 9202]] as const) for (let i = 0; i < 15; i++) untouched.push(document.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, repeat: i > 0, bubbles: true, cancelable: true })));
    return untouched.every(Boolean);
  })).toBe(true);
  await sendVolume(); await page.clock.runFor(4100); await expect(page.locator('.video-player')).not.toHaveClass(/controls-visible/); await sendVolume();
  await expect(page.locator('.video-player')).not.toHaveClass(/controls-visible/);
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual([]);
  await page.keyboard.press('MediaPlayPause'); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play'); await sendVolume();
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9101, bubbles: true, cancelable: true })));
  await page.evaluate(() => window.__playerFixture.finishSeek()); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await page.keyboard.press('Escape'); await sendVolume();
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual(['seek:30000']);
});

test('volume stays owned by Samsung on Home and Settings while channel tabs remain available', async ({ page }) => {
  await nativeFixture(page, { channels: true, volumeKeys: true }); await page.goto('/'); await page.locator('#top-settings').click();
  expect(await page.evaluate(() => window.__playerFixture.keys)).not.toContain('VolumeUp');
  expect(await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'VolumeDown', keyCode: 448, bubbles: true, cancelable: true })))).toBe(true);
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-clock')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual([]);
});
