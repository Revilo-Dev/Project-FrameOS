import { openMedia } from './mediaNavigation';
import { test, expect, type Page } from '@playwright/test';
import { nativeFixture } from './nativeFixture';
import { bitcoinFixture } from './bitcoinFixture';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function setup(page: Page, nativeSettings = 'SecurityError') {
  await nativeFixture(page, { apps: true, channels: true });
  await page.addInitScript(nativeSettings => {
    const runtime = window as unknown as { tizen: any };
    let current = { type: 'HDMI', number: 2 };
    runtime.tizen.systeminfo = { getPropertyValue(name: string, done: (value: unknown) => void) { window.__playerFixture.calls.push(name); done({ connected: [{ type: 'HDMI', number: 2 }, { type: 'TV', number: 0 }], disconnected: [{ type: 'HDMI', number: 1 }] }); } };
    runtime.tizen.tvwindow = {
      getSource: () => ({ ...current, signal: true }),
      setSource(source: any, done: (source: unknown) => void) { current = source; window.__playerFixture.calls.push(`source:${source.type}:${source.number}`); done(source); },
      show(done: (rect: string[]) => void, _fail: unknown, rect: string[], _kind: string, z: string) { window.__playerFixture.calls.push(`show:${z}:${rect.join(',')}`); done(rect); },
      hide(done: () => void) { window.__playerFixture.calls.push('hide:tvwindow'); done(); },
    };
    runtime.tizen.ApplicationControl = class { constructor(public operation: string) {} };
    runtime.tizen.application.launchAppControl = (control: { operation: string }, id: string | null, done: () => void, fail: (error: unknown) => void) => {
      window.__playerFixture.calls.push(`control:${control.operation}:${id}`); nativeSettings ? fail({ name: nativeSettings }) : done();
    };
  }, nativeSettings);
  await page.route('https://api.open-meteo.com/**', route => route.abort()); await page.route('https://api.exchange.coinbase.com/**', route => route.abort());
  await page.goto('/'); await expect(page.locator('#app-youtube')).toBeFocused();
}
async function settings(page: Page, section: string, tool?: string) {
  await page.locator('#top-settings').click(); await page.locator(`#settings-tab-${section}`).click();
  if (tool) await page.locator(`#launcher-${tool}`).click();
}
async function calibrate(page: Page) {
  await settings(page, 'advanced', 'remote'); await page.locator('#remote-test-start').click();
  for (let i = 0; i < 2; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(800); await page.keyboard.up('Enter'); }
  await expect(page.getByLabel('Remote input evidence')).toContainText('"status": "supported"');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await expect(page.locator('.settings-panel')).toHaveCount(0); await page.locator('#app-youtube').focus();
}
test('Up uses spatial focus and one Down opens Media', async ({ page }) => {
  await setup(page);
  const ids = await page.locator('.app-tile').evaluateAll(nodes => nodes.map(node => node.id));
  for (const id of ids) {
    await page.locator(`[id="${id}"]`).focus(); await page.keyboard.press('ArrowUp');
    await expect(page.locator('.dock-options')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.id.startsWith('widget-') || document.activeElement?.id.startsWith('top-'))).toBe(true);
  }
  await page.locator('#app-youtube').focus(); await page.keyboard.press('ArrowDown'); await expect(page.locator('#media-entry-0')).toBeFocused();
});
test('short OK opens promptly while unverified long editing stays disabled without substitute shortcuts', async ({ page }) => {
  await setup(page); await page.keyboard.down('Enter');
  await expect.poll(() => page.evaluate(() => window.__playerFixture.calls.filter(call => call === 'launch:9Ur5IzDKqV.TizenYouTube').length)).toBe(1);
  await page.waitForTimeout(800); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  await expect(page.locator('.dock-options')).toHaveCount(0); await expect(page.locator('.is-moving')).toHaveCount(0);
  await page.keyboard.press('ContextMenu'); await expect(page.locator('.dock-options')).toHaveCount(0);
});
test('verified sustained OK opens editing once on release, cancels/commits moves and never launches the app', async ({ page }) => {
  await setup(page); await calibrate(page);
  await page.keyboard.down('Enter'); await page.waitForTimeout(800); await expect(page.locator('.dock-options')).toHaveCount(0); await page.keyboard.up('Enter');
  await expect(page.locator('#dock-option-open')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual([]);
  await page.locator('#dock-option-move').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape');
  expect(await page.locator('.dock-cell').evaluateAll(nodes => nodes.slice(0, 3).map(node => (node as HTMLElement).dataset.dockId))).toEqual(['art', 'youtube', 'stan']);
  await page.keyboard.down('Enter'); await page.waitForTimeout(800); await page.keyboard.up('Enter'); await page.locator('#dock-option-move').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  expect(await page.locator('.dock-cell').evaluateAll(nodes => nodes.slice(0, 3).map(node => (node as HTMLElement).dataset.dockId))).toEqual(['art', 'stan', 'youtube']);
});
test('failed remote evidence disables long editing cleanly and stale timers do not open menus', async ({ page }) => {
  await setup(page); await settings(page, 'advanced', 'remote'); await page.locator('#remote-test-start').click(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Remote input evidence')).toContainText('unsupported');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.locator('#app-youtube').focus();
  await page.keyboard.down('Enter'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800); await page.keyboard.up('Enter');
  await expect(page.locator('.dock-options')).toHaveCount(0); await expect(page.locator('#app-stan')).toBeFocused();
});
test('a missing release disables previously verified editing without launching on the eventual keyup', async ({ page }) => {
  await setup(page); await calibrate(page); await page.keyboard.down('Enter'); await page.waitForTimeout(2700); await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 13, repeat: false, bubbles: true }))); await page.keyboard.up('Enter');
  await expect(page.locator('.dock-options')).toHaveCount(0); expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('launch:')))).toEqual([]);
  await settings(page, 'advanced', 'remote'); await expect(page.getByLabel('Remote input evidence')).toContainText('"status": "unsupported"');
});
test('Settings has six sections and Back returns from a child page before closing the panel', async ({ page }) => {
  await setup(page); await settings(page, 'appearance'); await expect(page.locator('.settings-tabs button')).toHaveCount(6);
  await page.locator('#settings-tab-clock').click(); await expect(page.locator('#settings-section-back')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#settings-tab-clock')).toBeFocused(); await expect(page.locator('.settings-panel')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.settings-panel')).toHaveCount(0);
});
test('HDMI ports appear with real status, pin once, persist and directly request the reported full-screen source', async ({ page }) => {
  await setup(page); await page.locator('#app-all-apps').click();
  await expect(page.locator('[id="all-source-HDMI:1-open"]')).toContainText('Disconnected');
  await expect(page.locator('[id="all-source-HDMI:2-open"]')).toContainText('Connected');
  await expect(page.locator('[id="all-source-HDMI:3-open"]')).toHaveCount(0);
  await page.locator('[id="all-source-HDMI:1-pin"]').click(); await page.locator('[id="all-source-HDMI:1-pin"]').click();
  await expect(page.locator('[id="all-source-HDMI:1-pin"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[id="app-source:HDMI:1"]')).toHaveCount(1);
  await page.keyboard.press('Escape'); await page.reload(); await page.locator('[id="app-source:HDMI:1"]').click();
  await expect(page.locator('.source-viewer')).toContainText('Viewing requested'); await expect(page.locator('.frameos')).toHaveClass(/source-viewing/);
  const calls = await page.evaluate(() => window.__playerFixture.calls);
  expect(calls).toContain('source:HDMI:1'); expect(calls).toContain('show:FRONT:0,0,100%,100%'); expect(calls.filter(call => call.startsWith('launch:'))).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.locator('[id="app-source:HDMI:1"]')).toBeFocused();
  expect(await page.evaluate(() => window.__playerFixture.calls)).toContain('hide:tvwindow');
});
test('source picker uses direct cards, spatial focus and Back returns to its exact source card', async ({ page }) => {
  await setup(page); await page.locator('#app-sources').click(); await page.locator('[id="source-HDMI:1"]').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[id="source-HDMI:2"]')).toBeFocused();
  await expect(page.locator('.sources-panel')).not.toContainText(/tvwindow|setSource|VIDEOSOURCE/);
  await page.keyboard.press('Enter'); await expect(page.locator('.source-viewer')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.locator('[id="source-HDMI:2"]')).toBeFocused(); await page.keyboard.press('Escape'); await expect(page.locator('#app-sources')).toBeFocused();
});
test('Back during delayed HDMI discovery cancels the direct launch before any input change', async ({ page }) => {
  await setup(page); await page.locator('#app-all-apps').click(); await page.locator('[id="all-source-HDMI:1-pin"]').click(); await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const tv = (window as unknown as { tizen: any }).tizen;
    tv.systeminfo.getPropertyValue = (_property: string, callback: (value: unknown) => void) => { (window as any).__finishSource = () => callback({ connected: [{ type: 'HDMI', number: 1 }], disconnected: [] }); };
  });
  await page.locator('[id="app-source:HDMI:1"]').click(); await expect(page.locator('.source-viewer')).toContainText('Opening input'); await page.keyboard.press('Escape');
  await expect(page.locator('[id="app-source:HDMI:1"]')).toBeFocused(); await page.evaluate(() => (window as any).__finishSource());
  await page.waitForTimeout(80); expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('source:') || call.startsWith('show:')))).toEqual([]);
});
for (const outcome of ['SecurityError', '']) test(`Settings fallback works and one supported AppControl attempt records ${outcome || 'unverified ACK'}`, async ({ page }) => {
  await setup(page, outcome); await page.locator('#app-settings').click(); await expect(page.locator('#settings-title')).toHaveText('FrameOS Settings');
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('control:')))).toEqual([]);
  await page.locator('#settings-tab-tv-sources').click(); await page.locator('#settings-native-test').click(); await page.locator('#settings-native-test').evaluate((element: HTMLElement) => element.click());
  expect(await page.evaluate(() => window.__playerFixture.calls.filter(call => call.startsWith('control:')))).toEqual(['control:http://tizen.org/appcontrol/operation/setting:null']);
  await page.locator('#launcher-home').click(); expect(await page.evaluate(() => window.__playerFixture.calls)).toContain('launch:com.samsung.tv.csfs');
});
test('maintained browser SVG and exact static gradients are included in production', async ({ page }) => {
  const source = await readFile('public/assets/browser.svg'), built = await readFile('dist/assets/browser.svg');
  expect(createHash('sha256').update(source).digest('hex')).toBe(createHash('sha256').update(built).digest('hex'));
  expect(source.toString()).toContain('viewBox="0 0 260 260"'); await setup(page);
  await expect(page.locator('#app-browser img')).toHaveAttribute('src', './assets/browser.svg');
  const gradients = await page.locator('#app-gallery, #app-browser, #app-settings').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundImage));
  expect(gradients[0]).toMatch(/183, 24, 241.*252, 89, 22.*250, 1, 146.*255, 13, 70.*255, 13, 70/);
  expect(gradients[1]).toMatch(/67, 104, 239.*75, 34, 238/); expect(gradients[2]).toMatch(/51, 50, 67.*28, 26, 29/);
});
test('three new themes persist, retain settings and provide preview screenshots across launcher screens', async ({ page }) => {
  await setup(page); await mkdir('artifacts/v041-previews', { recursive: true });
  for (const theme of ['onyx', 'light', 'aqua']) {
    await settings(page, 'appearance'); await page.locator(`#theme-${theme}`).click(); await expect(page.locator('.frameos')).toHaveClass(new RegExp(`theme-${theme}`));
    await expect(page.locator(`#theme-${theme}`)).toHaveAttribute('aria-pressed', 'true'); await page.screenshot({ animations: 'disabled', path: `artifacts/v041-previews/${theme}-settings.png` });
    await page.keyboard.press('Escape'); await page.locator('#app-browser').focus(); await expect(page.locator('#app-browser')).toHaveCSS('width', '290px'); await page.screenshot({ animations: 'disabled', path: `artifacts/v041-previews/${theme}-home.png` });
    await page.locator('#app-all-apps').click(); await page.screenshot({ animations: 'disabled', path: `artifacts/v041-previews/${theme}-all-apps.png` }); await page.keyboard.press('Escape');
    await page.locator('#app-sources').click(); await page.screenshot({ animations: 'disabled', path: `artifacts/v041-previews/${theme}-sources.png` }); await page.keyboard.press('Escape');
    await openMedia(page); await expect(page.locator('#media-entry-0')).toBeVisible(); await page.screenshot({ animations: 'disabled', path: `artifacts/v041-previews/${theme}-media.png` });
    await page.locator('#media-entry-1').click(); await expect(page.locator('#player-toggle')).toHaveAttribute('aria-label', 'Pause'); await page.screenshot({ animations: 'disabled', path: `artifacts/v041-previews/${theme}-player.png` });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('.frameos')).toHaveClass(new RegExp(`theme-${theme}`));
  }
  await writeFile('artifacts/v041-previews/index.html', '<!doctype html><meta charset="utf-8"><title>FrameOS v0.4.1 themes</title><style>body{background:#111;color:#eee;font:18px Arial;padding:30px}section{margin-bottom:40px}img{width:31%;margin:1%;border-radius:12px}a{color:inherit}</style><h1>FrameOS v0.4.1 theme previews</h1>' + ['onyx','light','aqua'].map(theme => '<section><h2>'+theme+'</h2>'+['home','settings','all-apps','sources','media','player'].map(screen => `<a href="${theme}-${screen}.png"><img src="${theme}-${screen}.png" alt="${theme} ${screen}"></a>`).join('')+'</section>').join(''));
});
test('dedicated dock ring matches its surface geometry and remains inside the scrolling viewport', async ({ page }) => {
  await setup(page);
  for (const theme of ['onyx', 'light', 'aqua']) {
    await settings(page, 'appearance'); await page.locator(`#theme-${theme}`).click(); await page.keyboard.press('Escape');
    for (const id of ['art', 'browser', 'all-apps']) {
      await page.locator(`#app-${id}`).focus(); await expect(page.locator(`#app-${id}`)).toHaveCSS('width', '290px');
      const result = await page.locator(`#app-${id}`).evaluate(tile => {
        const ring = tile.querySelector('.dock-focus-ring')!, surface = tile.querySelector('.dock-tile-surface')!;
        const r = ring.getBoundingClientRect(), s = surface.getBoundingClientRect(), nav = tile.closest('.app-dock')!.getBoundingClientRect();
        return { radius: getComputedStyle(ring).borderRadius, surfaceRadius: getComputedStyle(surface).borderRadius, overflow: getComputedStyle(tile).overflow, opacity: getComputedStyle(ring).opacity, equal: Math.abs(r.x-s.x)<.1 && Math.abs(r.y-s.y)<.1 && Math.abs(r.width-s.width)<.1 && Math.abs(r.height-s.height)<.1, visible: r.top>=nav.top && r.bottom<=nav.bottom && r.left>=nav.left && r.right<=nav.right };
      });
      expect(result.radius).toBe(result.surfaceRadius); expect(result.overflow).toBe('visible'); expect(result.opacity).toBe('1'); expect(result.equal).toBe(true); expect(result.visible).toBe(true);
    }
  }
});
test('Light and Aqua keep a populated Bitcoin chart readable against their widget surfaces', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-21T08:23:00Z') }); await setup(page); await bitcoinFixture(page); await page.reload(); await expect(page.locator('#widget-bitcoin')).toContainText('$67,250.00');
  for (const theme of ['light', 'aqua']) {
    await settings(page, 'appearance'); await page.locator(`#theme-${theme}`).click(); await page.keyboard.press('Escape');
    const contrast = await page.locator('.bitcoin-chart').evaluate(chart => {
      const rgb = (text: string) => text.match(/[\d.]+/g)!.slice(0,3).map(Number);
      const luminance = (channels: number[]) => channels.map(value => { const c=value/255; return c<=.04045 ? c/12.92 : Math.pow((c+.055)/1.055,2.4); }).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
      const fg=luminance(rgb(getComputedStyle(chart).color)), bg=luminance(rgb(getComputedStyle(chart.closest('.dashboard-card')!).backgroundColor));
      return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    });
    expect(contrast).toBeGreaterThan(3);
  }
});
