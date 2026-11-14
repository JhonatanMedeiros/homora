import { describe, expect, it, vi } from 'vitest';
import {
  integrationDefinitions,
  jellyfinManifest,
  uptimeKumaManifest,
  type IntegrationManifest,
} from '@homora/shared';
import { assertValidDefinition } from './integration-test-support.js';
import { createManifestAdapter, createManifestRegistration } from './integration-test-support.js';
import { integrationRegistry } from './integration-registry.js';
import { createIntegrationRegistry, type IntegrationTransport } from './integrations.js';
import { integrationTypes, publicFieldKeys } from './integration-fields.js';
import { connectionSetupSchema } from './managed-proposals.js';
import { createConnectionSchema } from './input-schemas.js';

type Writable<T> = { -readonly [K in keyof T]: Writable<T[K]> };
type Draft = Writable<IntegrationManifest>;
const clone = (manifest: IntegrationManifest) => structuredClone(manifest) as unknown as Draft;
const base = clone(uptimeKumaManifest);
const broken = (change: (manifest: Draft) => void) => {
  const manifest = clone(base);
  change(manifest);
  return manifest as IntegrationManifest;
};

describe('manifest schema', () => {
  it('accepts every built-in definition', () => {
    for (const definition of integrationDefinitions)
      expect(() => assertValidDefinition(definition)).not.toThrow();
  });
  const cases: [string, (manifest: Draft) => void][] = [
    ['unknown brand icon', (m) => void (m.brandIcon = 'no-such-icon')],
    ['placeholder that is not a text field', (m) => void (m.requests[0]!.path = '/x/{secret}')],
    ['placeholder for an unknown field', (m) => void (m.requests[0]!.path = '/x/{nope}')],
    ['dot segments in a path', (m) => void (m.requests[0]!.path = '/a/../b')],
    ['query string inside the path', (m) => void (m.requests[0]!.path = '/a?x=1')],
    ['fragment in the path', (m) => void (m.requests[0]!.path = '/a#x')],
    ['expression-like template', (m) => void (m.requests[0]!.path = '/a/{slug.length}')],
    [
      'non-GET style extra key',
      (m) => void ((m.requests[0] as Record<string, unknown>).method = 'POST'),
    ],
    ['status outside 2xx', (m) => void (m.requests[0]!.expectStatus = 500)],
    ['body limit above the transport cap', (m) => void (m.requests[0]!.maxBodyBytes = 3_000_000)],
    [
      'unknown request id in an extraction',
      (m) => void ((m.extract[0] as { request?: string }).request = 'x'),
    ],
    [
      'prototype path segment',
      (m) => void ((m.extract[0] as { path: unknown[] }).path = ['__proto__']),
    ],
    ['display reading an unknown value', (m) => void (m.display.summary.text = '{nope}')],
    ['duplicate field', (m) => void m.fields.push({ ...m.fields[0]! })],
    [
      'reserved text key',
      (m) =>
        void m.fields.push({ key: 'ca', kind: 'text', label: 'x', required: false, maxLength: 5 }),
    ],
    ['invalid pattern', (m) => void (m.fields[1]!.pattern = '(')],
    ['unknown error code', (m) => void (m.fields[1]!.errorCode = 'made-up-code')],
    ['auth without a secret field', (m) => void (m.auth = { type: 'bearer' })],
    ['unknown auth type', (m) => void ((m as { auth: unknown }).auth = { type: 'cookie' })],
    [
      'unknown extraction op',
      (m) => void (m.extract as unknown[]).push({ op: 'eval', out: 'x', code: '1' }),
    ],
    [
      'unbounded string pick',
      (m) =>
        void (m.extract as unknown[]).push({ op: 'pick', out: 'x', path: ['a'], type: 'string' }),
    ],
    [
      'unbounded number pick',
      (m) =>
        void (m.extract as unknown[]).push({ op: 'pick', out: 'x', path: ['a'], type: 'number' }),
    ],
  ];
  for (const [label, change] of cases)
    it(`rejects ${label}`, () => {
      expect(() => assertValidDefinition(broken(change))).toThrow(/Invalid integration definition/);
    });
  it('fails registry creation for an invalid manifest, not at request time', () => {
    expect(() =>
      createIntegrationRegistry([
        createManifestRegistration(broken((m) => void (m.brandIcon = 'x'))),
      ]),
    ).toThrow();
  });
});

