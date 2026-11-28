export { monitoringReasonKey } from './monitoring-reason.js';
export { isHomePrivateHost } from './private-host.js';
export { monitoringState, type MonitoringState } from './monitoring-state.js';

/** Internal widget contracts. The host owns placement, persistence and data access. */
export type WidgetLocation = 'page' | 'card' | 'top-bar';
export type WidgetSize = 'normal' | 'wide';
/** In grid columns (of 12) and rows. */
export type SummaryPlacement = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};
/** The default and smallest size a widget takes on the Summary. */
export function summaryPlacement(
  definition: WidgetDefinition<unknown> | undefined,
  size: WidgetSize = 'normal',
): SummaryPlacement {
  return (
    definition?.summary ?? {
      width: size === 'wide' ? 8 : 4,
      height: 2,
      minWidth: 3,
      minHeight: 1,
    }
  );
}
export type WidgetStat = { label: string; value: string; id?: 'cpu' | 'memory' | 'disk' };

/** Source identifiers name a data contract, not a transport or credentials. */
export type WidgetSource = { contract: string; version: number };
export type WidgetDefinition<Config> = {
  type: string;
  version: number;
  locations: readonly WidgetLocation[];
  source: WidgetSource | null;
  portable?: boolean;
  /** Select the existing authenticated connection observation. */
  connectionData?: 'resources';
  defaultConfig?: Config;
  sizes?: readonly WidgetSize[];
  /** How the widget sits on the Summary grid when it differs from what its size gives. */
  summary?: SummaryPlacement;
  /** Drawn only on the Summary, from the health the application has already read. */
  summaryOnly?: boolean;
  parseConfig(value: unknown): Config | null;
  /** Remove installation-local references when crossing the configuration transfer boundary. */
  portableConfig?(config: Config): Config;
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
  MonitoringLatency,
  MonitoringCounts,
  MonitoringSummary,
  MonitoringCertificate,
  MonitoringCertificates,
  MonitoringProblem,
  MonitoringProblems,
  MonitoringIncident,
  MonitoringIncidentReason,
  MonitoringIncidents,
  MonitoringMaintenance,
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
  homeAssistantEntitiesSource,
  type HomeAssistantEntity,
  type HomeAssistantEntitiesResult,
} from './widgets/home-assistant-entities/source.js';
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
