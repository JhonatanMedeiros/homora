import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases, long } from '../../../test-support/integration-test-support.js';
import { adguardManifest } from './definition.js';
import { createManifestAdapter } from '../../../test-support/integration-test-support.js';

const password = 'adguard-pass-SECRET456';
runAdapterContract({
  name: 'adguard-home',
  create: (transport) => createManifestAdapter(adguardManifest, transport),
  validConfig: { url: 'https://adguard.example.test', username: 'admin', secret: password },
  secrets: [password],
  invalidConfigs: [
    ...urlCases(['http://adguard.example.test']).map(({ label, url }) => ({
      label,
      config: { url, username: 'admin', secret: password },
    })),
    {
      label: 'username with colon',
      config: { url: 'https://adguard.example.test', username: 'a:b', secret: password },
    },
    {
      label: 'empty password',
      config: { url: 'https://adguard.example.test', username: 'admin', secret: '' },
    },
    {
      label: 'control char in password',
      config: { url: 'https://adguard.example.test', username: 'admin', secret: 'a\nb' },
    },
    {
      label: 'oversized username',
      config: { url: 'https://adguard.example.test', username: long, secret: password },
    },
  ],
  fixtures: {
    valid: {
      body: fixture('adguard-home/status.json'),
      expected: { running: true, protectionEnabled: true, version: 'v0.107.52' },
    },
    wrongShape: [
      { label: 'no fields', body: {} },
      { label: 'string flag', body: { running: 'yes', protection_enabled: true, version: '1' } },
    ],
    oversized: [
      { label: 'long version', body: { running: true, protection_enabled: true, version: long } },
    ],
    echoSecret: (secret) => ({ running: true, protection_enabled: true, version: secret }),
  },
});
