import { runAdapterContract } from '../../../../../apps/backend/src/adapter-contract.js';
import { fixture, urlCases } from '../../../../../apps/backend/src/integration-test-support.js';
import { createProxmoxConnectionAdapter } from './testing.js';

const proxmoxToken = 'proxmox-SECRET789';
runAdapterContract({
  name: 'proxmox',
  create: createProxmoxConnectionAdapter,
  validConfig: {
    url: 'https://pve.example.test:8006',
    tokenId: 'root@pam!homora',
    secret: proxmoxToken,
  },
  secrets: [proxmoxToken],
  invalidConfigs: [
    ...urlCases(['http://pve.example.test']).map(({ label, url }) => ({
      label,
      config: { url, tokenId: 'root@pam!homora', secret: proxmoxToken },
    })),
    {
      label: 'malformed token id',
      config: { url: 'https://pve.example.test', tokenId: 'nope', secret: proxmoxToken },
    },
    {
      label: 'empty secret',
      config: { url: 'https://pve.example.test', tokenId: 'root@pam!homora', secret: '' },
    },
    {
      label: 'oversized secret',
      config: {
        url: 'https://pve.example.test',
        tokenId: 'root@pam!homora',
        secret: 'a'.repeat(513),
      },
    },
  ],
  fixtures: {
    valid: {
      body: fixture('proxmox/cluster-resources.json'),
      expected: {
        vms: { running: 1, total: 1 },
        containers: { running: 0, total: 1 },
        cpu: 50,
        memory: 50,
        disk: 10,
      },
    },
    wrongShape: [
      { label: 'no data', body: {} },
      { label: 'data not array', body: { data: {} } },
    ],
    oversized: [],
  },
  // The shared transport only throws fixed strings; the Proxmox adapter passes them through.
  sanitizesTransportErrors: false,
});