describe('template injection', () => {
  const hostile = [
    '../x',
    'a/b',
    'a?b=1',
    'a#b',
    'a%2fb',
    'a b',
    'a\nb',
    '%00',
    '{slug}',
    "a'b",
    'a;b',
  ];
  for (const slug of hostile)
    it(`never lets ${JSON.stringify(slug)} reach a request path`, async () => {
      const transport = vi.fn(async () => ({ status: 200, body: { heartbeatList: {} } }));
      const adapter = createManifestAdapter(uptimeKumaManifest, transport);
      await expect(adapter.collect({ url: 'https://k.test', slug })).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    });
  it('encodes values that pass a permissive pattern', async () => {
    const manifest = clone(base);
    manifest.fields[1]!.pattern = '[^\\s]+';
    const transport = vi.fn<IntegrationTransport>(async () => ({
      status: 200,
      body: { heartbeatList: {}, publicGroupList: [] },
    }));
    await createManifestAdapter(manifest, transport).collect({
      url: 'https://k.test',
      slug: 'a/../b?c#d',
    });
    expect(transport.mock.calls[0]![0].path).toBe('/api/status-page/heartbeat/a%2F..%2Fb%3Fc%23d');
  });
});

describe('interpreter bounds', () => {
  const run = (manifest: IntegrationManifest, config: Record<string, string>, body: unknown) =>
    createManifestAdapter(manifest, async () => ({ status: 200, body })).collect(config);
  const extract = (step: IntegrationManifest['extract'][number], body: unknown) => {
    const manifest = { ...clone(jellyfinManifest), extract: [step] };
    manifest.display = { summary: { text: 'x' }, stats: [{ label: 'x', value: 'x' }] };
    return run(manifest, { url: 'https://j.test' }, body);
  };
  it('rejects numbers outside their bounds and non-finite numbers', async () => {
    const step = { op: 'pick', out: 'n', path: ['n'], type: 'integer', min: 0, max: 10 } as const;
    await expect(extract(step, { n: 5 })).resolves.toEqual({ n: 5 });
    for (const n of [-1, 11, 1.5, Infinity, '5', null])
      await expect(extract(step, { n })).rejects.toThrow();
  });
  it('counts, sums and takes the last element within limits', async () => {
    await expect(
      extract(
        { op: 'count', out: 'c', path: ['a'], where: { path: ['s'], equals: 'on' } },
        { a: [{ s: 'on' }, { s: 'off' }, { s: 'on' }] },
      ),
    ).resolves.toEqual({ c: 2 });
    await expect(
      extract(
        { op: 'sum', out: 's', path: ['a'], field: ['v'], max: 10 },
        { a: [{ v: 4 }, { v: 5 }] },
      ),
    ).resolves.toEqual({ s: 9 });
    await expect(
      extract(
        { op: 'sum', out: 's', path: ['a'], field: ['v'], max: 10 },
        { a: [{ v: 6 }, { v: 5 }] },
      ),
    ).rejects.toThrow();
    await expect(
      extract(
        { op: 'last', out: 'l', path: ['a'], field: ['v'], type: 'string', maxLength: 3 },
        { a: [{ v: 'x' }, { v: 'abc' }] },
      ),
    ).resolves.toEqual({ l: 'abc' });
    await expect(
      extract(
        { op: 'last', out: 'l', path: ['a'], field: ['v'], type: 'string', maxLength: 3 },
        { a: [] },
      ),
    ).rejects.toThrow();
    await expect(
      extract({ op: 'count', out: 'c', path: ['a'], max: 1 }, { a: [1, 2] }),
    ).rejects.toThrow();
  });
  it('maps states through a closed table and never partially succeeds', async () => {
    const step = {
      op: 'state',
      out: 's',
      path: ['v'],
      states: { ok: ['good', 1] },
      other: 'unknown',
    } as const;
    await expect(extract(step, { v: 'good' })).resolves.toEqual({ s: 'ok' });
    await expect(extract(step, { v: 'whatever' })).resolves.toEqual({ s: 'unknown' });
    await expect(
      extract({ op: 'pick', out: 'n', path: ['missing'], type: 'string', maxLength: 5 }, { v: 1 }),
    ).rejects.toThrow('Invalid response');
  });
  it('does not read inherited properties', async () => {
    await expect(
      extract({ op: 'pick', out: 'x', path: ['toString'], type: 'string', maxLength: 50 }, {}),
    ).rejects.toThrow();
  });
  it('rejects a secret reflected by the remote service', async () => {
    const manifest = clone(
      integrationDefinitions.find((d) => d.type === 'home-assistant') as IntegrationManifest,
    );
    await expect(
      run(
        manifest,
        { url: 'https://h.test', entityId: 'sensor.a', secret: 'abc123' },
        { entity_id: 'sensor.a', state: 'x abc123 y' },
      ),
    ).rejects.toThrow();
  });
});

