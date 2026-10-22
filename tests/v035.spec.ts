import { test, expect } from '@playwright/test';
import { nativeFixture, openSeries } from './nativeFixture';
import { mediaOption } from './mediaOptions';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
});

test('dock expands only the focused icon, reveals every full title and never overlaps during navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-youtube')).toBeFocused();
  await expect(page.locator('#app-youtube')).toHaveCSS('width', '290px');
  await expect(page.locator('#app-stan')).toHaveCSS('width', '104px');
  await expect(page.locator('#app-stan .app-name')).toHaveCSS('opacity', '0');
  await expect(page.locator('#app-youtube')).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('ArrowLeft');
  for (const id of ['art', 'youtube', 'stan', 'prime', 'gallery', 'browser', 'settings']) {
    const tile = page.locator(`#app-${id}`);
    await expect(tile).toBeFocused();
    await expect(tile).toHaveCSS('width', '290px');
    await expect(tile.locator('.app-name')).toHaveCSS('opacity', '1');
    expect(await tile.locator('.app-name').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await tile.evaluate(element => element.querySelector('.app-name')!.getBoundingClientRect().right <= element.getBoundingClientRect().right)).toBe(true);
    if (id !== 'settings') await page.keyboard.press('ArrowRight');
  }
  const stable = await page.evaluate(async () => {
    const failures: { frame: number; rects: { left: number; right: number; height: number }[] }[] = [];
    for (let index = 0; index < 24; index++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: index < 12 ? 'ArrowLeft' : 'ArrowRight', bubbles: true, cancelable: true }));
      await new Promise(requestAnimationFrame);
      const rects = Array.from(document.querySelectorAll('.app-tile')).map(element => element.getBoundingClientRect());
      if (!rects.every((rect, i) => rect.left >= 0 && rect.right <= 1920 && Math.abs(rect.height - 104) < .1 && (!i || rect.left >= rects[i - 1].right))) failures.push({ frame: index, rects: rects.map(({ left, right, height }) => ({ left, right, height })) });
    }
    return failures;
  });
  expect(stable).toEqual([]);
  await expect(page.locator('#app-settings')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'settings-title');
  await page.keyboard.press('Escape'); await expect(page.locator('#app-settings')).toBeFocused();
  await expect(page.locator('#app-settings')).toHaveCSS('width', '290px');
  await page.screenshot({ path: 'artifacts/v035-home.png' });
});

test('every local clock font has different rendered numerals, previews immediately and persists with stable alignment', async ({ page }) => {
  await page.goto('/'); await page.locator('#top-settings').click(); await page.locator('#settings-tab-clock').click();
  const alignment = await page.locator('.clock time').boundingBox();
  const fingerprints: number[] = [];
  for (const id of ['modern', 'rounded', 'minimal', 'bold', 'digital', 'classic']) {
    await page.locator(`#clock-font-${id}`).click();
    await expect(page.locator('.clock')).toHaveClass(new RegExp(`clock-font-${id}`));
    await expect(page.locator(`#clock-font-${id}`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.clock time').boundingBox()).toEqual(alignment);
    fingerprints.push(await page.locator('.clock time').evaluate(async element => {
      const style = getComputedStyle(element);
      await document.fonts.load(`${style.fontWeight} 96px ${style.fontFamily}`, '0123456789:');
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 150;
      const ctx = canvas.getContext('2d')!; ctx.font = `${style.fontWeight} 96px ${style.fontFamily}`;
      ctx.fillText('0123456789:', 0, 110);
      return ctx.getImageData(0, 0, 1000, 150).data.reduce((hash, value) => ((hash * 31) + value) >>> 0, 0);
    }));
  }
  expect(new Set(fingerprints).size).toBe(6);
  await page.locator('#clock-font-digital').click();
  await page.screenshot({ path: 'artifacts/v035-clock-settings.png' });
  await page.reload(); await expect(page.locator('.clock')).toHaveClass(/clock-font-digital/);
  expect(await page.locator('.clock time').boundingBox()).toEqual(alignment);
});

test('clock remains readable if local font decoding is unavailable', async ({ page }) => {
  await page.route('**/clock-*.ttf', route => route.abort());
  await page.goto('/'); await expect(page.locator('.clock-digits')).toHaveText(/\d+:\d{2}/);
  const box = await page.locator('.clock-digits').boundingBox(); expect(box!.width).toBeGreaterThan(200); expect(box!.width).toBeLessThan(660); expect(box!.height).toBe(176);
});

test('Settings floats above wallpaper; channel keys wrap tabs, restore focus, and do not compete with player seeks', async ({ page }) => {
  await nativeFixture(page, { channels: true }); await page.goto('/');
  await page.locator('#app-settings').click();
  const bounds = await page.locator('.settings-panel').boundingBox();
  expect(bounds!.width / 1920).toBeGreaterThan(.65); expect(bounds!.width / 1920).toBeLessThan(.75);
  expect(bounds!.y).toBeGreaterThan(0); expect(bounds!.y + bounds!.height).toBeLessThan(1080);
  await expect(page.locator('.settings-wallpaper')).toHaveCSS('background-image', /-soft\.jpg/);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9101, bubbles: true, cancelable: true })));
  await expect(page.locator('#settings-tab-clock')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#clock-font-rounded').click();
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-wallpapers')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('PageDown'); await expect(page.locator('#clock-font-rounded')).toBeFocused();
  await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
  await expect(page.locator('#settings-tab-media')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-appearance')).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.locator('#app-settings')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused(); await page.keyboard.press('Enter');
  await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9101, bubbles: true, cancelable: true })));
  await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
  await expect(page.locator('.settings-panel')).toHaveCount(0);
});

