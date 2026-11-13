import type { IntegrationManifest } from '../integration-manifest-shared.js';
import { urlField, printable } from '../integration-manifest-shared.js';

export const speedtestTrackerManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'speedtest-tracker',
  label: 'Speedtest Tracker',
  mark: 'ST',
  capabilities: ['speedtest-results'],
  fields: [
    urlField({ httpsOnly: true, allowPath: true, errorCode: 'https-url-required' }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'API token',
      required: true,
      maxLength: 4096,
      pattern: printable,
      help: 'Create it at /admin/api-tokens with only the "Read Results" ability.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'bearer' },
  requests: [{ id: 'latest', path: '/api/v1/results/latest' }],
  extract: [
    { op: 'pick', out: 'download', path: ['download_bits_human'], type: 'string', maxLength: 40 },
    { op: 'pick', out: 'upload', path: ['upload_bits_human'], type: 'string', maxLength: 40 },
    { op: 'pick', out: 'ping', path: ['ping'], type: 'number', min: 0, max: 100000 },
  ],
  display: {
    summary: { text: 'Download: {download} · Upload: {upload} · Ping: {ping} ms' },
    stats: [
      { label: 'Download', labelKey: 'stat.download', value: '{download}' },
      { label: 'Upload', labelKey: 'stat.upload', value: '{upload}' },
      { label: 'Ping', labelKey: 'stat.ping', value: '{ping} ms' },
    ],
  },
  messages: { notFound: 'No speedtest result is available yet.' },
};
