import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { EvidenceFact, EvidenceUnknown } from '@homora/shared';
import { parseInvestigation, type Investigation } from './incident-investigation-model';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Button } from '@homora/ui/button';
import { Skeleton } from '@homora/ui/skeleton';
import { LoadingRegion } from '@/components/skeletons';
import { formatDateTime, t } from '@/i18n';
import { useMonitorNames } from './use-monitor-names';

function factText(item: EvidenceFact): string {
  if (item.source === 'monitor-check') {
    const status = item.attributes.status;
    return status === 'available'
      ? t('investigation.checkAvailable')
      : status === 'unavailable'
        ? t('investigation.checkUnavailable')
        : t('investigation.checkUnknown');
  }
  return item.attributes.event === 'opened'
    ? t('investigation.opened')
    : item.attributes.event === 'recovered'
      ? t('investigation.recovered')
      : t('investigation.overlap');
}
function gapText(key: string): string {
  switch (key) {
    case 'root-cause':
      return t('investigation.gapCause');
    case 'historical-dependencies':
      return t('investigation.gapDependencies');
    case 'historical-configuration':
      return t('investigation.gapConfiguration');
    case 'history-outside-retention':
      return t('investigation.gapRetention');
    case 'checks-truncated':
      return t('investigation.gapChecksTruncated');
    case 'related-incidents-truncated':
      return t('investigation.gapRelatedTruncated');
    case 'hypotheses-truncated':
      return t('investigation.gapHypothesesTruncated');
    case 'invalid-checks':
    case 'invalid-related-incidents':
      return t('investigation.gapInvalid');
    default:
      return t('investigation.gapCoverage');
  }
}

export function IncidentInvestigationDialog({
  incidentId,
  onClose,
}: {
  incidentId: number | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState<Investigation | null>(null);
  const monitorName = useMonitorNames(incidentId !== null && value?.incidentId === incidentId);
  const [failedId, setFailedId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (incidentId === null) return;
    const controller = new AbortController();
    setValue(null);
    setFailedId(null);
    void fetch(`/api/incidents/${incidentId}/investigation`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const result = parseInvestigation((await response.json()) as unknown, incidentId);
        if (!result) throw new Error('invalid investigation');
        return result;
      })
      .then((result) => {
        if (!controller.signal.aborted) setValue(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedId(incidentId);
      });
    return () => controller.abort();
  }, [incidentId, attempt]);
  const current = value?.incidentId === incidentId ? value : null;
  const facts =
    current?.evidence.items.filter((item): item is EvidenceFact => item.kind === 'fact') ?? [];
  const hypotheses = current?.evidence.items.filter((item) => item.kind === 'hypothesis') ?? [];
  const gaps =
    current?.evidence.items.filter((item): item is EvidenceUnknown => item.kind === 'unknown') ??
    [];
  return (
    <Dialog
      open={incidentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{t('investigation.title')}</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label={t('investigation.close')}>
                <X />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription>{t('investigation.description')}</DialogDescription>
        </DialogHeader>
        {failedId === incidentId && incidentId !== null ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p>{t('investigation.error')}</p>
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t('investigation.retry')}
            </Button>
          </div>
        ) : current ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              {t('investigation.generated', { time: formatDateTime(current.evidence.evaluatedAt) })}
            </p>
            {current.from && current.to && (
              <p className="text-sm text-muted-foreground">
                {t('investigation.range', {
                  from: formatDateTime(current.from),
                  to: formatDateTime(current.to),
                })}
              </p>
            )}
            <section aria-labelledby="investigation-facts">
              <h3 id="investigation-facts" className="font-semibold">
                {t('investigation.facts')}
              </h3>
              <ol className="flex flex-col gap-3 pt-2">
                {facts.map((fact) => (
                  <li
                    key={fact.id}
                    id={`evidence-${fact.id}`}
                    className="flex flex-col gap-1 border-b pb-2 text-sm"
                  >
                    <span>
                      {factText(fact)} · {monitorName(fact.subject.id)}
                    </span>
                    <span className="text-muted-foreground">
                      <time dateTime={fact.observedAt}>{formatDateTime(fact.observedAt)}</time> ·{' '}
                      {fact.source === 'monitor-check'
                        ? t('investigation.sourceCheck')
                        : t('investigation.sourceIncident')}{' '}
                      · {fact.id}
                    </span>
                    {fact.link && /^\/services\/\d+$/.test(fact.link) && (
                      <a className="underline" href={fact.link}>
                        {t('investigation.openServiceNamed', {
                          name: monitorName(fact.subject.id),
                        })}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="investigation-hypotheses">
              <h3 id="investigation-hypotheses" className="font-semibold">
                {t('investigation.hypotheses')}
              </h3>
              {hypotheses.length === 0 ? (
                <p className="text-sm">{t('investigation.noHypothesis')}</p>
              ) : (
                <ul className="flex flex-col gap-2 pt-2">
                  {hypotheses.map((item) => (
                    <li key={item.id} className="text-sm">
                      {t('investigation.temporalHypothesis')} · {monitorName(item.subject.id)}{' '}
                      {typeof item.attributes.overlapCount === 'number' &&
                        item.attributes.overlapCount > 1 && (
                          <span>
                            {t('investigation.overlapCount', {
                              count: item.attributes.overlapCount,
                            })}{' '}
                          </span>
                        )}
                      <span>
                        {t('investigation.evidence')}{' '}
                        {item.evidenceIds.map((id, index) => (
                          <span key={id}>
                            {index > 0 && ', '}
                            <a className="underline" href={`#evidence-${id}`}>
                              {id}
                              {facts.find((fact) => fact.id === id)
                                ? ` · ${monitorName(facts.find((fact) => fact.id === id)!.subject.id)}`
                                : ''}
                            </a>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="investigation-unknown">
              <h3 id="investigation-unknown" className="font-semibold">
                {t('investigation.unknown')}
              </h3>
              <ul className="list-disc pl-5 text-sm">
                {gaps
                  .flatMap((gap) => gap.missing)
                  .map((key) => (
                    <li key={key}>{gapText(key)}</li>
                  ))}
              </ul>
            </section>
            <section aria-labelledby="investigation-next">
              <h3 id="investigation-next" className="font-semibold">
                {t('investigation.next')}
              </h3>
              <p className="text-sm">{t('investigation.nextText')}</p>
            </section>
          </div>
        ) : (
          <LoadingRegion label={t('investigation.loading')}>
            <Skeleton className="h-32 w-full" />
          </LoadingRegion>
        )}
      </DialogContent>
    </Dialog>
  );
}
