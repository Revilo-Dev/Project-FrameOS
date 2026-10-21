import { bitcoinFixture } from './bitcoinFixture';
import { test, expect, type Page } from '@playwright/test';
import { nativeFixture } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await bitcoinFixture(page);
  await page.clock.install({ time: new Date('2026-10-21T08:23:00Z') });
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {
    timezone: 'Australia/Brisbane', current: { temperature_2m: 24, weather_code: 2, is_day: 1, time: '2026-10-21T18:00' },
    daily: { time: ['2026-10-21', '2026-10-22'], temperature_2m_max: [29.2, 30.4], temperature_2m_min: [17.8, 18.1] },
    hourly: { time: ['2026-10-21T18:00', '2026-10-21T19:00', '2026-10-21T20:00', '2026-10-21T21:00', '2026-10-21T22:00', '2026-10-21T23:00', '2026-10-22T00:00'], weather_code: [2, 0, 3, 61, 2, 3, 0], temperature_2m: [24, 23, 22, 21, 20, 20, 19], is_day: [1, 0, 0, 0, 0, 0, 0], precipitation_probability: [0, 0, 10, 60, 20, 10, 0] },
  } }));
});
async function seed(page: Page, enabled: string[]) {
  await page.addInitScript(ids => {
    if (!localStorage.getItem('frameos.widgets.v1')) localStorage.setItem('frameos.widgets.v1', JSON.stringify({ version: 1, bitcoinAdded: true, enabled: ids, cities: ['Australia/Brisbane', 'Europe/Warsaw', 'America/New_York'], calendarPrivacy: false }));
  }, enabled);
}
async function settings(page: Page) { await page.locator('#top-settings').click(); await page.locator('#settings-tab-widgets').click(); }

