import type { IntegrationManifest } from '../integration-manifest-shared.js';
import { urlField, printable } from '../integration-manifest-shared.js';

export const tailscaleManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'tailscale',
  label: 'Tailscale',
  mark: 'TS',
  brandIcon: 'tailscale',
  capabilities: ['network-devices'],
  fields: [
    urlField({
      httpsOnly: true,
      defaultValue: 'https://api.tailscale.com',
      errorCode: 'https-url-required',
    }),
    {
      key: 'tailnet',
      kind: 'text',
      label: 'Tailnet',
      labelKey: 'connections.tailnet',
      help: 'Use - for the default tailnet of the token, or the tailnet name.',
      required: true,
      maxLength: 100,
      pattern: '[A-Za-z0-9._-]+',
      defaultValue: '-',
      errorCode: 'invalid-config',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'API access token',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Tailscale API access tokens expire (at most 90 days); create a new one when it does.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'basic-key' },
  requests: [{ id: 'devices', path: '/api/v2/tailnet/{tailnet}/devices', maxBodyBytes: 2_000_000 }],
  extract: [
    { op: 'count', out: 'devices', path: ['devices'] },
    {
      op: 'count',
      out: 'online',
      path: ['devices'],
      where: { path: ['connectedToControl'], equals: true },
    },
    {
      op: 'count',
      out: 'updates',
      path: ['devices'],
      where: { path: ['updateAvailable'], equals: true },
    },
  ],
  display: {
    summary: { text: 'Devices: {devices} · Online: {online} · Updates available: {updates}' },
    stats: [
      { label: 'Devices', labelKey: 'stat.devices', value: '{devices}' },
      { label: 'Online', labelKey: 'stat.online', value: '{online}' },
      { label: 'Updates', labelKey: 'stat.updates', value: '{updates}', hideWhenZero: 'updates' },
    ],
  },
};
