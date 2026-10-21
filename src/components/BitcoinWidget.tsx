import { BITCOIN_REFRESH_MS, type BitcoinState } from '../services/bitcoin';
import { dayKey, resolvedZone } from '../services/calendar';
import { useMinute } from './useMinute';

const usd = (price: number) => price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function BitcoinWidget({ state, timeZone, detailed = false }: { state: BitcoinState; timeZone: string; detailed?: boolean }) {
  const now = useMinute(), value = state.snapshot;
  if (!value) return <div className="bitcoin-empty"><strong>{state.status === 'loading' ? 'Loading Bitcoin…' : 'Bitcoin price unavailable'}</strong><span>{state.status === 'loading' ? 'BTC / USD' : 'Check your internet connection. Data refreshes automatically.'}</span></div>;
  const today = value.timeZone === timeZone && value.day === dayKey(now, timeZone), change = today && value.openToday ? (value.price / value.openToday - 1) * 100 : null;
  const points = today ? value.points : [];
  const min = Math.min(...points.map(point => point.price)), max = Math.max(...points.map(point => point.price));
  const start = points[0]?.time || 0, span = Math.max(1, (points[points.length - 1]?.time || 0) - start), range = Math.max(max - min, max * .001);
  const coordinates = points.map(point => `${(4 + (point.time - start) / span * 472).toFixed(1)},${(12 + (max - point.price) / range * 76).toFixed(1)}`);
  const trend = change === null ? '' : change >= 0 ? ' market-up' : ' market-down';
  return <div className={`bitcoin-widget${detailed ? ' bitcoin-detail' : ''}${trend}`}>
    <div className="bitcoin-quote"><strong>{usd(value.price)}<small>USD</small></strong><span className="bitcoin-change">{change === null ? '—' : `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}%`}<small>today</small></span></div>
    <div className="bitcoin-chart">
      {coordinates.length > 1 ? <svg viewBox="0 0 480 100" role="img" aria-label={`Bitcoin USD price today in ${resolvedZone(timeZone)} time`} preserveAspectRatio="none">
        <defs><linearGradient id={detailed ? 'bitcoin-fill-detail' : 'bitcoin-fill-card'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".26" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
        <path className="bitcoin-grid" d="M4 24H476M4 56H476M4 88H476" />
        <path d={`M${coordinates.join(' L')} L476 100 L4 100 Z`} fill={`url(#${detailed ? 'bitcoin-fill-detail' : 'bitcoin-fill-card'})`} />
        <path d={`M${coordinates.join(' L')}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg> : <span className="bitcoin-chart-empty">{today ? 'Today’s chart is not available yet' : 'Saved chart is from an earlier day'}</span>}
    </div>
    <div className="bitcoin-stats"><span><small>24h high</small><strong>{usd(value.high)}</strong></span><span><small>24h low</small><strong>{usd(value.low)}</strong></span><span><small>24h volume · BTC</small><strong>{value.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span></div>
    <div className="bitcoin-source">{state.status !== 'ready' || now.getTime() - value.fetchedAt >= BITCOIN_REFRESH_MS ? 'Saved · ' : ''}Coinbase · {new Date(value.fetchedAt).toLocaleString('en-AU', { timeZone: resolvedZone(timeZone), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{detailed && <span>Today is measured from midnight in {resolvedZone(timeZone)}. High, low and volume cover the last 24 hours on Coinbase.</span>}</div>
  </div>;
}
