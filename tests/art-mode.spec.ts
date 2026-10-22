import { test, expect } from '@playwright/test';
import { nativeFixture } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await nativeFixture(page, { apps: true });
});

for (const width of [1920, 960]) test(`Art Mode keeps the same wallpaper and clock, hides all controls, and restores Home at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width * 9 / 16 });
  await page.goto('/');
  await expect(page.locator('.app-tile').first()).toHaveAttribute('id', 'app-art');
  const clock = page.locator('.clock time');
  const element = await clock.elementHandle();
  const before = await clock.boundingBox();
  const style = await clock.evaluate(el => ({ font: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize }));
  const wallpaper = await page.locator('.wallpaper').evaluate(el => getComputedStyle(el).backgroundImage);
  const widgets = await page.locator('.dashboard-card').count();
  await page.locator('#app-art').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.frameos')).toHaveClass(/art-mode/);
  await expect(clock).toBeVisible();
  expect(await clock.boundingBox()).toEqual(before);
  expect(await clock.evaluate(el => ({ font: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize }))).toEqual(style);
  expect(await page.locator('.wallpaper').evaluate(el => getComputedStyle(el).backgroundImage)).toBe(wallpaper);
  for (const selector of ['.topbar', '.dock-section', '.widget-dashboard', '.media-prompt', '.clock > span', '.media-hub', '.wallpaper-shade', '.ambient-wallpaper']) await expect(page.locator(selector)).toBeHidden();
  await expect(page.getByRole('button')).toHaveCount(0);
  expect(await page.evaluate(() => window.__playerFixture.calls.some(call => call.startsWith('launch:')))).toBe(false);
  await page.screenshot({ path: `artifacts/v0381/art-mode-${width}.png` });
  await page.keyboard.press('Enter');
  await expect(page.locator('.frameos')).not.toHaveClass(/art-mode/);
  await expect(page.locator('#app-art')).toBeFocused();
  await expect(page.locator('.dashboard-card')).toHaveCount(widgets);
  await expect(page.locator('.clock > span')).toBeVisible();
  expect(await element!.evaluate(el => el === document.querySelector('.clock time'))).toBe(true);
  await page.screenshot({ path: `artifacts/v0381/home-restored-${width}.png` });
});

test('one Back, direction, click anywhere or touch restores Home; volume and Power keep system behavior', async ({ page }) => {
  await page.goto('/');
  for (const key of ['Escape', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) {
    await page.locator('#app-art').click();
    await page.keyboard.press(key); await expect(page.locator('#app-art')).toBeFocused();
    await expect(page.locator('.frameos')).not.toHaveClass(/art-mode/);
  }
  await page.locator('#app-art').click();
  const system = await page.evaluate(() => ['AudioVolumeUp', 'AudioVolumeDown', 'Power'].map(key => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))));
  expect(system).toEqual([true, true, true]); await expect(page.locator('.frameos')).toHaveClass(/art-mode/);
  await page.mouse.click(10, 10); await expect(page.locator('#app-art')).toBeFocused();
  await page.locator('#app-art').click();
  await page.evaluate(() => document.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true })));
  await expect(page.locator('.frameos')).not.toHaveClass(/art-mode/);
  // A touch's compatibility click must not activate the newly restored tile.
  await page.locator('#app-art').dispatchEvent('click'); await expect(page.locator('.frameos')).not.toHaveClass(/art-mode/);
});

test('holding Select on entry and wake cannot cause duplicate transitions or activate a hidden control', async ({ page }) => {
  await page.goto('/'); await page.locator('#app-art').focus();
  await page.keyboard.down('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await expect(page.locator('.frameos')).toHaveClass(/art-mode/); await page.keyboard.up('Enter');
  await page.keyboard.down('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await expect(page.locator('.frameos')).not.toHaveClass(/art-mode/);
  await page.keyboard.up('Enter'); await expect(page.locator('#app-art')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#app-youtube')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.locator('.media-hub')).not.toHaveAttribute('aria-hidden', 'true');
});
