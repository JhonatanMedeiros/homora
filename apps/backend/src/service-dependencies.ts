import type { DatabaseSync } from 'node:sqlite';

export const MAX_DEPENDENCIES_PER_SERVICE = 50;

export class DependencyError extends Error {
  constructor(
    readonly code:
      'service-not-found' | 'dependency-self' | 'dependency-cycle' | 'dependency-limit',
  ) {
    super(code);
    this.name = 'DependencyError';
  }
}

export type Dependency = { serviceId: number; dependsOnId: number };

/**
 * Manual "service A depends on service B" records. Homora's own data: nothing here reads or
 * writes to external systems. A new edge is rejected when it would close a cycle, so the stored graph is
 * always acyclic and traversals terminate (they still keep a visited set).
 */
export function createServiceDependencies(sqlite: DatabaseSync) {
  const exists = (id: number) =>
    Boolean(sqlite.prepare('SELECT id FROM services WHERE id=?').get(id));
  const dependsOn = sqlite.prepare(
    'SELECT depends_on_id AS id FROM service_dependencies WHERE service_id=?',
  );
  /** True when `from` already depends on `target`, directly or through other services. */
  function reaches(from: number, target: number) {
    const seen = new Set<number>();
    const stack = [from];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const row of dependsOn.all(current) as { id: number }[]) stack.push(row.id);
    }
    return false;
  }
  return {
    list(): Dependency[] {
      return sqlite
        .prepare(
          'SELECT service_id AS serviceId, depends_on_id AS dependsOnId FROM service_dependencies ORDER BY service_id, depends_on_id',
        )
        .all() as Dependency[];
    },
    /** Returns false when the record already existed. */
    add(serviceId: number, dependsOnId: number): boolean {
      if (serviceId === dependsOnId) throw new DependencyError('dependency-self');
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (!exists(serviceId) || !exists(dependsOnId))
          throw new DependencyError('service-not-found');
        if (
          sqlite
            .prepare('SELECT 1 FROM service_dependencies WHERE service_id=? AND depends_on_id=?')
            .get(serviceId, dependsOnId)
        ) {
          sqlite.exec('COMMIT');
          return false;
        }
        const count = sqlite
          .prepare('SELECT COUNT(*) AS n FROM service_dependencies WHERE service_id=?')
          .get(serviceId) as { n: number };
        if (count.n >= MAX_DEPENDENCIES_PER_SERVICE) throw new DependencyError('dependency-limit');
        if (reaches(dependsOnId, serviceId)) throw new DependencyError('dependency-cycle');
        sqlite
          .prepare(
            'INSERT INTO service_dependencies(service_id,depends_on_id,created_at) VALUES(?,?,?)',
          )
          .run(serviceId, dependsOnId, Date.now());
        sqlite.exec('COMMIT');
        return true;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    remove(serviceId: number, dependsOnId: number): boolean {
      return (
        sqlite
          .prepare('DELETE FROM service_dependencies WHERE service_id=? AND depends_on_id=?')
          .run(serviceId, dependsOnId).changes > 0
      );
    },
  };
}
