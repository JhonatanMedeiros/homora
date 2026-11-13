export const UPTIME_RANGES = ['24h', '7d', '30d'] as const;
export type UptimeRange = (typeof UPTIME_RANGES)[number];
export type UptimeBucketStatus = 'up' | 'down' | 'partial' | 'unknown';

/** Availability over a period; `uptimePct` is null while there are too few checks to be meaningful. */
export type UptimeSummary = {
  range: UptimeRange;
  uptimePct: number | null;
  /** Every check in the period under the current configuration, including unknown ones. */
  checks: number;
  downChecks: number;
  unknownChecks: number;
  lastLatencyMs: number | null;
  /** Nearest-rank 95th percentile of successful checks; only present on the single-service endpoint. */
  p95LatencyMs?: number | null;
  /** True when older checks in this period were made under a different configuration and are left out. */
  reconfigured: boolean;
  buckets: { start: string; status: UptimeBucketStatus }[];
};
