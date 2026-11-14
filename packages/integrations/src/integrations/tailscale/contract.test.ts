import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases, long } from '../../../test-support/integration-test-support.js';
import { tailscaleManifest } from './definition.js';
import { createManifestAdapter } from '../../../test-support/integration-test-support.js';

const tailscaleToken = 'tskey-api-SECRET159';
runAdapterContract({
  name: 'tailscale',
  create: (transport) => createManifestAdapter(tailscaleManifest, transport),
  validConfig: { url: 'https://api.tailscale.test', tailnet: '-', secret: tailscaleToken },
  secrets: [tailscaleToken],
  invalidConfigs: [
    ...urlCases(['http://api.tailscale.test', 'https://api.tailscale.test/sub']).map(
      ({ label, url }) => ({ label, config: { url, tailnet: '-', secret: tailscaleToken } }),
    ),
    {
      label: 'missing tailnet',
      config: { url: 'https://api.tailscale.test', secret: tailscaleToken },
    },
    {
      label: 'empty token',
      config: { url: 'https://api.tailscale.test', tailnet: '-', secret: '' },
    },
    {
      label: 'oversized token',
      config: { url: 'https://api.tailscale.test', tailnet: '-', secret: long },
    },
  ],
  pathFields: ['tailnet'],
  fixtures: {
    valid: {
      body: fixture('tailscale/devices.json'),
      expected: { devices: 3, online: 2, updates: 1 },
    },
    wrongShape: [
      { label: 'no devices key', body: {} },
      { label: 'root array', body: [] },
      { label: 'devices is an object', body: { devices: {} } },
    ],
    oversized: [
      { label: 'too many devices', body: { devices: Array.from({ length: 10001 }, () => ({})) } },
    ],
  },
});
