import { useMemo } from 'react';
import type { Incident, Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { groupCauses, type Cause } from '@/lib/causes';
import { reasonText } from '@/lib/uptime-view';
import type { Impact } from '@/lib/hosts';
import { formatTime, t } from '@/i18n';

type Props = {
  /** Services that are down right now (not blocked, not in maintenance). */
  down: Service[];
  incidents?: Record<number, Incident>;
  impacts: Map<number, Impact>;
  onOpen: (service: Service) => void;
  /** Services already acknowledged or muted: they leave the causes and wait behind one line. */
  quiet?: Service[];
  onAcknowledge?: (services: Service[], muteMinutes?: number) => void;
  onShowAgain?: (services: Service[]) => void;
};

function detail(cause: Cause): string {
  switch (cause.kind) {
    case 'guest-stopped':
      return t('causes.guest-stopped');
    case 'host-offline':
      return t('causes.host-offline');
    case 'no-response':
      return t('causes.no-response');
    case 'same-error':
      return t('causes.same-error', { reason: reasonText(cause.reason, cause.httpStatus) });
    default:
      return t('causes.other', { reason: reasonText(cause.reason, cause.httpStatus) });
  }
}

/**
 * "Needs attention": the offline services grouped by what they probably share. Computed in the
 * browser from facts Homora already holds, so every line says "likely" and never names a fix.
 */
export function ProbableCauses({
  down,
  incidents,
  impacts,
  onOpen,
  quiet = [],
  onAcknowledge,
  onShowAgain,
}: Props) {
  const causes = useMemo(
    () =>
      groupCauses(
        down.map((service) => ({
          id: service.id,
          down: true,
          reason: incidents?.[service.id]?.reason,
          httpStatus: incidents?.[service.id]?.httpStatus,
          since: incidents?.[service.id]?.startedAt ?? null,
          impact: impacts.get(service.id),
        })),
      ),
    [down, incidents, impacts],
  );
  if (!causes.length && !quiet.length) return null;
  const byId = new Map(down.map((service) => [service.id, service]));
  return (
    <section
      aria-label={t('causes.title')}
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('causes.title')}</h2>
        <p className="text-xs text-muted-foreground">
          {causes.length > 0 &&
            t('causes.summary', { services: down.length, causes: causes.length })}
        </p>
      </div>
      {causes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {causes.map((cause) => {
            const members = cause.ids.flatMap((id) => byId.get(id) ?? []);
            return (
              <li key={cause.key} className="flex flex-col gap-1.5">
                <p className="text-sm">
                  {detail(cause)}
                  {cause.since !== null && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {t('causes.since', { time: formatTime(cause.since) })}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((service) => (
                    <Button
                      key={service.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={t('causes.open', { name: service.name })}
                      onClick={() => onOpen(service)}
                    >
                      {service.name}
                    </Button>
                  ))}
                  {onAcknowledge && (
                    <span className="ml-auto flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onAcknowledge(members)}
                      >
                        {t('attention.acknowledge')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onAcknowledge(members, 60)}
                      >
                        {t('attention.mute')}
                      </Button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {quiet.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span>{t('attention.acknowledged', { count: quiet.length })}</span>
          <span>{quiet.map((service) => service.name).join(', ')}</span>
          {onShowAgain && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onShowAgain(quiet)}>
              {t('attention.showAgain')}
            </Button>
          )}
        </div>
      )}
      {onAcknowledge && causes.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('attention.note')}</p>
      )}
    </section>
  );
}
