import type { IntegrationAdapter } from './integrations.js';
import { InputError } from './api-error.js';

export type JellyfinConfig = { url: string };
export type JellyfinSummary = { name: string; version: string };
type Transport = (request: {
  origin: string;
  path: string;
}) => Promise<{ status: number; body: unknown }>;

function validate(config: JellyfinConfig): JellyfinConfig {
  if (!config || typeof config.url !== 'string' || config.url.length > 2048)
    throw new InputError('invalid-url');
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw new InputError('invalid-url');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new InputError('invalid-url');
  return { url: url.toString().replace(/\/+$/, '') };
}

/** Only inject a transport that enforces destination policy, TLS and response limits. */
export function createJellyfinAdapter(
  transport: Transport,
): IntegrationAdapter<JellyfinConfig, JellyfinSummary> {
  return {
    type: 'jellyfin',
    label: 'Jellyfin',
    capabilities: ['server-info'],
    validate,
    async collect(config) {
      const safe = validate(config);
      const url = new URL(safe.url);
      let response: { status: number; body: unknown };
      try {
        response = await transport({
          origin: url.origin,
          path: `${url.pathname.replace(/\/+$/, '')}/System/Info/Public`,
        });
      } catch {
        throw new Error('Could not query Jellyfin.');
      }
      if (response.status !== 200 || !response.body || typeof response.body !== 'object')
        throw new Error('Invalid Jellyfin response.');
      const body = response.body as Record<string, unknown>;
      if (
        typeof body.ServerName !== 'string' ||
        !body.ServerName ||
        body.ServerName.length > 256 ||
        typeof body.Version !== 'string' ||
        !body.Version ||
        body.Version.length > 128
      )
        throw new Error('Invalid Jellyfin response.');
      return { name: body.ServerName, version: body.Version };
    },
  };
}
