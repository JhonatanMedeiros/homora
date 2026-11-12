import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  runAdapterContract,
  assertBounded,
  assertRequestIsSafe,
  HOSTILE_PATH_VALUES,
} from './adapter-contract.js';
import {
  adguardManifest,
  homeAssistantManifest,
  jellyfinManifest,
  speedtestTrackerManifest,
  uptimeKumaManifest,
} from '@homora/shared';
import { createManifestAdapter } from './manifest-adapter.js';
import { createProxmoxConnectionAdapter } from './proxmox-connection.js';
import { integrationRegistry } from './integration-registry.js';

const fixtureDir = new URL('./fixtures/', import.meta.url);
function fixture(path: string): unknown {
  const file = JSON.parse(readFileSync(new URL(path, fixtureDir), 'utf8')) as {
    _source?: { docs?: string; note?: string };
    body: unknown;
  };
  if (!file._source?.docs || !file._source.note) throw new Error(`Fixture ${path} lacks a source.`);
  return file.body;
}
const long = 'x'.repeat(5000);
const urlCases = (extra: string[] = []) => [
  ...[
    'not a url',
    'file:///etc/passwd',
    'ftp://example.test',
    'javascript:alert(1)',
    `https://${long}.test`,
    ...extra,
  ].map((url) => ({ label: `URL ${url.slice(0, 40)}`, url })),
  { label: 'credentials in URL', url: 'https://user:pass@example.test' },
  { label: 'query string', url: 'https://example.test/?key=secret' },
  { label: 'fragment', url: 'https://example.test/#x' },
];

const jellyfin = fixture('jellyfin/system-info-public.json') as Record<string, unknown>;
runAdapterContract({
  name: 'jellyfin',
  create: (transport) => createManifestAdapter(jellyfinManifest, transport),
  validConfig: { url: 'https://jelly.example.test' },
  secrets: [],
  invalidConfigs: [...urlCases(), { label: 'missing url', url: undefined }]
    .map(({ label, url }) => ({ label, config: { url } }))
    .concat([{ label: 'null config', config: null as never }]),
  fixtures: {
    valid: { body: jellyfin, expected: { name: 'Server', version: '10.10.3' } },
    wrongShape: [
      { label: 'no fields', body: {} },
      { label: 'numeric name', body: { ServerName: 42, Version: '1' } },
    ],
    oversized: [
      { label: 'long name', body: { ServerName: long, Version: '1' } },
      { label: 'long version', body: { ServerName: 'a', Version: long } },
    ],
  },
  authenticated: false,
});

const token = 'ha-token-SECRET123';
runAdapterContract({
  name: 'home-assistant',
  create: (transport) => createManifestAdapter(homeAssistantManifest, transport),
  validConfig: { url: 'https://ha.example.test', secret: token, entityId: 'sensor.temperature' },
  secrets: [token],
  invalidConfigs: [
    ...urlCases(['http://ha.example.test', 'https://ha.example.test/sub']).map(
      ({ label, url }) => ({
        label,
        config: { url, secret: token, entityId: 'sensor.temperature' },
      }),
    ),
    {
      label: 'empty token',
      config: { url: 'https://ha.example.test', secret: '', entityId: 'sensor.a' },
    },
    {
      label: 'token with whitespace',
      config: { url: 'https://ha.example.test', secret: 'a b', entityId: 'sensor.a' },
    },
    {
      label: 'oversized token',
      config: { url: 'https://ha.example.test', secret: long, entityId: 'sensor.a' },
    },
    {
      label: 'oversized entity',
      config: {
        url: 'https://ha.example.test',
        secret: token,
        entityId: `sensor.${'a'.repeat(300)}`,
      },
    },
  ],
  pathFields: ['entityId'],
  fixtures: {
    valid: {
      body: fixture('home-assistant/state.json'),
      expected: {
        entityId: 'sensor.temperature',
        state: '21.5',
        lastUpdated: '2026-01-01T10:00:00+00:00',
      },
    },
    wrongShape: [
      { label: 'other entity', body: { entity_id: 'sensor.other', state: '1' } },
      { label: 'numeric state', body: { entity_id: 'sensor.temperature', state: 1 } },
    ],
    oversized: [
      {
        label: 'long state',
        body: { entity_id: 'sensor.temperature', state: long.repeat(1) + 'y' },
      },
    ],
    echoSecret: (secret) => ({ entity_id: 'sensor.temperature', state: `leak ${secret}` }),
  },
});

