import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('packaged classic entry works at a local file origin without CORS overrides', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await expect(page.locator('#hero-usb')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hero-usb')).toBeFocused();
  expect(errors).toEqual([]);
});

test('all tiles are remotely reachable, Enter opens honest state, Back restores focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#hero-usb')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  for (const id of ['usb', 'youtube', 'stan', 'foxtel', 'gallery', 'art', 'browser', 'settings']) {
    await expect(page.locator(`#app-${id}`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    if (id !== 'settings') await expect(page.getByText(/planned for a future version/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(`#app-${id}`)).toBeFocused();
    await page.keyboard.press('ArrowRight');
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });
});

test('settings persist immediately, wallpaper switches in place, Tizen Back returns to origin', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#wallpaper-tidal')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wallpaper')).toHaveCSS('background-image', /dune\.jpg/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('.frameos')).toHaveClass(/theme-midnight/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.frameos')).toHaveClass(/motion-off/);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 10009, bubbles: true, cancelable: true })));
  await expect(page.locator('#hero-personalise')).toBeFocused();
  await page.reload();
  await expect(page.locator('.frameos')).toHaveClass(/theme-midnight/);
  await expect(page.locator('.frameos')).toHaveClass(/motion-off/);
  await expect(page.locator('.wallpaper')).toHaveCSS('background-image', /dune\.jpg/);
});

test('rapid repeated arrows have no stale focus and a held Enter never activates panel controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hero-usb')).toBeFocused();
  await page.evaluate(() => {
    const dispatch = (key: string, repeat = false) => document.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
    dispatch('ArrowDown');
    for (let i = 0; i < 40; i++) dispatch('ArrowRight', true);
  });
  await expect(page.locator('#app-settings')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })));
  expect(await page.evaluate(() => localStorage.getItem('frameos.settings.v1'))).toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-settings')).toBeFocused();
});

test('restricted storage is graceful, corrupt settings recover, missing Tizen APIs are safe', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('frameos.settings.v1', '{broken');
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new Error('Storage unavailable'); } });
    Object.defineProperty(window, 'tizen', { value: {} });
  });
  await page.goto('/');
  await expect(page.locator('.frameos')).toHaveClass(/theme-slate/);
  await page.locator('#top-settings').click();
  await page.locator('#theme-warm').click();
  await expect(page.getByRole('status')).toContainText('Storage is unavailable');
  await expect(page.locator('.frameos')).toHaveClass(/theme-warm/);
});

test('modal Tab navigation, all origins, and Home Back remain usable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#top-settings').click();
  await page.locator('#motion-off').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#settings-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#motion-off')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#top-settings')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hero-usb')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#notice-close')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hero-usb')).toBeFocused();
});

test('production assets are offline, reduced motion is respected and preview scales without clipping', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#hero-usb')).toBeFocused();
  await expect(page.locator('#hero-usb')).toHaveCSS('transition-duration', '0s, 0s, 0s');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const resized = await page.locator('.stage').boundingBox();
      return resized!.width / 1920;
    }).toBeCloseTo(Math.min(viewport.width / 1920, viewport.height / 1080), 5);
    const box = await page.locator('.stage').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  expect(external).toEqual([]);
});

test('capture home and settings for visual review', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hero-usb')).toBeFocused();
  await page.screenshot({ path: 'artifacts/home.png' });
  await page.locator('#top-settings').click();
  await expect(page.locator('#theme-slate')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'artifacts/settings.png' });
});
