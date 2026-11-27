import { expect, it } from 'vitest';
import { potentialDependents } from './dependencies.js';
import { evidenceReferencesValid } from './evidence.js';

it('uses dependency direction, shortest paths, multiple roots and confirmed evidence', () => {
  const result = potentialDependents(
    [1],
    [
      { serviceId: 2, dependsOnId: 1 },
      { serviceId: 3, dependsOnId: 2 },
      { serviceId: 3, dependsOnId: 1 },
      { serviceId: 4, dependsOnId: 3 },
      { serviceId: 1, dependsOnId: 4 },
      { serviceId: 7, dependsOnId: 8 },
    ],
    '2026-01-01T00:00:00.000Z',
  );
  expect(result.paths).toEqual([
    [1, 2],
    [1, 3],
    [1, 3, 4],
  ]);
  expect(result.evidence.items.filter((item) => item.kind === 'fact')).toHaveLength(3);
  expect(evidenceReferencesValid(result.evidence)).toBe(true);
  expect(result.evidence.items.at(-1)).toMatchObject({
    kind: 'unknown',
    missing: ['unrecorded-dependencies'],
  });
  expect(
    potentialDependents(
      [1, 3],
      [
        { serviceId: 2, dependsOnId: 1 },
        { serviceId: 4, dependsOnId: 3 },
      ],
    ).paths,
  ).toEqual([
    [1, 2],
    [3, 4],
  ]);
});

it('reports depth and count limits and does not turn an empty graph into proof of no impact', () => {
  const chain = Array.from({ length: 10 }, (_, index) => ({
    serviceId: index + 2,
    dependsOnId: index + 1,
  }));
  const limited = potentialDependents([1], chain);
  expect(limited.paths).toHaveLength(8);
  expect(limited.truncated).toBe(true);
  expect(limited.evidence.items.at(-1)).toMatchObject({
    missing: ['unrecorded-dependencies', 'results-truncated'],
  });
  const many = potentialDependents(
    [1],
    Array.from({ length: 101 }, (_, index) => ({ serviceId: index + 2, dependsOnId: 1 })),
  );
  expect(many.paths).toHaveLength(100);
  expect(many.truncated).toBe(true);
  expect(potentialDependents([1], []).paths).toEqual([]);
});