runAdapterContract({
  name: 'uptime-kuma',
  create: (transport) => createManifestAdapter(uptimeKumaManifest, transport),
  validConfig: { url: 'https://kuma.example.test', slug: 'home' },
  secrets: [],
  invalidConfigs: [
    ...urlCases(['https://kuma.example.test/sub']).map(({ label, url }) => ({
      label,
      config: { url, slug: 'home' },
    })),
    {
      label: 'oversized slug',
      config: { url: 'https://kuma.example.test', slug: 'a'.repeat(101) },
    },
  ],
  pathFields: ['slug'],
  fixtures: {
    valid: {
      body: fixture('uptime-kuma/heartbeat.json'),
      expected: { up: 1, down: 1, pending: 1, maintenance: 1, unknown: 1 },
    },
    wrongShape: [
      { label: 'no list', body: {} },
      { label: 'list is array', body: { heartbeatList: [] } },
      { label: 'monitor not array', body: { heartbeatList: { a: 1 } } },
    ],
    oversized: [],
  },
  authenticated: false,
});

const password = 'adguard-pass-SECRET456';
runAdapterContract({
  name: 'adguard-home',
  create: (transport) => createManifestAdapter(adguardManifest, transport),
  validConfig: { url: 'https://adguard.example.test', username: 'admin', secret: password },
  secrets: [password],
  invalidConfigs: [
    ...urlCases(['http://adguard.example.test']).map(({ label, url }) => ({
      label,
      config: { url, username: 'admin', secret: password },
    })),
    {
      label: 'username with colon',
      config: { url: 'https://adguard.example.test', username: 'a:b', secret: password },
    },
    {
      label: 'empty password',
      config: { url: 'https://adguard.example.test', username: 'admin', secret: '' },
    },
    {
      label: 'control char in password',
      config: { url: 'https://adguard.example.test', username: 'admin', secret: 'a\nb' },
    },
    {
      label: 'oversized username',
      config: { url: 'https://adguard.example.test', username: long, secret: password },
    },
  ],
  fixtures: {
    valid: {
      body: fixture('adguard-home/status.json'),
      expected: { running: true, protectionEnabled: true, version: 'v0.107.52' },
    },
    wrongShape: [
      { label: 'no fields', body: {} },
      { label: 'string flag', body: { running: 'yes', protection_enabled: true, version: '1' } },
    ],
    oversized: [
      { label: 'long version', body: { running: true, protection_enabled: true, version: long } },
    ],
    echoSecret: (secret) => ({ running: true, protection_enabled: true, version: secret }),
  },
});

const speedtestToken = '1|speedtest-SECRET321';
runAdapterContract({
  name: 'speedtest-tracker',
  create: (transport) => createManifestAdapter(speedtestTrackerManifest, transport),
  validConfig: { url: 'https://speedtest.example.test', secret: speedtestToken },
  secrets: [speedtestToken],
  invalidConfigs: [
    ...urlCases(['http://speedtest.example.test']).map(({ label, url }) => ({
      label,
      config: { url, secret: speedtestToken },
    })),
    { label: 'empty token', config: { url: 'https://speedtest.example.test', secret: '' } },
    {
      label: 'token with whitespace',
      config: { url: 'https://speedtest.example.test', secret: 'a b' },
    },
    { label: 'oversized token', config: { url: 'https://speedtest.example.test', secret: long } },
  ],
  fixtures: {
    valid: {
      body: fixture('speedtest-tracker/results-latest.json'),
      expected: { download: '98.77 Mbps', upload: '18.77 Mbps', ping: 12.345 },
    },
    wrongShape: [
      { label: 'no fields', body: {} },
      {
        label: 'numeric human text',
        body: { download_bits_human: 1, upload_bits_human: 'x', ping: 1 },
      },
      {
        label: 'wrapped in data',
        body: { data: { download_bits_human: 'a', upload_bits_human: 'b', ping: 1 } },
      },
      {
        label: 'string ping',
        body: { download_bits_human: 'a', upload_bits_human: 'b', ping: '1' },
      },
    ],
    oversized: [
      {
        label: 'long download text',
        body: { download_bits_human: long, upload_bits_human: 'b', ping: 1 },
      },
      { label: 'huge ping', body: { download_bits_human: 'a', upload_bits_human: 'b', ping: 1e9 } },
    ],
    echoSecret: (secret) => ({ download_bits_human: secret, upload_bits_human: 'b', ping: 1 }),
  },
});

