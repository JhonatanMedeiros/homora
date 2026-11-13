import { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';
import {
  fixture,
  urlCases,
  long,
} from '../../../../../apps/backend/src/integration-test-support.js';
import { speedtestTrackerManifest } from './definition.js';
import { createManifestAdapter } from '../../../../../apps/backend/src/manifest-adapter.js';

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