test('three default widgets fit between the centred clock and dock and are D-pad reachable', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (/googleapis|accounts.google/.test(request.url())) requests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.dashboard-card')).toHaveCount(3);
  await expect(page.locator('.weather-hour')).toHaveCount(6);
  await expect(page.locator('.weather-high')).toHaveText('High29°');
  await expect(page.locator('.weather-low')).toHaveText('Low18°');
  const dailyFits = await page.locator('.dashboard-card .weather-daily').evaluate(element => {
    const daily = element.getBoundingClientRect(), summary = element.parentElement!.querySelector('.weather-summary')!.getBoundingClientRect(), card = element.closest('.dashboard-card')!.getBoundingClientRect();
    return daily.left > summary.right && daily.right <= card.right - 24;
  });
  expect(dailyFits).toBe(true);
  await expect(page.locator('.world-city')).toHaveCount(3);
  await expect(page.locator('.dashboard-bitcoin')).toContainText('$67,250.00');
  await expect(page.locator('.dashboard-card .weather-icon-rain')).toHaveCSS('color', 'rgb(155, 171, 245)');
  const geometry = await page.evaluate(() => {
    const clock = document.querySelector('.clock')!.getBoundingClientRect(), dock = document.querySelector('.app-dock')!.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll('.dashboard-card')).map(item => item.getBoundingClientRect());
    return cards.every((card, i) => card.top > clock.bottom && card.bottom < dock.top && card.left > 0 && card.right < 1920 && (!i || card.left > cards[i - 1].right));
  });
  expect(geometry).toBe(true);
  const headings = await page.locator('.dashboard-card .widget-heading').evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
  expect(Math.max(...headings) - Math.min(...headings)).toBeLessThan(1);
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#widget-weather')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#widget-bitcoin')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('.widget-panel-bitcoin')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#widget-bitcoin')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('.widget-panel-world-clock')).toBeVisible();
  await expect(page.locator('.widget-panel-world-clock .world-city')).toHaveCount(3);
  expect(requests).toEqual([]);
});
test('Settings enforces the maximum, persists order and supports one, two and zero widgets', async ({ page }) => {
  await page.goto('/'); await settings(page);
  await expect(page.locator('.widget-counter')).toHaveText('3 / 3 active');
  await expect(page.locator('#widget-later-weather')).toHaveCSS('width', '58px');
  await page.locator('#widget-toggle-todo').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#widget-toggle-todo')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#widget-toggle-weather').click(); await page.locator('#widget-toggle-todo').click();
  await page.locator('#widget-earlier-todo').click(); await expect(page.locator('#widget-toggle-todo')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await page.locator('.dashboard-card').evaluateAll(cards => cards.map(card => card.id))).toEqual(['widget-bitcoin', 'widget-todo', 'widget-world-clock']);
  await page.reload(); expect(await page.locator('.dashboard-card').evaluateAll(cards => cards.map(card => card.id))).toEqual(['widget-bitcoin', 'widget-todo', 'widget-world-clock']);
  await settings(page); await page.locator('#widget-toggle-todo').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.widget-dashboard')).toHaveAttribute('data-widget-count', '2');
  await settings(page); await page.locator('#widget-toggle-bitcoin').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.dashboard-card')).toHaveCount(1);
  const single = await page.locator('.dashboard-card').boundingBox(); expect(single!.x + single!.width / 2).toBeCloseTo(960, 0);
  await settings(page); await page.locator('#widget-toggle-world-clock').click(); await page.keyboard.press('Escape');
  await expect(page.locator('.dashboard-card')).toHaveCount(0); await expect(page.locator('.clock')).toBeVisible();
  await expect(page.locator('#top-settings')).toBeFocused(); await page.reload(); await expect(page.locator('.dashboard-card')).toHaveCount(0);
});
test('local tasks can be entered with the remote, completed, removed and restored after reload', async ({ page }) => {
  await seed(page, ['todo']); await page.goto('/'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#organiser-title')).toBeFocused();
  await page.keyboard.type('Water the plants'); await page.keyboard.press('Enter'); await expect(page.locator('#organiser-add')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('.organiser-item')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(page.locator('.todo-preview')).toContainText('Water the plants');
  await page.reload(); await page.locator('#widget-todo').click(); await expect(page.locator('.organiser-item')).toContainText('Water the plants');
  await page.locator('.organiser-complete').click(); await expect(page.locator('.organiser-complete')).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await page.locator('#widget-todo').click(); await expect(page.locator('.organiser-complete')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.organiser-remove').click(); await expect(page.locator('#organiser-add')).toBeFocused();
  await page.reload(); await page.locator('#widget-todo').click(); await expect(page.locator('.organiser-item')).toHaveCount(0);
});
test('local reminders retain due times, remain separate from Calendar and reject empty titles', async ({ page }) => {
  await seed(page, ['reminders']); await page.goto('/'); await page.locator('#widget-reminders').click();
  await page.locator('#organiser-add').click(); await expect(page.locator('.organiser-status')).toHaveText('Enter a title first.');
  await page.locator('#organiser-title').fill('Appointment'); await page.keyboard.press('Enter');
  await expect(page.locator('#organiser-date')).toBeFocused(); await page.locator('#organiser-date').fill('2026-10-22');
  await page.keyboard.press('Enter'); await expect(page.locator('#organiser-time')).toBeFocused();
  await page.locator('#organiser-time').fill('09:30'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.locator('.organiser-item')).toContainText('9:30 am');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('frameos.organiser.v1')!));
  expect(stored.reminders[0].due).toBe('2026-10-21T23:30:00.000Z'); expect(stored.tasks).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.locator('.reminder-preview')).toContainText('Appointment');
  await page.reload(); await page.locator('#widget-reminders').click(); await expect(page.locator('.organiser-item')).toContainText('Appointment');
  await page.locator('.organiser-complete').click(); await page.keyboard.press('Escape'); await expect(page.locator('.reminder-preview')).toHaveCount(0);
});
test('Calendar has an honest disconnected month view, D-pad day navigation and persistent Privacy Mode', async ({ page }) => {
  await seed(page, ['calendar']); await page.goto('/'); await page.locator('#widget-calendar').click();
  await expect(page.locator('.calendar-state-unconfigured')).toContainText('connection coming later');
  await expect(page.locator('.calendar-day')).toHaveCount(42); await expect(page.locator('#calendar-refresh')).toBeDisabled();
  await page.locator('#calendar-next').click(); await expect(page.locator('.calendar-toolbar h3')).toHaveText('November 2026');
  await page.locator('#calendar-today').click(); await expect(page.locator('.calendar-toolbar h3')).toHaveText('October 2026');
  await page.locator('#calendar-day-2026-10-21').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('#calendar-day-2026-10-22')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.calendar-day').last().focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#calendar-agenda')).toBeFocused();
  expect(await page.locator('#calendar-agenda').evaluate(element => element.getBoundingClientRect().bottom <= document.querySelector('.widget-panel-content')!.getBoundingClientRect().bottom)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('#widget-calendar')).toBeFocused();
  await settings(page); await page.locator('#calendar-privacy').click(); await page.reload(); await settings(page);
  await expect(page.locator('#calendar-privacy')).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Escape');
  await page.locator('#widget-calendar').click(); await expect(page.locator('.privacy-label')).toContainText('Event titles are hidden');
});
test('Widgets tab shares channel routing, preserves focus and leaves player seeking unchanged', async ({ page }) => {
  await nativeFixture(page, { channels: true, volumeKeys: true }); await page.goto('/');
  await page.locator('#top-settings').click(); await page.locator('#settings-tab-weather').click();
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-widgets')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown'); await expect(page.locator('#widget-toggle-weather')).toBeFocused();
  await page.keyboard.press('PageUp'); await expect(page.locator('#settings-tab-usb')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('PageDown'); await expect(page.locator('#widget-toggle-weather')).toBeFocused();
  expect((await page.evaluate(() => window.__playerFixture.calls)).filter(call => call.startsWith('seek:'))).toEqual([]);
  await page.keyboard.press('Escape'); await page.locator('#app-youtube').focus(); await page.keyboard.press('ArrowDown');
  await page.locator('#media-entry-0').click(); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.keyboard.press('PageUp'); await expect(page.locator('#player-seek')).toHaveAttribute('aria-valuenow', '30000');
});
test('world city selection stays bounded and persists while retaining at least one city', async ({ page }) => {
  await page.goto('/'); await settings(page);
  await page.locator('[id="world-city-Asia/Tokyo"]').focus(); await page.keyboard.press('Enter'); await expect(page.locator('[id="world-city-Asia/Tokyo"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[id="world-city-Europe/Warsaw"]').click(); await page.locator('[id="world-city-Asia/Tokyo"]').click();
  await page.keyboard.press('Escape'); await expect(page.locator('.world-times')).toContainText('Tokyo');
  await page.reload(); await settings(page); await page.locator('[id="world-city-America/New_York"]').click(); await page.locator('[id="world-city-Asia/Tokyo"]').click();
  await page.locator('[id="world-city-Australia/Brisbane"]').focus(); await page.keyboard.press('Enter'); await expect(page.locator('[id="world-city-Australia/Brisbane"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await expect(page.locator('.world-city')).toHaveCount(1);
});
