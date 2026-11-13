import type { IntegrationManifest } from '../integration-manifest-shared.js';
import { urlField, printable } from '../integration-manifest-shared.js';

export const homeAssistantManifest: IntegrationManifest = {
  kind: 'manifest',
  type: 'home-assistant',
  label: 'Home Assistant',
  mark: 'HA',
  brandIcon: 'home-assistant',
  capabilities: ['entity-state'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'entityId',
      kind: 'text',
      label: 'Entity',
      labelKey: 'connections.entity',
      placeholderKey: 'connections.entityPlaceholder',
      required: true,
      maxLength: 255,
      pattern: '[a-z0-9_]+\\.[a-z0-9_]+',
      errorCode: 'invalid-entity',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'Access token',
      labelKey: 'connections.accessToken',
      required: true,
      maxLength: 4096,
      pattern: printable,
      errorCode: 'invalid-token',
    },
  ],
  auth: { type: 'bearer' },
  requests: [{ id: 'state', path: '/api/states/{entityId}' }],
  require: [{ path: ['entity_id'], equalsConfig: 'entityId' }],
  extract: [
    { op: 'config', out: 'entityId', key: 'entityId' },
    { op: 'pick', out: 'state', path: ['state'], type: 'string', maxLength: 1024 },
    {
      op: 'pick',
      out: 'lastUpdated',
      path: ['last_updated'],
      type: 'string',
      maxLength: 128,
      optional: true,
    },
  ],
  display: {
    values: { entity: { from: 'entityId' } },
    summary: { text: 'Entity: {entity} · State: {state}', key: 'data.homeAssistant' },
    stats: [{ label: 'State', labelKey: 'stat.state', value: '{state}' }],
  },
  messages: { notFound: 'Entity not found in Home Assistant.' },
};
