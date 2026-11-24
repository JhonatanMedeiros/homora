import { AlertCircle, Gauge } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homora/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Skeleton } from '@homora/ui/skeleton';
import { cn } from '@homora/ui/lib/utils';
import { availabilityRanges, type AvailabilityRange } from '../../../monitoring.js';
import type { MonitoringState } from '../../../monitoring-state.js';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  availabilityStateKey,
  defaultAvailabilityConfig,
  formatAvailabilityPct,
  widgetAvailabilityWidget,
  type AvailabilityConfig,
} from '../definition.js';
import {
  useAvailabilityReading,
  useTargetOptions,
  type AvailabilityReading,
} from './use-reading.js';

function relativeTime(instant: number | null, now: number, locale: string, fallback: string) {
  if (instant === null) return fallback;
  const seconds = Math.max(0, Math.floor((now - instant) / 1000));
  const [amount, unit] =
    seconds >= 86400
      ? ([Math.floor(seconds / 86400), 'day'] as const)
      : seconds >= 3600
        ? ([Math.floor(seconds / 3600), 'hour'] as const)
        : seconds >= 60
          ? ([Math.floor(seconds / 60), 'minute'] as const)
          : ([seconds, 'second'] as const);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-amount, unit);
}

function stateBadgeVariant(state: MonitoringState) {
  if (state === 'down') return 'destructive' as const;
  if (state === 'degraded' || state === 'maintenance' || state === 'blocked') {
    return 'secondary' as const;
  }
  return 'outline' as const;
}

function bucketClass(status: 'up' | 'down' | 'partial' | 'unknown'): string {
  switch (status) {
    case 'up':
      return 'bg-emerald-500';
    case 'partial':
      return 'bg-amber-500';
    case 'down':
      return 'bg-destructive';
    case 'unknown':
      return 'bg-muted';
  }
}

export function AvailabilityView({ config }: { config: AvailabilityConfig }) {
  const { monitoring } = useWidgetHost();
  const reading = useAvailabilityReading(config, monitoring?.readAvailability);
  return <AvailabilityContent config={config} reading={reading} />;
}

