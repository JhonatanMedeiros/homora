import type { StatusOverview } from '@homora/shared';
import { monitoringState } from '@homora/widgets';
import { t } from '@/i18n';
import type { ServiceStatus } from '@/lib/services';
import { formatDuration } from '@/features/uptime/uptime-view';

export const MAX_NAMED = 2;

export type WindowState = 'down' | 'degraded' | 'ok' | 'maintenance' | 'unknown';
export type StatusTone = 'down' | 'warn' | 'ok';

export type StatusSummaryInput = {
  services: { id: number; name: string }[];
  statuses: Record<number, ServiceStatus>;
  /** Services the network policy keeps from being checked; they are not "down". */
  blockedIds: Set<number>;
  overview?: StatusOverview;
  now: number;
};

export type StatusSummary = {
  /** Lines such as "Radarr down for 14 min", one per service that is offline. */
  down: string[];
  /** Lines such as "Sonarr slow: 1840 ms". */
  slow: string[];
  unknown: number;
  blocked: number;
  certs: { name: string; days: number }[];
  windows: { id: number; name: string; state: WindowState }[];
  /** Offline plus slow services: what the Home calls "problems". */
  problems: number;
  measurement: NonNullable<StatusOverview['measurement']> | null;
  title: string;
  subtitle: string;
  tone: StatusTone;
};

/**
 * What the Home says about health, from facts Homora already holds. One source for the banner
 * body and for the status pill in the header, so the two can never disagree.
 */
export function summarizeStatus({
  services,
  statuses,
  blockedIds,
  overview,
  now,
}: StatusSummaryInput): StatusSummary {
  const down: string[] = [];
  const slow: string[] = [];
  let unknown = 0;
  let blocked = 0;
  const certs: { name: string; days: number }[] = [];
  const windows: { id: number; name: string; state: WindowState }[] = [];
  for (const service of services) {
    const status = statuses[service.id];
    if (typeof status?.certExpiresAt === 'number')
      certs.push({
        name: service.name,
        days: Math.floor((status.certExpiresAt - now) / 86_400_000),
      });
    const state = monitoringState({
      status: status?.status,
      reason: status?.reason,
      latencyMs: status?.latencyMs,
      degradedLatencyMs: overview?.settings[service.id]?.degradedLatencyMs,
      blocked: blockedIds.has(service.id),
      measurementReason: overview?.measurement?.reason,
    });
    windows.push({
      id: service.id,
      name: service.name,
      state: state === 'blocked' ? 'unknown' : state,
    });
    if (state === 'maintenance') continue;
    const isBlocked = state === 'blocked';
    const slowNow = state === 'degraded';
    if (isBlocked) blocked++;
    else if (status?.status === 'unavailable') {
      const since = overview?.open[service.id]?.startedAt;
      down.push(
        typeof since === 'number'
          ? t('banner.down', { name: service.name, duration: formatDuration(now - since) })
          : t('banner.downNow', { name: service.name }),
      );
    } else if (status?.status === 'available') {
      if (slowNow)
        slow.push(
          t('banner.degraded', {
            name: service.name,
            latency: Math.round(status.latencyMs ?? 0),
          }),
        );
    } else unknown++;
  }
  const problems = down.length + slow.length;
  const measurement = overview?.measurement ?? null;
  const title = measurement
    ? t('banner.measurement.title')
    : problems > 0
      ? problems === 1
        ? t('banner.problem.one')
        : t('banner.problem.other', { count: problems })
      : unknown > 0
        ? unknown === 1
          ? t('banner.unknown.one')
          : t('banner.unknown.other', { count: unknown })
        : blocked > 0
          ? t('banner.allMonitoredUp')
          : t('banner.allUp');
  const named = [...down, ...slow];
  const subtitle = measurement
    ? t('banner.measurement.detail')
    : [
        ...named.slice(0, MAX_NAMED),
        ...(named.length > MAX_NAMED
          ? [t('banner.more', { count: named.length - MAX_NAMED })]
          : []),
        ...(blocked > 0
          ? [
              blocked === 1
                ? t('banner.blocked.one')
                : t('banner.blocked.other', { count: blocked }),
            ]
          : []),
      ].join(' · ');
  const tone = measurement
    ? 'warn'
    : down.length > 0
      ? 'down'
      : problems > 0 || unknown > 0 || blocked > 0
        ? 'warn'
        : 'ok';

  return {
    down,
    slow,
    unknown,
    blocked,
    certs,
    windows,
    problems,
    measurement,
    title,
    subtitle,
    tone,
  };
}

/** The short words on the header pill, from the same summary as the banner body. */
export function pillText(
  summary: Pick<StatusSummary, 'measurement' | 'problems' | 'unknown' | 'blocked'>,
) {
  if (summary.measurement) return t('pill.measurement');
  if (summary.problems > 0)
    return summary.problems === 1
      ? t('pill.problem.one')
      : t('pill.problem.other', { count: summary.problems });
  if (summary.unknown > 0) return t('pill.unknown');
  if (summary.blocked > 0) return t('pill.blocked');
  return t('pill.allUp');
}
