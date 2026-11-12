import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { createMcp } from './mcp.js';
import { createIntegrationConnections } from './integration-connections.js';
import { createProposalService } from './proposals.js';
import { createServiceConfiguration } from './service-configuration.js';
import { agentAddresses, configAddresses, usableAddress } from './proxmox-inventory.js';
import { cardAddresses, rankSuggestions, type GuestFacts } from './host-suggestions.js';
import { getAuthorizedResponse } from './network-request.js';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

const guest = (vmid: number, patch: Partial<GuestFacts> = {}): GuestFacts => ({
  connectionId: 1,
  node: 'pve1',
  vmid,
  type: 'lxc',
  name: `ct${vmid}`,
  status: 'running',
  config: [],
  agent: [],
  ...patch,
});

it('parses static addresses and guest-agent addresses, ignoring dhcp, loopback and link-local', () => {
  expect(
    configAddresses('lxc', {
      net0: 'name=eth0,bridge=vmbr0,ip=192.168.1.5/24,gw=192.168.1.1,ip6=fd00::5/64',
      net1: 'name=eth1,ip=dhcp',
      memory: 512,
    }),
  ).toEqual(['192.168.1.5', 'fd00::5']);
  expect(
    configAddresses('qemu', { ipconfig0: 'ip=10.0.0.7/24,gw=10.0.0.1', net0: 'ip=1.1.1.1' }),
  ).toEqual(['10.0.0.7']);
  expect(configAddresses('lxc', null)).toEqual([]);
  expect(
    agentAddresses({
      result: [
        { name: 'lo', 'ip-addresses': [{ 'ip-address': '127.0.0.1' }] },
        {
          name: 'eth0',
          'ip-addresses': [{ 'ip-address': '10.0.0.7' }, { 'ip-address': 'fe80::1' }],
        },
      ],
    }),
  ).toEqual(['10.0.0.7']);
  expect(usableAddress('169.254.1.1')).toBeNull();
  expect(usableAddress('nope')).toBeNull();
});

it('ranks by independent signals: strong, medium, none, never by name', () => {
  const cards = [
    { id: 1, addresses: ['10.0.0.7'] },
    { id: 2, addresses: ['10.0.0.8'] },
    { id: 3, addresses: ['10.0.0.9'] },
    { id: 4, addresses: [] },
  ];
  const guests = [
    guest(100, { type: 'qemu', config: ['10.0.0.7'], agent: ['10.0.0.7'] }),
    guest(101, { config: ['10.0.0.8'] }),
    // Same name as the card, but no signal: not a candidate.
    guest(102, { name: 'service-3' }),
  ];
  const [strong, medium, none, empty] = rankSuggestions(cards, guests);
  expect(strong.candidates[0]).toMatchObject({ strength: 'strong', host: { vmid: 100 } });
  expect(strong.candidates[0].evidence.map((item) => item.kind)).toEqual([
    'config-address',
    'guest-agent',
  ]);
  expect(medium.candidates[0]).toMatchObject({ strength: 'medium', host: { vmid: 101 } });
  expect(none.candidates).toEqual([]);
  expect(empty.candidates).toEqual([]);
});

it('counts a Docker association as a separate signal and flags conflicting evidence', () => {
  const [docker] = rankSuggestions(
    [{ id: 1, addresses: ['10.0.0.7'] }],
    [guest(100, { config: ['10.0.0.7'], dockerServiceIds: [1] })],
  );
  expect(docker.candidates[0].strength).toBe('strong');
  const [tie] = rankSuggestions(
    [{ id: 1, addresses: ['10.0.0.7'] }],
    [
      guest(100, { config: ['10.0.0.7'], agent: ['10.0.0.7'] }),
      guest(101, { config: ['10.0.0.7'], agent: ['10.0.0.7'] }),
    ],
  );
  expect(tie.candidates.map((item) => [item.strength, item.ambiguous])).toEqual([
    ['medium', true],
    ['medium', true],
  ]);
  const [wins] = rankSuggestions(
    [{ id: 1, addresses: ['10.0.0.7'] }],
    [
      guest(100, { config: ['10.0.0.7'], agent: ['10.0.0.7'] }),
      guest(101, { config: ['10.0.0.7'] }),
    ],
  );
  expect(wins.candidates[0]).toMatchObject({ strength: 'strong', ambiguous: false });
});

it('does not suggest a dismissed guest for that card only', () => {
  const guests = [guest(100, { config: ['10.0.0.7'] })];
  const cards = [
    { id: 1, addresses: ['10.0.0.7'] },
    { id: 2, addresses: ['10.0.0.7'] },
  ];
  const [one, two] = rankSuggestions(cards, guests, new Set(['1:1:lxc:100']));
  expect(one.candidates).toEqual([]);
  expect(two.candidates).toHaveLength(1);
});

