import type { Service } from '@homora/shared';
import { describeStatus } from '@/lib/status-text';
import type { ServiceStatus } from '@/lib/services';
import type { HostGuestGroup, HostNodeGroup } from '@/features/hosts/hosts';
import type { HostUsage } from '@homora/integrations';

/** What the map needs to know about one service: is it a problem, and how bad. */
export type Health = 'down' | 'degraded' | 'ok' | 'unknown';
export type HealthOf = (service: Service) => Health;

/** Same wording rules as every other status view: `describeStatus` decides the state. */
export function serviceHealth(status: ServiceStatus | undefined, blocked: boolean): Health {
  const { state, blocked: isBlocked } = describeStatus(status, blocked);
  if (isBlocked) return 'unknown';
  if (state === 'unavailable') return 'down';
  if (state === 'degraded') return 'degraded';
  if (state === 'available' || state === 'maintenance') return 'ok';
  return 'unknown';
}

export const isProblem = (health: Health) => health === 'down' || health === 'degraded';
/** Problems first, then everything else; used when "problems first" is on. */
export const healthRank = (health: Health) =>
  health === 'down' ? 0 : health === 'degraded' ? 1 : 2;

export type HealthCounts = {
  total: number;
  ok: number;
  degraded: number;
  down: number;
  unknown: number;
};

export function countHealth(services: Service[], healthOf: HealthOf): HealthCounts {
  const counts: HealthCounts = {
    total: services.length,
    ok: 0,
    degraded: 0,
    down: 0,
    unknown: 0,
  };
  for (const service of services) counts[healthOf(service)]++;
  return counts;
}
const add = (a: HealthCounts, b: HealthCounts): HealthCounts => ({
  total: a.total + b.total,
  ok: a.ok + b.ok,
  degraded: a.degraded + b.degraded,
  down: a.down + b.down,
  unknown: a.unknown + b.unknown,
});

export type GuestSummary = {
  counts: HealthCounts;
  /** A stopped guest, or one with a failing or slow service. */
  problem: boolean;
  running: boolean;
};
export function guestSummary(group: HostGuestGroup, healthOf: HealthOf): GuestSummary {
  const counts = countHealth(group.services, healthOf);
  const running = group.guest.status === 'running';
  const stopped = group.guest.status === 'stopped';
  return {
    counts,
    running,
    problem: stopped || counts.down + counts.degraded > 0,
  };
}

export type NodeState = 'online' | 'degraded' | 'offline' | 'unknown';
export type NodeSummary = {
  counts: HealthCounts;
  state: NodeState;
  problem: boolean;
};
export function nodeSummary(node: HostNodeGroup, healthOf: HealthOf): NodeSummary {
  const guests = node.guests.map((group) => guestSummary(group, healthOf));
  const counts = guests.map((guest) => guest.counts).reduce(add, countHealth([], healthOf));
  const status = node.node.status;
  const problem = status === 'offline' || guests.some((guest) => guest.problem);
  const state: NodeState =
    status === 'offline'
      ? 'offline'
      : status === 'unknown'
        ? 'unknown'
        : problem
          ? 'degraded'
          : 'online';
  return { counts, state, problem };
}

/** Whole percent of a usage, or null when there is nothing meaningful to show. */
export const usagePercent = (usage?: HostUsage) =>
  usage && usage.total > 0 ? Math.min(100, Math.round((usage.used / usage.total) * 100)) : null;
export const cpuPercent = (cpu?: number) =>
  typeof cpu === 'number' ? Math.min(100, Math.round(cpu * 100)) : null;

const GIB = 1024 ** 3;
/** Memory or disk usage as "3.1 GB", the unit of the whole figure kept simple. */
export const gigabytes = (bytes: number) => bytes / GIB;

/** Problems first, then name order is applied by the caller's tie-break. */
export const healthCompare =
  (healthOf: HealthOf) =>
  (a: Service, b: Service): number =>
    healthRank(healthOf(a)) - healthRank(healthOf(b));
