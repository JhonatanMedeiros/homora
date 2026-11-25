// @vitest-environment happy-dom
import { Toaster, toast } from 'sonner';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Service } from '@homora/shared';
import { HostMap } from './host-map';
import { setLocale } from '@/i18n';
import type { HostInventories } from '@/features/hosts/hosts';
import type { ServiceStatus } from '@/lib/services';

const scrollTo = vi.fn();
beforeEach(() => {
  setLocale('en');
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  HTMLElement.prototype.scrollTo = scrollTo as never;
  scrollTo.mockClear();
  render(<Toaster />);
});
afterEach(() => {
  toast.dismiss();
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
  card(1, 'pihole', 100),
  card(2, 'adguard', 100),
  card(3, 'jellyfin', 200, { category: 'Media' }),
  card(4, 'notes'),
  card(5, 'vpn', undefined, { hostExternal: true }),
  card(6, 'idleapp', 300),
];
const up: ServiceStatus = { status: 'available', lastAttempt: null, latencyMs: 12 };
const down: ServiceStatus = { status: 'unavailable', lastAttempt: null, reason: 'no-response' };
const statuses: Record<number, ServiceStatus> = { 1: down, 2: up, 3: up, 4: up, 5: up, 6: up };
const connections = [{ id: 1, name: 'Lab' }];
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      {
        name: 'pve1',
        status: 'online',
        metrics: { cpu: 0.25, memory: { used: 4, total: 8 }, disk: { used: 1, total: 4 } },
      },
    ],
    guests: [
      {
        vmid: 100,
        name: 'dns',
        type: 'lxc',
        node: 'pve1',
        status: 'running',
        metrics: { cpu: 0.05, memory: { used: 1, total: 4 } },
      },
      { vmid: 200, name: 'media', type: 'lxc', node: 'pve1', status: 'running' },
      { vmid: 300, name: 'idle', type: 'lxc', node: 'pve1', status: 'stopped' },
    ],
  },
};

