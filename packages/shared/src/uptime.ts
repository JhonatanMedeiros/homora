export const UPTIME_RANGES = ['24h', '7d', '30d'] as const;
export type UptimeRange = (typeof UPTIME_RANGES)[number];
export type UptimeBucketStatus = 'up' | 'down' | 'partial' | 'unknown';

/** One period of the history bar. Latency and failure detail are absent when the period has no checks. */
export type UptimeBucket = {
  start: string;
  status: UptimeBucketStatus;
  /** Checks of every kind made in the period. */
  checks?: number;
  /** Mean latency of the successful checks, in milliseconds. */
  avgLatencyMs?: number | null;
  /** Why the most recent failed check of the period failed (the monitor's vocabulary). */
  reason?: string;
  httpStatus?: number | null;
};

/**
 * How a service's health is read (see `service_monitor_settings`). `failureThreshold` is the
 * number of consecutive failed checks before an incident opens and an alert is sent; `recoveryThreshold`
 * the number of consecutive successes before it closes; `degradedLatencyMs` the latency above
 * which an online service reads "Degraded" (null: never).
 */
export type MonitorSettings = {
  failureThreshold: number;
  recoveryThreshold: number;
  degradedLatencyMs: number | null;
};
export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  failureThreshold: 1,
  recoveryThreshold: 1,
  degradedLatencyMs: null,
};
export const THRESHOLD_MAX = 10;
export const DEGRADED_LATENCY_MIN = 50;
export const DEGRADED_LATENCY_MAX = 60_000;
/** Returns normalized settings, or null when the value is not a well-formed settings object. */
export function parseMonitorSettings(value: unknown): MonitorSettings | null {
  if (!value || typeof value !== 'object') return null;
  const { failureThreshold, recoveryThreshold, degradedLatencyMs, ...rest } = value as Record<
    string,
    unknown
  >;
  if (Object.keys(rest).length) return null;
  const threshold = (n: unknown): n is number =>
    Number.isSafeInteger(n) && Number(n) >= 1 && Number(n) <= THRESHOLD_MAX;
  if (!threshold(failureThreshold) || !threshold(recoveryThreshold)) return null;
  if (degradedLatencyMs !== null) {
    if (
      !Number.isSafeInteger(degradedLatencyMs) ||
      Number(degradedLatencyMs) < DEGRADED_LATENCY_MIN ||
      Number(degradedLatencyMs) > DEGRADED_LATENCY_MAX
    )
      return null;
  }
  return {
    failureThreshold,
    recoveryThreshold,
    degradedLatencyMs: degradedLatencyMs === null ? null : Number(degradedLatencyMs),
  };
}
/** An online service that answered slower than its limit; failing or unknown services never are. */
export function isDegraded(
  settings: Pick<MonitorSettings, 'degradedLatencyMs'> | undefined,
  status: string | undefined,
  latencyMs: number | null | undefined,
): boolean {
  return (
    status === 'available' &&
    typeof settings?.degradedLatencyMs === 'number' &&
    typeof latencyMs === 'number' &&
    latencyMs > settings.degradedLatencyMs
  );
}

/** A period in which a service was down. `endedAt` is null while it is still down. */
export type Incident = {
  id: number;
  serviceId: number;
  startedAt: number;
  endedAt: number | null;
  reason: string;
  httpStatus: number | null;
  failedChecks: number;
};
/** Fleet-wide numbers for the dashboard banner. Times are milliseconds. */
export type StatusOverview = {
  generatedAt: string;
  /** Only services whose settings differ from the defaults. */
  settings: Record<number, MonitorSettings>;
  /** The incident each service is in right now. */
  open: Record<number, Incident>;
  /** Incidents that started in the last 7 days, and in the 7 days before that. */
  incidents7d: number;
  incidentsPrevious7d: number;
  /** Mean duration of the incidents that ended in the last 30 days; null when there were none. */
  mttrMs: number | null;
  /** Longest stretch in the last 30 days without any open incident. */
  longestCleanMs: number;
  /** Availability over the last 30 days across all services, against the configured target. */
  sla: { targetPct: number; actualPct: number | null };
};
export const SLA_TARGET_DEFAULT = 99.9;
/** Availability over a period; `uptimePct` is null while there are too few checks to be meaningful. */
export type UptimeSummary = {
  range: UptimeRange;
  uptimePct: number | null;
  /** Every check in the period under the current configuration, including unknown ones. */
  checks: number;
  downChecks: number;
  unknownChecks: number;
  lastLatencyMs: number | null;
  /** Availability of the period right before this one (same length), or null without enough data. */
  previousUptimePct?: number | null;
  /** Nearest-rank 95th percentile of successful checks; only present on the single-service endpoint. */
  p95LatencyMs?: number | null;
  /** True when older checks in this period were made under a different configuration and are left out. */
  reconfigured: boolean;
  buckets: UptimeBucket[];
};

/** A scheduled maintenance window of one service (epoch milliseconds). */
export type Maintenance = {
  id: number;
  serviceId: number;
  startsAt: number;
  endsAt: number;
  note: string;
};
export const MAINTENANCE_NOTE_MAX = 140;
/** A window is at least a minute and at most 30 days long. */
export const MAINTENANCE_MIN_MS = 60_000;
export const MAINTENANCE_MAX_MS = 30 * 24 * 3_600_000;
/** What the dashboard needs: windows open now and the ones still to come, soonest first. */
export type MaintenanceOverview = { windows: Maintenance[] };

/** Median and 95th percentile of the successful checks of one slot of the latency chart. */
export type LatencyPoint = {
  start: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  checks: number;
};
export type LatencySeries = {
  range: UptimeRange;
  bucketMs: number;
  start: number;
  points: LatencyPoint[];
  p50: number | null;
  p95: number | null;
  max: number | null;
};
/** Extra data of the service detail page. `heat` rows are hourly counts of checks. */
export type ServiceInsights = {
  generatedAt: number;
  heat: { hour: number; up: number; down: number; unknown: number }[];
  reasons: { reason: string; httpStatus: number | null; count: number }[];
  recent: {
    observedAt: number;
    status: 'available' | 'unavailable' | 'unknown';
    reason: string;
    httpStatus: number | null;
    latencyMs: number | null;
  }[];
};

export const TAG_MAX_LENGTH = 24;
export const TAGS_MAX_PER_SERVICE = 6;
/** Lower-case, trimmed, inner whitespace collapsed to "-"; `null` when nothing usable is left. */
export function normalizeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replace(/\s+/g, '-');
  return tag.length > 0 &&
    tag.length <= TAG_MAX_LENGTH &&
    ![...tag].some((char) => char.charCodeAt(0) < 32 || char === '<' || char === '>')
    ? tag
    : null;
}
export type TagsOverview = { tags: Record<number, string[]> };
