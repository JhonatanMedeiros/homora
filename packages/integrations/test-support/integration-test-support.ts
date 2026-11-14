import { createManifestAdapter as sdkAdapter } from '../src/backend-manifest-adapter.js';
import type { IntegrationManifest } from '../src/integration-manifest.js';
import type { IntegrationTransport } from '../src/backend.js';

/** Minimal deterministic host: production validation of icons and codes belongs to the host. */
export const createManifestAdapter = (
  manifest: IntegrationManifest,
  transport: IntegrationTransport,
) => sdkAdapter(manifest, transport, (code) => new Error(code));

import { readFileSync } from 'node:fs';

export const fixtureDir = new URL('../src/integrations/', import.meta.url);
export function fixture(path: string): unknown {
  const file = JSON.parse(
    readFileSync(new URL(path.replace('/', '/fixtures/'), fixtureDir), 'utf8'),
  ) as {
    _source?: { docs?: string; note?: string };
    body: unknown;
  };
  if (!file._source?.docs || !file._source.note) throw new Error(`Fixture ${path} lacks a source.`);
  return file.body;
}
export const long = 'x'.repeat(5000);
export const urlCases = (extra: string[] = []) => [
  ...[
    'not a url',
    'file:///etc/passwd',
    'ftp://example.test',
    'javascript:alert(1)',
    `https://${long}.test`,
    ...extra,
  ].map((url) => ({ label: `URL ${url.slice(0, 40)}`, url })),
  { label: 'credentials in URL', url: 'https://user:pass@example.test' },
  { label: 'query string', url: 'https://example.test/?key=secret' },
  { label: 'fragment', url: 'https://example.test/#x' },
];
