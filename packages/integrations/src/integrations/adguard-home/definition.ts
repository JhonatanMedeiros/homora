import type { IntegrationManifest } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

export const adguardManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'adguard-home',
  label: 'AdGuard Home',
  mark: 'A',
  brandIcon: 'adguard-home',
  capabilities: ['dns-status'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'username',
      kind: 'text',
      label: 'Username',
      labelKey: 'connections.username',
      required: true,
      maxLength: 256,
      pattern: '[^:]+',
      identity: true,
      errorCode: 'invalid-credentials',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'Password',
      labelKey: 'connections.password',
      required: true,
      maxLength: 4096,
      errorCode: 'invalid-credentials',
    },
  ],
  auth: { type: 'basic', usernameField: 'username' },
  requests: [{ id: 'status', path: '/control/status' }],
  extract: [
    { op: 'pick', out: 'running', path: ['running'], type: 'boolean' },
    { op: 'pick', out: 'protectionEnabled', path: ['protection_enabled'], type: 'boolean' },
    { op: 'pick', out: 'version', path: ['version'], type: 'string', maxLength: 128 },
  ],
  display: {
    values: {
      service: {
        from: 'running',
        map: {
          true: { text: 'running', key: 'data.running' },
          false: { text: 'stopped', key: 'data.stopped' },
        },
      },
      protection: {
        from: 'protectionEnabled',
        map: {
          true: { text: 'enabled', key: 'data.enabled' },
          false: { text: 'disabled', key: 'data.disabled' },
        },
      },
    },
    summary: {
      text: 'Service: {service} · Protection: {protection} · Version: {version}',
      key: 'data.adguard',
    },
    stats: [
      { label: 'Service', labelKey: 'stat.service', value: '{service}' },
      { label: 'Protection', labelKey: 'stat.protection', value: '{protection}' },
      { label: 'Version', labelKey: 'stat.version', value: '{version}' },
    ],
  },
};
