import { test, expect } from '@playwright/test';
import { nativeFixture, openSeries } from './nativeFixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/$WEBAPIS/webapis/webapis.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.route('https://api.open-meteo.com/**', route => route.abort());
});

test('Media is a label and one Down from any dock tile enters Media and restores that tile', async ({ page }) => {
  await nativeFixture(page); await page.goto('/');
  await expect(page.locator('#home-media')).toContainText('Media');
  expect(await page.locator('#home-media').evaluate(element => element.tagName)).toBe('DIV');
  await expect(page.locator('#home-media')).not.toHaveAttribute('tabindex');
  for (const id of ['app-youtube', 'app-stan', 'app-all-apps']) {
    await page.locator(`#${id}`).focus(); await page.keyboard.press('ArrowDown');
    await expect(page.locator('#media-entry-0')).toBeFocused();
    await page.keyboard.press('Home'); await expect(page.locator(`#${id}`)).toBeFocused();
    await expect(page.locator('.home')).not.toHaveClass(/home-away/);
  }
});

test('Episodes lists every video in this folder, marks the current one and switches across series', async ({ page }) => {
  await page.clock.install();
  await nativeFixture(page, { videoNames: ['Show.S01E10.mkv', 'Show.S01E02.mkv', 'Other.S01E01.mp4', 'Show.S01E01.mp4'] });
  await openSeries(page); await page.locator('#media-entry-2').click();
  await expect(page.locator('.player-top h1')).toContainText('Show.S01E01');
  await page.keyboard.press('ArrowUp'); await expect(page.locator('#player-episodes')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#player-episode-1')).toBeFocused();
  await expect(page.locator('.player-episode')).toHaveCount(4);
  await expect(page.locator('.player-episode[aria-current=true]')).toContainText('Show.S01E01');
  await expect(page.locator('.player-episode[aria-current=true]')).toContainText('Now playing');
  await expect(page.locator('#player-episode-3')).toContainText('Show.S01E10');
  const opens = await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('open:')));
  await page.clock.runFor(6000); await expect(page.locator('#player-episode-panel')).toBeVisible();
  await page.keyboard.press('Enter'); await expect(page.locator('#player-episode-panel')).toHaveCount(0);
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('open:')))).toEqual(opens);
  await page.locator('#player-episodes').click(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect(page.locator('.player-top h1')).toContainText('Other.S01E01');
  await expect(page.locator('#player-toggle')).toBeFocused();
  await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause');
  expect(await page.evaluate(() => window.__playerFixture.calls)).toContain('open:/media/removable_sdc7/Series/Other.S01E01.mp4');
  await page.locator('#player-episodes').click(); await expect(page.locator('#player-episode-0')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Escape'); await expect(page.locator('#player-episodes')).toBeFocused();
  await expect(page.locator('.video-player')).toBeVisible();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#player-home')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('.video-player')).toHaveCount(0); await expect(page.locator('#app-youtube')).toBeFocused();
  await expect(page.locator('html')).not.toHaveClass(/native-playback/);
  expect(await page.evaluate(() => window.__playerFixture.calls)).toContain('close');
});

