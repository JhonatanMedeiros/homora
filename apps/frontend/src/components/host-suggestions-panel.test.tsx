// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Service } from '@homora/shared';
import { HostSuggestionsPanel } from './host-suggestions-panel';
import { ManagedProposalChange } from '@/features/agents/managed-proposal-change';
import { setLocale } from '@/i18n';

const card = (id: number, name: string): Service => ({
  id,
  name,
  url: `http://${name}.test`,
  category: 'Home',
  description: '',
});
const services = [card(1, 'Pi-hole'), card(2, 'NAS'), card(3, 'Notes')];
const candidate = (vmid: number, strength: 'strong' | 'medium') => ({
  host: { connectionId: 1, node: 'pve1', vmid, type: 'lxc' as const },
  name: `guest${vmid}`,
  status: 'running',
  strength,
  evidence:
    strength === 'strong'
      ? [
          { kind: 'config-address', address: '10.0.0.7' },
          { kind: 'guest-agent', address: '10.0.0.7' },
        ]
      : [{ kind: 'config-address', address: '10.0.0.8' }],
  ambiguous: false,
});
const suggestions = {
  suggestions: [
    { serviceId: 1, candidates: [candidate(101, 'strong')] },
    { serviceId: 2, candidates: [candidate(102, 'medium')] },
    { serviceId: 3, candidates: [] },
  ],
  unavailableConnections: [],
};
let calls: { url: string; method: string; body: unknown }[];

beforeEach(() => {
  setLocale('en');
  calls = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method)
        calls.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
      return url === '/api/host-suggestions'
        ? new Response(JSON.stringify(suggestions))
        : new Response('{}');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const onChanged = vi.fn();
  const onChooseManually = vi.fn();
  render(
    <HostSuggestionsPanel
      open
      onOpenChange={() => {}}
      services={services}
      onChanged={onChanged}
      onChooseManually={onChooseManually}
    />,
  );
  return { onChanged, onChooseManually };
}

it('shows strength with text and the evidence, and only offers manual linking without evidence', async () => {
  const { onChooseManually } = setup();
  expect(await screen.findByText('Strong')).toBeTruthy();
  expect(screen.getByText('Medium')).toBeTruthy();
  expect(screen.getByText(/Address 10.0.0.7 is set in the guest configuration/)).toBeTruthy();
  expect(screen.getByText('Not enough evidence')).toBeTruthy();
  // Nothing is written just by opening the panel.
  expect(calls).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Choose host manually' }));
  expect(onChooseManually).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
});

it('accepts, then undoes, writing only the Homora link', async () => {
  const { onChanged } = setup();
  await screen.findByText('Strong');
  fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
  await screen.findByText('Linked to guest101');
  expect(calls).toEqual([
    {
      url: '/api/services/1/host',
      method: 'PUT',
      body: { host: { connectionId: 1, node: 'pve1', vmid: 101, type: 'lxc' } },
    },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(calls[1]).toMatchObject({ url: '/api/services/1/host', body: { host: null } }),
  );
  expect(onChanged).toHaveBeenCalled();
});

it('dismisses and restores a suggestion, remembering it per card and guest', async () => {
  setup();
  await screen.findByText('Medium');
  fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]);
  await screen.findByText('Dismissed guest102');
  expect(calls[0]).toMatchObject({
    url: '/api/services/2/host-suggestion-dismissal',
    body: { dismissed: true, host: { vmid: 102 } },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(calls[1].body).toMatchObject({ dismissed: false }));
});

it('accepts the selected suggestions in one action', async () => {
  setup();
  await screen.findByText('Strong');
  const accept = screen.getByRole('button', { name: /Accept selected \(0\)/ }) as HTMLButtonElement;
  expect(accept.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pi-hole' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select NAS' }));
  fireEvent.click(screen.getByRole('button', { name: 'Accept selected (2)' }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls.map((call) => call.url)).toEqual(['/api/services/1/host', '/api/services/2/host']);
});

it('reports a failed read and a failed save without applying anything', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 502 })),
  );
  setup();
  expect(await screen.findByText(/Could not read suggestions/)).toBeTruthy();
});

it('shows the evidence computed by Homora for an agent host-link proposal', () => {
  render(
    <ManagedProposalChange
      diff={{
        kind: 'managed',
        change: {
          kind: 'host-link',
          change: {
            op: 'link',
            serviceId: 1,
            host: { connectionId: 1, node: 'pve1', vmid: 101, type: 'lxc' },
            strength: 'medium',
            evidence: ['The service address 10.0.0.7 is configured on the guest.'],
          },
        },
        before: { services: [{ id: 1, name: 'Pi-hole', host_connection_id: null }] },
      }}
    />,
  );
  expect(screen.getByText('Host link suggestion')).toBeTruthy();
  expect(screen.getByText(/The service address 10.0.0.7/)).toBeTruthy();
  expect(screen.getByText('Medium')).toBeTruthy();
  expect(screen.getByText(/Proxmox is never changed/)).toBeTruthy();
});
