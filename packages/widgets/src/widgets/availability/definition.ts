import {
  availabilityRanges,
  defineWidget,
  monitoringSources,
  type AvailabilityRange,
  type MonitoringState,
} from '../../index.js';

export const MAX_AVAILABILITY_TARGET_LENGTH = 200;

export type AvailabilityConfig = {
  target: string;
  range: AvailabilityRange;
};

export const defaultAvailabilityConfig: AvailabilityConfig = {
  target: '',
  range: '24h',
};

export const widgetAvailabilityWidget = defineWidget<AvailabilityConfig>({
  type: 'availability',
  version: 1,
  locations: ['page'],
  source: monitoringSources.availability,
  portable: true,
  sizes: ['normal', 'wide'],
  defaultConfig: defaultAvailabilityConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => !['target', 'range'].includes(key))) return null;
    if (typeof config.target !== 'string') return null;
    const target = config.target.trim();
    if (!target || target !== config.target || target.length > MAX_AVAILABILITY_TARGET_LENGTH) {
      return null;
    }
    if (
      typeof config.range !== 'string' ||
      !availabilityRanges.includes(config.range as AvailabilityRange)
    ) {
      return null;
    }
    return {
      target,
      range: config.range as AvailabilityRange,
    };
  },
});

export function formatAvailabilityPct(pct: number | null, locale: string): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: pct === 100 || pct === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pct / 100);
}

export function availabilityStateKey(state: MonitoringState): string {
  return `availabilityWidget.state.${state}`;
}