it('uses the outbound policy for hostnames and treats a block as no signal', async () => {
  const resolver = vi.fn(async () => [{ address: '192.168.1.5', family: 4 }]);
  // IP literal: no lookup at all.
  expect(
    await cardAddresses({ url: 'http://10.0.0.7:8080/', allowPrivate: false }, resolver),
  ).toEqual(['10.0.0.7']);
  expect(resolver).not.toHaveBeenCalled();
  // Hostname resolving to a private address without authorization: policy blocks, no signal.
  expect(await cardAddresses({ url: 'http://pihole.lan/', allowPrivate: false }, resolver)).toEqual(
    [],
  );
  // Authorized by the card itself: the address becomes a signal.
  expect(await cardAddresses({ url: 'http://pihole.lan/', allowPrivate: true }, resolver)).toEqual([
    '192.168.1.5',
  ]);
  // Failed lookup: absent, no error.
  const failing = vi.fn(async () => {
    throw new Error('ENOTFOUND');
  });
  expect(await cardAddresses({ url: 'http://gone.lan/', allowPrivate: true }, failing)).toEqual([]);
  expect(await cardAddresses({ url: 'not a url', allowPrivate: true }, resolver)).toEqual([]);
});

const resources = [
  { type: 'node', node: 'pve1', status: 'online' },
  { type: 'lxc', vmid: 101, name: 'dns', node: 'pve1', status: 'running' },
  { type: 'qemu', vmid: 100, name: 'nas', node: 'pve1', status: 'running' },
];
function mockProxmox(agentAllowed: boolean) {
  vi.mocked(getAuthorizedResponse).mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    const reply = (data: unknown, status = 200) => ({ status, body: JSON.stringify({ data }) });
    if (path.endsWith('/cluster/resources')) return reply(resources);
    if (path.endsWith('/lxc/101/config')) return reply({ net0: 'name=eth0,ip=10.0.0.7/24' });
    if (path.endsWith('/qemu/100/config')) return reply({ ipconfig0: 'ip=10.0.0.9/24' });
    if (path.endsWith('/qemu/100/agent/network-get-interfaces'))
      return agentAllowed
        ? reply({ result: [{ name: 'eth0', 'ip-addresses': [{ 'ip-address': '10.0.0.9' }] }] })
        : { status: 403, body: '{}' };
    return { status: 404, body: '{}' };
  });
}

