// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { HostLink } from '@homora/shared';
import { HostPicker } from './host-picker';
import { HostView } from './host-view';
import { setLocale } from '@/i18n';
import type { HostInventories } from '@/lib/hosts';
import { chooseSelectOption } from '@/test-select';

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
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'online' },
    ],
    guests: [
      { vmid: 101, name: 'pihole', type: 'lxc', node: 'pve1', status: 'running' },
      { vmid: 100, name: 'nas', type: 'qemu', node: 'pve1', status: 'stopped' },
      { vmid: 200, name: 'media', type: 'qemu', node: 'pve2', status: 'running' },
    ],
  },
};

function setup(value: HostLink | null = null, data = inventories) {
  const onChange = vi.fn();
  render(
    <HostPicker
      value={value}
      onChange={onChange}
      connections={connections}
      connectionsLoaded
      inventories={data}
      onReload={() => {}}
    />,
  );
  return onChange;
}

it('searches guests by name or id and links the chosen one with the keyboard-reachable buttons', () => {
  const onChange = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
  const list = screen.getByRole('list', { name: 'Guests' });
  expect(within(list).getAllByRole('button')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Search guests'), { target: { value: 'pi' } });
  expect(within(list).getAllByRole('button')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Search guests'), { target: { value: '200' } });
  fireEvent.click(within(list).getByRole('button', { name: /media/ }));
  expect(onChange).toHaveBeenCalledWith({
    connectionId: 1,
    node: 'pve2',
    vmid: 200,
    type: 'qemu',
  });
});

it('filters by node and shows an empty note when nothing matches', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Choose host' }));
  await chooseSelectOption('Node', 'pve2');
  const guests = screen.getByRole('list', { name: 'Guests' });
  expect(within(guests).getAllByRole('button', { pressed: false })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Search guests'), { target: { value: 'zzz' } });
  expect(screen.getByText('No guests match.')).toBeTruthy();
});

it('shows the current guest name, unlinks, and says "Host not found" for a vanished guest', () => {
  const onChange = setup({ connectionId: 1, node: 'pve1', vmid: 101, type: 'lxc' });
  expect(screen.getByText(/pihole/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Unlink host' }));
  expect(onChange).toHaveBeenCalledWith(null);
  cleanup();
  setup({ connectionId: 1, node: 'pve1', vmid: 555, type: 'lxc' });
  expect(screen.getByText('Host not found')).toBeTruthy();
});

it('points to Integrations when there is no Proxmox connection', () => {
  render(
    <HostPicker
      value={null}
      onChange={() => {}}
      connections={[]}
      connectionsLoaded
      inventories={{}}
      onReload={() => {}}
    />,
  );
  expect(screen.getByText(/Add a Proxmox connection/)).toBeTruthy();
});

it('renders the Host view with node sections, an unlinked section and "Host not found"', () => {
  const card = (id: number, name: string, host: HostLink | null) => ({
    id,
    name,
    url: `https://${name}.test`,
    category: 'Home',
    description: '',
    host,
  });
  render(
    <HostView
      services={[
        card(1, 'pihole', { connectionId: 1, node: 'pve1', vmid: 101, type: 'lxc' }),
        card(2, 'lost', { connectionId: 1, node: 'pve1', vmid: 999, type: 'lxc' }),
        card(3, 'notes', null),
      ]}
      connections={connections}
      inventories={inventories}
      statuses={{}}
      blockedIds={new Set()}
    />,
  );
  expect(screen.getByRole('button', { name: /pve1/ })).toBeTruthy();
  expect(screen.getByText('Not linked')).toBeTruthy();
  expect(screen.getByText('Host not found', { selector: 'h2' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /notes/ })).toBeTruthy();
});
