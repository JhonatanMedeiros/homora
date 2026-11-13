import { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';
import {
  fixture,
  urlCases,
  long,
} from '../../../../../apps/backend/src/integration-test-support.js';
import { cloudflareManifest } from './definition.js';
import { createManifestAdapter } from '../../../../../apps/backend/src/integration-test-support.js';

const cloudflareToken = 'cf-token-SECRET753';
runAdapterContract({
  name: 'cloudflare',
  create: (transport) => createManifestAdapter(cloudflareManifest, transport),
  validConfig: { url: 'https://api.cloudflare.test', secret: cloudflareToken },
  secrets: [cloudflareToken],
  invalidConfigs: [
    ...urlCases(['http://api.cloudflare.test', 'https://api.cloudflare.test/sub']).map(
      ({ label, url }) => ({ label, config: { url, secret: cloudflareToken } }),
    ),
    { label: 'empty token', config: { url: 'https://api.cloudflare.test', secret: '' } },
    { label: 'oversized token', config: { url: 'https://api.cloudflare.test', secret: long } },
  ],
  fixtures: {
    valid: { body: fixture('cloudflare/zones.json'), expected: { zones: 7, active: 7 } },
    wrongShape: [
      { label: 'no result_info', body: { success: true, result: [] } },
      { label: 'success false', body: { success: false, result_info: { total_count: 1 } } },
      { label: 'string count', body: { success: true, result_info: { total_count: '1' } } },
    ],
    oversized: [
      {
        label: 'count above the bound',
        body: { success: true, result_info: { total_count: 1e9 } },
      },
      { label: 'negative count', body: { success: true, result_info: { total_count: -1 } } },
    ],
  },
});