function setup(patch: Partial<React.ComponentProps<typeof HostMap>> = {}) {
  const edit = {
    onLinkHost: vi.fn(async () => true),
    onMarkExternal: vi.fn(async () => true),
    onAddDependency: vi.fn(async () => null),
    onRemoveDependency: vi.fn(async () => null),
    connectionsLoaded: true,
    onReload: vi.fn(),
  };
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
      statuses={statuses}
      blockedIds={new Set()}
      edit={edit}
      {...handlers}
      {...patch}
    />,
  );
  return { edit, ...handlers };
}
const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, `) });
const canvas = () => screen.getByRole('region', { name: 'Map of services by host' });
const guestToggle = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`services of ${name}$`) });

it('has a toolbar with search, filters with counts, grouping and the display switches', () => {
  setup({ dependencies: [{ serviceId: 2, dependsOnId: 1 }] });
  const bar = screen.getByRole('toolbar', { name: 'Map filters' });
  expect(within(bar).getByRole('searchbox', { name: 'Find a service or guest' })).toBeTruthy();
  const filters = within(bar).getByRole('radiogroup', { name: 'Show' });
  expect(within(filters).getByRole('radio', { name: /^All\s*6$/ })).toBeTruthy();
  expect(within(filters).getByRole('radio', { name: /^Problems\s*1$/ })).toBeTruthy();
  // Not linked counts the services that still need a host: the external one does not.
  expect(within(filters).getByRole('radio', { name: /^Not linked\s*1$/ })).toBeTruthy();
  expect(within(bar).getByRole('radio', { name: 'Host' }).getAttribute('aria-checked')).toBe(
    'true',
  );
  expect(within(bar).getByRole('switch', { name: 'Connections' })).toBeTruthy();
  expect(within(bar).getByRole('switch', { name: 'Collapse healthy' })).toBeTruthy();
  expect(within(bar).getByText('Arrow: depends on')).toBeTruthy();
});

it('shows state, a health summary and load meters on hosts and guests, with the state in words', () => {
  setup();
  const node = within(canvas()).getByRole('region', { name: 'pve1' });
  expect(within(node).getByText('Degraded')).toBeTruthy();
  expect(within(node).getByText(/3 guests/)).toBeTruthy();
  expect(within(node).getByText(/1 offline/)).toBeTruthy();
  // Metrics are shown when the inventory has them and left out when it does not.
  expect(within(node).getAllByText('CPU').length).toBe(2);
  expect(within(node).getByText('Disk')).toBeTruthy();
  const dns = within(node).getByRole('group', { name: 'dns' });
  expect(within(dns).getByText('5%')).toBeTruthy();
  const media = within(node).getByRole('group', { name: 'media' });
  expect(within(media).queryByText('CPU')).toBeNull();
  // A stopped guest is flagged, with how many of its services are online.
  const idle = within(node).getByRole('group', { name: 'idle' });
  expect(within(idle).getByText('Stopped', { exact: false })).toBeTruthy();
  expect(within(dns).getByText('1/2 online')).toBeTruthy();
});

it('writes the state on a failing tile and shows latency for a healthy one', () => {
  setup();
  expect(within(tile('pihole')).getByText('Offline')).toBeTruthy();
  expect(within(tile('adguard')).getByText('12 ms')).toBeTruthy();
  // The healthy word is kept for screen readers only.
  expect(within(tile('adguard')).getByText('Online').className).toContain('sr-only');
});

it('collapses and mutes what is healthy in Problems, and says so when nothing is wrong', () => {
  setup();
  fireEvent.click(screen.getByRole('radio', { name: /^Problems/ }));
  expect(guestToggle('media').getAttribute('aria-expanded')).toBe('false');
  expect(guestToggle('dns').getAttribute('aria-expanded')).toBe('true');
  // The services of a collapsed guest are still reachable in the list, never dropped.
  expect(within(canvas()).queryByRole('button', { name: /^jellyfin, / })).toBeNull();
  expect(screen.queryByText(/No problems right now/)).toBeNull();
  cleanup();
  setup({ statuses: { ...statuses, 1: up } });
  fireEvent.click(screen.getByRole('radio', { name: /^Problems/ }));
  expect(screen.getByText(/No problems right now/)).toBeTruthy();
});

it('finds services ignoring accents, keeps everything on the map, and clears with Esc', () => {
  setup();
  const search = screen.getByRole('searchbox', { name: 'Find a service or guest' });
  fireEvent.change(search, { target: { value: 'JELLY' } });
  expect(tile('jellyfin').className).toContain('border-primary');
  expect(tile('adguard').className).toContain('border-dashed');
  fireEvent.keyDown(search, { key: 'Escape' });
  expect((search as HTMLInputElement).value).toBe('');
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(screen.getByText('Nothing matches “zzz”.')).toBeTruthy();
});

it('focuses the search with / unless a field already has the keys', () => {
  setup();
  const search = screen.getByRole('searchbox', { name: 'Find a service or guest' });
  fireEvent.keyDown(window, { key: '/' });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: 'a' } });
  fireEvent.keyDown(search, { key: '/' });
  expect((search as HTMLInputElement).value).toBe('a');
});

it('collapses healthy guests with the saved preference and lets a hand choice win', () => {
  setup();
  fireEvent.click(screen.getByRole('switch', { name: 'Collapse healthy' }));
  expect(localStorage.getItem('homora-collapse-healthy')).toBe('on');
  expect(guestToggle('media').getAttribute('aria-expanded')).toBe('false');
  expect(guestToggle('dns').getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(guestToggle('media'));
  expect(guestToggle('media').getAttribute('aria-expanded')).toBe('true');
  expect(within(canvas()).getByRole('button', { name: /^jellyfin, / })).toBeTruthy();
});

it('groups by dashboard group with the same tiles', () => {
  setup();
  fireEvent.click(screen.getByRole('radio', { name: 'Group' }));
  expect(within(canvas()).getByRole('region', { name: 'Home' })).toBeTruthy();
  const media = within(canvas()).getByRole('region', { name: 'Media' });
  expect(within(media).getByRole('button', { name: /^jellyfin, / })).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Collapse healthy' }).dataset.disabled).toBe('');
});

it('draws dependency arrows only when asked and remembers the choice', () => {
  setup({ dependencies: [{ serviceId: 2, dependsOnId: 1 }] });
  expect(canvas().querySelector('svg path[marker-end]')).toBeTruthy();
  fireEvent.click(screen.getByRole('switch', { name: 'Connections' }));
  expect(canvas().querySelector('svg path[marker-end]')).toBeNull();
  expect(localStorage.getItem('homora-map-connections')).toBe('off');
  cleanup();
  setup({ dependencies: [{ serviceId: 2, dependsOnId: 1 }] });
  expect(canvas().querySelector('svg path[marker-end]')).toBeNull();
  expect(screen.getByRole('switch', { name: 'Connections' }).getAttribute('aria-checked')).toBe(
    'false',
  );
});

it('turns the arrow red when what a service depends on is down', () => {
  setup({ dependencies: [{ serviceId: 2, dependsOnId: 1 }] });
  expect(canvas().querySelector('svg path[marker-end]')?.getAttribute('class')).toContain(
    'text-destructive',
  );
});

function mockSuggestions(body: object, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => body }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const suggestion = (serviceId: number, strength: 'strong' | 'medium', ambiguous = false) => ({
  serviceId,
  candidates: [
    {
      host: { connectionId: 1, node: 'pve1', vmid: 100, type: 'lxc' },
      name: 'dns',
      status: 'running',
      strength,
      ambiguous,
      evidence: [{ kind: 'config-address', address: '10.0.0.5' }],
    },
  ],
});

it('looks for matches only on request, shows them on the tile and links the strong ones with undo', async () => {
  const fetchMock = mockSuggestions({
    suggestions: [suggestion(4, 'strong')],
    unavailableConnections: [],
  });
  const { edit } = setup();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /^Link \d+ suggested/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Find matches' }));
  expect(await screen.findByText('Suggested: dns')).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Link 1 suggested' }));
  await waitFor(() => expect(edit.onLinkHost).toHaveBeenCalledTimes(1));
  expect(edit.onLinkHost).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }), {
    connectionId: 1,
    node: 'pve1',
    vmid: 100,
    type: 'lxc',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(edit.onLinkHost).toHaveBeenLastCalledWith(expect.objectContaining({ id: 4 }), null),
  );
});

it('never links a medium or ambiguous match in bulk, but offers it on the service', async () => {
  mockSuggestions({
    suggestions: [suggestion(4, 'medium')],
    unavailableConnections: [],
  });
  const { edit } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Find matches' }));
  expect(await screen.findByText('Suggested: dns')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Link \d+ suggested/ })).toBeNull();
  fireEvent.click(tile('notes'));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).getByText(/Possible match: dns/)).toBeTruthy();
  expect(within(panel).getByRole('list', { name: 'Evidence' })).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Link to dns' }));
  await waitFor(() => expect(edit.onLinkHost).toHaveBeenCalledTimes(1));
});

it('reports a failed lookup without inventing results', async () => {
  mockSuggestions({}, false);
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Find matches' }));
  expect(await screen.findByText('Could not look for matches. Try again.')).toBeTruthy();
  expect(screen.queryByText(/^Suggested:/)).toBeNull();
});

it('dismisses a suggestion for one service and can undo it', async () => {
  const fetchMock = mockSuggestions({
    suggestions: [suggestion(4, 'medium')],
    unavailableConnections: [],
  });
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Find matches' }));
  await screen.findByText('Suggested: dns');
  fireEvent.click(tile('notes'));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss suggestion' }));
  await waitFor(() => expect(screen.queryByText('Suggested: dns')).toBeNull());
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  const dismissal = calls.find(([url]) => url.includes('host-suggestion-dismissal'))!;
  expect(JSON.parse(dismissal[1].body as string)).toMatchObject({ dismissed: true });
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  await screen.findByText('Suggested: dns');
});

it('keeps external services in their own container and moves them with buttons or by dropping', async () => {
  const { edit } = setup();
  const external = within(canvas()).getByRole('region', { name: 'External' });
  expect(within(external).getByRole('button', { name: /^vpn, / })).toBeTruthy();
  fireEvent.click(within(external).getByRole('button', { name: /^vpn, / }));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Move to Not linked' }));
  await waitFor(() =>
    expect(edit.onMarkExternal).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), false),
  );
  fireEvent.click(tile('notes'));
  fireEvent.click(
    within(screen.getByRole('complementary', { name: 'Details' })).getByRole('button', {
      name: 'Mark as external',
    }),
  );
  await waitFor(() =>
    expect(edit.onMarkExternal).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }), true),
  );
  expect(await screen.findByText('notes marked as external.')).toBeTruthy();
  // The drag equivalent drops the tile on the External container.
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
  fireEvent(tile('notes'), createEvent.dragStart(tile('notes'), { dataTransfer }));
  fireEvent.dragOver(external);
  fireEvent.drop(external);
  await waitFor(() => expect(edit.onMarkExternal).toHaveBeenCalledTimes(3));
});

it('says what is wrong in the panel: an alert with how long it has been down', () => {
  setup({ downSince: () => Date.now() - 5 * 60_000 });
  fireEvent.click(tile('pihole'));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  const alert = within(panel).getByRole('alert');
  expect(within(alert).getByText('Needs attention')).toBeTruthy();
  expect(within(alert).getByText(/down since/)).toBeTruthy();
  // Every action is read-only toward the infrastructure.
  expect(within(panel).getByRole('link', { name: 'Open service' })).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'Open card on Home' })).toBeTruthy();
  expect(within(panel).queryByRole('button', { name: /restart|logs/i })).toBeNull();
});

it('shows a calm panel for a healthy service, with where it runs and what it is reached through', () => {
  setup({
    dependencies: [
      { serviceId: 3, dependsOnId: 2 },
      { serviceId: 2, dependsOnId: 1 },
    ],
  });
  fireEvent.click(tile('jellyfin'));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).queryByRole('alert')).toBeNull();
  expect(within(panel).getByText('media · on pve1')).toBeTruthy();
  const chain = within(panel).getByText('Reached through').parentElement!;
  expect(
    within(chain)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['pihole', '→adguard', '→jellyfin']);
});

it('summarises a guest in the panel with its load and services', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /^dns/ }));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).getByText('Load')).toBeTruthy();
  expect(within(panel).getByText('2 services')).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'pihole' }));
  expect(
    within(screen.getByRole('complementary', { name: 'Details' })).getByRole('alert'),
  ).toBeTruthy();
});

it('moves the view when the minimap is pressed, and hides it from assistive technology', () => {
  setup();
  const minimap = document.querySelector('[data-homora="host-map-minimap"]') as HTMLElement;
  expect(minimap.getAttribute('aria-hidden')).toBe('true');
  minimap.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 176, height: 108, right: 176, bottom: 108 }) as DOMRect;
  fireEvent.pointerDown(minimap, { clientX: 80, clientY: 50, pointerId: 1 });
  expect(scrollTo).toHaveBeenCalled();
});

it('warns when an inventory could not be read and never shows that host as offline', () => {
  setup({ inventories: { 1: { status: 'error' } } });
  expect(screen.getByText(/could not be read/)).toBeTruthy();
  const unavailable = within(canvas()).getByRole('region', { name: 'Host unavailable' });
  expect(within(unavailable).queryByText('Offline', { selector: '[class*="badge"]' })).toBeNull();
  expect(within(canvas()).queryByRole('region', { name: 'pve1' })).toBeNull();
});
