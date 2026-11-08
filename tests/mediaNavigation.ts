import { expect, type Page } from '@playwright/test';

export async function openMedia(page: Page) {
  await page.locator('#app-youtube').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.home')).toHaveClass(/home-away/);
}
