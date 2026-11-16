import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import {
  createManifestAdapter,
  fixture,
  long,
  urlCases,
} from '../../../test-support/integration-test-support.js';
import { healthchecksManifest } from './definition.js';

const apiKey = 'hc_readonly-SECRET321';
runAdapterContract({
  name: 'healthchecks',
  create: (transport) => createManifestAdapter(healthchecksManifest, transport),
  validConfig: { url: 'https://healthchecks.example.test', secret: apiKey },
  secrets: [apiKey],
  invalidConfigs: [
    ...urlCases(['http://healthchecks.example.test']).map(({ label, url }) => ({
      label,
      config: { url, secret: apiKey },
    })),
    { label: 'empty key', config: { url: 'https://healthchecks.example.test', secret: '' } },
    {
      label: 'key with newline',
      config: { url: 'https://healthchecks.example.test', secret: 'a\nb' },
    },
    { label: 'oversized key', config: { url: 'https://healthchecks.example.test', secret: long } },
  ],
  fixtures: {
    valid: {
      body: fixture('healthchecks/checks.json'),
      expected: { checks: 6, up: 2, grace: 1, down: 1, paused: 1, new: 1 },
    },
    wrongShape: [
      { label: 'array instead of object', body: [] },
      { label: 'checks is not an array', body: { checks: {} } },
    ],
    oversized: [
      {
        label: 'too many checks',
        body: { checks: Array.from({ length: 10001 }, () => ({ status: 'up' })) },
      },
    ],
  },
});
