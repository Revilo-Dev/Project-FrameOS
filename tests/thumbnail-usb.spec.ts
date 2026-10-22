import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeFixture, openSeries } from './nativeFixture';
import { mediaOption } from './mediaOptions';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const format of ['MP4', 'MKV']) test(`new Windows generator ${format} screenshot renders from nested USB path, survives restart and reconnect`, async ({ page }) => {
  const root = resolve('artifacts/v0381/offline', format), manifestPath = resolve(root, '.frameos-thumbnails.json');
  test.skip(!existsSync(manifestPath), 'Optional real-media bundle: generate screenshots from genuine MP4/MKV files; see scripts/media-thumbnails/README.md.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const name = Object.keys(manifest.files)[0], item = manifest.files[name];
  const imageUri = pathToFileURL(resolve(root, item.image)).href;
  await nativeFixture(page, { folderName: 'Nested Unicode é', offline: { name, ...item, imageUri } });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.locator('#home-media').click(); await page.locator('#media-entry-0').click();
  const image = page.locator('#media-entry-1 .media-thumbnail img');
  await expect(image).toBeVisible();
  const rendering = await image.evaluate(el => { const image = el as HTMLImageElement; return { complete: image.complete, width: image.naturalWidth, height: image.naturalHeight, uri: image.currentSrc }; });
  expect(rendering).toEqual({ complete: true, width: 320, height: 180, uri: imageUri });
  await page.screenshot({ path: `artifacts/v0381/${format.toLowerCase()}-rendered.png` });
  await page.locator('#media-entry-1').click({ button: 'right' }); await page.locator('#context-thumbnail').click();
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('Pre-generated USB image');
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('Rendered');
  await expect(page.locator('.thumbnail-attempts')).not.toContainText('native-find');
  await expect(page.locator('.thumbnail-attempts')).not.toContainText('html-video');
  const diagnostic = await page.locator('.thumbnail-diagnostic-facts').innerText();
  await page.reload(); await page.locator('#home-media').click(); await page.locator('#media-entry-0').click();
  await expect(image).toBeVisible();
  await page.locator('#media-entry-1').click({ button: 'right' }); await page.locator('#context-thumbnail').click();
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('Persistent hit');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__playerFixture.remove()); await expect(page.locator('.media-tile')).toHaveCount(0);
  await page.evaluate(() => window.__playerFixture.reinsert()); await expect(page.locator('#media-entry-0')).toContainText('Nested Unicode');
  await page.locator('#media-entry-0').click(); await expect(image).toBeVisible();
  await mkdir('artifacts/v0381', { recursive: true });
  await writeFile(`artifacts/v0381/${format.toLowerCase()}-rendering-evidence.json`, JSON.stringify({ format, name, rendering, diagnostic, restart: 'Persistent hit and image rendered', reconnect: 'Image rendered after fresh drive discovery', platform: 'Desktop production file-origin browser with read-only Tizen filesystem fixture; physical TV verification outstanding' }, null, 2));
});

test('missing/unreadable images show the video icon and cache failure instead of broken images', async ({ page }) => {
  await nativeFixture(page, { offline: { name: 'Missing image.mkv', size: 12, modified: 1000, image: '.frameos-thumbnails/0123456789abcdef01234567.jpg', imageUri: 'file:///missing-frameos-thumbnail.jpg' } });
  await openSeries(page);
  const card = page.locator('#media-entry-1');
  await expect(card.locator('.media-thumbnail > .icon')).toBeVisible();
  await expect(card.locator('.media-thumbnail img')).toHaveCount(0);
  await card.click({ button: 'right' }); await page.locator('#context-thumbnail').click();
  await expect(page.locator('.thumbnail-diagnostic-facts')).toContainText('Failure cached for 5 minutes');
  await expect(page.locator('.thumbnail-attempts')).toContainText('ImageLoadError');
});

test('grid defaults to five, supports all 3–7 choices, persists and keeps large-folder focus visible', async ({ page }) => {
  await nativeFixture(page, { count: 2000 }); await openSeries(page);
  const first = await page.locator('#media-entry-0').boundingBox(), sixth = await page.locator('#media-entry-5').boundingBox();
  expect(sixth!.y).toBeGreaterThan(first!.y);
  for (const columns of [3, 4, 5, 6, 7]) {
    await mediaOption(page, `grid-${columns}`);
    await page.locator('#media-entry-0').focus(); await page.keyboard.press('ArrowDown');
    await expect(page.locator(`#media-entry-${columns}`)).toBeFocused();
    expect(await page.locator('.media-tile').count()).toBeLessThanOrEqual(columns * 5 + 1);
  }
  await page.reload(); await page.locator('#home-media').click(); await page.locator('#media-entry-0').click();
  await page.locator('#media-options').click(); await expect(page.locator('#grid-7')).toHaveAttribute('aria-checked', 'true'); await page.keyboard.press('Escape');
  await page.locator('#media-entry-0').focus();
  await expect(page.locator('.breadcrumbs button, .media-home-indicator[tabindex]')).toHaveCount(0);
  // Every ordinary Down crosses exactly one row, including at the viewport edge.
  let previousScroll = await page.locator('.media-viewport').evaluate(el => el.scrollTop);
  let scrollMoves = 0;
  for (let i = 1; i <= 8; i++) {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(`#media-entry-${i * 7}`)).toBeFocused();
    const currentScroll = await page.locator('.media-viewport').evaluate(el => el.scrollTop);
    if (currentScroll !== previousScroll) { expect(currentScroll - previousScroll).toBe(280); scrollMoves++; }
    previousScroll = currentScroll;
  }
  expect(scrollMoves).toBeGreaterThan(0);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#media-entry-49')).toBeFocused();
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  const focused = await page.locator('.media-tile.is-focused').boundingBox(), viewport = await page.locator('.media-viewport').boundingBox();
  expect(focused!.y).toBeGreaterThanOrEqual(viewport!.y); expect(focused!.y + focused!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height);
});
