export const MAX_DEPENDENCIES_PER_SERVICE = 50;
import type { EvidenceBundle, EvidenceFact } from './evidence.js';

/** "serviceId depends on dependsOnId", recorded by hand. */
export type Dependency = { serviceId: number; dependsOnId: number };

/** One shortest path from a target to a potentially dependent monitor, using manual records. */
export function potentialDependents(
  roots: readonly number[],
  edges: readonly Dependency[],
  evaluatedAt = new Date().toISOString(),
) {
  const maxDepth = 8;
  const maxResults = 100;
  const seen = new Set(roots);
  const queue = [...new Set(roots)].map((id) => ({ id, path: [id] }));
  const paths: number[][] = [];
  let truncated = false;
  const reverse = new Map<number, number[]>();
  for (const edge of edges) {
    const list = reverse.get(edge.dependsOnId) ?? [];
    list.push(edge.serviceId);
    reverse.set(edge.dependsOnId, list);
  }
  for (const list of reverse.values()) list.sort((a, b) => a - b);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    for (const next of reverse.get(current.id) ?? []) {
      if (seen.has(next)) continue;
      if (current.path.length > maxDepth || paths.length >= maxResults) {
        truncated = true;
        continue;
      }
      seen.add(next);
      const path = [...current.path, next];
      paths.push(path);
      queue.push({ id: next, path });
    }
  }
  const used = new Map<string, EvidenceFact>();
  for (const path of paths)
    for (let index = 1; index < path.length; index++) {
      const dependsOnId = path[index - 1]!;
      const serviceId = path[index]!;
      const id = `dependency:${serviceId}:${dependsOnId}`;
      used.set(id, {
        id,
        version: 1,
        kind: 'fact',
        source: 'manual-dependency',
        subject: { type: 'monitor', id: String(serviceId) },
        observedAt: evaluatedAt,
        evaluatedAt,
        freshness: 'fresh',
        confidence: 'confirmed',
        summary: 'A manual dependency is recorded.',
        link: null,
        attributes: { dependsOnId },
      });
    }
  const evidence: EvidenceBundle = {
    version: 1,
    evaluatedAt,
    items: [
      ...used.values(),
      {
        id: 'gap:dependency-completeness',
        version: 1,
        kind: 'unknown',
        source: 'coverage-assessment',
        subject: { type: 'inventory', id: 'all' },
        observedAt: null,
        evaluatedAt,
        freshness: 'unknown',
        confidence: 'unknown',
        summary: 'The dependency graph may be incomplete.',
        link: null,
        missing: truncated
          ? ['unrecorded-dependencies', 'results-truncated']
          : ['unrecorded-dependencies'],
        attributes: {},
      },
    ],
  };
  return { paths, truncated, maxDepth, maxResults, evidence };
}
