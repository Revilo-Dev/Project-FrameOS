import { test, expect, type Page } from '@playwright/test';
import { nativeFixture } from './nativeFixture';
async function settings(page: Page, tool?: string) {
  await page.locator('#top-settings').click();
  if (tool) await page.locator(`#launcher-${tool}`).click();
}
async function catalogue(page: Page, apps: { id: string; name: string; show?: boolean }[]) {
  await page.evaluate(apps => {
    const runtime = window as unknown as { tizen: { application: { getAppsInfo(done: (apps: unknown[]) => void): void } } };
    runtime.tizen.application.getAppsInfo = done => done(apps);
  }, apps);
}
test('Samsung Home escape uses the recorded public launch ID and reports ACK evidence', async ({ page }) => {
  await nativeFixture(page, { apps: true }); await page.goto('/'); await catalogue(page, []);
  await settings(page); await page.locator('#launcher-home').click();
  await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual(['launch:com.samsung.tv.csfs']);
  await page.locator('#launcher-apps').click();
  await expect(page.getByLabel('Launch diagnostics')).toContainText('API accepted');
  await expect(page.getByLabel('Launch diagnostics')).toContainText('com.samsung.tv.csfs');
  await page.locator('#launch-report-down').click();
  expect(await page.getByLabel('Launch diagnostics').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByText('An API acknowledgement does not confirm', { exact: false })).toBeVisible();
});
test('pins a real installed ID, preserves the dock and focus, and revalidates before launch', async ({ page }) => {
  await nativeFixture(page, { apps: true }); await page.goto('/');
  const actual = { id: 'RealApp123.Player', name: 'My Player', show: true };
  await catalogue(page, [actual, { id: 'FakeApp123.service', name: 'Service', show: true }, { id: 'TdjFk7yyVS.frameos', name: 'FrameOS', show: true }, { id: 'org.tizen.art-app', name: 'Art', show: true }]);
  await settings(page, 'apps');
  await expect(page.locator('.launcher-app-grid button')).toHaveCount(1);
  await page.getByRole('button', { name: /My Player RealApp123.Player/ }).click();
  await page.keyboard.press('Escape'); await expect(page.locator('#launcher-apps')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#top-settings')).toBeFocused();
  await expect(page.locator('.app-dock .app-tile')).toHaveCount(7);
  await expect(page.locator('#app-art')).toBeVisible(); await expect(page.locator('#app-settings')).toBeVisible();
  await page.locator('#app-youtube').click();
  await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.includes('launch:RealApp123.Player'))).toBe(true);
  await page.reload(); await expect(page.locator('#app-youtube')).toContainText('My Player');
  await catalogue(page, []); await page.locator('#app-youtube').click();
  await expect(page.getByRole('heading', { name: 'My Player is not installed' })).toBeVisible();
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual([]);
});
test('refresh falls back safely if the focused installed app disappears', async ({ page }) => {
  await nativeFixture(page, { apps: true }); await page.goto('/');
  await catalogue(page, [{ id: 'RealApp123.Player', name: 'My Player', show: true }]); await settings(page, 'apps');
  await page.getByRole('button', { name: /My Player RealApp123.Player/ }).focus();
  await catalogue(page, []);
  // Trigger a refresh without changing DOM focus first, as an asynchronous refresh would.
  await page.locator('#apps-refresh').evaluate((element: HTMLElement) => element.click());
  await expect(page.locator('#apps-refresh')).toBeFocused(); await expect(page.locator('.launcher-app-grid button')).toHaveCount(0);
});
test('restores focus only on return to FrameOS and leaves active editors alone', async ({ page }) => {
  await nativeFixture(page, { apps: true }); await page.goto('/'); await page.locator('#app-stan').focus();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    (document.activeElement as HTMLElement).blur();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app-stan')).toBeFocused();
  await settings(page, 'backup'); await page.locator('#backup-text').focus();
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(page.locator('#backup-text')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual([]);
});
test('backup export excludes tokens, reviews changes and restores with an independent local recovery copy', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => localStorage.setItem('frameos.account.token', 'do-not-export'));
  await settings(page, 'backup'); await page.locator('#backup-export').click();
  const text = await page.locator('#backup-text').inputValue(); expect(text).not.toContain('do-not-export');
  const backup = JSON.parse(text); backup.preferences.settings.theme = 'warm';
  await page.locator('#backup-text').fill(JSON.stringify(backup)); await page.locator('#backup-review').click();
  await expect(page.getByLabel('Reviewed preferences')).toContainText('warm');
  await page.locator('#backup-report-down').click();
  expect(await page.getByLabel('Reviewed preferences').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('.frameos')).toHaveClass(/theme-slate/);
  await page.locator('#backup-apply').click(); await expect(page.locator('.frameos')).toHaveClass(/theme-warm/);
  const previous = await page.evaluate(() => JSON.parse(localStorage.getItem('frameos.preferences.recovery.v2')!).preferences.settings.theme); expect(previous).toBe('slate');
  await page.locator('#backup-recovery').click(); await page.locator('#backup-review').click(); await page.locator('#backup-apply').click();
  await expect(page.locator('.frameos')).toHaveClass(/theme-slate/);
  await page.locator('#backup-text').fill('{"format":"frameos.preferences","version":99}'); await page.locator('#backup-review').click();
  await expect(page.locator('#backup-apply')).toHaveCount(0); await expect(page.getByText('Unsupported backup format/version.')).toBeVisible();
});
test('performance capture is opt-in, completes on the actual visible UI, and cancels when hidden', async ({ page }) => {
  await page.goto('/'); await settings(page, 'performance');
  await expect(page.getByText('No capture yet.', { exact: false })).toBeVisible();
  await page.locator('#performance-here').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Performance report')).toContainText('Complete', { timeout: 9000 });
  const report = JSON.parse((await page.getByLabel('Performance report').textContent())!);
  expect(report.visibleStage).toBe(true); expect(report.frames.samples).toBeGreaterThan(30); expect(report.callbackFps).toBeGreaterThan(0);
  await page.locator('#performance-report-down').focus(); await page.keyboard.press('Enter');
  expect(await page.getByLabel('Performance report').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('#performance-here').click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByLabel('Performance report')).toContainText('Cancelled');
});
