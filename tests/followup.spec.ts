import { test, expect } from '@playwright/test';
import { nativeFixture } from './nativeFixture';
import { bitcoinFixture } from './bitcoinFixture';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T08:23:00Z') });
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ body: '' }));
  await page.route('https://api.open-meteo.com/**', route => route.abort());
  await bitcoinFixture(page);
});
test('Bitcoin replaces Calendar with genuine-shaped daily chart, USD quote, stats and an accessible detail panel', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.dashboard-card')).toHaveCount(3);
  const card = page.locator('#widget-bitcoin');
  await expect(card).toContainText('$67,250.00'); await expect(card).toContainText('+3.46%');
  await expect(card).toContainText('24h volume'); await expect(card.locator('svg[role=img]')).toBeVisible();
  expect(await card.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: 'artifacts/v038/home-bitcoin.png' });
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); await expect(card).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('.bitcoin-detail')).toBeVisible();
  await expect(page.locator('.bitcoin-detail')).toContainText('midnight in Australia/Brisbane');
  await page.clock.runFor(600);
  await page.screenshot({ path: 'artifacts/v038/bitcoin-detail.png' });
  await page.keyboard.press('Escape'); await expect(card).toBeFocused();
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.clock.fastForward(301000); await expect(card).toContainText('Saved');
});
for (const outcome of ['success', 'missing', 'denied'] as const) test(`YouTube native launch handles ${outcome} honestly`, async ({ page }) => {
  await nativeFixture(page, { youtube: outcome }); await page.goto('/');
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('launch:'))).toEqual([]);
  await page.locator('#app-youtube').click();
  if (outcome === 'success') {
    await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual(['launch:9Ur5IzDKqV.TizenYouTube']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } else await expect(page.getByRole('dialog')).toContainText(outcome === 'missing' ? 'not installed' : 'permission');
});
test('Media uses the selected preblurred wallpaper and restores native transparency only for playback', async ({ page }) => {
  await nativeFixture(page); await page.goto('/');
  await expect(page.locator('#media-entry-0')).toBeAttached();
  await page.locator('#home-media').click(); await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#media-entry-0')).toContainText('Extras');
  expect(await page.locator('.wallpaper').evaluate(element => getComputedStyle(element).backgroundImage)).toBe(await page.locator('.ambient-wallpaper').evaluate(element => getComputedStyle(element).backgroundImage));
  await expect(page.locator('.media-hub')).toHaveCSS('background-color', 'rgba(11, 20, 31, 0.24)');
  await page.clock.runFor(600);
  await page.screenshot({ path: 'artifacts/v038/media-background.png' });
  await page.locator('#media-entry-1').click(); await expect(page.locator('.wallpaper')).toHaveCSS('visibility', 'hidden');
  await page.keyboard.press('Escape'); await expect(page.locator('.wallpaper')).toHaveCSS('visibility', 'visible');
});

test('opening Media during USB discovery focuses arriving cards without stealing later navigation', async ({ page }) => {
  await nativeFixture(page, { delayDirectory: true }); await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__playerFixture.reads.length)).toBe(1);
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-home')).toBeFocused();
  await page.evaluate(() => { window.__playerFixture.delayDirectory = false; window.__playerFixture.finishDirectory(); });
  await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#media-entry-1')).toBeFocused();
  await page.clock.fastForward(301000); await expect(page.locator('#media-entry-1')).toBeFocused();
});

test('Bitcoin fetches fresh prices every five minutes and refreshes overdue data when Home returns', async ({ page }) => {
  let requests = 0;
  const prices = ['67250', '68000', '69000', '70000'];
  await page.route('https://api.exchange.coinbase.com/products/BTC-USD/stats', route => {
    const last = prices[Math.min(requests++, prices.length - 1)];
    return route.fulfill({ json: { last, high: '71000', low: '64000', volume: String(12000 + requests) } });
  });
  await page.goto('/'); const card = page.locator('#widget-bitcoin');
  await expect(card).toContainText('$67,250.00'); expect(requests).toBe(1);
  await page.clock.fastForward(299000); expect(requests).toBe(1);
  await page.clock.fastForward(2000); await expect(card).toContainText('$68,000.00'); expect(requests).toBe(2);
  await page.clock.fastForward(300001); await expect(card).toContainText('$69,000.00'); expect(requests).toBe(3);
  await page.locator('#home-media').click(); await page.clock.fastForward(301000); expect(requests).toBe(3);
  await page.keyboard.press('Escape'); await expect(card).toContainText('$70,000.00'); expect(requests).toBe(4);
});

test('every installed dock app uses the intended native app, including Prime instead of Foxtel', async ({ page }) => {
  await nativeFixture(page, { apps: true }); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Foxtel', exact: true })).toHaveCount(0);
  for (const [tile, id] of [['youtube', '9Ur5IzDKqV.TizenYouTube'], ['stan', '73iTZRTc34.Stan'], ['prime', 'org.tizen.primevideo'], ['gallery', 'com.samsung.tv.gallery'], ['browser', 'com.samsung.tv.knox-browser'], ['art', 'org.tizen.art-app']]) {
    await page.locator(`#app-${tile}`).click();
    await expect.poll(() => page.evaluate(id => window.__playerFixture.calls.filter(call => call === `launch:${id}`).length, id)).toBe(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
