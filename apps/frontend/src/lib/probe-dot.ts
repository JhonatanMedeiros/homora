import type { LightState } from '@/lib/services';

/** Light color of a probe by state; the state is always also written out. */
export const PROBE_DOT: Record<LightState, string> = {
  available: 'bg-success',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
  unavailable: 'bg-destructive',
  unknown: 'ring-[1.5px] ring-inset ring-muted-foreground',
};
