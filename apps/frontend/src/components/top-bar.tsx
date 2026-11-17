import { formatNumber, t } from '@/i18n';
import { TopBarWidget } from '@/components/widget-ui-registry';
import { useSystemStats } from '@/hooks/use-system-stats';

/** Optional top bar showing date, time, and system resources from the selected connection. */
export function TopBar() {
  const system = useSystemStats(true);
  return (
    <div
      role="region"
      data-homora="top-bar"
      aria-label={t('topBar.label')}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border bg-card px-3 py-1.5 sm:gap-x-6 sm:gap-y-2 sm:px-4 sm:py-2"
    >
      <TopBarWidget />
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
