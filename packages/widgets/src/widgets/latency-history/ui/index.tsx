import { useEffect, useState } from 'react';
import { ChartLine } from 'lucide-react';
import { Field, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import {
  availabilityRanges,
  type AvailabilityRange,
  type MonitoringLatency,
} from '../../../monitoring.js';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultLatencyHistoryConfig,
  widgetLatencyHistoryWidget,
  type LatencyHistoryConfig,
} from '../definition.js';

function View({ config }: { config: LatencyHistoryConfig }) {
  const { monitoring, t, locale } = useWidgetHost();
  const readLatency = monitoring?.readLatency;
  const [result, setResult] = useState<{
    key: string;
    data: MonitoringLatency | null;
    error: boolean;
  }>({ key: '', data: null, error: false });
  const key = JSON.stringify(config);
  useEffect(() => {
    if (!config.target) return;
    let active = true;
    let controller: AbortController;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        if (!readLatency) throw new Error('unavailable');
        const data = await readLatency(
          { target: config.target!, range: config.range },
          controller.signal,
        );
        if (active && !controller.signal.aborted) setResult({ key, data, error: false });
      } catch {
        if (active && !controller.signal.aborted) setResult({ key, data: null, error: true });
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, config.target, config.range, readLatency]);
  if (!config.target)
    return <p className="text-sm text-muted-foreground">{t('latencyWidget.unconfigured')}</p>;
  if (result.key !== key || (!result.data && !result.error))
    return <p role="status">{t('latencyWidget.loading')}</p>;
  if (result.error || !result.data) return <p role="alert">{t('latencyWidget.error')}</p>;
  const target = result.data.target;
  if (!target) return <p role="status">{t('latencyWidget.missing')}</p>;
  const valid = target.lastValid;
  const current = target.state === 'ok' || target.state === 'degraded';
  const max = Math.max(0, ...target.points.map((p) => p.p50 ?? 0));
  const hasPoints = target.points.some((point) => point.p50 !== null);
  const coords = target.points.map((p, i) =>
    p.p50 === null
      ? null
      : `${(i / Math.max(1, target.points.length - 1)) * 100},${100 - (p.p50 / Math.max(1, max)) * 90}`,
  );
  const runs: string[][] = [];
  for (const coord of coords) {
    if (coord === null) {
      if (runs.at(-1)?.length) runs.push([]);
    } else {
      if (runs.length === 0) runs.push([]);
      runs.at(-1)!.push(coord);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="break-words">{target.name}</strong>
        <span>{t(`latencyWidget.state.${target.state}`)}</span>
      </div>
      {valid ? (
        <p>
          <span className="text-2xl font-semibold tabular-nums">
            {new Intl.NumberFormat(locale).format(valid.latencyMs)} ms
          </span>{' '}
          <span className="text-xs text-muted-foreground">
            {t(
              current && !target.stale && valid.observedAt === target.lastAttempt
                ? 'latencyWidget.current'
                : 'latencyWidget.lastValid',
            )}{' '}
            ·{' '}
            {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
              valid.observedAt,
            )}
          </span>
        </p>
      ) : (
        <p>{t('latencyWidget.noData')}</p>
      )}
      {target.stale && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('latencyWidget.stale')}
        </p>
      )}
      {hasPoints ? (
        <svg
          role="img"
          aria-label={t('latencyWidget.chartLabel')}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-20 w-full overflow-visible text-primary"
        >
          {runs.map((run, i) =>
            run.length === 1 ? (
              <circle
                key={i}
                cx={run[0]!.split(',')[0]}
                cy={run[0]!.split(',')[1]}
                r="1"
                fill="currentColor"
              />
            ) : (
              <polyline
                key={i}
                points={run.join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>
      ) : (
        <p className="text-xs text-muted-foreground">{t('latencyWidget.noPeriodData')}</p>
      )}
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{t(`availabilityWidget.range.${config.range}`)}</span>
        {hasPoints && (
          <span>
            {t('latencyWidget.scale')} {new Intl.NumberFormat(locale).format(max)} ms
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('latencyWidget.chartHelp')}</p>
      {hasPoints && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t('latencyWidget.values')}</summary>
          <ul className="mt-2 max-h-40 overflow-auto">
            {target.points.map((point) => (
              <li key={point.start}>
                {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
                  point.start,
                )}
                :{' '}
                {point.p50 === null
                  ? t('latencyWidget.gap')
                  : `${new Intl.NumberFormat(locale).format(point.p50)} ms`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Editor({
  config,
  onChange,
}: {
  config: LatencyHistoryConfig;
  onChange: (value: LatencyHistoryConfig) => void;
}) {
  const { monitoring, t } = useWidgetHost();
  const readServiceTargets = monitoring?.readServiceTargets;
  const [targets, setTargets] = useState<{ target: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (readServiceTargets)
      readServiceTargets(controller.signal)
        .then(setTargets)
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    else setFailed(true);
    return () => controller.abort();
  }, [readServiceTargets]);
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="latency-target">{t('latencyWidget.target')}</FieldLabel>
        <FormSelect
          id="latency-target"
          value={config.target ?? ''}
          onChange={(event) => onChange({ ...config, target: event.target.value || null })}
        >
          <FormSelectOption value="">{t('latencyWidget.select')}</FormSelectOption>
          {config.target && !targets.some((item) => item.target === config.target) && (
            <FormSelectOption value={config.target}>{t('latencyWidget.missing')}</FormSelectOption>
          )}
          {targets.map((item) => (
            <FormSelectOption key={item.target} value={item.target}>
              {item.name}
            </FormSelectOption>
          ))}
        </FormSelect>
        {failed && <p role="alert">{t('latencyWidget.error')}</p>}
      </Field>
      <Field>
        <FieldLabel htmlFor="latency-range">{t('latencyWidget.range')}</FieldLabel>
        <FormSelect
          id="latency-range"
          value={config.range}
          onChange={(event) =>
            onChange({ ...config, range: event.target.value as AvailabilityRange })
          }
        >
          {availabilityRanges.map((range) => (
            <FormSelectOption key={range} value={range}>
              {t(`availabilityWidget.range.${range}`)}
            </FormSelectOption>
          ))}
        </FormSelect>
      </Field>
    </div>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetLatencyHistory',
  description: 'pageWidgets.widgetLatencyHistoryDesc',
  category: 'monitoring',
  defaultConfig: defaultLatencyHistoryConfig,
  parse: widgetLatencyHistoryWidget.parseConfig,
  View: ({ config }) => <View config={config as LatencyHistoryConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as LatencyHistoryConfig} onChange={onChange} />
  ),
  Gallery: () => <ChartLine aria-hidden="true" />,
  canSubmit: (config) => !!widgetLatencyHistoryWidget.parseConfig(config),
};