it('suggests, dismisses, undoes and accepts through the API with a session only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-suggest-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  try {
    const connection = (
      await send('POST', '/api/connections', {
        type: 'proxmox',
        name: 'Lab',
        url: 'https://pve.example:8006',
        tokenId: 'user@pve!homora',
        secret: 's',
        allowPrivate: true,
      })
    ).json();
    const make = async (name: string, url: string) =>
      (await send('POST', '/api/services', { name, url, category: 'Home' })).json().id as number;
    const dns = await make('Pi-hole', 'http://10.0.0.7/');
    const nas = await make('NAS', 'http://10.0.0.9:5000/');
    const orphan = await make('Orphan', 'http://10.9.9.9/');
    const byName = await make('dns', 'http://10.8.8.8/');

    mockProxmox(true);
    expect((await app.inject({ method: 'GET', url: '/api/host-suggestions' })).statusCode).toBe(
      401,
    );
    const proxmoxCalls = () =>
      vi
        .mocked(getAuthorizedResponse)
        .mock.calls.filter((call) => String(call[0]).includes('pve.example'));
    expect(proxmoxCalls()).toHaveLength(0);
    const first = (await send('GET', '/api/host-suggestions')).json();
    const forCard = (id: number) =>
      first.suggestions.find((item: { serviceId: number }) => item.serviceId === id);
    expect(forCard(dns).candidates[0]).toMatchObject({ strength: 'medium', host: { vmid: 101 } });
    expect(forCard(nas).candidates[0]).toMatchObject({ strength: 'strong', host: { vmid: 100 } });
    // A card named like a guest, or with no matching address, only offers manual linking.
    expect(forCard(orphan).candidates).toEqual([]);
    expect(forCard(byName).candidates).toEqual([]);

    // Without guest-agent access (read-only token) the strong case degrades to medium.
    await send('PUT', `/api/connections/${connection.id}`, { name: 'Lab 2' });
    mockProxmox(false);
    const degraded = (await send('GET', '/api/host-suggestions?x=1')).json();
    expect(
      degraded.suggestions.find((item: { serviceId: number }) => item.serviceId === nas)
        .candidates[0].strength,
    ).toBe('medium');

    const host = { connectionId: connection.id, node: 'pve1', vmid: 101, type: 'lxc' };
    const dismissal = (dismissed: boolean) =>
      send('PUT', `/api/services/${dns}/host-suggestion-dismissal`, { host, dismissed });
    expect((await dismissal(true)).statusCode).toBe(200);
    const after = (await send('GET', '/api/host-suggestions')).json();
    expect(
      after.suggestions.find((item: { serviceId: number }) => item.serviceId === dns).candidates,
    ).toEqual([]);
    expect((await dismissal(false)).statusCode).toBe(200);
    expect(
      (await send('GET', '/api/host-suggestions'))
        .json()
        .suggestions.find((item: { serviceId: number }) => item.serviceId === dns).candidates,
    ).toHaveLength(1);
    expect(
      (await send('PUT', '/api/services/999/host-suggestion-dismissal', { host, dismissed: true }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await send('PUT', `/api/services/${dns}/host-suggestion-dismissal`, {
          host,
          dismissed: 'yes',
        })
      ).statusCode,
    ).toBe(400);

    // Accepting writes only Homora's link; a linked card is no longer suggested.
    expect((await send('PUT', `/api/services/${dns}/host`, { host })).statusCode).toBe(200);
    expect(
      (await send('GET', '/api/host-suggestions'))
        .json()
        .suggestions.some((item: { serviceId: number }) => item.serviceId === dns),
    ).toBe(false);
    // Only GET calls reached Proxmox.
    expect(proxmoxCalls().length).toBeGreaterThan(0);
    for (const call of proxmoxCalls())
      expect(JSON.stringify(call[2] ?? {})).not.toMatch(/"method":"(POST|PUT|DELETE)"/);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('lets an agent propose a link only with scopes and server-computed evidence, then audits it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-suggest-mcp-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const sqlite = getSqliteHandle(db.db);
  const vault = createVault(path);
  const connections = createIntegrationConnections(db.db, vault);
  const connection = await connections.createConnection({
    type: 'proxmox',
    name: 'Lab',
    url: 'https://pve.example:8006',
    tokenId: 'user@pve!homora',
    secret: 's',
    allowPrivate: true,
  });
  const configuration = createServiceConfiguration(sqlite);
  const card = configuration.createService({
    name: 'Pi-hole',
    url: 'http://10.0.0.7/',
    category: 'Home',
  });
  const other = configuration.createService({
    name: 'Other',
    url: 'http://10.1.1.1/',
    category: 'Home',
  });
  const proposals = createProposalService(sqlite, configuration);
  mockProxmox(true);
  const connect = async (scopes: string[]) => {
    const identity = proposals.issue('agent-' + scopes.join('-'), scopes as never);
    const server = createMcp(sqlite, { token: identity.token, connections });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    return client;
  };
  const text = (value: unknown) => (value as { content: { text: string }[] }).content[0].text;
  try {
    const readOnly = await connect(['hosts:read']);
    const listed = JSON.parse(
      text(await readOnly.callTool({ name: 'list_host_suggestions', arguments: {} })),
    );
    expect(listed.suggestions).toHaveLength(1);
    expect(listed.suggestions[0].candidates[0].evidence[0]).toContain('10.0.0.7');
    const input = {
      serviceId: card.id,
      connectionId: connection.id,
      node: 'pve1',
      vmid: 101,
      type: 'lxc',
    };
    // The read scope cannot propose; a scope-less agent cannot even read.
    expect((await readOnly.callTool({ name: 'propose_host_link', arguments: input })).isError).toBe(
      true,
    );
    const none = await connect(['services:read']);
    expect((await none.callTool({ name: 'list_host_suggestions', arguments: {} })).isError).toBe(
      true,
    );

    const proposer = await connect(['hosts:propose']);
    // No independent evidence for this card/guest pair: refused, nothing stored.
    expect(
      (
        await proposer.callTool({
          name: 'propose_host_link',
          arguments: { ...input, serviceId: other.id },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await proposer.callTool({
          name: 'propose_host_link',
          arguments: { ...input, vmid: 100, type: 'qemu' },
        })
      ).isError,
    ).toBe(true);
    const created = await proposer.callTool({ name: 'propose_host_link', arguments: input });
    expect(created.isError, text(created)).not.toBe(true);
    const proposal = JSON.parse(text(created));
    expect(proposal.diff.change).toMatchObject({
      kind: 'host-link',
      change: { op: 'link', serviceId: card.id, strength: 'medium' },
    });
    expect(proposal.diff.change.change.evidence[0]).toContain('10.0.0.7');
    // Nothing is applied before a human decides, and the proposal is audited.
    expect(configuration.listHosts().size).toBe(0);
    expect(
      sqlite
        .prepare("SELECT result FROM audit_events WHERE action='proposal' AND proposal_id=?")
        .get(proposal.id),
    ).toEqual({ result: 'created' });
    proposals.decide(proposal.id, true, 'human');
    expect(configuration.listHosts().get(card.id)).toEqual({
      connectionId: connection.id,
      node: 'pve1',
      vmid: 101,
      type: 'lxc',
    });
    expect(
      sqlite
        .prepare("SELECT result FROM audit_events WHERE action='review' AND proposal_id=?")
        .get(proposal.id),
    ).toBeTruthy();
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
