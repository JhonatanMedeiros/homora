/** A monitor's state as seen by the Home, without presentation or transport details. */
export type MonitoringState = 'down' | 'degraded' | 'ok' | 'maintenance' | 'blocked' | 'unknown';

export function monitoringState(input: {
  status?: string;
  reason?: string | null;
  latencyMs?: number | null;
  degradedLatencyMs?: number | null;
  blocked: boolean;
  measurementReason?: string | null;
}): MonitoringState {
  if (input.reason === 'maintenance') return 'maintenance';
  if (
    ((input.blocked || input.reason === 'destination-blocked') && input.status !== 'available') ||
    (input.measurementReason != null &&
      input.status === 'unavailable' &&
      input.reason === input.measurementReason)
  )
    return 'blocked';
  if (input.status === 'unavailable') return 'down';
  if (input.status !== 'available') return 'unknown';
  if (
    typeof input.degradedLatencyMs === 'number' &&
    typeof input.latencyMs === 'number' &&
    input.latencyMs > input.degradedLatencyMs
  )
    return 'degraded';
  return 'ok';
}
