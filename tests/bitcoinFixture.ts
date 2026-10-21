import type { Page } from '@playwright/test';

export async function bitcoinFixture(page: Page) {
  const start = Date.parse('2026-10-20T14:00:00Z') / 1000;
  const candles = Array.from({ length: 220 }, (_, index) => {
    const close = 65000 + index * 8 + Math.sin(index / 6) * 180 + Math.cos(index / 15) * 130;
    return [start + index * 300, close - 90, close + 90, index ? close - 10 : 65000, close, 12];
  }).reverse();
  await page.route('https://api.exchange.coinbase.com/**', route => route.fulfill({ json: route.request().url().includes('/stats') ? { last: '67250', high: '68000', low: '64000', volume: '12345' } : candles }));
}
