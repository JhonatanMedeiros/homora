import type { WindowState } from '@/features/uptime/status-summary';

export const STATE_COLOR: Record<WindowState, string> = {
  down: 'bg-destructive',
  degraded: 'bg-warning',
  ok: 'bg-success',
  maintenance: 'bg-info',
  unknown: 'bg-muted-foreground',
};

export const STATE_LABEL = {
  down: 'status.unavailable',
  degraded: 'status.degraded',
  ok: 'status.available',
  maintenance: 'status.maintenance',
  unknown: 'status.unknown',
} as const satisfies Record<WindowState, string>;

/** Problems first, healthy last. */
export const STATE_ORDER: WindowState[] = ['down', 'degraded', 'unknown', 'maintenance', 'ok'];
