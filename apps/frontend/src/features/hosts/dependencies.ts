import type { Dependency, Service } from '@homora/shared';
import type { Impact } from '@/features/hosts/hosts';

export type { Dependency };

export const dependsOn = (id: number, dependencies: readonly Dependency[]) =>
  dependencies.filter((item) => item.serviceId === id).map((item) => item.dependsOnId);
export const usedBy = (id: number, dependencies: readonly Dependency[]) =>
  dependencies.filter((item) => item.dependsOnId === id).map((item) => item.serviceId);

const IMPAIRED = new Set<Impact>(['host-offline', 'guest-stopped', 'service-down']);
export const isImpaired = (impact: Impact | undefined) => !!impact && IMPAIRED.has(impact);

/**
 * For each service, the services it depends on (directly or through others) that are impaired.
 * Breadth-first, nearest first, with a visited set so a cycle can never loop. The result is a
 * "may be affected" hint derived from manual records, not a measured fact.
 */
export function impairedUpstream(
  services: readonly Pick<Service, 'id'>[],
  dependencies: readonly Dependency[],
  impacts: ReadonlyMap<number, Impact>,
): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const { id } of services) {
    const seen = new Set<number>([id]);
    const queue = [...dependsOn(id, dependencies)];
    const found: number[] = [];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      if (isImpaired(impacts.get(next))) found.push(next);
      queue.push(...dependsOn(next, dependencies));
    }
    if (found.length > 0) result.set(id, found);
  }
  return result;
}

/** Services that may break if any of `roots` stops, excluding the roots themselves. */
export function dependentsOf(roots: readonly number[], dependencies: readonly Dependency[]) {
  const seen = new Set<number>(roots);
  const queue = [...roots];
  const found: number[] = [];
  while (queue.length > 0) {
    for (const user of usedBy(queue.shift()!, dependencies)) {
      if (seen.has(user)) continue;
      seen.add(user);
      found.push(user);
      queue.push(user);
    }
  }
  return found;
}

/**
 * The path of manual dependencies that leads to a service, from the outermost one down to the
 * service itself (for example a tunnel, then a proxy, then the app). Follows the first recorded
 * dependency at each step and stops at a repeat, so a cycle can never loop; one entry means there
 * is nothing upstream.
 */
export function upstreamChain(id: number, dependencies: readonly Dependency[]): number[] {
  const chain = [id];
  const seen = new Set(chain);
  let current = id;
  for (;;) {
    const next = dependsOn(current, dependencies).find((item) => !seen.has(item));
    if (next === undefined) return chain.reverse();
    chain.push(next);
    seen.add(next);
    current = next;
  }
}
