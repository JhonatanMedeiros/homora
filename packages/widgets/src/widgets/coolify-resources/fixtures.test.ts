import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { defaultConfig } from './definition.js';
import { parseResources, selectResources } from './logic.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../integrations/src/integrations/coolify/fixtures/${name}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ).body;
it('presents resource and application fixture observations, including unknown status and multiple addresses', () => {
  const raw = fixture('resources');
  const apps = fixture('applications');
  // The adapter's normalized outputs for these fixtures are verified in its contract tests.
  const inventory = {
    resources: [
      {
        uuid: raw[0].uuid,
        name: raw[0].name,
        type: raw[0].type,
        state: 'running',
        rawStatus: raw[0].status,
        urls: apps[0].fqdn
          .split(',')
          .slice(0, 2)
          .map((url: string) => url.trim()),
      },
      {
        uuid: raw[1].uuid,
        name: raw[1].name,
        type: raw[1].type,
        state: 'degraded',
        rawStatus: raw[1].status,
        urls: [],
      },
      {
        uuid: raw[2].uuid,
        name: raw[2].name,
        type: raw[2].type,
        state: 'stopped',
        rawStatus: raw[2].status,
        urls: [],
      },
      {
        uuid: raw[3].uuid,
        name: raw[3].name,
        type: raw[3].type,
        state: 'unknown',
        rawStatus: raw[3].status,
        urls: [],
      },
    ],
  };
  const rows = parseResources(inventory)!;
  expect(rows[0]!.urls).toEqual(['https://blog.example.test', 'https://www.blog.example.test']);
  expect(rows.find((r) => r.state === 'unknown')?.rawStatus).toBe('restarting');
  expect(selectResources(rows, { ...defaultConfig, limit: 1 }).rows[0]?.state).toBe('stopped');
});
