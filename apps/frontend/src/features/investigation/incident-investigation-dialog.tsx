import { useEffect, useState } from 'react';
import type { EvidenceBundle, EvidenceFact, EvidenceUnknown } from '@homora/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Button } from '@homora/ui/button';
import { Skeleton } from '@homora/ui/skeleton';
import { LoadingRegion } from '@/components/skeletons';
import { formatDateTime, t } from '@/i18n';

type Investigation = {
  incidentId: number;
  monitorId: number;
  from: string | null;
  to: string | null;
  truncated: boolean;
  evidence: EvidenceBundle;
};

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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (incidentId === null) return;
    const controller = new AbortController();
    setValue(null);
    setFailed(false);
    void fetch(`/api/incidents/${incidentId}/investigation`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        return (await response.json()) as Investigation;
      })
      .then((result) => {
        if (!controller.signal.aborted) setValue(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [incidentId, attempt]);
  const facts =
    value?.evidence.items.filter((item): item is EvidenceFact => item.kind === 'fact') ?? [];
  const hypotheses = value?.evidence.items.filter((item) => item.kind === 'hypothesis') ?? [];
  const gaps =
    value?.evidence.items.filter((item): item is EvidenceUnknown => item.kind === 'unknown') ?? [];
  return (
    <Dialog
      open={incidentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('investigation.title')}</DialogTitle>
          <DialogDescription>{t('investigation.description')}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p>{t('investigation.error')}</p>
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t('investigation.retry')}
            </Button>
          </div>
        ) : value ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              {t('investigation.generated', { time: formatDateTime(value.evidence.evaluatedAt) })}
            </p>
            {value.from && value.to && (
              <p className="text-sm text-muted-foreground">
                {t('investigation.range', {
                  from: formatDateTime(value.from),
                  to: formatDateTime(value.to),
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
                      {factText(fact)} · {t('investigation.monitor', { id: fact.subject.id })}
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
                        {t('investigation.openService')}
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
                      {t('investigation.temporalHypothesis')}{' '}
                      <span>
                        {t('investigation.evidence')}{' '}
                        {item.evidenceIds.map((id, index) => (
                          <span key={id}>
                            {index > 0 && ', '}
                            <a className="underline" href={`#evidence-${id}`}>
                              {id}
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
