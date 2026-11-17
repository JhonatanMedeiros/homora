import type { MonitorSettings } from '@homora/shared';
import { monitoringState } from '@homora/widgets';
import type { ServiceStatus } from '@/lib/services';

export type StatusFilter = 'all' | 'down' | 'degraded' | 'maintenance' | 'ok' | 'unmeasured';
export const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'down',
  'degraded',
  'maintenance',
  'ok',
  'unmeasured',
];

/** The one filter bucket a service belongs to (maintenance is planned, so it is never "down"). */
export function statusBucket(
  status: ServiceStatus | undefined,
  settings: MonitorSettings | undefined,
  blocked: boolean,
  measurementReason?: string | null,
): Exclude<StatusFilter, 'all'> | 'other' {
  const state = monitoringState({
    status: status?.status,
    reason: status?.reason,
    latencyMs: status?.latencyMs,
    degradedLatencyMs: settings?.degradedLatencyMs,
    blocked,
    measurementReason,
  });
  return state === 'unknown' || state === 'blocked' ? 'unmeasured' : state;
}

export const matchesStatusFilter = (
  filter: StatusFilter,
  bucket: ReturnType<typeof statusBucket>,
) => filter === 'all' || filter === bucket;
