// One-time, offline conversion of the user's preserved uploads. Chrome 69 has no
// AVIF decoder; ship bounded JPEGs, thumbnails and a baked blur for every image.
import { chromium } from '@playwright/test';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const input = 'artifacts/imports/user-assets-2026-10-20/wallpapers';
const output = 'public/wallpapers';
const files = (await readdir(input)).filter(name => /\.(jpg|jpeg|png|webp|avif)$/i.test(name)).sort();
const browser = await chromium.launch();
const catalog = [];
const previous = JSON.parse(await readFile('src/services/wallpaper-catalog.json', 'utf8').catch(() => '[]'));
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await mkdir(output, { recursive: true });
  for (const [index, file] of files.entries()) {
    const id = path.parse(file).name;
    const bytes = await readFile(path.join(input, file));
    const format = /avif$/i.test(file) ? 'avif' : 'jpeg';
    const rendered = await page.evaluate(async ({ source }) => {
      const image = new Image();
      image.src = source;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Cannot decode wallpaper')); });
      const render = (width, height, blur, quality) => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        const scale = Math.max(width / image.width, height / image.height) * (blur ? 1.15 : 1);
        const w = image.width * scale, h = image.height * scale;
        context.filter = blur ? 'blur(16px)' : 'none';
        context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
        return canvas.toDataURL('image/jpeg', quality).split(',')[1];
      };
      return { main: render(1920, 1080, false, .88), thumb: render(320, 180, false, .8), soft: render(480, 270, true, .78) };
    }, { source: `data:image/${format};base64,${bytes.toString('base64')}` });
    for (const [kind, base64] of Object.entries(rendered)) await writeFile(path.join(output, `${id}${kind === 'main' ? '' : `-${kind}`}.jpg`), Buffer.from(base64, 'base64'));
    catalog.push({ id, name: previous.find(item => item.id === id)?.name || (id === 'dark-mount' ? 'Midnight peaks' : id === 'forrestclean' ? 'Forest' : `Landscape ${String(index + 1).padStart(2, '0')}`), src: `./wallpapers/${id}.jpg`, thumbnail: `./wallpapers/${id}-thumb.jpg`, ambient: `./wallpapers/${id}-soft.jpg` });
  }
  await writeFile('src/services/wallpaper-catalog.json', JSON.stringify(catalog, null, 2) + '\n');
  await page.setContent(`<style>body{margin:0;background:#111;color:white;font:14px Arial;display:grid;grid-template-columns:repeat(7,1fr)}figure{margin:5px}img{width:100%;height:108px;object-fit:cover}figcaption{padding:4px}</style>${await Promise.all(catalog.map(async (item, i) => `<figure><img src="data:image/jpeg;base64,${(await readFile(path.join(output, `${item.id}-thumb.jpg`))).toString('base64')}"><figcaption>${i + 1}. ${item.name}</figcaption></figure>`)).then(items => items.join(''))}`);
  await page.screenshot({ path: 'artifacts/wallpaper-contact-sheet.jpg', fullPage: true });
  console.log(`Imported ${catalog.length} wallpapers, each with a TV JPEG, thumbnail and baked ambient layer.`);
} finally { await browser.close(); }
