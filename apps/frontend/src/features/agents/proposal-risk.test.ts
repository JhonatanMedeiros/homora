import { expect, it } from 'vitest';
import type { Diff } from './agent-model';
import { diffRisk, highestRisk, needsHold } from './proposal-risk';

it('treats ordinary service edits as low risk', () => {
  expect(diffRisk({ op: 'update', id: 1, service: { name: 'A' } })).toBe('low');
  expect(diffRisk({ op: 'create', service: { name: 'A' } })).toBe('low');
  expect(diffRisk({ kind: 'managed', change: { kind: 'group' } })).toBe('low');
});

it('flags changes that widen what Homora reaches or does', () => {
  expect(diffRisk({ op: 'create', service: { allowPrivate: true } })).toBe('attention');
  expect(diffRisk({ op: 'update', service: { checkInsecure: true } })).toBe('attention');
  expect(diffRisk({ kind: 'managed', change: { kind: 'maintenance' } })).toBe('attention');
  expect(diffRisk(null)).toBe('attention');
});

it('flags removals and agent access', () => {
  expect(diffRisk({ op: 'delete', id: 3 })).toBe('destructive');
  expect(diffRisk({ kind: 'agent', change: { op: 'revoke' } } as Diff)).toBe('destructive');
  expect(diffRisk({ kind: 'agent', change: { op: 'create' } } as Diff)).toBe('access');
  expect(diffRisk({ kind: 'managed', change: { kind: 'connection-setup' } })).toBe('access');
});

it('takes the most serious risk of a batch and holds only for the serious ones', () => {
  expect(highestRisk([])).toBe('low');
  expect(highestRisk(['low', 'attention', 'access'])).toBe('access');
  expect(highestRisk(['access', 'destructive'])).toBe('destructive');
  expect([needsHold('low'), needsHold('attention'), needsHold('access')]).toEqual([
    false,
    false,
    true,
  ]);
});
