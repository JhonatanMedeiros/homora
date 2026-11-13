import { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';
import {
  fixture,
  urlCases,
  long,
} from '../../../../../apps/backend/src/integration-test-support.js';
import { portainerManifest } from './definition.js';
import { createManifestAdapter } from '../../../../../apps/backend/src/manifest-adapter.js';

const portainerToken = 'ptr_portainer-SECRET654';
runAdapterContract({
  name: 'portainer',
  create: (transport) => createManifestAdapter(portainerManifest, transport),
  validConfig: { url: 'https://portainer.example.test', secret: portainerToken },
  secrets: [portainerToken],
  invalidConfigs: [
    ...urlCases(['http://portainer.example.test']).map(({ label, url }) => ({
      label,
      config: { url, secret: portainerToken },
    })),
    { label: 'empty token', config: { url: 'https://portainer.example.test', secret: '' } },
    {
      label: 'token with newline',
      config: { url: 'https://portainer.example.test', secret: 'a\nb' },
    },
    { label: 'oversized token', config: { url: 'https://portainer.example.test', secret: long } },
  ],
  fixtures: {
    valid: {
      body: fixture('portainer/endpoints.json'),
      expected: { environments: 3, up: 2, down: 1 },
    },
    wrongShape: [
      { label: 'object instead of array', body: {} },
      { label: 'wrapped array', body: { endpoints: [] } },
    ],
    oversized: [
      {
        label: 'too many environments',
        body: Array.from({ length: 10001 }, () => ({ Status: 1 })),
      },
    ],
  },
});
