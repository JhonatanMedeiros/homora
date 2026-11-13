import { useEffect, useState } from 'react';
import { formatNumber, t, useI18n } from '@/i18n';
import { useClockPreferences } from '@/hooks/use-clock-preferences';
import { useSystemStats } from '@/hooks/use-system-stats';
import { browserTimeZone, type ClockPreferences } from '@/lib/clock';
import { clockPresentation } from '@homora/widgets/clock';

function useNow(seconds: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Ticks on the next boundary (second or minute), not on a drifting interval.
    const step = seconds ? 1_000 : 60_000;
    const timer = window.setTimeout(() => setNow(new Date()), step - (Date.now() % step));
    return () => window.clearTimeout(timer);
  }, [now, seconds]);
  return now;
}

/** Time and date in the chosen format and time zone. */
export function Clock({ preferences }: { preferences: ClockPreferences }) {
  const { locale } = useI18n();
  const now = useNow(preferences.seconds);
  const { time, date, zone } = clockPresentation.present({ locale, config: preferences, now });
  const custom = preferences.timeZone && preferences.timeZone !== browserTimeZone();
  return (
    <div className="flex items-baseline gap-2 sm:gap-3">
      <time
        dateTime={now.toISOString()}
        className="font-mono text-base font-medium tabular-nums sm:text-xl"
      >
        {time}
      </time>
      {(preferences.date || custom) && (
        <span className="text-xs text-muted-foreground sm:text-sm">
          {[preferences.date && date, custom && zone].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  );
}

/** Optional top bar showing date, time, and system resources from the selected connection. */
export function TopBar() {
  const preferences = useClockPreferences();
  const system = useSystemStats(true);
  return (
    <div
      role="region"
      data-homora="top-bar"
      aria-label={t('topBar.label')}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border bg-card px-3 py-1.5 sm:gap-x-6 sm:gap-y-2 sm:px-4 sm:py-2"
    >
      <Clock preferences={preferences} />
      {system.status === 'ready' && (
        <dl className="flex flex-wrap gap-x-3 gap-y-1 sm:gap-x-5">
          {system.stats.map((stat) => (
            <div key={stat.id} className="flex items-baseline gap-1.5">
              <dt className="font-mono text-[0.6875rem] text-muted-foreground">{stat.label}</dt>
              <dd className="font-mono text-xs font-medium sm:text-sm">
                {formatNumber(Number.parseInt(stat.value, 10))}%
              </dd>
            </div>
          ))}
        </dl>
      )}
      {system.status === 'node-unavailable' && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('topBar.nodeUnavailable')}
        </p>
      )}
      {system.status === 'error' && (
        <p className="text-xs text-muted-foreground">{t('topBar.unavailable')}</p>
      )}
    </div>
  );
}
