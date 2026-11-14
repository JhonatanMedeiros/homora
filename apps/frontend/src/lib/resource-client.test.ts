import { expect, it } from 'vitest';
import { widgetStats } from '@/features/connections/connection-model';
import {
  parseInventory,
  parseLinks,
  sameUrl,
  viewLink,
} from '@homora/integrations/resources/client';
import type { IntegrationResource, ResourceLink } from '@homora/integrations';

const resource = (over: Partial<IntegrationResource> = {}): IntegrationResource => ({
  uuid: 'abc123',
  type: 'application',
  name: 'Blog',
  description: null,
  state: 'running',
  rawStatus: 'running:healthy',
  urls: ['https://blog.example.com'],
  environmentId: 1,
  ...over,
});
const link = (over: Partial<ResourceLink> = {}): ResourceLink => ({
  id: 1,
  serviceId: 7,
  integrationId: 2,
  resourceUuid: 'abc123',
  resourceType: 'application',
  seenName: 'Blog',
  seenUrl: 'https://blog.example.com',
  ...over,
});

it('renders the Coolify summary and rejects malformed data', () => {
  expect(
    widgetStats('coolify', { total: 5, running: 3, degraded: 0, stopped: 1, unknown: 1 }),
  ).toEqual([
    { label: 'Recursos', value: '5' },
    { label: 'Em execução', value: '3' },
    { label: 'Parados', value: '1' },
    { label: 'Desconhecidos', value: '1' },
  ]);
  expect(
    widgetStats('coolify', { total: -1, running: 0, degraded: 0, stopped: 0, unknown: 0 }),
  ).toBeNull();
  expect(widgetStats('coolify', { total: 1, running: 1 })).toBeNull();
  expect(widgetStats('coolify', 'x')).toBeNull();
});

it('keeps only well-formed resources, duplicate-free, with safe addresses', () => {
  const parsed = parseInventory({
    checkedAt: '2026-01-01T00:00:00Z',
    data: {
      resources: [
        resource(),
        resource({ name: 'Copy' }),
        { ...resource({ uuid: 'bad uuid!' }) },
        { ...resource({ uuid: 'other' }), type: 'database' },
        {
          ...resource({ uuid: 'creds' }),
          urls: ['https://user:pw@x.example', 'javascript:alert(1)', 'https://ok.example'],
          state: 'weird',
        },
      ],
    },
  });
  expect(parsed?.resources.map((item) => item.uuid)).toEqual(['abc123', 'creds']);
  expect(parsed?.resources[1]).toMatchObject({ urls: ['https://ok.example'], state: 'unknown' });
  expect(parseInventory({ data: {} })).toBeNull();
  expect(parseLinks([link(), { id: 'x' }, null])).toHaveLength(1);
});

it('compares addresses by host and path', () => {
  expect(sameUrl('https://Blog.example.com/', 'https://blog.example.com')).toBe(true);
  expect(sameUrl('https://a.example', 'https://b.example')).toBe(false);
  expect(sameUrl(null, 'https://a.example')).toBe(false);
});

it('reports unavailable, missing, unchanged and changed links', () => {
  expect(viewLink(link(), null)).toEqual({ kind: 'unavailable' });
  expect(viewLink(link(), [resource({ uuid: 'zzz' })])).toEqual({ kind: 'missing' });
  expect(viewLink(link(), [resource()])).toMatchObject({
    kind: 'found',
    nameChanged: false,
    urlChanged: false,
  });
  // One of several domains matching the reviewed address is not a change.
  expect(
    viewLink(link(), [resource({ urls: ['https://other.example', 'https://blog.example.com'] })]),
  ).toMatchObject({ urlChanged: false, newUrl: 'https://blog.example.com' });
  expect(
    viewLink(link(), [resource({ name: 'Blog 2', urls: ['https://new.example'] })]),
  ).toMatchObject({
    nameChanged: true,
    urlChanged: true,
    newName: 'Blog 2',
    newUrl: 'https://new.example',
  });
  expect(viewLink(link({ seenUrl: null }), [resource({ urls: [] })])).toMatchObject({
    urlChanged: false,
  });
  expect(viewLink(link({ seenUrl: null }), [resource()])).toMatchObject({ urlChanged: true });
});
