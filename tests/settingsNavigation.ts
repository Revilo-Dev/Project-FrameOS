import { expect, type Page } from '@playwright/test';
export async function settingsSubsection(page: Page, child: string) {
  const parent = child === 'weather' ? 'widgets' : child === 'usb' ? 'media' : 'appearance';
  await page.locator(`#settings-tab-${parent}`).click(); await page.locator(`#settings-tab-${child}`).click();
}
export async function launcherTool(page: Page, tool: string) {
  await page.locator(`#settings-tab-${tool === 'apps' ? 'home-dock' : 'advanced'}`).click(); await page.locator(`#launcher-${tool}`).click();
}
export async function closeSettings(page: Page) {
  if (!(await page.locator('.settings-panel').count()) && await page.locator('.all-apps-panel').count()) await page.keyboard.press('Escape');
  if (await page.locator('#launcher-tool-back').count()) await page.keyboard.press('Escape');
  if (await page.locator('#settings-section-back').count()) await page.keyboard.press('Escape');
  if (await page.locator('.settings-panel').count()) await page.keyboard.press('Escape');
  await expect(page.locator('.settings-panel')).toHaveCount(0);
}
export async function verifyDockHold(page: Page) {
  await page.locator('#top-settings').click(); await launcherTool(page, 'remote'); await page.locator('#remote-test-start').click();
  for (let i = 0; i < 2; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(800); await page.keyboard.up('Enter'); }
  await expect(page.getByLabel('Remote input evidence')).toContainText('"status": "supported"');
  await closeSettings(page); await page.locator('#app-youtube').focus();
}
