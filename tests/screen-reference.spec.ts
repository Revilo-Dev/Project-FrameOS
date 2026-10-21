import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeFixture } from './nativeFixture';
import { mediaOption } from './mediaOptions';

test('capture all FrameOS screens and assemble the reference gallery', async ({ page, context }) => {
  test.setTimeout(90000);
  const directory = resolve('artifacts/screens');
  await mkdir(directory, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-21T08:23:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('frameos.settings.v1', JSON.stringify({ version: 1, theme: 'slate', wallpaper: 'dark-mount', motion: 'off', weatherCity: 'brisbane', showFps: false, timeFormat: '12h', timeZone: 'Australia/Brisbane', clockFont: 'modern' }));
  });
  await nativeFixture(page, { channels: true, volumeKeys: true });
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/config.xml', route => readFile('tizen/config.xml.v0.4.preview', 'utf8').then(body => route.fulfill({ contentType: 'application/xml', body })));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {
    timezone: 'Australia/Brisbane', current: { temperature_2m: 24, weather_code: 2, is_day: 1, time: '2026-10-21T18:00' },
    daily: { time: ['2026-10-21', '2026-10-22'], temperature_2m_max: [29.2, 30.4], temperature_2m_min: [17.8, 18.1] },
    hourly: { time: ['2026-10-21T18:00', '2026-10-21T19:00', '2026-10-21T20:00', '2026-10-21T21:00', '2026-10-21T22:00', '2026-10-21T23:00', '2026-10-22T00:00'], weather_code: [2, 0, 3, 61, 2, 3, 0], temperature_2m: [24, 23, 22, 21, 20, 20, 19], is_day: [1, 0, 0, 0, 0, 0, 0], precipitation_probability: [0, 0, 10, 60, 20, 10, 0] },
  } }));
  const captures: { title: string; file: string }[] = [];
  const capture = async (name: string, title: string, nativeVideo = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => Array.from(document.images).filter(image => image.getClientRects().length && !image.closest('[aria-hidden="true"]')).every(image => image.complete && image.naturalWidth > 0));
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(directory, file), ...(nativeVideo ? { style: '.native-video-surface{visibility:hidden}.video-player{background:#0b1017}.player-fill,.player-knob{transition:none!important}' } : {}) });
    captures.push({ title, file });
  };
  await page.goto('/'); await expect(page.locator('#app-youtube')).toBeFocused();
  await expect(page.locator('.weather-hour')).toHaveCount(6);
  await capture('home', 'Home · widgets and expanded application dock');
  for (const id of ['weather', 'calendar', 'world-clock']) {
    await page.locator(`#widget-${id}`).click();
    await expect(page.locator(`.widget-panel-${id}`)).toBeVisible();
    await capture(`widget-${id}`, `Widget · ${id === 'calendar' ? 'Calendar (Google connection deferred)' : id}`);
    await page.keyboard.press('Escape');
  }
  await page.locator('#top-settings').click();
  for (const [id, title] of [['appearance', 'Appearance'], ['clock', 'Clock'], ['wallpapers', 'Wallpapers'], ['weather', 'Weather'], ['widgets', 'Widgets'], ['media', 'Media / playback'], ['usb', 'USB diagnostics']]) {
    await page.locator(`#settings-tab-${id}`).click();
    if (id === 'usb') {
      await page.locator('#usb-rescan').click();
      await expect(page.locator('.diagnostic-status')).toContainText('USB detected');
    }
    await capture(`settings-${id}`, `Settings · ${title}`);
    if (id === 'clock') {
      await page.locator('.settings-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await capture('clock-time-zones', 'Settings · Clock time zones');
      await page.locator('.settings-content').evaluate(element => { element.scrollTop = 0; });
    }
  }
  await page.locator('#settings-tab-widgets').click();
  for (const id of ['weather', 'world-clock']) await page.locator(`#widget-toggle-${id}`).click();
  for (const id of ['reminders', 'todo']) await page.locator(`#widget-toggle-${id}`).click();
  await page.keyboard.press('Escape');
  for (const id of ['reminders', 'todo']) {
    await page.locator(`#widget-${id}`).click();
    await page.locator('#organiser-title').fill(id === 'reminders' ? 'Water the plants' : 'Plan the weekend');
    if (id === 'reminders') { await page.locator('#organiser-date').fill('2026-10-22'); await page.locator('#organiser-time').fill('09:00'); }
    await page.locator('#organiser-add').click();
    await capture(`widget-${id}`, `Widget · ${id === 'todo' ? 'To-do' : 'Reminders'} (local)`);
    await page.keyboard.press('Escape');
  }
  for (const [id, count] of [['todo', 2], ['reminders', 1], ['calendar', 0]] as const) {
    await page.locator('#top-settings').click(); await page.locator('#settings-tab-widgets').click();
    await page.locator(`#widget-toggle-${id}`).click(); await page.keyboard.press('Escape');
    await capture(`home-${count}-widgets`, `Home · ${count} ${count === 1 ? 'widget' : 'widgets'}`);
  }
  await page.locator('#top-settings').click(); await page.locator('#settings-tab-widgets').click();
  for (const id of ['weather', 'calendar', 'world-clock']) await page.locator(`#widget-toggle-${id}`).click();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#home-media').click(); await expect(page.locator('#media-entry-0')).toBeFocused();
  await capture('media-root', 'Media Hub · USB root');
  await page.keyboard.press('Enter'); await expect(page.locator('#media-entry-0')).toContainText('Extras');
  await capture('media-folder', 'Media Hub · episode folder');
  await page.locator('#media-options').click(); await expect(page.getByRole('menu')).toBeVisible();
  await capture('media-options', 'Media Hub · Options');
  await page.keyboard.press('Escape'); await page.locator('#media-entry-1').focus(); await page.keyboard.press('ContextMenu');
  await expect(page.locator('.media-context')).toBeVisible(); await capture('item-actions', 'Media Hub · item actions');
  await page.locator('#context-details').click(); await expect(page.locator('.media-details')).toBeVisible();
  await capture('file-details', 'Media Hub · file details');
  await page.keyboard.press('Escape'); await page.locator('#media-entry-2').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.oncurrentplaytime(65000));
  await capture('player-playing', 'Player · playing / Pause control', true);
  await page.locator('#player-toggle').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Play');
  await capture('player-paused', 'Player · paused / Play control', true);
  await page.locator('#player-next').click(); await expect(page.locator('.player-top h1')).toContainText('S01E10');
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => { window.__playerFixture.listener!.oncurrentplaytime(180000); window.__playerFixture.listener!.onstreamcompleted(); });
  await expect(page.locator('.player-ended')).toBeVisible(); await capture('player-finished', 'Player · finished / Replay', true);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('.page-stack')).not.toHaveClass(/page-stack-media/);
  await page.locator('#top-network').click(); await expect(page.getByRole('dialog')).toBeVisible();
  await capture('network', 'Network status'); await page.keyboard.press('Escape');
  await page.locator('#app-youtube').click(); await expect(page.locator('#notice-close')).toBeVisible();
  await capture('app-notice', 'Application availability notice'); await page.keyboard.press('Escape');
  await page.locator('#top-power').click(); await expect(page.locator('#exit-cancel')).toBeVisible();
  await capture('exit', 'Exit confirmation'); await page.keyboard.press('Escape');
  await page.locator('#home-media').click(); await expect(page.locator('#media-entry-0')).toContainText('Series');
  await page.locator('#media-entry-0').click(); await expect(page.locator('#media-entry-0')).toContainText('Extras');
  await page.locator('#media-entry-0').click(); await expect(page.getByText('This folder is empty', { exact: true })).toBeVisible();
  await capture('empty-folder', 'Media Hub · empty folder'); await page.keyboard.press('Escape');
  await expect(page.locator('#media-entry-0')).toContainText('Extras');
  await page.evaluate(() => { window.__playerFixture.failDirectory = 'UnknownError'; }); await mediaOption(page, 'media-refresh');
  await expect(page.locator('.media-recovery')).toBeVisible(); await capture('media-recovery', 'Media Hub · recovery / retry');
  await page.evaluate(() => { window.__playerFixture.failDirectory = 'SecurityError'; }); await mediaOption(page, 'media-refresh');
  await expect(page.locator('.media-error')).toBeVisible(); await capture('media-error', 'Media Hub · access error');
  await page.evaluate(() => { window.__playerFixture.failDirectory = ''; }); await mediaOption(page, 'media-refresh');
  await expect(page.locator('#media-entry-1')).toBeVisible(); await page.locator('#media-entry-1').click();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => window.__playerFixture.listener!.onerror('UnsupportedCodec'));
  await expect(page.locator('.player-message')).toContainText('UnsupportedCodec'); await capture('player-error', 'Player · playback error', true);
  await page.keyboard.press('Escape'); await page.evaluate(() => window.__playerFixture.remove());
  await expect(page.getByText('Connect a USB device', { exact: true })).toBeVisible(); await capture('no-usb', 'Media Hub · USB disconnected');

  expect(captures).toHaveLength(33);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>FrameOS screen references</title><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#0b111b;color:#eff5fb;font:18px Arial,sans-serif}h1{font-size:30px;margin:0 0 8px}p{font-size:16px;color:#b1c2d4;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(4,1fr);grid-gap:20px}figure{margin:0;border:1px solid #334154;border-radius:16px;overflow:hidden;background:#172131}img{display:block;width:100%;height:auto}figcaption{padding:12px 14px;font-size:17px}a{color:inherit}
    </style><h1>FrameOS · Screen references</h1><p>33 full-size captures · Click an image to open it · Desktop native-API fixtures; the TV video surface is represented by a dark background.</p><div class="grid">${captures.map(({ title, file }, i) => `<figure><a href="./${file}"><img src="./${file}" alt="${title}"></a><figcaption>${i + 1}. ${title}</figcaption></figure>`).join('')}</div></html>`;
  await writeFile(resolve(directory, 'index.html'), html);
  await writeFile(resolve(directory, 'screens.json'), JSON.stringify({ capturedAt: new Date().toISOString(), viewport: { width: 1920, height: 1080 }, captures }, null, 2));
  const gallery = await context.newPage(); await gallery.setViewportSize({ width: 1920, height: 1080 });
  await gallery.goto(pathToFileURL(resolve(directory, 'index.html')).href);
  await expect(gallery.locator('img')).toHaveCount(33);
  await gallery.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
  await gallery.screenshot({ path: resolve(directory, 'all-screens.png'), fullPage: true });
  await gallery.close();
});
