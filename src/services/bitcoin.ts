import { dayKey, zonedDateTime } from './calendar';
import type { SettingsStorage } from './settings';

export const BITCOIN_ORIGIN = 'https://api.exchange.coinbase.com';
export const BITCOIN_CACHE_KEY = 'frameos.bitcoin.v1';
export const BITCOIN_REFRESH_MS = 5 * 60 * 1000;
export interface BitcoinSnapshot {
  version: 1; timeZone: string; day: string; fetchedAt: number;
  price: number; openToday: number | null; high: number; low: number; volume: number;
  points: { time: number; price: number }[];
}
export interface BitcoinState { status: 'loading' | 'ready' | 'offline' | 'error'; snapshot: BitcoinSnapshot | null }
const number = (value: unknown) => typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
const positive = (value: number) => Number.isFinite(value) && value > 0;

export function mapBitcoin(stats: unknown, candles: unknown, timeZone: string, now: number): BitcoinSnapshot {
  const value = stats as Record<string, unknown> | null;
  const price = number(value?.last), high = number(value?.high), low = number(value?.low), volume = number(value?.volume);
  if (![price, high, low].every(positive) || high < low || !Number.isFinite(volume) || volume < 0) throw new Error('Invalid Bitcoin market data');
  const day = dayKey(new Date(now), timeZone), start = zonedDateTime(day, '00:00', timeZone)?.getTime();
  if (start === undefined) throw new Error('Invalid market timezone');
  if (!Array.isArray(candles) || candles.length > 300) throw new Error('Invalid Bitcoin history');
  const rows = candles.filter((row): row is unknown[] => Array.isArray(row) && row.length >= 6)
    .map(row => ({ time: number(row[0]) * 1000, open: number(row[3]), price: number(row[4]) }))
    .filter(row => Number.isFinite(row.time) && row.time >= start && row.time <= now && positive(row.open) && positive(row.price))
    .sort((a, b) => a.time - b.time).filter((row, index, all) => !index || row.time !== all[index - 1].time);
  const openToday = rows.length && rows[0].time <= start + 300000 ? rows[0].open : null;
  const points = rows.map(row => ({ time: row.time, price: row.price }));
  if (points.length && points[points.length - 1].time < now) points.push({ time: now, price });
  else if (points.length) points[points.length - 1].price = price;
  return { version: 1, timeZone, day, fetchedAt: now, price, openToday, high, low, volume, points: points.slice(-300) };
}
export function readBitcoinCache(storage: SettingsStorage, timeZone: string, now = Date.now()): BitcoinSnapshot | null {
  try {
    const raw = storage.getItem(BITCOIN_CACHE_KEY); if (!raw || raw.length > 50000) return null;
    const value = JSON.parse(raw) as BitcoinSnapshot;
    if (value.version !== 1 || value.timeZone !== timeZone || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !Number.isFinite(value.fetchedAt) || value.fetchedAt > now + 60000 || now - value.fetchedAt > 86400000 * 3
      || ![value.price, value.high, value.low].every(positive) || value.high < value.low || !Number.isFinite(value.volume) || value.volume < 0 || value.openToday !== null && !positive(value.openToday)
      || !Array.isArray(value.points) || value.points.length > 300 || !value.points.every((point, index) => Number.isFinite(point.time) && point.time <= value.fetchedAt && positive(point.price) && (!index || point.time > value.points[index - 1].time))) return null;
    return value;
  } catch { return null; }
}
export async function refreshBitcoin(storage: SettingsStorage, timeZone: string, signal: AbortSignal, fetcher: typeof fetch = fetch, now = Date.now()): Promise<BitcoinState> {
  const cached = readBitcoinCache(storage, timeZone, now);
  if (cached && cached.day === dayKey(new Date(now), timeZone) && now - cached.fetchedAt < BITCOIN_REFRESH_MS) return { status: 'ready', snapshot: cached };
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (signal.aborted) throw new Error('Cancelled');
    const day = dayKey(new Date(now), timeZone), start = zonedDateTime(day, '00:00', timeZone)!;
    const paths = ['stats', `candles?granularity=300&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(new Date(now).toISOString())}`];
    const data = await Promise.race([
      Promise.all(paths.map(async path => { const response = await fetcher(`${BITCOIN_ORIGIN}/products/BTC-USD/${path}`, { signal: controller.signal, cache: 'no-store' }); if (!response.ok) throw new Error('Market data unavailable'); return response.json(); })),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Market data timed out')); }, 8000); }),
    ]);
    if (signal.aborted) throw new Error('Cancelled');
    const snapshot = mapBitcoin(data[0], data[1], timeZone, now);
    try { storage.setItem(BITCOIN_CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Session data remains usable. */ }
    return { status: 'ready', snapshot };
  } catch {
    return { status: cached ? 'offline' : 'error', snapshot: cached };
  } finally { clearTimeout(timer); controller.abort(); signal.removeEventListener('abort', abort); }
}