test('Settings D-pad fallback, text editing and reopened tab focus remain predictable', async ({ page }) => {
  await nativeFixture(page); await page.goto('/'); await page.locator('#top-settings').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('#settings-tab-clock')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#time-format-12h')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#clock-font-modern')).toBeFocused();
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'editing-test'; document.querySelector('.settings-panel')!.appendChild(input); input.focus(); });
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-clock')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#clock-font-minimal').click(); await page.keyboard.press('Escape'); await expect(page.locator('#top-settings')).toBeFocused();
  await page.locator('#top-settings').click(); await expect(page.locator('#clock-font-minimal')).toBeFocused();
  await page.screenshot({ path: 'artifacts/v035-settings.png' });
});

test('Media Options contains filters, sorting, hidden files and Refresh without rereading for UI preferences', async ({ page }) => {
  await nativeFixture(page); await openSeries(page);
  const reads = await page.evaluate(() => window.__playerFixture.reads.length);
  await expect(page.locator('.media-header h1')).toHaveCount(0); await expect(page.locator('.media-filters')).toHaveCount(0);
  await page.locator('#media-options').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#filter-all')).toBeFocused(); await expect(page.locator('#filter-all')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('#filter-video')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menu')).toBeVisible(); await expect(page.locator('.page-stack')).toHaveClass(/page-stack-media/);
  await page.locator('#sort-name-desc').click(); await expect(page.locator('#sort-name-desc')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#media-hidden').click(); await expect(page.locator('#media-hidden')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__playerFixture.reads.length)).toBe(reads);
  await page.screenshot({ path: 'artifacts/v035-media-options.png' });
  await page.keyboard.press('Escape'); await expect(page.locator('#media-options')).toBeFocused();
  await expect(page.locator('.breadcrumbs')).toContainText('Series');
  await mediaOption(page, 'media-refresh'); await expect(page.locator('#media-entry-0')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.reads.length)).toBe(reads + 1);
});

test('Media Up skips display-only breadcrumbs before returning Home; Back retains folder hierarchy', async ({ page }) => {
  await nativeFixture(page); await page.goto('/'); await expect(page.locator('#app-youtube')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#app-stan')).toBeFocused(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#media-entry-0')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#media-entry-0')).toContainText('Extras');
  await page.keyboard.press('Escape'); await expect(page.locator('#media-entry-0')).toContainText('Series');
  await expect(page.locator('.breadcrumbs button')).toHaveCount(0);
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#media-options')).toBeFocused();
  await expect(page.locator('.page-stack')).toHaveClass(/page-stack-media/);
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#app-stan')).toBeFocused();
  await expect(page.locator('.page-stack')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#app-stan')).toBeFocused();
});

test('folder titles clamp to two lines, retain full names and focus without card expansion', async ({ page }) => {
  const name = 'A very long folder name with family holiday collections and television series '.repeat(3) + '終';
  await nativeFixture(page, { folderName: name }); await page.goto('/'); await page.keyboard.press('ArrowDown');
  const folder = page.locator('#media-entry-0'); await expect(folder).toBeFocused();
  await expect(page.locator('.page-stack')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -1080)');
  await expect(folder).toHaveAttribute('title', name); await expect(folder.locator('.media-filename')).toHaveText(name);
  await expect(page.locator('.focused-media-title')).toHaveText(name);
  const focused = await folder.boundingBox();
  await page.keyboard.press('ArrowRight'); const blurred = await folder.boundingBox();
  expect(blurred).toEqual(focused);
  const text = await folder.locator('.media-filename').boundingBox(); expect(text!.height).toBe(52); expect(text!.width).toBeLessThan(focused!.width);
  await page.keyboard.press('ArrowLeft'); await expect(folder).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'artifacts/v035-folders.png' });
  await page.keyboard.press('Enter'); await expect(page.locator('#media-entry-0')).toContainText('Extras');
  await page.keyboard.press('Escape'); await expect(folder).toHaveAttribute('title', name); await expect(folder).toBeFocused();
  expect((await page.evaluate(() => window.__playerFixture.reads))[1]).toBe(`removable_sdc7/${name}`);
});
