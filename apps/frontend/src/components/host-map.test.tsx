// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Service } from '@homora/shared';
import { HostMap } from './host-map';
import { setLocale } from '@/i18n';
import { buildHostView, type HostInventories } from '@/lib/hosts';
import { MAP } from '@/lib/map-layout';

let reduce = false;
const scrollTo = vi.fn();
function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}
beforeEach(() => {
  setLocale('en');
  reduce = false;
  scrollTo.mockClear();
  setWidth(1280);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('reduced-motion'),
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  HTMLElement.prototype.scrollTo = scrollTo as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = (id: number, name: string, vmid?: number, node = 'pve1'): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host: vmid ? { connectionId: 1, node, vmid, type: 'lxc' } : null,
});
const services = [
  card(1, 'pihole', 100),
  card(2, 'adguard', 100),
  card(3, 'jellyfin', 200, 'pve2'),
  card(4, 'notes'),
];
const connections = [{ id: 1, name: 'Lab' }];
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'offline' },
    ],
    guests: [
      { vmid: 100, name: 'dns', type: 'lxc', node: 'pve1', status: 'running' },
      { vmid: 200, name: 'media', type: 'lxc', node: 'pve2', status: 'running' },
    ],
  },
};

function setup(patch: Partial<React.ComponentProps<typeof HostMap>> = {}) {
  const handlers = {
    onRefresh: vi.fn(),
    onListView: vi.fn(),
    onOpenCard: vi.fn(),
    onChangeHost: vi.fn(),
  };
  render(
    <HostMap
      services={services}
      connections={connections}
      inventories={inventories}
      statuses={{ 1: { status: 'available', lastAttempt: null } }}
      blockedIds={new Set()}
      {...handlers}
      {...patch}
    />,
  );
  return handlers;
}

it('renders nodes, guests and services, with the offline node written out and an unlinked container', () => {
  setup();
  const canvas = screen.getByRole('region', { name: 'Map of services by host' });
  expect(within(canvas).getByRole('region', { name: 'pve1' })).toBeTruthy();
  expect(within(canvas).getByRole('region', { name: 'pve2' })).toBeTruthy();
  expect(within(canvas).getByRole('region', { name: 'Not linked' })).toBeTruthy();
  expect(within(canvas).getByText(/Offline · 1 service · 1 affected/)).toBeTruthy();
  expect(within(canvas).getByRole('group', { name: 'dns' })).toBeTruthy();
});

it('positions guests and services relative to their containing node and guest', () => {
  setup();
  const node = screen.getByRole('region', { name: 'pve1' });
  const guest = within(node).getByRole('group', { name: 'dns' });
  const service = within(guest).getByRole('button', { name: /^pihole, / });

  expect(guest.getAttribute('style')).toContain(`left: ${MAP.nodePad}px`);
  expect(guest.getAttribute('style')).toContain(`top: ${MAP.nodeHeader}px`);
  expect(service.getAttribute('style')).toContain(`left: ${MAP.guestPad}px`);
  expect(service.getAttribute('style')).toContain(
    `top: ${MAP.guestHeader + MAP.serviceH + MAP.serviceGap}px`,
  );
});

it('visits services in the same order as the Host view, which is the DOM and focus order', () => {
  setup();
  const tiles = within(screen.getByRole('region', { name: 'Map of services by host' }))
    .getAllByRole('button', { pressed: false })
    .filter((button) => /, /.test(button.getAttribute('aria-label') ?? ''))
    .map((button) => button.getAttribute('aria-label')!.split(',')[0]);
  const host = buildHostView(services, connections, inventories);
  const expected = [
    ...host.nodes.flatMap((node) =>
      node.guests.flatMap((group) => group.services.map((service) => service.name)),
    ),
    ...host.unlinked.map((service) => service.name),
  ];
  expect(tiles).toEqual(expected);
});

it('selects a service with the keyboard-operable button and shows its details', () => {
  const handlers = setup();
  expect(screen.queryByRole('complementary', { name: 'Details' })).toBeNull();
  const tile = screen.getByRole('button', { name: /^jellyfin, / });
  fireEvent.click(tile);
  expect(tile.getAttribute('aria-pressed')).toBe('true');
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).getByText('jellyfin')).toBeTruthy();
  expect(within(panel).getByText('media · on pve2')).toBeTruthy();
  expect(within(panel).getByText('Host offline')).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Open card on Home' }));
  expect(handlers.onOpenCard).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Change host' }));
  expect(handlers.onChangeHost).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
});

it('shows the configured icon on the map and service details in the panel', () => {
  const detailed = { ...services[0]!, icon: 'brand:proxmox', description: 'DNS for the lab' };
  setup({ services: [detailed], cardDetails: () => ({ tags: ['network'] }) });
  const tile = screen.getByRole('button', { name: /^pihole, / });
  expect(tile.querySelector('img')?.getAttribute('src')).toContain('proxmox.svg');
  fireEvent.click(tile);
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).getByText('DNS for the lab')).toBeTruthy();
  expect(within(panel).getByText('network')).toBeTruthy();
});

it('selects a guest and lists its services', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /dns/ }));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).getByRole('button', { name: 'pihole' })).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'adguard' })).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Close details' }));
  expect(screen.queryByRole('complementary', { name: 'Details' })).toBeNull();
});

it('keeps zoom between 60% and 120%', () => {
  setup();
  const out = screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement;
  const zoomIn = screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement;
  for (let i = 0; i < 8; i++) fireEvent.click(out);
  expect(screen.getByText('Zoom 60%')).toBeTruthy();
  expect(out.disabled).toBe(true);
  for (let i = 0; i < 12; i++) fireEvent.click(zoomIn);
  expect(screen.getByText('Zoom 120%')).toBeTruthy();
  expect(zoomIn.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByText('Zoom 100%')).toBeTruthy();
});

it('does not animate recentering when the user prefers reduced motion', () => {
  reduce = true;
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Fit' }));
  expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));
  cleanup();
  reduce = false;
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }));
});

it('refreshes and links to the list view', () => {
  const handlers = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  const hostList = screen.getByRole('button', { name: 'Host list' });
  expect(hostList).toBeTruthy();
  fireEvent.click(hostList);
  expect(handlers.onRefresh).toHaveBeenCalled();
  expect(handlers.onListView).toHaveBeenCalled();
});

it('shows the phone notice under 768 px, with the list as the primary choice', () => {
  setWidth(500);
  const handlers = setup();
  expect(
    screen.getByText('The map is not optimized for phones yet. It works best on a larger screen.'),
  ).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Map of services by host' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Use the host list' }));
  expect(handlers.onListView).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open the map anyway' }));
  expect(screen.getByRole('region', { name: 'Map of services by host' })).toBeTruthy();
});

it('says there is nothing to map when no service is linked', () => {
  setup({ services: [card(4, 'notes')] });
  expect(screen.getByText(/nothing to map/)).toBeTruthy();
});
