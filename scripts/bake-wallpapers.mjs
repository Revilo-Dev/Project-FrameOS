// Offline artwork bake. No filters, canvas rendering or blur run in the launcher.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const name of ['tidal', 'dune', 'dusk']) {
    const directory = new URL('../public/wallpapers/', import.meta.url);
    const svg = await readFile(new URL(`${name}.svg`, directory), 'utf8');
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.jpg`, directory)), type: 'jpeg', quality: 88 });
    const data = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = `data:image/svg+xml;base64,${btoa(source)}`;
      await new Promise((resolve) => { image.onload = resolve; });
      const canvas = document.createElement('canvas');
      canvas.width = 480; canvas.height = 270;
      const context = canvas.getContext('2d');
      context.fillStyle = '#172530'; context.fillRect(0, 0, 480, 270);
      context.filter = 'blur(18px)';
      context.drawImage(image, -36, -20, 552, 310);
      return canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
    }, svg);
    await writeFile(new URL(`${name}-soft.jpg`, directory), Buffer.from(data, 'base64'));
  }
} finally { await browser.close(); }
