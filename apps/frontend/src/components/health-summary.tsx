import { t } from '@/i18n';
import { StatusTag } from '@/components/status-tag';

type Props = {
  online: number;
  down: number;
  blocked: number;
  unknown: number;
};
export function HealthSummary({ online, down, blocked, unknown }: Props) {
  return (
    <div aria-label={t('health.label')} className="flex flex-wrap items-center gap-2">
      {online > 0 && (
        <StatusTag state="available" label={t('health.availableCount', { count: online })} />
      )}
      {down > 0 && (
        <StatusTag state="unavailable" label={t('health.unavailableCount', { count: down })} />
      )}
      {unknown > 0 && (
        <StatusTag state="unknown" label={t('health.unknownCount', { count: unknown })} />
      )}
      {blocked > 0 && (
        <StatusTag state="unknown" blocked label={t('health.blockedCount', { count: blocked })} />
      )}
    </div>
  );
}
