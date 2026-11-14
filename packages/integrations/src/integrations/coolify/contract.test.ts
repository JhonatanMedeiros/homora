import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases, long } from '../../../test-support/integration-test-support.js';
import { createCoolifyAdapter } from './testing.js';

const coolifyToken = '1|coolify-SECRET456';
runAdapterContract({
  name: 'coolify',
  create: createCoolifyAdapter,
  validConfig: { url: 'https://coolify.example.test', secret: coolifyToken },
  secrets: [coolifyToken],
  invalidConfigs: [
    ...urlCases(['http://coolify.example.test', 'https://coolify.example.test/a%2fb']).map(
      ({ label, url }) => ({ label, config: { url, secret: coolifyToken } }),
    ),
    { label: 'empty secret', config: { url: 'https://coolify.example.test', secret: '' } },
    {
      label: 'secret with a space',
      config: { url: 'https://coolify.example.test', secret: 'a b' },
    },
    {
      label: 'oversized secret',
      config: { url: 'https://coolify.example.test', secret: 'a'.repeat(513) },
    },
    { label: 'null config', config: null as never },
  ],
  fixtures: {
    valid: {
      body: fixture('coolify/resources.json'),
      expected: { total: 4, running: 1, degraded: 1, stopped: 1, unknown: 1 },
    },
    wrongShape: [
      { label: 'not an array', body: {} },
      { label: 'wrapped in data', body: { data: [] } },
      { label: 'item not an object', body: [null] },
      { label: 'uuid with a space', body: [{ uuid: 'a b', name: 'x', type: 'application' }] },
      { label: 'missing name', body: [{ uuid: 'a', type: 'service' }] },
      {
        label: 'text environment',
        body: [{ uuid: 'a', name: 'x', type: 'service', environment_id: 'one' }],
      },
    ],
    oversized: [
      { label: 'long name', body: [{ uuid: 'a', name: long, type: 'application' }] },
      {
        label: 'long status',
        body: [{ uuid: 'a', name: 'x', type: 'service', status: 's'.repeat(65) }],
      },
      {
        label: 'long description',
        body: [{ uuid: 'a', name: 'x', type: 'service', description: 'd'.repeat(501) }],
      },
      { label: 'long uuid', body: [{ uuid: 'u'.repeat(65), name: 'x', type: 'service' }] },
      {
        label: 'too many resources',
        body: Array.from({ length: 1001 }, (_, index) => ({
          uuid: `u${index}`,
          name: 'x',
          type: 'service',
        })),
      },
    ],
    echoSecret: (secret) => [{ uuid: 'a', name: secret, type: 'application' }],
  },
});
