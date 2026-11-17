import type { WidgetSource } from './index.js';
import type { MonitoringState } from './monitoring-state.js';

/** Host-owned, versioned sources. They never name a connection or grant network access. */
export const monitoringSources = {
  summary: { contract: 'homora:monitoring-summary', version: 1 },
  problems: { contract: 'homora:monitoring-problems', version: 1 },
  incidents: { contract: 'homora:monitoring-incidents', version: 1 },
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

/** Offline first; known incident starts precede unknown starts, with a stable ID tie-break. */
export function orderMonitoringProblems(items: readonly MonitoringProblem[]): MonitoringProblem[] {
  return [...items].sort(
    (a, b) =>
      (a.state === b.state ? 0 : a.state === 'down' ? -1 : 1) ||
      (a.since ?? Infinity) - (b.since ?? Infinity) ||
      a.id - b.id,
  );
}
