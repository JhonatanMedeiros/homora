import { useEffect, useState } from 'react';
import { Button } from '@homora/ui/button';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, t } from '@/i18n';

type Coverage = {
  evaluatedAt: string;
  total: number;
  truncated: boolean;
  items: {
    id: number;
    kind: 'service' | 'probe';
    reason: 'missing-target' | 'stale' | 'unknown' | 'blocked' | 'maintenance';
    observedAt: string | null;
    link: string;
  }[];
};

export function MonitoringCoverage() {
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Coverage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const now = useNow();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setData(null);
    setFailed(false);
    setLoading(true);
    void fetch('/api/monitoring/coverage', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('request failed');
        return (await response.json()) as Coverage;
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
  }, [enabled, attempt]);
  return (
    <section aria-labelledby="monitoring-coverage-title" className="flex flex-col gap-3">
      <h2 id="monitoring-coverage-title" className="text-lg font-semibold">
        {t('coverage.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('coverage.description')}</p>
      {enabled ? (
        <>
          {loading && <p role="status">{t('common.loading')}</p>}
          {failed && <p role="alert">{t('coverage.error')}</p>}
          {data && (
            <>
              <p className="text-sm text-muted-foreground">
                {t('coverage.evaluated', { time: formatDateTime(data.evaluatedAt) })}
              </p>
              {now - Date.parse(data.evaluatedAt) > 120_000 && (
                <p role="status">{t('coverage.outdated')}</p>
              )}
              {data.total === 0 ? (
                <p>{t('coverage.noMonitors')}</p>
              ) : data.items.length === 0 ? (
                <p>{t('coverage.noGaps')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.items.map((item) => (
                    <li key={item.id} className="rounded-md border p-3">
                      <p className="font-medium">
                        {t(item.kind === 'service' ? 'coverage.service' : 'coverage.probe', {
                          id: String(item.id),
                        })}
                      </p>
                      <p>{t(`coverage.reason.${item.reason}`)}</p>
                      {item.observedAt && (
                        <p className="text-sm text-muted-foreground">
                          {t('coverage.observed', { time: formatDateTime(item.observedAt) })}
                        </p>
                      )}
                      <a className="text-sm underline" href={item.link}>
                        {t('coverage.review', { id: String(item.id) })}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {data.truncated && <p>{t('coverage.truncated')}</p>}
              <p className="text-sm text-muted-foreground">{t('coverage.limits')}</p>
            </>
          )}
          {!loading && (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t('coverage.refresh')}
            </Button>
          )}
        </>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setEnabled(true)}>
          {t('coverage.show')}
        </Button>
      )}
    </section>
  );
}