export function AvailabilityContent({
  config,
  reading,
}: {
  config: AvailabilityConfig;
  reading: AvailabilityReading;
}) {
  const { t, locale, openMonitor, wide } = useWidgetHost();

  if (reading.status === 'unconfigured') {
    return <p className="text-sm text-muted-foreground">{t('availabilityWidget.unconfigured')}</p>;
  }

  if (reading.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('availabilityWidget.loading')}</span>
        <div aria-hidden="true" className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-1/2 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-full motion-reduce:animate-none" />
          <Skeleton className="h-3 w-2/3 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (reading.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('availabilityWidget.error')}
      </p>
    );
  }

  const { data, now, stale } = reading;
  const target = data.target;

  if (!target) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {stale && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('availabilityWidget.stale', {
              time: relativeTime(data.generatedAt, now, locale, t('availabilityWidget.now')),
            })}
          </p>
        )}
        <Empty className="gap-2 p-3 md:p-3">
          <EmptyHeader>
            <EmptyMedia>
              <AlertCircle aria-hidden="true" className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="text-sm">
              {t('availabilityWidget.missingTarget', { name: config.target })}
            </EmptyTitle>
            <EmptyDescription className="text-xs">
              {t('availabilityWidget.missingTargetHint')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const counted = target.upChecks + target.downChecks;
  const pctText = formatAvailabilityPct(target.uptimePct, locale);
  const rangeLabel = t(`availabilityWidget.range.${data.range}`);
  const numberFormat = new Intl.NumberFormat(locale);
  const barLabel = t('availabilityWidget.barLabel', {
    name: target.name,
    range: rangeLabel,
    pct: pctText ?? t('availabilityWidget.insufficientData'),
    up: numberFormat.format(target.upChecks),
    down: numberFormat.format(target.downChecks),
  });

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {(stale || target.stale) && (
        <p role="status" className="text-xs text-muted-foreground">
          {stale
            ? t('availabilityWidget.stale', {
                time: relativeTime(data.generatedAt, now, locale, t('availabilityWidget.now')),
              })
            : t('availabilityWidget.staleCheck', {
                time: relativeTime(target.lastAttempt, now, locale, t('availabilityWidget.now')),
              })}
        </p>
      )}

      <div className={cn('flex min-w-0 gap-2', wide ? 'items-center justify-between' : 'flex-col')}>
        <Button
          type="button"
          variant="ghost"
          disabled={!openMonitor}
          onClick={() => openMonitor?.(target.id, target.isService)}
          aria-label={t(
            target.isService ? 'availabilityWidget.openService' : 'availabilityWidget.openProbe',
            { name: target.name },
          )}
          className="h-auto min-h-11 justify-start whitespace-normal px-1 py-1 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="break-words font-medium">{target.name}</span>
            <Badge variant="outline">
              {t(
                target.isService
                  ? 'availabilityWidget.kind.service'
                  : 'availabilityWidget.kind.probe',
              )}
            </Badge>
            <Badge variant={stateBadgeVariant(target.state)}>
              {t(availabilityStateKey(target.state))}
            </Badge>
          </span>
        </Button>

        <div
          className={cn(
            'flex items-baseline gap-2',
            wide ? 'shrink-0 text-right' : 'justify-between',
          )}
        >
          {pctText === null ? (
            <span className="text-sm font-medium text-muted-foreground">
              {t('availabilityWidget.insufficientData')}
            </span>
          ) : (
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{pctText}</span>
          )}
          <span className="text-xs text-muted-foreground">{rangeLabel}</span>
        </div>
      </div>

      <div
        role="img"
        aria-label={barLabel}
        className={cn(
          'flex w-full items-stretch gap-px overflow-hidden rounded-sm',
          wide ? 'h-6' : 'h-4',
        )}
      >
        {target.buckets.map((bucket) => (
          <span
            key={bucket.start}
            className={cn('min-w-[2px] flex-1', bucketClass(bucket.status))}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {pctText === null ? (
          <span>
            {t('availabilityWidget.insufficientDataDetail', {
              counted: numberFormat.format(counted),
              min: numberFormat.format(target.minChecks),
            })}
          </span>
        ) : (
          <span>
            {t('availabilityWidget.checksSummary', {
              up: numberFormat.format(target.upChecks),
              down: numberFormat.format(target.downChecks),
            })}
          </span>
        )}
        {target.unknownChecks > 0 && (
          <span>
            {t('availabilityWidget.excludedChecks', {
              count: numberFormat.format(target.unknownChecks),
            })}
          </span>
        )}
      </div>

      {target.reconfigured && (
        <p className="text-xs text-muted-foreground">{t('availabilityWidget.reconfigured')}</p>
      )}
    </div>
  );
}

function Editor({
  config,
  onChange,
}: {
  config: AvailabilityConfig;
  onChange: (config: AvailabilityConfig) => void;
}) {
  const { t, monitoring } = useWidgetHost();
  const options = useTargetOptions(monitoring?.readTargets);
  const missingCurrent =
    Boolean(config.target) &&
    !options.loading &&
    !options.error &&
    !options.targets.some((item) => item.name === config.target);

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="availability-target">{t('availabilityWidget.target')}</FieldLabel>
        <FormSelect
          id="availability-target"
          value={config.target}
          onChange={(event) => onChange({ ...config, target: event.target.value })}
        >
          <FormSelectOption value="">{t('availabilityWidget.targetPlaceholder')}</FormSelectOption>
          {missingCurrent && (
            <FormSelectOption value={config.target}>{config.target}</FormSelectOption>
          )}
          {options.targets.map((item) => (
            <FormSelectOption key={`${item.isService ? 's' : 'p'}:${item.name}`} value={item.name}>
              {`${item.name} (${t(item.isService ? 'availabilityWidget.kind.service' : 'availabilityWidget.kind.probe')})`}
            </FormSelectOption>
          ))}
        </FormSelect>
        <FieldDescription>{t('availabilityWidget.targetHelp')}</FieldDescription>
        {options.error && (
          <p role="alert" className="text-xs text-destructive">
            {t('availabilityWidget.targetLoadError')}
          </p>
        )}
        {missingCurrent && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('availabilityWidget.targetNotInList')}
          </p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="availability-range">{t('availabilityWidget.range')}</FieldLabel>
        <FormSelect
          id="availability-range"
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
  name: 'pageWidgets.widgetAvailability',
  description: 'pageWidgets.widgetAvailabilityDesc',
  category: 'monitoring',
  keywords: [
    'availability',
    'uptime',
    'sla',
    'probe',
    'service',
    'disponibilidade',
    'sonda',
    'serviço',
  ],
  defaultConfig: defaultAvailabilityConfig,
  parse: widgetAvailabilityWidget.parseConfig,
  View: ({ config }) => <AvailabilityView config={config as AvailabilityConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as AvailabilityConfig} onChange={onChange} />
  ),
  Gallery: () => <Gauge aria-hidden="true" />,
  canSubmit: (config) => !!widgetAvailabilityWidget.parseConfig(config),
};
