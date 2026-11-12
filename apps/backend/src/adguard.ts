import type { IntegrationAdapter } from './integrations.js';
import { InputError } from './api-error.js';

export type AdGuardConfig = { url: string; username: string; password: string };
export type AdGuardStatus = { running: boolean; protectionEnabled: boolean; version: string };
type Transport = (request: {
  origin: string;
  path: string;
  authorization: string;
}) => Promise<{ status: number; body: unknown }>;
const hasControl = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

function validate(config: AdGuardConfig): AdGuardConfig {
  if (typeof config.url !== 'string' || config.url.length > 2048)
    throw new InputError('https-url-required');
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw new InputError('https-url-required');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new InputError('https-url-required');
  if (
    typeof config.username !== 'string' ||
    !config.username ||
    config.username.length > 256 ||
    config.username.includes(':') ||
    hasControl(config.username) ||
    typeof config.password !== 'string' ||
    !config.password ||
    config.password.length > 4096 ||
    hasControl(config.password)
  )
    throw new InputError('invalid-credentials');
  return { url: url.origin, username: config.username, password: config.password };
}

/** The injected transport must enforce network policy, TLS and response limits. */
export function createAdGuardAdapter(
  transport: Transport,
): IntegrationAdapter<AdGuardConfig, AdGuardStatus> {
  return {
    type: 'adguard-home',
    label: 'AdGuard Home',
    capabilities: ['dns-status'],
    validate,
    async collect(config) {
      const safe = validate(config);
      let response: { status: number; body: unknown };
      try {
        response = await transport({
          origin: safe.url,
          path: '/control/status',
          authorization: `Basic ${Buffer.from(`${safe.username}:${safe.password}`, 'utf8').toString('base64')}`,
        });
      } catch {
        throw new Error('Could not connect to AdGuard Home.');
      }
      if (response.status === 401 || response.status === 403)
        throw new Error('AdGuard Home refused authentication or access.');
      if (response.status !== 200 || !response.body || typeof response.body !== 'object')
        throw new Error('Invalid response from AdGuard Home.');
      const body = response.body as Record<string, unknown>;
      if (
        typeof body.running !== 'boolean' ||
        typeof body.protection_enabled !== 'boolean' ||
        typeof body.version !== 'string' ||
        body.version.length > 128 ||
        body.version.includes(safe.password)
      )
        throw new Error('Invalid response from AdGuard Home.');
      return {
        running: body.running,
        protectionEnabled: body.protection_enabled,
        version: body.version,
      };
    },
  };
}
