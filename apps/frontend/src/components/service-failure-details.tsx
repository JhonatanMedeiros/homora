import { CHECK_INTERVAL_DEFAULT, type Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { DetailsSkeleton } from '@/components/skeletons';
import { formatAgo, formatTime, t } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ServiceStatus } from '@/lib/services';
import { useServiceFailureDetails, type FailureCheck } from '@/hooks/use-service-failure-details';

const BARS = 24;

function reasonText(status: ServiceStatus) {
  const code = typeof status.httpStatus === 'number' ? status.httpStatus : null;
  if (status.reason === 'unexpected-status' && code !== null && status.expectedStatus)
    return t('card.note.unexpected', { code, expected: status.expectedStatus });
  if (status.reason === 'not-found') return t('details.reasonNotFound');
  if (status.reason === 'error-status' && code !== null) return t('details.reasonError', { code });
  if (
    status.reason === 'content-mismatch' ||
    status.reason === 'cert-expired' ||
    status.reason === 'cert-invalid'
  )
    return t(`uptime.reason.${status.reason}`);
  return t('details.reasonNoResponse');
}

function tipText(status: ServiceStatus) {
  if (status.reason === 'unexpected-status') return t('details.tipError');
  if (status.reason === 'not-found') return t('details.tipNotFound');
  if (status.reason === 'error-status') return t('details.tipError');
  return t('details.tipNoResponse');
}

/** Why a service is offline, from the checks Homora already keeps. No response bodies or headers. */
export function ServiceFailureDetails({
  id,
  service,
  status,
  onEdit,
  className,
}: {
  id: string;
  service: Service;
  status: ServiceStatus;
  onEdit: () => void;
  className?: string;
}) {
  const detail = useServiceFailureDetails(service.id, status.lastAttempt);

  if (detail === 'loading') {
    return (
      <div id={id} className={cn('z-10 border-t border-destructive/35 pt-3', className)}>
        <DetailsSkeleton label={t('details.loading')} />
      </div>
    );
  }
  if (detail === 'error') {
    return (
      <div
        id={id}
        className={cn(
          'z-10 flex items-center gap-2 border-t border-destructive/35 pt-3 text-sm text-muted-foreground',
          className,
        )}
      >
        {t('details.error')}
      </div>
    );
  }

  const seconds = service.checkInterval ?? CHECK_INTERVAL_DEFAULT;
  const since = detail.failingSince ?? (status.lastAttempt ? Date.parse(status.lastAttempt) : null);
  const bars: (FailureCheck | null)[] = [
    ...Array.from<null>({ length: Math.max(0, BARS - detail.recent.length) }).fill(null),
    ...detail.recent.slice(-BARS),
  ];
  const failed = detail.recent.filter((check) => check.status === 'unavailable').length;
  const facts: [string, string][] = [
    [t('details.reason'), reasonText(status)],
    ...(since === null
      ? []
      : [
          [
            t('details.since'),
            [
              detail.failingSinceIsApproximate
                ? t('details.sinceApprox', { time: formatTime(since) })
                : formatTime(since),
              formatAgo(since),
            ].join(' · '),
          ] as [string, string],
        ]),
    [
      t('details.lastSuccess'),
      detail.lastSuccess
        ? [
            formatTime(detail.lastSuccess.observedAt),
            typeof detail.lastSuccess.latencyMs === 'number' &&
              `${Math.round(detail.lastSuccess.latencyMs)} ms`,
          ]
            .filter(Boolean)
            .join(' · ')
        : t('details.noSuccess'),
    ],
    [
      t('details.check'),
      t(service.checkType === 'ping' ? 'details.checkPing' : 'details.checkHttp', { seconds }),
    ],
  ];
  return (
    <div
      id={id}
      className={cn(
        'z-10 flex flex-col gap-3.5 border-t border-destructive/35 pt-3 text-sm',
        className,
      )}
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 text-[0.8125rem]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {detail.recent.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div
            role="img"
            aria-label={t('details.historyLabel', { failed, total: detail.recent.length })}
            className="grid h-5 grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-0.5"
          >
            {bars.map((check, index) => (
              <span
                key={index}
                title={check ? formatTime(check.observedAt) : undefined}
                className={cn(
                  'h-full rounded-[2px]',
                  check === null
                    ? 'bg-border'
                    : check.status === 'unavailable'
                      ? 'bg-destructive'
                      : 'bg-success/85',
                )}
              />
            ))}
          </div>
          <div className="flex justify-between font-mono text-[0.6875rem] text-muted-foreground">
            <span>{t('details.historyOldest')}</span>
            <span>{t('details.historyNow')}</span>
          </div>
        </div>
      )}
      <p className="rounded-md border bg-card px-3 py-2 text-[0.8125rem]">
        <b className="font-semibold">{t('details.tryTitle')}:</b> {tipText(status)}
      </p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t('card.edit', { name: service.name })}
          onClick={onEdit}
        >
          {t('common.edit')}
        </Button>
      </div>
    </div>
  );
}
