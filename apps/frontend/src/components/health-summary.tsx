import { StatusTag } from '@/components/status-tag';
import { t } from '@/i18n';

type Props = { online: number; down: number; blocked: number; monitored: number };

/** Disponibilidade do painel numa linha de etiquetas, com a dica de rede privada uma vez só. */
export function HealthSummary({ online, down, blocked, monitored }: Props) {
  if (!online && !down && !blocked) return null;
  return (
    <div aria-label={t('health.label')} className="flex flex-wrap items-center gap-2">
      {down > 0 && <StatusTag state="unavailable" label={t('health.down', { count: down })} />}
      {online > 0 && (
        <StatusTag
          state="available"
          label={
            down === 0 && online === monitored
              ? t('health.allUp')
              : t('health.up', { count: online })
          }
        />
      )}
      {blocked > 0 && (
        <>
          <StatusTag state="unknown" blocked label={t('health.blocked', { count: blocked })} />
          <small className="text-sm text-muted-foreground">{t('health.hint')}</small>
        </>
      )}
    </div>
  );
}
