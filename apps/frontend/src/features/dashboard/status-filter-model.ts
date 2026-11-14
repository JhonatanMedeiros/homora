import { isDegraded, type MonitorSettings } from '@homora/shared';
import type { ServiceStatus } from '@/lib/services';

export type StatusFilter = 'all' | 'down' | 'degraded' | 'maintenance';
export const STATUS_FILTERS: StatusFilter[] = ['all', 'down', 'degraded', 'maintenance'];

/** The one filter bucket a service belongs to (maintenance is planned, so it is never "down"). */
export function statusBucket(
  status: ServiceStatus | undefined,
  settings: MonitorSettings | undefined,
  blocked: boolean,
): Exclude<StatusFilter, 'all'> | 'other' {
  if (status?.reason === 'maintenance') return 'maintenance';
  if (status?.status === 'unavailable' && !blocked) return 'down';
  if (status?.status === 'available' && isDegraded(settings, status.status, status.latencyMs))
    return 'degraded';
  return 'other';
}

export const matchesStatusFilter = (
  filter: StatusFilter,
  bucket: ReturnType<typeof statusBucket>,
) => filter === 'all' || filter === bucket;
