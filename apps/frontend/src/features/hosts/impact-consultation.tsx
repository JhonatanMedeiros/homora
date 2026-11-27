import { useEffect, useState } from 'react';
import { potentialDependents, type Dependency } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, t } from '@/i18n';

type Named = { id: number; name: string };

/** Read the saved graph on demand, independently of the map's cached data. */
export function ImpactConsultation({
  roots,
  services,
  onSelect,
}: {
  roots: Named[];
  services: Named[];
  onSelect: (id: number) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [value, setValue] = useState<{ edges: Dependency[]; at: number } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const now = useNow();
  const key = roots
    .map((root) => root.id)
    .sort((a, b) => a - b)
    .join(',');
  useEffect(() => {
    if (!attempt) return;
    const controller = new AbortController();
    setState('loading');
    setValue(null);
    void fetch('/api/service-dependencies', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const data: unknown = await response.json();
        if (
          !Array.isArray(data) ||
          !data.every((row: unknown) => {
            if (!row || typeof row !== 'object') return false;
            const item = row as Record<string, unknown>;
            return (
              Number.isSafeInteger(item.serviceId) &&
              Number(item.serviceId) > 0 &&
              Number.isSafeInteger(item.dependsOnId) &&
              Number(item.dependsOnId) > 0
            );
          })
        )
          throw new Error('invalid');
        return data as Dependency[];
      })
      .then((edges) => {
        if (!controller.signal.aborted) {
          setValue({ edges, at: Date.now() });
          setState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [attempt, key]);
  const result = value
    ? potentialDependents(
        roots.map((root) => root.id),
        value.edges,
        new Date(value.at).toISOString(),
      )
    : null;
  const names = new Map(services.map((service) => [service.id, service.name]));
  return (
    <section className="flex flex-col gap-2" aria-label={t('impactQuery.title')}>
      <h4 className="text-sm font-semibold">{t('impactQuery.title')}</h4>
      <p className="text-xs text-muted-foreground">{t('impactQuery.description')}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={state === 'loading'}
        onClick={() => setAttempt((n) => n + 1)}
      >
        {t(state === 'idle' ? 'impactQuery.show' : 'impactQuery.refresh')}
      </Button>
      {state === 'loading' && <p role="status">{t('common.loading')}</p>}
      {state === 'error' && <p role="alert">{t('impactQuery.error')}</p>}
      {value && result && (
        <>
          <p className="text-xs text-muted-foreground">
            {t('impactQuery.evaluated', { time: formatDateTime(value.at) })}
          </p>
          {now - value.at > 120_000 && <p role="status">{t('impactQuery.stale')}</p>}
          {result.paths.length === 0 ? (
            <p className="text-sm">{t('impactQuery.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.paths.map((path) => (
                <li key={path.join(':')} className="text-sm">
                  <span className="font-medium">
                    {t(path.length === 2 ? 'impactQuery.direct' : 'impactQuery.transitive')}
                  </span>
                  {' · '}
                  {path.map((id, index) => (
                    <span key={id}>
                      {index > 0 && ' → '}
                      {names.has(id) ? (
                        <Button variant="link" className="h-auto p-0" onClick={() => onSelect(id)}>
                          {names.get(id)}
                        </Button>
                      ) : (
                        t('impactQuery.unknownMonitor', { id })
                      )}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {result.truncated && <p>{t('impactQuery.truncated')}</p>}
          <p className="text-xs text-muted-foreground">{t('impactQuery.limits')}</p>
        </>
      )}
    </section>
  );
}
