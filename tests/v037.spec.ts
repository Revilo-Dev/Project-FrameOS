import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeFixture, openSeries } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
});

test('folder material fills its card and keeps equal widths, centered icon, truncation and stable white focus', async ({ page }) => {
  await nativeFixture(page, { folderName: 'A very long folder name that should wrap cleanly while keeping the full card background aligned' });
  await page.goto('/'); await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused();
  const card = page.locator('#media-entry-0');
  await expect(card).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
  const measurements = await card.evaluate(element => {
    const card = element.getBoundingClientRect(), surface = element.querySelector('.folder-surface')!.getBoundingClientRect(), icon = element.querySelector('.folder-icon')!.getBoundingClientRect(), style = getComputedStyle(element);
    return { width: card.width, innerWidth: surface.width, padding: parseFloat(style.paddingLeft) * 2 + parseFloat(style.borderLeftWidth) * 2, iconCenter: icon.x + icon.width / 2, center: card.x + card.width / 2 };
  });
  expect(Math.abs(measurements.width - measurements.innerWidth - measurements.padding)).toBeLessThan(2);
  expect(Math.abs(measurements.iconCenter - measurements.center)).toBeLessThan(2);
  await expect(card.locator('.folder-surface')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card.locator('.media-filename')).toHaveCSS('overflow', 'hidden');
  const before = await card.boundingBox(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
  const after = await card.boundingBox(); expect(after!.width).toBe(before!.width);
  await page.screenshot({ path: 'artifacts/v037/folder.png' });
});

test('diagnostics show failure evidence and retry bypasses the negative cache without scanning storage', async ({ page }) => {
  await nativeFixture(page); await openSeries(page); await page.locator('#media-entry-1').click({ button: 'right' }); await page.locator('#context-thumbnail').click();
  await expect(page.locator('#thumbnail-retry')).toBeFocused();
  await page.locator('#thumbnail-retry').click(); await expect(page.locator('#thumbnail-retry')).toHaveText('Retry Thumbnail');
  await expect(page.locator('.thumbnail-last-error')).not.toHaveText('None recorded');
  await expect(page.locator('.thumbnail-attempts')).toContainText('NotIndexed');
  const summary = page.locator('.thumbnail-diagnostic-summary');
  await expect(summary).toContainText('No indexed match');
  await expect(summary).toContainText('No thumbnail obtained');
  await expect.poll(() => page.locator('.thumbnail-diagnostic-overview').evaluate(element => {
    const rect = element.getBoundingClientRect(), view = element.closest('.settings-content')!.getBoundingClientRect();
    return JSON.stringify({ visible: rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1, top: rect.top, bottom: rect.bottom, viewTop: view.top, viewBottom: view.bottom });
  })).toContain('"visible":true');
  await page.screenshot({ path: 'artifacts/v038/diagnostics-visible-result.png' });
  const reads = await page.evaluate(() => window.__playerFixture.reads.length);
  await page.locator('#thumbnail-retry').click(); await expect(page.locator('#thumbnail-retry')).toHaveText('Retry Thumbnail');
  expect(await page.evaluate(() => window.__playerFixture.reads.length)).toBe(reads);
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('Readable (native resolve succeeded)');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#thumbnail-scroll-down')).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.locator('.thumbnail-diagnostic-records').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/v037/diagnostics-failure.png' });
});

for (const [format, folder] of [['MP4', 'Season 01 (1994-95)'], ['MKV', 'Season 03 (1996-97)']] as const) test(`real ${format} FFmpeg snapshot loads through read-only manifest, renders and persists after restart`, async ({ page }) => {
  const directory = resolve('artifacts/v037/offline', folder), manifestPath = resolve(directory, '.frameos-thumbnails.json');
  test.skip(!existsSync(manifestPath), 'Generate the optional real-media acceptance bundle first; source videos are not committed.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')), name = Object.keys(manifest.files)[0], item = manifest.files[name];
  await nativeFixture(page, { offline: { name, ...item, imageUri: pathToFileURL(resolve(directory, item.image)).href } });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href); await expect(page.locator('#app-youtube')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused(); await page.keyboard.press('Enter');
  const image = page.locator('#media-entry-1 .media-thumbnail img');
  await expect(image).toBeVisible(); expect(await image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(320);
  await page.screenshot({ path: `artifacts/v037/${format.toLowerCase()}-real-thumbnail.png` });
  await page.locator('#media-entry-1').click({ button: 'right' }); await page.locator('#context-thumbnail').click();
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('offline-manifest');
  await expect(page.locator('.thumbnail-diagnostic-preview')).toBeVisible();
  await page.reload(); await expect(page.locator('#app-youtube')).toBeFocused(); await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(image).toBeVisible();
  await page.locator('#media-entry-1').click({ button: 'right' }); await page.locator('#context-thumbnail').click();
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('Persistent hit');
});