describe('registry as the single source of truth', () => {
  it('describes every type with fields and display, and no request rules or secrets', () => {
    const described = integrationRegistry.describe();
    expect(described.map(({ type }) => type)).toEqual(integrationTypes);
    for (const entry of described) {
      expect(entry).toHaveProperty('fields');
      expect(JSON.stringify(entry)).not.toMatch(/requests|extract|"path"/);
    }
  });
  it('keeps the stored public keys that existing installations use', () => {
    // New integrations may add keys; the keys of stored connections must never disappear.
    expect(publicFieldKeys).toEqual(expect.arrayContaining(['entityId', 'slug', 'username']));
  });
  it('validates connection input and proposals against the registered types only', () => {
    const base = { name: 'X', url: 'https://x.test' };
    expect(createConnectionSchema.safeParse({ ...base, type: 'jellyfin' }).success).toBe(true);
    expect(createConnectionSchema.safeParse({ ...base, type: 'made-up' }).success).toBe(false);
    expect(
      createConnectionSchema.safeParse({ ...base, type: 'jellyfin', other: 'x' }).success,
    ).toBe(false);
    expect(connectionSetupSchema.safeParse({ ...base, type: 'made-up' }).success).toBe(false);
    expect(
      connectionSetupSchema.safeParse({
        ...base,
        type: 'home-assistant',
        url: 'http://x.test',
        entityId: 'sensor.a',
      }).success,
    ).toBe(false);
    expect(
      connectionSetupSchema.safeParse({ ...base, type: 'uptime-kuma', slug: 'home' }).success,
    ).toBe(true);
  });
});

it('projects independently named fields and joins keyed states for a different domain', async () => {
  const manifest: IntegrationManifest = {
    ...clone(jellyfinManifest),
    requests: [
      { id: 'catalog', path: '/catalog' },
      { id: 'measurements', path: '/measurements' },
    ],
    extract: [
      {
        op: 'rows',
        out: 'sensors',
        request: 'catalog',
        path: ['rooms'],
        items: ['devices'],
        key: ['serial'],
        keyType: 'string',
        maxKeyLength: 32,
        max: 3,
        fields: {
          serial: { source: 'item', path: ['serial'], type: 'string', maxLength: 32 },
          room: { source: 'group', path: ['label'], type: 'string', maxLength: 32 },
          battery: { source: 'item', path: ['battery'], type: 'integer', min: 0, max: 100 },
        },
        lookup: {
          out: 'condition',
          request: 'measurements',
          path: ['readings'],
          field: ['value'],
          states: { normal: [1] },
          other: 'unavailable',
        },
      },
    ],
    display: { summary: { text: 'Sensors' }, stats: [{ label: 'Sensors', value: 'Sensors' }] },
  };
  assertValidDefinition(manifest);
  const adapter = createManifestAdapter(manifest, async ({ path }) => ({
    status: 200,
    body:
      path === '/catalog'
        ? { rooms: [{ label: 'Kitchen', devices: [{ serial: 'sensor-a', battery: 80 }] }] }
        : { readings: { 'sensor-a': [{ value: 1 }] } },
  }));
  await expect(adapter.collect({ url: 'https://sensors.example' })).resolves.toEqual({
    sensors: [{ serial: 'sensor-a', room: 'Kitchen', battery: 80, condition: 'normal' }],
  });
});
