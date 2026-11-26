import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Skeleton } from '@homora/ui/skeleton';
import { LoadingRegion } from '@/components/skeletons';
import { formatDateTime, t } from '@/i18n';

type Target = { monitorId: string; incidentId: string };
type Detail = { startedAt: number; endedAt: number | null };

export function IncidentEvidenceDialog({
  target,
  close,
}: {
  target: Target | null;
  close: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    setDetail(null);
    setFailed(false);
    void fetch(`/api/services/${target.monitorId}/incidents/${target.incidentId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('incident unavailable');
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== 'object' ||
          !('id' in value) ||
          !('serviceId' in value) ||
          !('startedAt' in value) ||
          !('endedAt' in value) ||
          String(value.id) !== target.incidentId ||
          String(value.serviceId) !== target.monitorId ||
          typeof value.startedAt !== 'number' ||
          !Number.isFinite(value.startedAt) ||
          !(
            value.endedAt === null ||
            (typeof value.endedAt === 'number' && Number.isFinite(value.endedAt))
          )
        )
          throw new Error('invalid incident');
        return { startedAt: value.startedAt, endedAt: value.endedAt };
      })
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [target]);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('operationalSummary.evidenceTitle')}</DialogTitle>
          <DialogDescription>
            {target && t('operationalSummary.monitor', { id: target.monitorId })}
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert">{t('operationalSummary.evidenceUnavailable')}</p>
        ) : detail ? (
          <dl className="flex flex-col gap-2">
            <div>
              <dt className="font-medium">{t('operationalSummary.started')}</dt>
              <dd>{formatDateTime(detail.startedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium">{t('operationalSummary.ended')}</dt>
              <dd>
                {detail.endedAt === null
                  ? t('operationalSummary.ongoing')
                  : formatDateTime(detail.endedAt)}
              </dd>
            </div>
          </dl>
        ) : (
          <LoadingRegion label={t('operationalSummary.loading')}>
            <Skeleton className="h-16 w-full" />
          </LoadingRegion>
        )}
      </DialogContent>
    </Dialog>
  );
}
