import type { WidgetSource } from './index.js';
import type { MonitoringState } from './monitoring-state.js';

/** Host-owned, versioned sources. They never name a connection or grant network access. */
export const monitoringSources = {
  summary: { contract: 'homora:monitoring-summary', version: 1 },
  problems: { contract: 'homora:monitoring-problems', version: 1 },
  incidents: { contract: 'homora:monitoring-incidents', version: 1 },
  availability: { contract: 'homora:monitoring-availability', version: 1 },
  latency: { contract: 'homora:monitoring-latency', version: 1 },
  serviceTargets: { contract: 'homora:monitoring-service-targets', version: 1 },

  certificates: { contract: 'homora:monitoring-certificates', version: 1 },
  maintenance: { contract: 'homora:monitoring-maintenance', version: 1 },
} as const satisfies Record<string, WidgetSource>;

export function isInternalSource(source: WidgetSource | null): boolean {
  return (
    source !== null &&
    Object.values(monitoringSources).some(
      (candidate) => candidate.contract === source.contract && candidate.version === source.version,
    )
  );
}

export type MonitoringCounts = Record<MonitoringState, number>;
export type MonitoringSummary = {
  generatedAt: number;
  counts: MonitoringCounts;
  stale: number;
  measurementFailure: boolean;
};
export type MonitoringProblem = {
  id: number;
  name: string;
  state: 'down' | 'degraded';
  lastAttempt: number | null;
  stale: boolean;
  latencyMs: number | null;
  since: number | null;
  reason: string | null;
  httpStatus: number | null;
  isService: boolean;
};
export type MonitoringProblems = {
  generatedAt: number;
  items: MonitoringProblem[];
  truncated: boolean;
  total: number;
  unmeasured: number;
};
export type MonitoringIncident = {
  id: number;
  monitorId: number;
  name: string;
  startedAt: number;
  endedAt: number | null;
  reason: MonitoringIncidentReason;
  httpStatus: number | null;
  hasService: boolean;
};
export const monitoringIncidentReasons = [
  'destination-blocked',
  'no-response',
  'not-found',
  'error-status',
  'unexpected-status',
  'content-mismatch',
  'cert-expired',
  'cert-invalid',
  'cert-expiring',
  'maintenance',
  'other',
] as const;
export type MonitoringIncidentReason = (typeof monitoringIncidentReasons)[number];
export type MonitoringIncidents = {
  generatedAt: number;
  periodDays: number;
  items: MonitoringIncident[];
  truncated: boolean;
};

export const availabilityRanges = ['24h', '7d', '30d'] as const;
export type AvailabilityRange = (typeof availabilityRanges)[number];
export type MonitoringAvailabilityBucket = {
  start: string;
  status: 'up' | 'down' | 'partial' | 'unknown';
  checks: number;
};
export type MonitoringAvailabilityTarget = {
  id: number;
  name: string;
  isService: boolean;
  state: MonitoringState;
  lastAttempt: number | null;
  stale: boolean;
  uptimePct: number | null;
  checks: number;
  upChecks: number;
  downChecks: number;
  unknownChecks: number;
  minChecks: number;
  reconfigured: boolean;
  buckets: MonitoringAvailabilityBucket[];
};
export type MonitoringAvailability = {
  generatedAt: number;
  range: AvailabilityRange;
  target: MonitoringAvailabilityTarget | null;
};

export type MonitoringLatency = {
  generatedAt: number;
  range: AvailabilityRange;
  target: null | {
    id: number;
    name: string;
    state: MonitoringState;
    stale: boolean;
    lastAttempt: number | null;
    lastValid: { observedAt: number; latencyMs: number } | null;
    points: { start: number; p50: number | null }[];
  };
};

/** Offline first; known incident starts precede unknown starts, with a stable ID tie-break. */
export function orderMonitoringProblems(items: readonly MonitoringProblem[]): MonitoringProblem[] {
  return [...items].sort(
    (a, b) =>
      (a.state === b.state ? 0 : a.state === 'down' ? -1 : 1) ||
      (a.since ?? Infinity) - (b.since ?? Infinity) ||
      a.id - b.id,
  );
}

export type MonitoringCertificate = {
  id: number;
  name: string;
  expiresAt: number | null;
  observedAt: number | null;
  stale: boolean;
  state: MonitoringState;
};
export type MonitoringCertificates = {
  generatedAt: number;
  items: MonitoringCertificate[];
  total: number;
  missingFilter: boolean;
};

/** A maintenance window projected without notes or addresses. */
export type MonitoringMaintenance = {
  generatedAt: number;
  items: {
    id: number;
    monitorId: number;
    name: string;
    startsAt: number;
    endsAt: number;
    hasService: boolean;
  }[];
  total: number;
};
