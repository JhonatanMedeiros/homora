import { t } from '@/i18n';
import { StatusLight } from '@/components/status-light';

type Props = {
  total: number;
  online: number;
  down: number;
  blocked: number;
  unknown: number;
};
export function HealthSummary({ total, online, down, blocked, unknown }: Props) {
  return (
    <div aria-label={t('health.label')} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {total > 0 && (
        <strong className="text-lg font-semibold tracking-tight tabular-nums">
          {t('health.headline', { online, total })}
        </strong>
      )}
      {down > 0 && (
        <StatusLight state="unavailable" label={t('health.unavailableCount', { count: down })} />
      )}
      {unknown > 0 && (
        <StatusLight state="unknown" label={t('health.unknownCount', { count: unknown })} />
      )}
      {blocked > 0 && (
        <StatusLight state="unknown" blocked label={t('health.blockedCount', { count: blocked })} />
      )}
    </div>
  );
}
