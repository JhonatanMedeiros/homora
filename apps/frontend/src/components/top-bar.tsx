import { useEffect, useState } from 'react';
import { formatNumber, t, useI18n } from '@/i18n';
import { useSystemStats } from '@/hooks/use-system-stats';

const dateFormat = (locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFormat = (locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    // Atualiza no início de cada minuto, sem reagir a cada segundo.
    const timer = window.setTimeout(
      () => {
        tick();
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => window.clearTimeout(timer);
  }, [now]);
  return now;
}

/** Faixa opcional com data, hora e os recursos do sistema que o Proxmox informa. */
export function TopBar() {
  const { locale } = useI18n();
  const now = useNow();
  const system = useSystemStats(true);
  return (
    <div
      role="region"
      aria-label={t('topBar.label')}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md border bg-card px-4 py-2"
    >
      <div className="flex items-baseline gap-3">
        <time dateTime={now.toISOString()} className="font-mono text-xl font-medium">
          {timeFormat(locale).format(now)}
        </time>
        <span className="text-sm text-muted-foreground">{dateFormat(locale).format(now)}</span>
      </div>
      {system.status === 'ready' && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1">
          {system.stats.map((stat) => (
            <div key={stat.id} className="flex items-baseline gap-1.5">
              <dt className="text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                {stat.label}
              </dt>
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
