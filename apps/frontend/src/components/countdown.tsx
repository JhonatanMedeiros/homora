import { useEffect, useState } from 'react';
import { countdownRemaining, type CountdownConfig } from '@homora/widgets/countdown';
import { useI18n } from '@/i18n';

export function Countdown({ config }: { config: CountdownConfig }) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        setNow(new Date());
        timer = window.setTimeout(update, 60_000);
      }
    };
    timer = window.setTimeout(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const result = countdownRemaining(config, now);
  if (result.past && config.pastBehavior === 'hide') return null;
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const sign = result.past ? -1 : 1;
  const amount = result.days >= 1 ? result.days : result.hours >= 1 ? result.hours : result.minutes;
  const unit = result.days >= 1 ? 'day' : result.hours >= 1 ? 'hour' : 'minute';
  const remaining = relative.format(sign * amount, unit);
  const extra =
    result.hours >= 1 && result.days < 1 && result.minutes > 0
      ? ` ${new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(result.minutes)}`
      : '';
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: config.timeZone || undefined,
  }).format(result.target);
  return (
    <div
      className={result.past ? 'flex flex-col gap-1 text-muted-foreground' : 'flex flex-col gap-1'}
    >
      <span className="break-words">{config.eventName}</span>
      <span role="timer" aria-live="off" className="font-mono tabular-nums">
        {remaining}
        {extra}
      </span>
      <time dateTime={result.target.toISOString()} className="text-sm text-muted-foreground">
        {date} ({config.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone})
      </time>
    </div>
  );
}
