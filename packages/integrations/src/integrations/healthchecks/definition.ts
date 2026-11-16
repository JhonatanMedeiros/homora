import type { IntegrationManifest } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

const printable = '[\\x21-\\x7e]+';

export const healthchecksManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'healthchecks',
  label: 'Healthchecks',
  mark: 'HC',
  brandIcon: 'healthchecks',
  capabilities: ['job-checks'],
  fields: [
    urlField({ httpsOnly: true, allowPath: true, errorCode: 'https-url-required' }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'Read-only API key',
      labelKey: 'connections.readOnlyApiKey',
      required: true,
      maxLength: 256,
      pattern: printable,
      help: 'Use the read-only API key of the project (Project Settings, API Access). It cannot create, pause or delete checks.',
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'api-key' },
  requests: [{ id: 'checks', path: '/api/v3/checks/', maxBodyBytes: 1_000_000 }],
  extract: [
    { op: 'count', out: 'checks', path: ['checks'] },
    { op: 'count', out: 'up', path: ['checks'], where: { path: ['status'], equals: 'up' } },
    { op: 'count', out: 'grace', path: ['checks'], where: { path: ['status'], equals: 'grace' } },
    { op: 'count', out: 'down', path: ['checks'], where: { path: ['status'], equals: 'down' } },
    { op: 'count', out: 'paused', path: ['checks'], where: { path: ['status'], equals: 'paused' } },
    { op: 'count', out: 'new', path: ['checks'], where: { path: ['status'], equals: 'new' } },
  ],
  display: {
    summary: {
      text: 'Checks: {checks} · Up: {up} · Late: {grace} · Down: {down} · Paused: {paused} · New: {new}',
      key: 'data.healthchecks',
    },
    stats: [
      { label: 'Up', labelKey: 'stat.up', value: '{up}' },
      { label: 'Late', labelKey: 'stat.late', value: '{grace}', hideWhenZero: 'grace' },
      { label: 'Down', labelKey: 'stat.down', value: '{down}', hideWhenZero: 'down' },
      { label: 'Paused', labelKey: 'stat.paused', value: '{paused}', hideWhenZero: 'paused' },
      { label: 'New', labelKey: 'stat.new', value: '{new}', hideWhenZero: 'new' },
    ],
  },
};
