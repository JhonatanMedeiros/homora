// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Service } from '@homora/shared';
import { HostView } from './host-view';
import { HostMap } from './host-map';
import { setLocale } from '@/i18n';
import type { HostInventories } from '@/features/hosts/hosts';
import type { ServiceStatus } from '@/lib/services';

beforeEach(() => {
  setLocale('en');
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  HTMLElement.prototype.scrollTo = vi.fn() as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = (id: number, name: string, vmid?: number, patch: Partial<Service> = {}): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host: vmid ? { connectionId: 1, node: 'pve1', vmid, type: 'lxc' } : null,
  ...patch,
});
const services = [
  card(1, 'alpha', 100),
  card(2, 'bravo', 100),
  card(3, 'charlie', 100),
  card(4, 'notes'),
  card(5, 'vpn', undefined, { hostExternal: true }),
];
const up: ServiceStatus = { status: 'available', lastAttempt: null };
const down: ServiceStatus = { status: 'unavailable', lastAttempt: null, reason: 'no-response' };
const statuses: Record<number, ServiceStatus> = { 1: up, 2: up, 3: down, 4: up, 5: up };
const connections = [{ id: 1, name: 'Lab' }];
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [{ name: 'pve1', status: 'online' }],
    guests: [{ vmid: 100, name: 'dns', type: 'lxc', node: 'pve1', status: 'running' }],
  },
};
const props = { services, connections, inventories, statuses, blockedIds: new Set<number>() };
const names = () =>
  screen
    .getAllByRole('listitem')
    .map((item) => /alpha|bravo|charlie|notes|vpn/.exec(item.textContent ?? '')?.[0])
    .filter(Boolean);

it('lists services marked external in their own section, before Not linked', () => {
  render(<HostView {...props} />);
  const external = screen.getByText('External');
  const unlinked = screen.getByText('Not linked');
  expect(
    external.compareDocumentPosition(unlinked) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText('vpn')).toBeTruthy();
});

it('keeps name order by default and puts failing services first when asked', () => {
  render(<HostView {...props} />);
  expect(names().slice(0, 3)).toEqual(['alpha', 'bravo', 'charlie']);
  cleanup();
  render(<HostView {...props} problemsFirst />);
  expect(names().slice(0, 3)).toEqual(['charlie', 'alpha', 'bravo']);
});

it('gives the map the same service order as the list when problems come first', () => {
  render(<HostView {...props} problemsFirst />);
  const list = names();
  cleanup();
  localStorage.setItem('homora-problems-first', 'on');
  render(
    <HostMap
      {...props}
      onRefresh={vi.fn()}
      onListView={vi.fn()}
      onOpenCard={vi.fn()}
      onChangeHost={vi.fn()}
    />,
  );
  const mapped = screen
    .getAllByRole('button', { pressed: false })
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((label) => /^(alpha|bravo|charlie|notes|vpn), /.test(label))
    .map((label) => label.split(',')[0]);
  expect(mapped).toEqual(list);
});
