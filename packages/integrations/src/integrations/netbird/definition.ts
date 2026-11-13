import type { IntegrationManifest } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

const printable = '[\\x21-\\x7e]+';

export const netbirdManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'netbird',
  label: 'NetBird',
  mark: 'NB',
  brandIcon: 'netbird',
  capabilities: ['network-peers'],
  fields: [
    urlField({
      httpsOnly: true,
      defaultValue: 'https://api.netbird.io',
      help: 'Use https://api.netbird.io for NetBird Cloud, or the address of your own management server.',
      errorCode: 'https-url-required',
    }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'Personal access token',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create it for a service user with the lowest role that can list peers.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'token' },
  requests: [{ id: 'peers', path: '/api/peers', maxBodyBytes: 2_000_000 }],
  extract: [
    { op: 'count', out: 'peers', path: [] },
    { op: 'count', out: 'connected', path: [], where: { path: ['connected'], equals: true } },
  ],
  display: {
    summary: { text: 'Peers: {peers} · Connected: {connected}' },
    stats: [
      { label: 'Peers', labelKey: 'stat.peers', value: '{peers}' },
      { label: 'Connected', labelKey: 'stat.connected', value: '{connected}' },
    ],
  },
};
