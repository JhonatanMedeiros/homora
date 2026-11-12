import { useEffect, useState } from 'react';
import { formatNumber, t, useI18n } from '@/i18n';
import { useClockPreferences } from '@/hooks/use-clock-preferences';
import { useSystemStats } from '@/hooks/use-system-stats';
import { browserTimeZone, formatClock, type ClockPreferences } from '@/lib/clock';

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
  const { time, date, zone } = formatClock(locale, preferences, now);
  const custom = preferences.timeZone && preferences.timeZone !== browserTimeZone();
  return (
    <div className="flex items-baseline gap-3">
      <time dateTime={now.toISOString()} className="font-mono text-xl font-medium tabular-nums">
        {time}
      </time>
      {(preferences.date || custom) && (
        <span className="text-sm text-muted-foreground">
          {[preferences.date && date, custom && zone].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  );
}

/** Optional top bar showing date, time, and system resources from Proxmox. */
export function TopBar() {
  const preferences = useClockPreferences();
  const system = useSystemStats(true);
  return (
    <div
      role="region"
      data-homora="top-bar"
      aria-label={t('topBar.label')}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md border bg-card px-4 py-2"
    >
      <Clock preferences={preferences} />
      {system.status === 'ready' && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1">
          {system.stats.map((stat) => (
            <div key={stat.id} className="flex items-baseline gap-1.5">
              <dt className="font-mono text-[0.6875rem] text-muted-foreground">{stat.label}</dt>
              <dd className="font-mono text-sm font-medium">
                {formatNumber(Number.parseInt(stat.value, 10))}%
              </dd>
            </div>
          ))}
        </dl>
      )}
      {system.status === 'error' && (
        <p className="text-xs text-muted-foreground">{t('topBar.unavailable')}</p>
      )}
    </div>
  );
}
