import type { IntegrationAdapter } from './integrations.js';
import { InputError } from './api-error.js';

export type UptimeKumaConfig = { url: string; slug: string };
export type UptimeKumaSummary = {
  up: number;
  down: number;
  pending: number;
  maintenance: number;
  unknown: number;
};
type Transport = (request: {
  origin: string;
  path: string;
}) => Promise<{ status: number; body: unknown }>;

function validate(config: UptimeKumaConfig): UptimeKumaConfig {
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
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new InputError('invalid-url');
  if (typeof config.slug !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(config.slug))
    throw new InputError('invalid-status-page');
  return { url: url.origin, slug: config.slug };
}

/** Public status pages only; transport must enforce destination and response limits. */
export function createUptimeKumaAdapter(
  transport: Transport,
): IntegrationAdapter<UptimeKumaConfig, UptimeKumaSummary> {
  return {
    type: 'uptime-kuma',
    label: 'Uptime Kuma',
    capabilities: ['status-page'],
    validate,
    async collect(config) {
      const safe = validate(config);
      let response: { status: number; body: unknown };
      try {
        response = await transport({
          origin: safe.url,
          path: `/api/status-page/heartbeat/${safe.slug}`,
        });
      } catch {
        throw new Error('Could not connect to Uptime Kuma.');
      }
      if (response.status === 404)
        throw new Error('Status page not found or not published on Uptime Kuma.');
      if (response.status !== 200 || !response.body || typeof response.body !== 'object')
        throw new Error('Invalid response from Uptime Kuma.');
      const heartbeatList = (response.body as Record<string, unknown>).heartbeatList;
      if (!heartbeatList || typeof heartbeatList !== 'object' || Array.isArray(heartbeatList))
        throw new Error('Invalid response from Uptime Kuma.');
      const result = { up: 0, down: 0, pending: 0, maintenance: 0, unknown: 0 };
      for (const heartbeats of Object.values(heartbeatList)) {
        if (!Array.isArray(heartbeats)) throw new Error('Invalid response from Uptime Kuma.');
        const latest: unknown = heartbeats.at(-1);
        const status =
          latest && typeof latest === 'object'
            ? (latest as Record<string, unknown>).status
            : undefined;
        if (status === 1) result.up++;
        else if (status === 0) result.down++;
        else if (status === 2) result.pending++;
        else if (status === 3) result.maintenance++;
        else result.unknown++;
      }
      return result;
    },
  };
}
