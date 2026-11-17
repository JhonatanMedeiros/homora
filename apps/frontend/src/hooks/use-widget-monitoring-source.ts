import type { MonitoringProblems } from '@homora/widgets';

function validReading(value: unknown): value is MonitoringProblems {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  const timestamp = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const nullableTimestamp = (v: unknown) => v === null || timestamp(v);
  return (
    timestamp(data.generatedAt) &&
    timestamp(data.total) &&
    timestamp(data.unmeasured) &&
    typeof data.truncated === 'boolean' &&
    Array.isArray(data.items) &&
    data.items.length <= 50 &&
    data.items.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Record<string, unknown>;
      return (
        timestamp(item.id) &&
        (item.id as number) > 0 &&
        typeof item.name === 'string' &&
        item.name.length <= 200 &&
        (item.state === 'down' || item.state === 'degraded') &&
        nullableTimestamp(item.lastAttempt) &&
        typeof item.stale === 'boolean' &&
        (item.latencyMs === null ||
          (typeof item.latencyMs === 'number' &&
            Number.isFinite(item.latencyMs) &&
            item.latencyMs >= 0)) &&
        nullableTimestamp(item.since) &&
        (item.reason === null || (typeof item.reason === 'string' && item.reason.length <= 40)) &&
        (item.httpStatus === null ||
          (typeof item.httpStatus === 'number' &&
            Number.isInteger(item.httpStatus) &&
            item.httpStatus >= 100 &&
            item.httpStatus <= 599)) &&
        typeof item.isService === 'boolean'
      );
    })
  );
}

/** Validate the bounded response before handing it to a widget. */
export function parseWidgetMonitoringSource(data: unknown): MonitoringProblems {
  if (!validReading(data)) throw new Error('invalid source');
  return data;
}
