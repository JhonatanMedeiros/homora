export { monitoringReasonKey } from './monitoring-reason.js';
export { isHomePrivateHost } from './private-host.js';
export { monitoringState, type MonitoringState } from './monitoring-state.js';

/** Internal widget contracts. The host owns placement, persistence and data access. */
export type WidgetLocation = 'page' | 'card' | 'top-bar';
export type WidgetSize = 'normal' | 'wide';
export type WidgetStat = { label: string; value: string; id?: 'cpu' | 'memory' | 'disk' };

/** Source identifiers name a data contract, not a transport or credentials. */
export type WidgetSource = { contract: string; version: number };
export type WidgetDefinition<Config> = {
  type: string;
  version: number;
  locations: readonly WidgetLocation[];
  source: WidgetSource | null;
  portable?: boolean;
  defaultConfig?: Config;
  sizes?: readonly WidgetSize[];
  parseConfig(value: unknown): Config | null;
};
export type WidgetState<Data> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'none' }
  | { status: 'node-unavailable' }
  | { status: 'error' }
  | { status: 'ready'; data: Data };

/** A source is compatible only when both its contract and version match exactly. */
export function supportsSource(
  required: WidgetSource | null,
  offered: WidgetSource | null,
): boolean {
  return required === null
    ? offered === null
    : offered !== null &&
        required.contract === offered.contract &&
        required.version === offered.version;
}

export function defineWidget<Config>(
  definition: WidgetDefinition<Config>,
): WidgetDefinition<Config> {
  const sizes = definition.sizes ?? ['normal'];
  if (!sizes.includes('normal') || sizes.some((size) => size !== 'normal' && size !== 'wide'))
    throw new Error('Invalid widget sizes');
  return { ...definition, sizes };
}

/** Presentation is pure and receives only host-provided, validated observations. */
export type WidgetPresentation = {
  stats(value: unknown): WidgetStat[] | null;
  placeholderCount?: number;
};

export function definePresentation(presentation: WidgetPresentation): WidgetPresentation {
  return presentation;
}

/** Presentation transforms host-supplied input to safe display data. */
export type WidgetPresenter<Input, Output> = { present(input: Input): Output };
export function definePresenter<Input, Output>(
  presenter: WidgetPresenter<Input, Output>,
): WidgetPresenter<Input, Output> {
  return presenter;
}

import { isInternalSource } from './monitoring.js';
export {
  availabilityRanges,
  isInternalSource,
  monitoringSources,
  monitoringIncidentReasons,
  orderMonitoringProblems,
} from './monitoring.js';

/** Internal sources are supplied by every host and need no connection binding. */
export function isPortableWidget(definition: WidgetDefinition<unknown> | undefined): boolean {
  return (
    definition !== undefined &&
    (definition.portable === true || isInternalSource(definition.source))
  );
}
export type {
  AvailabilityRange,
  MonitoringAvailability,
  MonitoringAvailabilityBucket,
  MonitoringAvailabilityTarget,
  MonitoringCounts,
  MonitoringSummary,
  MonitoringProblem,
  MonitoringProblems,
  MonitoringIncident,
  MonitoringIncidentReason,
  MonitoringIncidents,
} from './monitoring.js';
export {
  MAX_FEED_BYTES,
  FeedParseError,
  parseFeedXml,
  sanitizeFeedLink,
  stripMarkupToPlainText,
  type ParsedFeed,
  type ParsedFeedEntry,
} from './widgets/rss-feed/parser.js';
export {
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
  MAX_FEED_TITLE_LENGTH,
  MAX_FEED_URL_LENGTH,
  parseFeedUrl,
  type RssFeedConfig,
} from './widgets/rss-feed/definition.js';
export {
  SourceInvalidQueryError,
  SourceParseError,
  SourcePolicyBlockedError,
  type ParsedSourceQuery,
  type RestrictedFetch,
  type RestrictedFetchOptions,
  type WidgetSourceContext,
  type WidgetSourceReader,
} from './source.js';
export {
  weatherSources,
  isWeatherSource,
  WEATHER_PROVIDER_IDS,
  WEATHER_UNITS,
  WEATHER_CONDITION_CODES,
  WEATHER_MAX_FORECAST_DAYS,
  type WeatherProviderId,
  type WeatherUnit,
  type WeatherConditionCode,
  type WeatherCurrent,
  type WeatherDailyForecast,
  type WeatherObservation,
  type WeatherLocationResult,
  type WeatherGeocodeResponse,
  type WeatherProviderSummary,
} from './weather.js';
