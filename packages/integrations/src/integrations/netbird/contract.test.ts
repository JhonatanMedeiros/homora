import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases, long } from '../../../test-support/integration-test-support.js';
import { netbirdManifest } from './definition.js';
import { createManifestAdapter } from '../../../test-support/integration-test-support.js';

const netbirdToken = 'nbp_netbird-SECRET987';
runAdapterContract({
  name: 'netbird',
  create: (transport) => createManifestAdapter(netbirdManifest, transport),
  validConfig: { url: 'https://api.netbird.example.test', secret: netbirdToken },
  secrets: [netbirdToken],
  invalidConfigs: [
    ...urlCases(['http://api.netbird.example.test', 'https://api.netbird.example.test/sub']).map(
      ({ label, url }) => ({ label, config: { url, secret: netbirdToken } }),
    ),
    { label: 'empty token', config: { url: 'https://api.netbird.example.test', secret: '' } },
    { label: 'oversized token', config: { url: 'https://api.netbird.example.test', secret: long } },
  ],
  fixtures: {
    valid: { body: fixture('netbird/peers.json'), expected: { peers: 3, connected: 2 } },
    wrongShape: [
      { label: 'object instead of array', body: {} },
      { label: 'wrapped array', body: { peers: [] } },
    ],
    oversized: [
      { label: 'too many peers', body: Array.from({ length: 10001 }, () => ({ connected: true })) },
    ],
  },
});
