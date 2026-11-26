import { useEffect, useState } from 'react';
import type { EvidenceBundle } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Skeleton } from '@homora/ui/skeleton';
import { LoadingRegion } from '@/components/skeletons';
import { useNow } from '@/hooks/use-now';
import { IncidentEvidenceDialog } from './incident-evidence-dialog';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { formatDateTime, t } from '@/i18n';

type Summary = { from: string; to: string; truncated: boolean; evidence: EvidenceBundle };

export function OperationalSummary() {
  const [enabled, setEnabled] = useState(false);
  const now = useNow();
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState<{ monitorId: string; incidentId: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setFailed(false);
    void fetch(`/api/operational-summary?range=${range}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('request failed');
        return (await response.json()) as Summary;
      })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, range, attempt]);
  const events = data?.evidence.items.filter((item) => item.kind === 'fact') ?? [];
  return (
    <section aria-labelledby="operational-summary-title" className="flex flex-col gap-3">
      <h2 id="operational-summary-title" className="text-lg font-semibold">
        {t('operationalSummary.title')}
      </h2>
      {enabled ? (
        <>
          <ToggleGroup
            type="single"
            variant="outline"
            value={range}
            aria-label={t('operationalSummary.range')}
            onValueChange={(value) => {
              if (value === '24h' || value === '7d') setRange(value);
            }}
          >
            <ToggleGroupItem value="24h">{t('operationalSummary.24h')}</ToggleGroupItem>
            <ToggleGroupItem value="7d">{t('operationalSummary.7d')}</ToggleGroupItem>
          </ToggleGroup>
          {loading && (
            <LoadingRegion label={t('operationalSummary.loading')}>
              <Skeleton className="h-16 w-full" />
            </LoadingRegion>
          )}
          {failed && (
            <div role="alert">
              <p>{t('operationalSummary.error')}</p>
              <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                {t('operationalSummary.show')}
              </Button>
            </div>
          )}
          {data && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {t('operationalSummary.updated', { time: formatDateTime(data.to) })}
                </p>
                <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                  {t('operationalSummary.refresh')}
                </Button>
              </div>
              {now - Date.parse(data.to) > 120_000 && (
                <p role="status">{t('operationalSummary.stale')}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {t('operationalSummary.period', {
                  from: formatDateTime(data.from),
                  to: formatDateTime(data.to),
                })}{' '}
                · {t('operationalSummary.source')}
              </p>
              <p className="text-sm text-muted-foreground">{t('operationalSummary.coverage')}</p>
              {data.truncated && <p>{t('operationalSummary.truncated')}</p>}
              {events.length === 0 ? (
                <p>{t('operationalSummary.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {events.map((item) => (
                    <li key={item.id} className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        {item.attributes.event === 'opened'
                          ? t('operationalSummary.opened')
                          : t('operationalSummary.recovered')}
                      </span>
                      <time dateTime={item.observedAt}>{formatDateTime(item.observedAt)}</time>
                      {item.link ? (
                        <a className="underline" href={item.link}>
                          {t('operationalSummary.monitor', { id: item.subject.id })}
                        </a>
                      ) : (
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => {
                            const match = /^incident:(\d+):(opened|recovered)$/.exec(item.id);
                            if (match && /^\d+$/.test(item.subject.id))
                              setTarget({ monitorId: item.subject.id, incidentId: match[1]! });
                          }}
                        >
                          {t('operationalSummary.inspect', { id: item.subject.id })}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setEnabled(true)}>
          {t('operationalSummary.show')}
        </Button>
      )}
      <IncidentEvidenceDialog target={target} close={() => setTarget(null)} />
    </section>
  );
}
