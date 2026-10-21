import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeFixture } from './nativeFixture';

for (const width of [1920, 960]) test(`video artwork fills equal fixed cards beneath short and long captions at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width * 9 / 16 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
  const catalog = JSON.parse(readFileSync(resolve('src/services/wallpaper-catalog.json'), 'utf8'));
  await nativeFixture(page, {
    thumbnail: pathToFileURL(resolve('dist', catalog[0].thumbnail)).href,
    videoNames: ['A short video.mp4', 'A very long video title with enough words to wrap across multiple lines without ever changing the thumbnail or the card size.mkv'],
  });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await expect(page.locator('#media-entry-0')).toBeAttached(); await page.locator('#home-media').click();
  await page.locator('#media-entry-0').click();
  const cards = page.locator('.media-type-video');
  await expect(cards).toHaveCount(2); await expect(cards.locator('.media-thumbnail img')).toHaveCount(2);
  const geometry = await cards.evaluateAll(elements => elements.map(element => {
    const card = element as HTMLElement, bounds = card.getBoundingClientRect(), image = card.querySelector('img')!;
    const art = image.getBoundingClientRect(), caption = card.querySelector('.media-filename')!.getBoundingClientRect();
    const scale = bounds.width / card.offsetWidth;
    return { width: bounds.width, height: bounds.height, imageWidth: art.width, imageHeight: art.height, innerWidth: card.clientWidth * scale, innerHeight: card.clientHeight * scale, titleHeight: caption.height, imageLoaded: image.naturalWidth > 0, fade: getComputedStyle(card.querySelector('.media-thumbnail')!, '::after').backgroundImage };
  }));
  for (const item of geometry) {
    expect(item.imageLoaded).toBe(true);
    expect(Math.abs(item.imageWidth - item.innerWidth)).toBeLessThan(1);
    expect(Math.abs(item.imageHeight - item.innerHeight)).toBeLessThan(1);
    expect(item.fade).toContain('linear-gradient');
  }
  expect(geometry[0].width).toBe(geometry[1].width); expect(geometry[0].height).toBe(geometry[1].height);
  expect(geometry[1].titleHeight).toBeGreaterThan(geometry[0].titleHeight);
  const before = await cards.last().boundingBox();
  await cards.last().focus(); await expect(cards.last()).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
  expect(await cards.last().boundingBox()).toEqual(before);
  await page.screenshot({ path: `artifacts/v038/video-cards-${width}.png` });
});