test('the episode panel scrolls and traps Tab focus; Back and Left close only the panel', async ({ page }) => {
  await nativeFixture(page, { count: 60 }); await openSeries(page); await page.locator('#media-entry-1').click();
  await page.locator('#player-episodes').click();
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#player-episode-25')).toBeFocused();
  await expect(page.locator('#player-episode-25')).toBeInViewport();
  expect(await page.locator('.player-episode-list').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('#player-episode-59').focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#player-episodes-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#player-episode-59')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#player-episodes')).toBeFocused();
  await expect(page.locator('.video-player')).toBeVisible();
  await page.locator('#player-episodes').click(); await page.keyboard.press('Escape');
  await expect(page.locator('#player-episodes')).toBeFocused();
  await page.screenshot({ path: 'artifacts/player-navigation/player-controls.png', style: '.native-video-surface{visibility:hidden}.video-player{background:#0b1017}' });
  await page.locator('#player-episodes').click();
  await page.screenshot({ path: 'artifacts/player-navigation/episode-panel.png', style: '.native-video-surface{visibility:hidden}.video-player{background:#0b1017}' });
});

test('Home closes Settings, editors, launcher panels and Art Mode', async ({ page }) => {
  await nativeFixture(page, { apps: true });
  await page.addInitScript(() => localStorage.setItem('frameos.widgets.v1', JSON.stringify({ version: 1, bitcoinAdded: true, enabled: ['todo'] })));
  await page.goto('/');
  await page.locator('#top-settings').click(); await page.keyboard.press('Home');
  await expect(page.locator('.settings-panel')).toHaveCount(0); await expect(page.locator('#app-youtube')).toBeFocused();
  await page.locator('#app-all-apps').click(); await expect(page.locator('.all-apps-panel')).toBeVisible();
  await page.keyboard.press('Home'); await expect(page.locator('.all-apps-panel')).toHaveCount(0);
  await expect(page.locator('#app-all-apps')).toBeFocused();
  await page.locator('#widget-todo').click(); await page.locator('#organiser-title').fill('Unsaved'); await page.keyboard.press('Home');
  await expect(page.locator('.widget-panel')).toHaveCount(0); await expect(page.locator('#app-all-apps')).toBeFocused();
  await page.locator('#app-art').click(); await expect(page.locator('.frameos')).toHaveClass(/art-mode/);
  await page.keyboard.press('Home'); await expect(page.locator('.frameos')).not.toHaveClass(/art-mode/);
  await expect(page.locator('#app-art')).toBeFocused();
});

test('advertised native Home routes from hidden playback and remains registered after leaving the player', async ({ page }) => {
  await page.clock.install(); await nativeFixture(page);
  await page.addInitScript(() => {
    const input = (window as unknown as { tizen: { tvinputdevice: { getSupportedKeys(): { name: string; code: number }[] } } }).tizen.tvinputdevice;
    const supported = input.getSupportedKeys;
    input.getSupportedKeys = () => [...supported(), { name: 'Home', code: 12399 }];
  });
  await openSeries(page); await page.locator('#media-entry-1').click();
  await page.clock.runFor(4100); await expect(page.locator('.video-player')).not.toHaveClass(/controls-visible/);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 12399, bubbles: true, cancelable: true })));
  await expect(page.locator('.video-player')).toHaveCount(0); await expect(page.locator('#app-youtube')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.keys.filter(key => key === 'Home'))).toHaveLength(1);
  expect(await page.evaluate(() => window.__playerFixture.releasedKeys)).not.toContain('Home');
});

test('Home during a pending seek returns immediately and cleans up native playback after the seek completes', async ({ page }) => {
  await nativeFixture(page, { delaySeek: true }); await openSeries(page); await page.locator('#media-entry-1').click();
  await page.keyboard.press('PageUp'); await page.keyboard.press('Home');
  await expect(page.locator('.video-player')).toHaveCount(0); await expect(page.locator('#app-youtube')).toBeFocused();
  const before = await page.evaluate(() => window.__playerFixture.calls.length);
  await page.evaluate(() => window.__playerFixture.finishSeek());
  expect((await page.evaluate(() => window.__playerFixture.calls)).slice(before)).toEqual(['state', 'stop', 'state', 'close']);
});

for (const failHide of [false, true]) test(`Home hides the active TV input; hide failure=${failHide} keeps a usable TV escape`, async ({ page }) => {
  await nativeFixture(page);
  await page.addInitScript(failHide => {
    const runtime = window as unknown as { tizen: Record<string, unknown> };
    const source = { type: 'HDMI', number: 2 };
    runtime.tizen.systeminfo = { getPropertyValue(_name: string, done: (value: unknown) => void) { done({ connected: [source], disconnected: [] }); } };
    runtime.tizen.tvwindow = {
      getSource: () => source,
      setSource(_source: unknown, done: (value: unknown) => void) { done(source); },
      show(done: (rect: string[]) => void) { done(['0', '0', '100%', '100%']); },
      hide(done: () => void, fail: (error: unknown) => void) { window.__playerFixture.calls.push('hide:tvwindow'); if (failHide) fail({ name: 'UnknownError' }); else done(); },
    };
  }, failHide);
  await page.goto('/'); await page.locator('#app-sources').click();
  await page.locator('[id="source-HDMI:2"]').click(); await expect(page.locator('.source-viewer')).toContainText('Viewing requested');
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => window.__playerFixture.calls)).toContain('hide:tvwindow');
  if (failHide) {
    await expect(page.locator('.source-viewer')).toContainText('Press TV to return to Samsung Home.');
    await expect(page.locator('#source-view-home')).toBeFocused();
  } else {
    await expect(page.locator('.source-viewer')).toHaveCount(0); await expect(page.locator('.sources-panel')).toHaveCount(0);
    await expect(page.locator('.frameos')).not.toHaveClass(/source-viewing/); await expect(page.locator('#app-sources')).toBeFocused();
  }
});