const proxmoxToken = 'proxmox-SECRET789';
runAdapterContract({
  name: 'proxmox',
  create: createProxmoxConnectionAdapter,
  validConfig: {
    url: 'https://pve.example.test:8006',
    tokenId: 'root@pam!homora',
    secret: proxmoxToken,
  },
  secrets: [proxmoxToken],
  invalidConfigs: [
    ...urlCases(['http://pve.example.test']).map(({ label, url }) => ({
      label,
      config: { url, tokenId: 'root@pam!homora', secret: proxmoxToken },
    })),
    {
      label: 'malformed token id',
      config: { url: 'https://pve.example.test', tokenId: 'nope', secret: proxmoxToken },
    },
    {
      label: 'empty secret',
      config: { url: 'https://pve.example.test', tokenId: 'root@pam!homora', secret: '' },
    },
    {
      label: 'oversized secret',
      config: {
        url: 'https://pve.example.test',
        tokenId: 'root@pam!homora',
        secret: 'a'.repeat(513),
      },
    },
  ],
  fixtures: {
    valid: {
      body: fixture('proxmox/cluster-resources.json'),
      expected: {
        vms: { running: 1, total: 1 },
        containers: { running: 0, total: 1 },
        cpu: 50,
        memory: 50,
        disk: 10,
      },
    },
    wrongShape: [
      { label: 'no data', body: {} },
      { label: 'data not array', body: { data: {} } },
    ],
    oversized: [],
  },
  // The shared transport only throws fixed strings; the Proxmox adapter passes them through.
  sanitizesTransportErrors: false,
});

describe('contract coverage', () => {
  it('lists no secrets and exposes only type, label and capabilities', () => {
    for (const entry of integrationRegistry.list())
      expect(Object.keys(entry).sort()).toEqual(['capabilities', 'label', 'type']);
  });
  it('has a contract run for every registered integration type', () => {
    const covered = [
      'jellyfin',
      'home-assistant',
      'uptime-kuma',
      'adguard-home',
      'speedtest-tracker',
      'proxmox',
    ];
    expect(
      integrationRegistry
        .list()
        .map(({ type }) => type)
        .sort(),
    ).toEqual([...covered].sort());
  });
  it('requires a source on every fixture', () => {
    for (const dir of readdirSync(fixtureDir))
      for (const file of readdirSync(new URL(`${dir}/`, fixtureDir)))
        expect(() => fixture(`${dir}/${file}`)).not.toThrow();
  });
  it('helper rejects unsafe requests and unbounded output', () => {
    expect(() => assertRequestIsSafe({ origin: 'https://a.test', path: '/a/../b' }, [])).toThrow();
    expect(() => assertRequestIsSafe({ origin: 'https://a.test', path: '/a b' }, [])).toThrow();
    expect(() =>
      assertRequestIsSafe({ origin: 'https://a.test', path: '/a', method: 'POST' } as never, []),
    ).toThrow();
    expect(() => assertBounded({ a: 'x'.repeat(5000) })).toThrow();
    expect(HOSTILE_PATH_VALUES.length).toBeGreaterThan(10);
  });
});
