import type { Service } from '@homora/shared';
import { expect, it } from 'vitest';
import { filterServices, parseQuery, score, sortServices } from './palette-search';

const svc = (id: number, name: string, category: string): Service =>
  ({
    id,
    name,
    category,
    url: `http://${name.toLowerCase()}.lan/`,
    description: '',
  }) as Service;

const services = [svc(1, 'Wiki', 'Casa'), svc(2, 'Proxmox', 'Infra'), svc(3, 'Grafana', 'Infra')];
const statuses = {
  1: { status: 'available' as const, lastAttempt: null },
  2: { status: 'unavailable' as const, lastAttempt: null },
};

it('parses status and group prefixes and keeps the remaining text', () => {
  expect(parseQuery('status:down')).toMatchObject({ status: 'unavailable', text: '' });
  expect(parseQuery('grupo:Infra graf')).toMatchObject({ group: 'Infra', text: 'graf' });
  expect(parseQuery('group:"Home Lab" status:up x')).toMatchObject({
    group: 'Home Lab',
    status: 'available',
    text: 'x',
  });
});

it('ignores a prefix that is still being typed and keeps unknown values as text', () => {
  expect(parseQuery('status:')).toMatchObject({ filtered: false, text: '' });
  expect(parseQuery('status:wat')).toMatchObject({ filtered: false, text: 'status:wat' });
});

it('status:down lists only unavailable services, treating no data as unknown', () => {
  const down = filterServices(services, statuses, new Set(), parseQuery('status:down'));
  expect(down.map((s) => s.id)).toEqual([2]);
  const unknown = filterServices(services, statuses, new Set(), parseQuery('status:unknown'));
  expect(unknown.map((s) => s.id)).toEqual([3]);
});

it('does not count unmonitored services as down and filters by group ignoring accents', () => {
  expect(filterServices(services, statuses, new Set([2]), parseQuery('status:down'))).toEqual([]);
  expect(filterServices(services, statuses, new Set(), parseQuery('grupo:infra')).length).toBe(2);
});

it('sorts by name or with unavailable first', () => {
  expect(sortServices(services, statuses, 'status').map((s) => s.id)).toEqual([2, 3, 1]);
  expect(sortServices(services, statuses, 'name').map((s) => s.id)).toEqual([3, 2, 1]);
  expect(sortServices(services, statuses, 'relevance')).toBe(services);
});

it('scores substrings above scattered letters, ignoring case and accents', () => {
  expect(score('Mídia Jellyfin', 'midia')).toBeGreaterThan(score('Mídia Jellyfin', 'mjf'));
  expect(score('Mídia Jellyfin', 'mjf')).toBeGreaterThan(0);
  expect(score('Wiki', 'zzz')).toBe(0);
  expect(score('Wiki', '')).toBe(1);
});
