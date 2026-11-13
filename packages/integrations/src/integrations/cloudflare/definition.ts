import type { IntegrationManifest } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

const printable = '[\\x21-\\x7e]+';

export const cloudflareManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'cloudflare',
  label: 'Cloudflare',
  mark: 'CF',
  brandIcon: 'cloudflare',
  capabilities: ['dns-zones'],
  fields: [
    urlField({
      httpsOnly: true,
      defaultValue: 'https://api.cloudflare.com',
      errorCode: 'https-url-required',
    }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'API token',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create an API token with only the Zone > Zone > Read permission.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'bearer' },
  requests: [
    { id: 'all', path: '/client/v4/zones', query: { per_page: '5' } },
    { id: 'active', path: '/client/v4/zones', query: { status: 'active', per_page: '5' } },
  ],
  require: [
    { request: 'all', path: ['success'], equals: true },
    { request: 'active', path: ['success'], equals: true },
  ],
  extract: [
    {
      op: 'pick',
      out: 'zones',
      request: 'all',
      path: ['result_info', 'total_count'],
      type: 'integer',
      min: 0,
      max: 1_000_000,
    },
    {
      op: 'pick',
      out: 'active',
      request: 'active',
      path: ['result_info', 'total_count'],
      type: 'integer',
      min: 0,
      max: 1_000_000,
    },
  ],
  display: {
    summary: { text: 'Zones: {zones} · Active: {active}' },
    stats: [
      { label: 'Zones', labelKey: 'stat.zones', value: '{zones}' },
      { label: 'Active', labelKey: 'stat.active', value: '{active}' },
    ],
  },
};
