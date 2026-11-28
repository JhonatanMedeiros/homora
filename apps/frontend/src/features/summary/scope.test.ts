import { describe, expect, it } from 'vitest';
import { scopedHealth, servicesInScope, type ScopeSources } from './scope';

const service = (id: number, category: string) => ({
  id,
  name: `S${id}`,
  url: `http://s${id}.lan/`,
  category,
  description: '',
  position: id,
});
const data = {
  services: [service(1, 'Media'), service(2, 'Infra'), service(3, 'Media')],
  statuses: {
    1: { status: 'available', latencyMs: 20 },
    2: { status: 'unavailable', reason: 'no-response' },
    3: { status: 'unavailable', reason: 'no-response' },
  },
  blockedIds: new Set<number>(),
  statusError: false,
  pages: [
    { id: 1, name: 'Home' },
    { id: 2, name: 'Lab' },
  ],
  pageIdOf: (category: string) => (category === 'Infra' ? 2 : 1),
} as unknown as ScopeSources['data'];

const input = {
  data,
  sources: {
    overview: null,
    attention: { marks: {} },
    clock: Date.now(),
    probeList: { probes: [{ id: -1, name: 'NAS', checkType: 'ping', address: 'nas.lan' }] },
  },
  health: { entries: [] },
  area: { hostData: { connections: [], inventories: {} }, model: { impacts: new Map() } },
} as unknown as ScopeSources;

const ids = (config: Parameters<typeof servicesInScope>[1]) =>
  servicesInScope(data, config).map((item) => item.id);

describe('scope of a Summary widget', () => {
  it('chooses by group and page together, never widening on a missing name', () => {
    expect(ids({ groups: ['Media'] })).toEqual([1, 3]);
    expect(ids({ pages: ['Lab'] })).toEqual([2]);
    expect(ids({ groups: ['Media'], pages: ['Lab'] })).toEqual([]);
    expect(ids({ groups: ['Gone'] })).toEqual([]);
  });

  it('keeps the whole reading when nothing was chosen', () => {
    const whole = scopedHealth(input, {});
    expect(whole.scoped).toBe(false);
    expect(whole.health).toBe(input.health);
  });

  it('counts only the chosen services, without probes', () => {
    const { health, services } = scopedHealth(input, { groups: ['Media'] });
    expect(services).toHaveLength(2);
    expect(health.downNow.map((item) => item.id)).toEqual([3]);
    expect(health.countsWithProbes).toMatchObject({ all: 2, down: 1 });
    expect(health.allProbes).toEqual([]);
  });
});
