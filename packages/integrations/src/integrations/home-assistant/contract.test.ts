import { runAdapterContract } from '../../../test-support/adapter-contract.js';
import { fixture, urlCases, long } from '../../../test-support/integration-test-support.js';
import { homeAssistantManifest } from './definition.js';
import { createManifestAdapter } from '../../../test-support/integration-test-support.js';

const token = 'ha-token-SECRET123';
runAdapterContract({
  name: 'home-assistant',
  create: (transport) => createManifestAdapter(homeAssistantManifest, transport),
  validConfig: { url: 'https://ha.example.test', secret: token, entityId: 'sensor.temperature' },
  secrets: [token],
  invalidConfigs: [
    ...urlCases(['http://ha.example.test', 'https://ha.example.test/sub']).map(
      ({ label, url }) => ({
        label,
        config: { url, secret: token, entityId: 'sensor.temperature' },
      }),
    ),
    {
      label: 'empty token',
      config: { url: 'https://ha.example.test', secret: '', entityId: 'sensor.a' },
    },
    {
      label: 'token with whitespace',
      config: { url: 'https://ha.example.test', secret: 'a b', entityId: 'sensor.a' },
    },
    {
      label: 'oversized token',
      config: { url: 'https://ha.example.test', secret: long, entityId: 'sensor.a' },
    },
    {
      label: 'oversized entity',
      config: {
        url: 'https://ha.example.test',
        secret: token,
        entityId: `sensor.${'a'.repeat(300)}`,
      },
    },
  ],
  pathFields: ['entityId'],
  fixtures: {
    valid: {
      body: fixture('home-assistant/state.json'),
      expected: {
        entityId: 'sensor.temperature',
        state: '21.5',
        lastUpdated: '2026-01-01T10:00:00+00:00',
      },
    },
    wrongShape: [
      { label: 'other entity', body: { entity_id: 'sensor.other', state: '1' } },
      { label: 'numeric state', body: { entity_id: 'sensor.temperature', state: 1 } },
    ],
    oversized: [
      {
        label: 'long state',
        body: { entity_id: 'sensor.temperature', state: long.repeat(1) + 'y' },
      },
    ],
    echoSecret: (secret) => ({ entity_id: 'sensor.temperature', state: `leak ${secret}` }),
  },
});
