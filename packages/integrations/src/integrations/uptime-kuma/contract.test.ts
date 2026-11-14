import { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';
import { fixture, urlCases } from '../../../../../apps/backend/src/integration-test-support.js';
import { uptimeKumaManifest } from './definition.js';
import { createManifestAdapter } from '../../../../../apps/backend/src/integration-test-support.js';

runAdapterContract({
  name: 'uptime-kuma',
  create: (transport) =>
    createManifestAdapter(uptimeKumaManifest, async (request) => {
      const response = await transport(request);
      if (request.path === '/api/status-page/home' && response.status === 200)
        return { ...response, body: fixture('uptime-kuma/page.json') };
      return response;
    }),
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
      expected: {
        up: 1,
        down: 1,
        pending: 1,
        maintenance: 1,
        unknown: 1,
        monitors: [
          { id: 1, name: 'Web', group: 'Services', status: 'up' },
          { id: 2, name: 'DB', group: 'Services', status: 'down' },
          { id: 3, name: 'Queue', group: 'Services', status: 'pending' },
          { id: 4, name: 'Worker', group: 'Services', status: 'maintenance' },
          { id: 5, name: 'New', group: 'Services', status: 'unknown' },
        ],
      },
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
