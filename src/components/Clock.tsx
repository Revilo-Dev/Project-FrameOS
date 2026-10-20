import { memo, useEffect, useState } from 'react';
import { formatClock } from '../services/clock';
import type { TimeFormat } from '../types/settings';

export const Clock = memo(function Clock({ timeFormat, timeZone }: { timeFormat: TimeFormat; timeZone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      setNow(new Date());
      timer = setTimeout(schedule, 60000 - (Date.now() % 60000));
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) schedule();
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const { time, period, date } = formatClock(now, timeZone, timeFormat);
  return <div className="clock"><time dateTime={now.toISOString()}><span className="clock-digits">{time}</span>{period && <small className="clock-period"> {period}</small>}</time><span>{date}</span></div>;
});
