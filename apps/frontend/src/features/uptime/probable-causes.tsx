import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Incident, Service } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { groupCauses, type Cause } from '@/features/uptime/causes';
import { reasonText } from '@/features/uptime/uptime-view';
import type { Impact } from '@/features/hosts/hosts';
import { formatTime, t } from '@/i18n';
import { cn } from '@homora/ui/lib/utils';

const OPEN_KEY = 'homora-causes-open';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

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
  /** Inside the status popover the causes are the point, so they stay open and cannot be hidden. */
  alwaysOpen?: boolean;
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
  alwaysOpen = false,
}: Props) {
  const [remembered, setOpen] = useState(readOpen);
  const open = alwaysOpen || remembered;
  const toggle = () => {
    const next = !remembered;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // The choice just is not remembered.
    }
  };
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
  if (causes.length === 0 && quiet.length === 0) return null;
  const byId = new Map(down.map((service) => [service.id, service]));
  return (
    <section
      aria-label={t('causes.title')}
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-semibold">
          {t('causes.title')}
          <span className="text-xs font-normal text-muted-foreground">
            {causes.length > 0 &&
              t('causes.summary', { services: down.length, causes: causes.length })}
          </span>
        </h2>
        {causes.length > 0 && !alwaysOpen && (
          <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={toggle}>
            {open ? t('causes.hide') : t('causes.show')}
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        )}
      </div>
      {open && causes.length > 0 && (
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
                      className="max-w-full"
                    >
                      <span className="truncate">{service.name}</span>
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
      {open && onAcknowledge && causes.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('attention.note')}</p>
      )}
    </section>
  );
}
