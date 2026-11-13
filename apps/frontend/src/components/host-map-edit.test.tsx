import { Toaster, toast } from 'sonner';
// @vitest-environment happy-dom
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
import { DependencyPicker } from './dependency-picker';
import { chooseSelectOption } from '@/test-select';
import { HostImpactBanner } from './host-impact-banner';
import { setLocale } from '@/i18n';
import { offlineNodes, type HostInventories } from '@/lib/hosts';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}
beforeEach(() => {
  setLocale('en');
  setWidth(1280);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  HTMLElement.prototype.scrollTo = vi.fn() as never;
});
beforeEach(() => {
  render(<Toaster />);
});

afterEach(() => {
  toast.dismiss();
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
const services = [card(1, 'pihole', 100), card(2, 'jellyfin', 200, 'pve2'), card(3, 'notes')];
const connections = [{ id: 1, name: 'Lab' }];
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'online' },
    ],
    guests: [
      { vmid: 100, name: 'dns', type: 'lxc', node: 'pve1', status: 'running' },
      { vmid: 200, name: 'media', type: 'lxc', node: 'pve2', status: 'running' },
    ],
  },
};

function setup(over: { readOnly?: boolean; fail?: string | null } = {}) {
  const edit = {
    onLinkHost: vi.fn(async () => true),
    onAddDependency: vi.fn(async () => over.fail ?? null),
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
      statuses={{}}
      blockedIds={new Set()}
      dependencies={[{ serviceId: 2, dependsOnId: 1 }]}
      edit={over.readOnly ? undefined : edit}
      {...handlers}
    />,
  );
  return { edit, ...handlers };
}
const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, `) });

it('drags an unlinked service onto a guest and links it with the same body as the form', async () => {
  const { edit } = setup();
  expect(tile('notes').getAttribute('draggable')).toBe('true');
  // Already linked services are not dragged by accident; they use Change host.
  expect(tile('pihole').getAttribute('draggable')).toBe('false');
  fireEvent(tile('notes'), createEvent.dragStart(tile('notes'), { dataTransfer }));
  const guest = screen.getByRole('group', { name: 'media' });
  fireEvent.dragOver(guest);
  fireEvent.drop(guest);
  await waitFor(() => expect(edit.onLinkHost).toHaveBeenCalledTimes(1));
  expect(edit.onLinkHost).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), {
    connectionId: 1,
    node: 'pve2',
    vmid: 200,
    type: 'lxc',
  });
  expect(await screen.findByText('notes linked to media.')).toBeTruthy();
});

it('offers the non-drag alternative: select the service, then choose a host', async () => {
  const { edit } = setup();
  fireEvent.click(tile('notes'));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Change host' }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Choose host' }));
  fireEvent.click(await screen.findByRole('button', { name: /dns/ }));
  await waitFor(() => expect(edit.onLinkHost).toHaveBeenCalledTimes(1));
  // Identical to what dragging produces.
  expect(edit.onLinkHost).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), {
    connectionId: 1,
    node: 'pve1',
    vmid: 100,
    type: 'lxc',
  });
});

it('unlinks from the panel and reports a failed change without pretending it worked', async () => {
  const { edit } = setup();
  fireEvent.click(tile('pihole'));
  fireEvent.click(screen.getByRole('button', { name: 'Change host' }));
  fireEvent.click(screen.getByRole('button', { name: 'Unlink host' }));
  await waitFor(() =>
    expect(edit.onLinkHost).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), null),
  );
  expect(await screen.findByText('pihole unlinked from its host.')).toBeTruthy();
  edit.onLinkHost.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole('button', { name: 'Unlink host' }));
  expect(await screen.findByText('Could not change the host. Try again.')).toBeTruthy();
});

it('records a dependency by picking another service, and Escape cancels picking', async () => {
  const { edit } = setup();
  fireEvent.click(tile('notes'));
  fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
  expect(screen.getByText('Pick the service that notes depends on.')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
  expect(screen.queryByText('Pick the service that notes depends on.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
  fireEvent.click(tile('pihole'));
  await waitFor(() => expect(edit.onAddDependency).toHaveBeenCalledWith(3, 1));
  expect(await screen.findByText('notes now depends on pihole.')).toBeTruthy();
});

it('shows server errors for a dependency, such as a cycle', async () => {
  setup({ fail: 'This would create a circular dependency.' });
  fireEvent.click(tile('pihole'));
  fireEvent.click(screen.getByRole('button', { name: 'Add dependency' }));
  fireEvent.click(tile('jellyfin'));
  expect(await screen.findByText('This would create a circular dependency.')).toBeTruthy();
});

it('shows Depends on and Used by, labelled manual, and removes a dependency', async () => {
  const { edit } = setup();
  fireEvent.click(tile('jellyfin'));
  const panel = screen.getByRole('complementary', { name: 'Details' });
  expect(within(panel).getByText('Depends on (manual dependency)')).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'pihole' })).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Remove dependency on pihole' }));
  await waitFor(() => expect(edit.onRemoveDependency).toHaveBeenCalledWith(2, 1));
  cleanup();
  setup();
  fireEvent.click(tile('pihole'));
  const used = screen.getByRole('complementary', { name: 'Details' });
  expect(within(used).getByRole('button', { name: 'jellyfin' })).toBeTruthy();
});

it('is read-only on a phone and without edit access, keeping the form-based alternative', () => {
  setWidth(500);
  const phone = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Open the map anyway' }));
  expect(tile('notes').getAttribute('draggable')).toBe('false');
  fireEvent.click(tile('notes'));
  expect(screen.queryByRole('button', { name: 'Add dependency' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Choose host' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Change host' }));
  expect(phone.onChangeHost).toHaveBeenCalled();
  cleanup();
  setWidth(1280);
  setup({ readOnly: true });
  expect(tile('notes').getAttribute('draggable')).toBe('false');
});

it('adds and removes dependencies in the form without a pointer', async () => {
  const onChange = vi.fn();
  render(<DependencyPicker selfId={3} services={services} value={[1]} onChange={onChange} />);
  expect(screen.getByText('pihole')).toBeTruthy();
  // Self and already chosen services are not offered.
  const options = await chooseSelectOption('Depends on', 'jellyfin');
  expect(options).toEqual(['Choose a service', 'jellyfin']);
  expect(onChange).toHaveBeenCalledWith([1, 2]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove dependency on pihole' }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it('adds the manual dependency count to the offline banner as a secondary line', () => {
  const offlineInventories: HostInventories = {
    1: {
      ...(inventories[1] as Extract<HostInventories[number], { status: 'ready' }>),
      nodes: [
        { name: 'pve1', status: 'online' },
        { name: 'pve2', status: 'offline' },
      ],
    },
  };
  render(
    <HostImpactBanner
      nodes={offlineNodes(services, connections, offlineInventories)}
      onSeeImpact={() => {}}
      indirect={() => 2}
    />,
  );
  expect(screen.getByText('pve2 is offline. 1 service is affected.')).toBeTruthy();
  expect(
    screen.getByText('2 more may be affected through dependencies you recorded.'),
  ).toBeTruthy();
});

it('closes the details with a click on the empty canvas or Escape, but not on a tile', () => {
  setup();
  fireEvent.click(tile('pihole'));
  expect(screen.getByRole('complementary', { name: 'Details' })).toBeTruthy();
  fireEvent.click(tile('jellyfin'));
  expect(screen.getByRole('complementary', { name: 'Details' })).toBeTruthy();
  fireEvent.click(screen.getByRole('region', { name: 'Map of services by host' }));
  expect(screen.queryByRole('complementary', { name: 'Details' })).toBeNull();
  fireEvent.click(tile('pihole'));
  fireEvent.keyDown(screen.getByRole('region', { name: 'Map of services by host' }), {
    key: 'Escape',
  });
  expect(screen.queryByRole('complementary', { name: 'Details' })).toBeNull();
});
