import { expect, type Page } from '@playwright/test';

export async function mediaOption(page: Page, id: string) {
  if (!await page.getByRole('menu', { name: 'Media options' }).isVisible()) await page.locator('#media-options').click();
  await page.locator(`#${id}`).click();
  if (id !== 'media-refresh' && id !== 'media-item-options') {
    await page.keyboard.press('Escape');
    await expect(page.locator('#media-options')).toBeFocused();
  }
}
