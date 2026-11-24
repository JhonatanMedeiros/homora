import { useEffect, useState } from 'react';
import type { MonitoringSummary } from '../../../monitoring.js';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import { Skeleton } from '@homora/ui/skeleton';
import { LayoutDashboard } from 'lucide-react';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultHomelabSummaryConfig,
  resolveSelection,
  summarizeCounts,
  widgetHomelabSummaryWidget,
  type HomelabSummaryConfig,
} from '../definition.js';

type Monitoring = NonNullable<ReturnType<typeof useWidgetHost>['monitoring']>;
function useScopes(readScopes: Monitoring['readScopes']) {
  const [scopes, setScopes] = useState<{
    groups: { id: number; name: string }[];
    pages: { id: number; name: string }[];
    loading: boolean;
    error: boolean;
  }>({ groups: [], pages: [], loading: true, error: false });
  useEffect(() => {
    const controller = new AbortController();
    void readScopes(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setScopes({ ...data, loading: false, error: false });
      },
      () => {
        if (!controller.signal.aborted)
          setScopes({ groups: [], pages: [], loading: false, error: true });
      },
    );
    return () => controller.abort();
  }, [readScopes]);
  return scopes;
}
function useSummary(
  readSummary: Monitoring['readSummary'],
  groups: number[],
  pages: number[],
  enabled: boolean,
) {
  const groupKey = groups.join(',');
  const pageKey = pages.join(',');
  const [result, setResult] = useState<{
    data: MonitoringSummary | null;
    loading: boolean;
    error: boolean;
    stale: boolean;
  }>({ data: null, loading: true, error: false, stale: false });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let sequence = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult({ data: null, loading: true, error: false, stale: false });
    const load = async () => {
      const current = ++sequence;
      try {
        const data = await readSummary(
          groupKey ? groupKey.split(',').map(Number) : [],
          pageKey ? pageKey.split(',').map(Number) : [],
          controller.signal,
        );
        if (!controller.signal.aborted && current === sequence)
          setResult({
            data,
            loading: false,
            error: false,
            stale: data.stale > 0 || Date.now() - data.generatedAt > 120_000,
          });
      } catch {
        if (!controller.signal.aborted && current === sequence)
          setResult((old) => ({ ...old, loading: false, error: true, stale: old.data !== null }));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [readSummary, groupKey, pageKey, enabled]);
  return result;
}

function View({ config }: { config: HomelabSummaryConfig }) {
  const { t, monitoring } = useWidgetHost();
  if (!monitoring) return <p role="alert">{t('summary.error')}</p>;
  return <Reading config={config} monitoring={monitoring} />;
}
function Reading({
  config,
  monitoring,
}: {
  config: HomelabSummaryConfig;
  monitoring: NonNullable<ReturnType<typeof useWidgetHost>['monitoring']>;
}) {
  const { t } = useWidgetHost();
  const scopes = useScopes(monitoring.readScopes);
  const result = useSummary(
    monitoring.readSummary,
    resolveSelection(config.groups, scopes.groups),
    resolveSelection(config.pages, scopes.pages),
    !scopes.loading && !scopes.error,
  );
  if (scopes.error || (!result.data && result.error))
    return (
      <p role="alert" className="text-sm">
        {t('summary.error')}
      </p>
    );
  if (scopes.loading || result.loading || !result.data)
    return (
      <div role="status" aria-label={t('common.loading')} className="space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  const data = summarizeCounts(result.data.counts);
  const items = [
    { key: 'ok' as const, label: t('summary.online'), count: data.ok, color: 'bg-success' },
    {
      key: 'degraded' as const,
      label: t('summary.degraded'),
      count: data.degraded,
      color: 'bg-warning',
    },
    { key: 'down' as const, label: t('summary.down'), count: data.down, color: 'bg-destructive' },
    {
      key: 'maintenance' as const,
      label: t('summary.maintenance'),
      count: data.maintenance,
      color: 'bg-info',
    },
    {
      key: 'unmeasured' as const,
      label: t('summary.unmeasured'),
      count: data.unmeasured,
      color: 'bg-muted-foreground',
    },
  ];
  const visible = items
    .filter((item) => item.key !== 'maintenance' || item.count > 0)
    .filter((item) => item.key !== 'unmeasured' || config.showUnmeasured);
  return (
    <div className="space-y-3 text-sm">
      {result.error && <p role="alert">{t('summary.error')}</p>}
      {result.stale && <p className="text-muted-foreground">{t('summary.stale')}</p>}
      {data.total === 0 ? (
        <p>
          {t(
            config.groups.length > 0 || config.pages.length > 0
              ? 'summary.emptyScope'
              : 'summary.empty',
          )}
        </p>
      ) : (
        <>
          <p className="font-medium tabular-nums">
            {t('summary.total', { online: data.ok, total: data.total })}
          </p>
          {data.ok === data.total && (
            <p className="text-muted-foreground">{t('summary.allOnline')}</p>
          )}
          {data.unmeasured === data.total && (
            <p className="text-muted-foreground">{t('summary.noneMeasured')}</p>
          )}
          <div
            role="img"
            aria-label={items.map((item) => `${item.count} ${item.label}`).join(', ')}
            className="flex h-2 overflow-hidden rounded-full bg-muted"
          >
            {items.map((item) => (
              <span
                key={item.key}
                className={item.color}
                style={{ width: `${(item.count / data.total) * 100}%` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {visible.map((item) =>
              monitoring.filterStatus ? (
                <Button
                  key={item.key}
                  variant="ghost"
                  className="h-auto min-h-11 justify-between gap-2 px-2 text-left"
                  onClick={() => monitoring.filterStatus?.(item.key)}
                >
                  <span>{item.label}</span>
                  <span className="font-mono tabular-nums">{item.count}</span>
                </Button>
              ) : (
                <span
                  key={item.key}
                  className="flex min-h-11 items-center justify-between gap-2 px-2"
                >
                  {item.label}
                  <span className="font-mono tabular-nums">{item.count}</span>
                </span>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
function Editor({
  config,
  onChange,
}: {
  config: HomelabSummaryConfig;
  onChange: (value: HomelabSummaryConfig) => void;
}) {
  const { t, monitoring } = useWidgetHost();
  if (!monitoring) return null;
  return <ScopeEditor config={config} onChange={onChange} monitoring={monitoring} t={t} />;
}
function ScopeEditor({
  config,
  onChange,
  monitoring,
  t,
}: {
  config: HomelabSummaryConfig;
  onChange: (value: HomelabSummaryConfig) => void;
  monitoring: NonNullable<ReturnType<typeof useWidgetHost>['monitoring']>;
  t: ReturnType<typeof useWidgetHost>['t'];
}) {
  const scopes = useScopes(monitoring.readScopes);
  return (
    <div className="space-y-4">
      <label className="flex min-h-11 items-center gap-2">
        <Checkbox
          checked={config.showUnmeasured}
          onCheckedChange={(checked) => onChange({ ...config, showUnmeasured: checked === true })}
        />
        {t('summary.showUnmeasured')}
      </label>
      {scopes.error && <p role="alert">{t('summary.error')}</p>}
      {(['groups', 'pages'] as const).map((kind) => (
        <fieldset key={kind} className="space-y-1">
          <legend className="font-medium">{t(`summary.${kind}`)}</legend>
          <p className="text-xs text-muted-foreground">{t('summary.all')}</p>
          {[
            ...scopes[kind],
            ...config[kind]
              .filter((name) => !scopes[kind].some((option) => option.name === name))
              .map((name) => ({ id: `missing:${name}`, name })),
          ].map((option) => (
            <label key={option.id} className="flex min-h-11 items-center gap-2">
              <Checkbox
                checked={config[kind].includes(option.name)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...config,
                    [kind]:
                      checked === true
                        ? [...config[kind], option.name]
                        : config[kind].filter((name) => name !== option.name),
                  })
                }
              />
              {option.name}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
export const widgetUI: WidgetUI = {
  name: 'summary.name',
  description: 'summary.desc',
  category: 'monitoring',
  keywords: ['status', 'services', 'health', 'resumo', 'serviços', 'saúde'],
  defaultConfig: defaultHomelabSummaryConfig,
  parse: widgetHomelabSummaryWidget.parseConfig,
  View: ({ config }) => <View config={config as HomelabSummaryConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as HomelabSummaryConfig} onChange={onChange} />
  ),
  Gallery: () => <LayoutDashboard aria-hidden="true" />,
};
