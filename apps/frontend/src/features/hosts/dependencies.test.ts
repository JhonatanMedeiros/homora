import { expect, it } from 'vitest';
import { dependentsOf, dependsOn, impairedUpstream, usedBy, type Dependency } from './dependencies';
import type { Impact } from './hosts';

const services = [1, 2, 3, 4, 5].map((id) => ({ id }));
// 3 depends on 2, 2 depends on 1, 4 depends on 1, 5 depends on nothing.
const deps: Dependency[] = [
  { serviceId: 3, dependsOnId: 2 },
  { serviceId: 2, dependsOnId: 1 },
  { serviceId: 4, dependsOnId: 1 },
];

it('reads both directions of a dependency', () => {
  expect(dependsOn(3, deps)).toEqual([2]);
  expect(usedBy(1, deps)).toEqual([2, 4]);
});

it('marks services that depend, even indirectly, on an impaired one', () => {
  const impacts = new Map<number, Impact>([[1, 'host-offline']]);
  const result = impairedUpstream(services, deps, impacts);
  expect([...result.entries()]).toEqual([
    [2, [1]],
    [3, [1]],
    [4, [1]],
  ]);
  expect(impairedUpstream(services, deps, new Map([[1, 'ok']])).size).toBe(0);
  expect(impairedUpstream(services, deps, new Map([[1, 'unknown']])).size).toBe(0);
  expect(impairedUpstream(services, [], impacts).size).toBe(0);
});

it('lists the nearest impaired upstream first and counts a stopped guest and a down service', () => {
  const impacts = new Map<number, Impact>([
    [1, 'service-down'],
    [2, 'guest-stopped'],
  ]);
  expect(impairedUpstream(services, deps, impacts).get(3)).toEqual([2, 1]);
});

it('never loops on a cycle that bypassed validation', () => {
  const cyclic: Dependency[] = [
    { serviceId: 1, dependsOnId: 2 },
    { serviceId: 2, dependsOnId: 1 },
  ];
  const impacts = new Map<number, Impact>([[2, 'host-offline']]);
  expect(impairedUpstream(services, cyclic, impacts).get(1)).toEqual([2]);
  expect(dependentsOf([1], cyclic)).toEqual([2]);
});

it('finds everything that may break when some services stop', () => {
  expect(dependentsOf([1], deps).sort()).toEqual([2, 3, 4]);
  expect(dependentsOf([5], deps)).toEqual([]);
  expect(dependentsOf([1, 2], deps).sort()).toEqual([3, 4]);
});
