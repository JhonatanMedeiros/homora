import type { Service } from '@homora/shared';
import type { Impact } from '@/lib/hosts';

/** "serviceId depends on dependsOnId", recorded by hand. */
export type Dependency = { serviceId: number; dependsOnId: number };

export const dependsOn = (id: number, dependencies: readonly Dependency[]) =>
  dependencies.filter((item) => item.serviceId === id).map((item) => item.dependsOnId);
export const usedBy = (id: number, dependencies: readonly Dependency[]) =>
  dependencies.filter((item) => item.dependsOnId === id).map((item) => item.serviceId);

const IMPAIRED: readonly Impact[] = ['host-offline', 'guest-stopped', 'service-down'];
export const isImpaired = (impact: Impact | undefined) => !!impact && IMPAIRED.includes(impact);

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
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      if (isImpaired(impacts.get(next))) found.push(next);
      queue.push(...dependsOn(next, dependencies));
    }
    if (found.length) result.set(id, found);
  }
  return result;
}

/** Services that may break if any of `roots` stops, excluding the roots themselves. */
export function dependentsOf(roots: readonly number[], dependencies: readonly Dependency[]) {
  const seen = new Set<number>(roots);
  const queue = [...roots];
  const found: number[] = [];
  while (queue.length) {
    for (const user of usedBy(queue.shift()!, dependencies)) {
      if (seen.has(user)) continue;
      seen.add(user);
      found.push(user);
      queue.push(user);
    }
  }
  return found;
}
