import type { IntegrationManifest } from '../integration-manifest-shared.js';
import { urlField } from '../integration-manifest-shared.js';

export const jellyfinManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'jellyfin',
  label: 'Jellyfin',
  mark: 'J',
  brandIcon: 'jellyfin',
  capabilities: ['server-info'],
  fields: [urlField({ allowPath: true, errorCode: 'invalid-url' })],
  auth: { type: 'none' },
  requests: [{ id: 'info', path: '/System/Info/Public' }],
  extract: [
    { op: 'pick', out: 'name', path: ['ServerName'], type: 'string', maxLength: 256 },
    { op: 'pick', out: 'version', path: ['Version'], type: 'string', maxLength: 128 },
  ],
  display: {
    summary: { text: 'Server: {name} · Version: {version}', key: 'data.jellyfin' },
    stats: [
      { label: 'Server', labelKey: 'stat.server', value: '{name}' },
      { label: 'Version', labelKey: 'stat.version', value: '{version}' },
    ],
  },
};
