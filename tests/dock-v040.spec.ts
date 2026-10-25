import { test, expect, type Page } from '@playwright/test';
import { nativeFixture } from './nativeFixture';
import { writeFile } from 'node:fs/promises';
const extras = Array.from({ length: 18 }, (_, i) => ({ id: `ActualApp${String(i).padStart(2, '0')}.Player`, name: `Player ${i + 1}`, show: true, iconPath: 'file:///opt/icons/unreadable.png' }));
async function fixture(page: Page, settings = 'SecurityError') {
  await nativeFixture(page, { apps: true });
  await page.addInitScript(({ extras, settings }) => {
    const tizen = (window as unknown as { tizen: any }).tizen;
    const old = tizen.application.getAppsInfo;
    tizen.application.getAppsInfo = (done: (apps: unknown[]) => void) => old((apps: unknown[]) => done([...apps, ...extras, { id: 'com.samsung.tv.coba.setting', name: 'Settings', version: '1.0' }, { id: 'SamsungSvc.background', name: 'Background Service', show: true }]));
    const launch = tizen.application.launch;
    tizen.application.launch = (id: string, done: () => void, fail: (error: unknown) => void) => id === 'com.samsung.tv.coba.setting' && settings ? fail({ name: settings }) : launch(id, done, fail);
    tizen.systeminfo = { getPropertyValue(property: string, done: (value: unknown) => void) { window.__playerFixture.calls.push(property); done({ connected: [{ type: 'HDMI', number: 2 }], disconnected: [{ type: 'HDMI', number: 1 }] }); } };
    tizen.tvwindow = {
      getSource: () => ({ type: 'HDMI', number: 2, signal: true }),
      setSource: (source: any, done: (value: unknown) => void) => { window.__playerFixture.calls.push(`source:${source.type}:${source.number}`); done(source); },
      show: (done: (rect: string[]) => void, _fail: unknown, rect: string[], _type: string, z: string) => { window.__playerFixture.calls.push(`show:${z}:${rect.join(',')}`); done(rect); },
      hide: (done: () => void) => { window.__playerFixture.calls.push('hide:tvwindow'); done(); },
    };
  }, { extras, settings });
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#app-youtube')).toBeFocused();
}
const order = (page: Page) => page.locator('.dock-cell').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.dockId));
test('All Apps discovers, filters, shows five columns, adds immediately without duplicates and persists', async ({ page }) => {
  await fixture(page); await page.locator('#app-all-apps').click();
  await expect(page.locator('.all-app-card')).toHaveCount(29); // 11 destinations + 18 additional real apps
  await expect(page.getByRole('button', { name: /Background Service/ })).toHaveCount(0);
  expect(await page.locator('.all-apps-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(5);
  expect(await page.locator('.all-apps-panel input').count()).toBe(0);
  const card = page.locator('[id="all-app-native:ActualApp00.Player"]');
  await card.click(); await page.locator('#dock-option-add').click();
  await expect(card).toContainText('Pinned'); await expect(page.locator('.app-tile')).toHaveCount(11);
  await card.click(); await expect(page.locator('#dock-option-add')).toHaveCount(0); await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('.app-tile')).toHaveCount(11);
  await page.locator('[id="app-native:ActualApp00.Player"]').click();
  await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.includes('launch:ActualApp00.Player'))).toBe(true);
  await page.locator('[id="app-native:ActualApp00.Player"]').focus(); await page.keyboard.press('ArrowUp'); await page.locator('#dock-option-remove').click();
  await expect(page.locator('#app-all-apps')).toBeFocused(); await page.reload(); await expect(page.locator('.app-tile')).toHaveCount(10);
});
test('short Select opens once; a repeated 600ms hold moves without launching and Back cancels', async ({ page }) => {
  await fixture(page); const before = await order(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.filter(call => call === 'launch:9Ur5IzDKqV.TizenYouTube').length)).toBe(1);
  await page.keyboard.down('Enter'); await page.waitForTimeout(200); await page.keyboard.down('Enter'); await page.waitForTimeout(450);
  await expect(page.locator('#app-youtube')).toHaveClass(/is-moving/);
  await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await page.keyboard.press('ArrowRight'); expect(await order(page)).not.toEqual(before);
  await page.keyboard.press('Escape'); expect(await order(page)).toEqual(before);
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')).length)).toBe(1);
});
test('Options Move confirms and persists; protected destinations stay accessible and the gear has a D-pad path', async ({ page }) => {
  await fixture(page); await page.keyboard.press('ArrowUp'); await expect(page.locator('#dock-option-open')).toBeFocused();
  await page.locator('#dock-option-move').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  expect((await order(page)).slice(0, 4)).toEqual(['art', 'stan', 'youtube', 'prime']);
  await page.reload(); await expect(page.locator('#app-youtube')).toBeFocused();
  expect((await order(page)).slice(0, 4)).toEqual(['art', 'stan', 'youtube', 'prime']);
  await page.locator('#app-tv').focus(); await page.keyboard.press('ArrowUp'); await expect(page.locator('#dock-option-remove')).toHaveCount(0);
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#top-settings')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#settings-title')).toHaveText('FrameOS Settings');
});
test('missing keyup and unreliable repeat never open a long-held app; Options Move still works', async ({ page }) => {
  await fixture(page); await page.keyboard.down('Enter'); await page.waitForTimeout(700);
  await expect(page.locator('.is-moving')).toHaveCount(0); await page.keyboard.up('Enter');
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual([]);
  await page.keyboard.down('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Enter');
  await expect(page.locator('#dock-option-open')).toBeFocused(); await page.locator('#dock-option-move').click();
  await expect(page.locator('#app-youtube')).toHaveClass(/is-moving/);
  await page.keyboard.press('Escape');
});
test('Tizen numeric key events work even when repeat is always false and system keys pass through', async ({ page }) => {
  await fixture(page);
  const key = (type: string, keyCode: number) => page.evaluate(({ type, keyCode }) => document.dispatchEvent(new KeyboardEvent(type, { key: 'Unidentified', keyCode, repeat: false, bubbles: true, cancelable: true })), { type, keyCode });
  await key('keydown', 13); await key('keydown', 13); await page.waitForTimeout(650);
  await expect(page.locator('#app-youtube')).toHaveClass(/is-moving/); await key('keyup', 13);
  await key('keydown', 39); await key('keyup', 39); await key('keydown', 13); await key('keyup', 13);
  expect((await order(page)).slice(0, 4)).toEqual(['art', 'stan', 'youtube', 'prime']);
  expect(await key('keydown', 10182)).toBe(true); expect(await key('keydown', 116)).toBe(true); expect(await key('keydown', 447)).toBe(true);
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual([]);
});
test('an overflowing dock scrolls into view and default restore has predictable focus', async ({ page }) => {
  await fixture(page);
  await page.locator('#app-all-apps').click();
  for (const app of extras.slice(0, 6)) {
    await page.locator(`[id="all-app-native:${app.id}"]`).click(); await page.locator('#dock-option-add').click();
  }
  await page.keyboard.press('Escape');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[id="app-native:ActualApp05.Player"]')).toBeFocused();
  await expect.poll(() => page.locator('.app-dock').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('[id="app-native:ActualApp05.Player"]').evaluate(element => element.getBoundingClientRect().right <= document.querySelector('.app-dock')!.getBoundingClientRect().right + 1)).toBe(true);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#app-all-apps')).toBeFocused();
  await page.keyboard.press('Enter'); await page.locator('#all-apps-restore').click();
  await page.locator('#dock-reset-cancel').click(); await expect(page.locator('#all-apps-restore')).toBeFocused();
  await page.locator('#all-apps-restore').click(); await page.locator('#dock-reset-confirm').click(); await expect(page.locator('#app-youtube')).toBeFocused();
});
test('TV Settings records a public API error and manual fallback; TV uses the exact recovery ID', async ({ page }) => {
  await fixture(page); await page.locator('#app-settings').click();
  await expect(page.getByRole('dialog')).toContainText('TV Settings could not be opened'); await expect(page.getByRole('dialog')).toContainText('Samsung Home');
  await page.keyboard.press('Escape'); await page.locator('#app-tv').click();
  await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.includes('launch:com.samsung.tv.csfs'))).toBe(true);
  await page.locator('#top-settings').click(); await page.locator('#launcher-apps').click();
  await expect(page.getByLabel('Launch diagnostics')).toContainText('com.samsung.tv.coba.setting');
  await expect(page.getByLabel('Launch diagnostics')).toContainText('SecurityError');
});
test('Sources separates discovery, setSource and full-screen show evidence and Back hides before closing', async ({ page }) => {
  await fixture(page); await page.locator('#app-sources').click();
  await expect(page.locator('#source-HDMI\\:1')).toContainText('Disconnected');
  await expect(page.locator('#source-HDMI\\:2')).toHaveAttribute('aria-current', 'true');
  await page.locator('#source-HDMI\\:2').click(); await expect(page.getByRole('status')).toContainText('Verify the picture');
  expect(await page.evaluate(() => window.__playerFixture.calls)).toContain('show:FRONT:0,0,100%,100%');
  await page.keyboard.press('Escape'); await expect(page.getByRole('status')).toContainText('TVWindow hidden');
  await page.keyboard.press('Escape'); await expect(page.locator('#app-sources')).toBeFocused();
});
test('App information keeps services filtered and restores nested Back; screenshots capture final layout', async ({ page }) => {
  await fixture(page); await page.locator('#app-all-apps').click();
  await page.locator('[id="all-app-native:ActualApp17.Player"]').focus(); await page.keyboard.press('Enter');
  await page.locator('#dock-option-info').click(); await expect(page.getByRole('dialog')).toContainText('ActualApp17.Player');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('[id="all-app-native:ActualApp17.Player"]')).toBeFocused();
  await expect(page.locator('.all-app-card')).toHaveCount(29);
  await expect(page.getByRole('button', { name: /Background Service/ })).toHaveCount(0);
  await page.locator('#all-app-art').focus(); await expect(page.locator('#all-app-art')).toHaveClass(/is-focused/);
  await expect(page.locator('#all-app-art')).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'artifacts/v040-all-apps.png' });
  await page.keyboard.press('Escape'); await page.locator('#app-art').focus(); await expect(page.locator('#app-art')).toHaveClass(/is-focused/); await expect(page.locator('#app-art')).toHaveCSS('width', '290px'); await page.screenshot({ path: 'artifacts/v040-dock.png' });
});
test('Home performance capture measures live dock navigation and retains launch diagnostics', async ({ page }) => {
  await fixture(page); await page.locator('#top-settings').click(); await page.locator('#launcher-performance').click(); await page.locator('#performance-home').click();
  await expect(page.locator('#app-youtube')).toBeFocused();
  for (let i = 0; i < 24; i++) { await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(70); }
  await page.locator('#top-settings').click(); await page.locator('#launcher-performance').click();
  await expect(page.getByLabel('Performance report')).toContainText('Complete', { timeout: 9000 });
  const report = JSON.parse((await page.getByLabel('Performance report').textContent())!);
  expect(report.visibleStage).toBe(true); expect(report.frames.samples).toBeGreaterThan(100); expect(report.handlers.samples).toBeGreaterThan(5);
  await writeFile('artifacts/v040-performance.json', JSON.stringify({ environment: 'Desktop Chromium, native API mocks; TV timing unverified', ...report }, null, 2));
});
