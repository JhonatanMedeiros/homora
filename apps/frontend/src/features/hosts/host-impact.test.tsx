// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HostLink, Service } from '@homora/shared';
import { HostImpactBanner } from './host-impact-banner';
import { HostView } from './host-view';
import { setLocale } from '@/i18n';
import { offlineNodes, type HostInventories } from '@/features/hosts/hosts';

beforeEach(() => {
  setLocale('en');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const connections = [{ id: 1, name: 'Lab' }];
const link = (vmid: number, node: string): HostLink => ({
  connectionId: 1,
  node,
  vmid,
  type: 'qemu',
});
const card = (id: number, name: string, host: HostLink): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host,
});
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'offline' },
    ],
    guests: [
      { vmid: 100, name: 'a', type: 'qemu', node: 'pve1', status: 'running' },
      { vmid: 200, name: 'b', type: 'qemu', node: 'pve2', status: 'running' },
      { vmid: 201, name: 'c', type: 'qemu', node: 'pve2', status: 'running' },
    ],
  },
};
const services = [
  card(1, 'one', link(100, 'pve1')),
  card(2, 'two', link(200, 'pve2')),
  card(3, 'three', link(201, 'pve2')),
];

it('announces an offline node with its affected count and opens the impact', () => {
  const onSeeImpact = vi.fn();
  render(
    <HostImpactBanner
      nodes={offlineNodes(services, connections, inventories)}
      onSeeImpact={onSeeImpact}
    />,
  );
  expect(screen.getByText('pve2 is offline. 2 services are affected.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'See impact' }));
  expect(onSeeImpact).toHaveBeenCalledWith(expect.objectContaining({ node: 'pve2' }));
});

it('shows no banner when nothing is offline or the inventory is unreadable', () => {
  const { container } = render(
    <HostImpactBanner
      nodes={offlineNodes(services, connections, { 1: { status: 'error' } })}
      onSeeImpact={() => {}}
    />,
  );
  expect(container.textContent).toBe('');
});

it('filters the Host view to one node and labels the affected services', () => {
  const onClear = vi.fn();
  render(
    <HostView
      services={services}
      connections={connections}
      inventories={inventories}
      statuses={{}}
      blockedIds={new Set()}
      nodeFilter={{ connectionId: 1, node: 'pve2' }}
      onClearFilter={onClear}
    />,
  );
  expect(screen.getByText(/Showing only pve2/)).toBeTruthy();
  expect(screen.queryByText('one')).toBeNull();
  expect(screen.getAllByText('Host offline')).toHaveLength(2);
  expect(screen.getByText(/Offline · 2 services · 2 affected/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show all hosts' }));
  expect(onClear).toHaveBeenCalled();
});

it('tells a down service on a running guest apart from an offline host', () => {
  render(
    <HostView
      services={services}
      connections={connections}
      inventories={inventories}
      statuses={{
        1: { status: 'unavailable', lastAttempt: null },
        2: { status: 'unavailable', lastAttempt: null },
      }}
      blockedIds={new Set()}
    />,
  );
  expect(screen.getAllByText('Service down')).toHaveLength(1);
  expect(screen.getAllByText('Host offline').length).toBeGreaterThan(0);
});
