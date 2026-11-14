import type { IntegrationManifest } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

export const uptimeKumaManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'uptime-kuma',
  label: 'Uptime Kuma',
  mark: 'UK',
  brandIcon: 'uptime-kuma',
  capabilities: ['status-page'],
  fields: [
    urlField({ errorCode: 'invalid-url' }),
    {
      key: 'slug',
      kind: 'text',
      label: 'Public page identifier',
      labelKey: 'connections.slug',
      required: true,
      maxLength: 100,
      pattern: '[A-Za-z0-9_-]+',
      errorCode: 'invalid-status-page',
    },
  ],
  auth: { type: 'none' },
  requests: [
    { id: 'heartbeat', path: '/api/status-page/heartbeat/{slug}' },
    { id: 'page', path: '/api/status-page/{slug}' },
  ],
  extract: [
    {
      op: 'rows',
      out: 'monitors',
      request: 'page',
      path: ['publicGroupList'],
      items: ['monitorList'],
      key: ['id'],
      keyType: 'integer',
      fields: {
        id: { source: 'item', path: ['id'], type: 'integer', min: 1, max: Number.MAX_SAFE_INTEGER },
        name: { source: 'item', path: ['name'], type: 'string', maxLength: 256 },
        group: { source: 'group', path: ['name'], type: 'string', maxLength: 256 },
      },
      max: 50,
      lookup: {
        out: 'status',
        request: 'heartbeat',
        path: ['heartbeatList'],
        field: ['status'],
        states: { up: [1], down: [0], pending: [2], maintenance: [3] },
        other: 'unknown',
      },
    },
    {
      op: 'tally',
      path: ['heartbeatList'],
      field: ['status'],
      states: { up: [1], down: [0], pending: [2], maintenance: [3] },
      other: 'unknown',
    },
  ],
  display: {
    summary: {
      text: 'Up: {up} · Down: {down} · Pending: {pending} · Maintenance: {maintenance} · Unknown: {unknown}',
      key: 'data.uptimeKuma',
    },
    stats: [
      { label: 'Up', labelKey: 'stat.up', value: '{up}' },
      { label: 'Down', labelKey: 'stat.down', value: '{down}' },
      { label: 'Pending', labelKey: 'stat.pending', value: '{pending}', hideWhenZero: 'pending' },
      {
        label: 'Maintenance',
        labelKey: 'stat.maintenance',
        value: '{maintenance}',
        hideWhenZero: 'maintenance',
      },
      { label: 'Unknown', labelKey: 'stat.unknown', value: '{unknown}', hideWhenZero: 'unknown' },
    ],
  },
  messages: { notFound: 'Status page not found or not published on Uptime Kuma.' },
};
