import type { IntegrationManifest } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

const printable = '[\\x21-\\x7e]+';

export const portainerManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'portainer',
  label: 'Portainer',
  mark: 'PT',
  brandIcon: 'portainer',
  capabilities: ['container-environments'],
  fields: [
    urlField({ httpsOnly: true, allowPath: true, errorCode: 'https-url-required' }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'Access token',
      labelKey: 'connections.accessToken',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create it in your Portainer account settings. Use a standard user that can only see the environments you want to show.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'api-key' },
  requests: [
    {
      id: 'environments',
      path: '/api/endpoints',
      query: { excludeSnapshots: 'true' },
      maxBodyBytes: 1_000_000,
    },
  ],
  extract: [
    { op: 'count', out: 'environments', path: [] },
    { op: 'count', out: 'up', path: [], where: { path: ['Status'], equals: 1 } },
    { op: 'count', out: 'down', path: [], where: { path: ['Status'], equals: 2 } },
  ],
  display: {
    summary: { text: 'Environments: {environments} · Up: {up} · Down: {down}' },
    stats: [
      { label: 'Environments', labelKey: 'stat.environments', value: '{environments}' },
      { label: 'Up', labelKey: 'stat.up', value: '{up}' },
      { label: 'Down', labelKey: 'stat.down', value: '{down}', hideWhenZero: 'down' },
    ],
  },
};
