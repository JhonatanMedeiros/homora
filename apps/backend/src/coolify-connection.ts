import {
  COOLIFY_UUID_PATTERN,
  type CoolifyResource,
  type CoolifyState,
  type CoolifySummary,
} from '@homora/shared';
import { InputError } from './api-error.js';
import type { IntegrationAdapter, IntegrationTransport } from './integrations.js';

export type CoolifyConfig = { url: string; secret: string };
export type CoolifyInventory = { resources: CoolifyResource[] };

/** Coolify's documented list endpoints. Only these two are read; both with GET. */
const RESOURCES_PATH = '/api/v1/resources';
const APPLICATIONS_PATH = '/api/v1/applications';
const MAX_RESOURCES = 1000;
const MAX_URLS = 5;
const MAX_BODY = 2_000_000;
const MAX_NAME = 200;
const MAX_DESCRIPTION = 500;
const MAX_STATUS = 64;

/**
 * Why a Coolify query failed in a way that retrying soon is pointless or harmful: Coolify blocks a
 * client after 30 failed requests per minute. The message is fixed; the caller uses `kind` and
 * `retryAfterSeconds` to back off without touching the network.
 */
export class CoolifyBackoffError extends Error {
  constructor(
    readonly kind: 'auth' | 'rate-limited',
    readonly retryAfterSeconds?: number,
  ) {
    super(
      kind === 'auth'
        ? 'Coolify refused the token or its permissions.'
        : 'Coolify is limiting requests; try again later.',
    );
    this.name = 'CoolifyBackoffError';
  }
}
const invalidResponse = () => new Error('Invalid response from Coolify.');
const unavailable = () => new Error('Could not query Coolify.');

const printable = /^[\x21-\x7e]+$/;
const safePath = /^(?:\/[A-Za-z0-9._~-]+)*\/?$/;

export function validateCoolifyConfig(input: CoolifyConfig): CoolifyConfig {
  if (!input || typeof input !== 'object') throw new InputError('invalid-data');
  const { url, secret } = input;
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048)
    throw new InputError('https-url-required');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InputError('https-url-required');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !safePath.test(parsed.pathname)
  )
    throw new InputError('https-url-required');
  if (typeof secret !== 'string' || secret.length > 512 || !printable.test(secret))
    throw new InputError('invalid-token');
  return { url: parsed.toString().replace(/\/+$/, ''), secret };
}

export function normalizeCoolifyState(status: unknown): CoolifyState {
  if (typeof status !== 'string') return 'unknown';
  const [base = '', health = ''] = status.trim().toLowerCase().split(':');
  if (base === 'running')
    return health === 'unhealthy' || health === 'degraded' ? 'degraded' : 'running';
  if (base === 'degraded') return 'degraded';
  if (base === 'exited' || base === 'stopped') return 'stopped';
  return 'unknown';
}

/** Valid http(s) addresses without credentials; Coolify's `fqdn` may hold several, comma separated. */
export function parseCoolifyUrls(fqdn: unknown): string[] {
  if (typeof fqdn !== 'string' || fqdn.length > 4096) return [];
  const urls = new Set<string>();
  for (const part of fqdn.split(',')) {
    const text = part.trim();
    if (!text || text.length > 2048) continue;
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      urls.add(url.toString());
    } catch {
      /* ignore an invalid address */
    }
    if (urls.size >= MAX_URLS) break;
  }
  return [...urls];
}

const boundedText = (value: unknown, max: number, required: boolean): string | null => {
  if (value === undefined || value === null) {
    if (required) throw invalidResponse();
    return null;
  }
  if (typeof value !== 'string' || value.length > max || (required && value.length === 0))
    throw invalidResponse();
  return value;
};

/** Picks only the fields Homora shows. Anything else Coolify returns is dropped. */
export function parseCoolifyResources(body: unknown, secret?: string): CoolifyResource[] {
  if (!Array.isArray(body) || body.length > MAX_RESOURCES) throw invalidResponse();
  const resources: CoolifyResource[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalidResponse();
    const entry = item as Record<string, unknown>;
    // Databases and anything else are out of scope; they are not validated.
    if (entry.type !== 'application' && entry.type !== 'service') continue;
    const uuid = entry.uuid;
    if (typeof uuid !== 'string' || !COOLIFY_UUID_PATTERN.test(uuid)) throw invalidResponse();
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    const environmentId = entry.environment_id;
    if (
      environmentId !== undefined &&
      environmentId !== null &&
      !(
        typeof environmentId === 'number' &&
        Number.isSafeInteger(environmentId) &&
        environmentId >= 0
      )
    )
      throw invalidResponse();
    const rawStatus = boundedText(entry.status, MAX_STATUS, false);
    resources.push({
      uuid,
      type: entry.type,
      name: boundedText(entry.name, MAX_NAME, true)!,
      description: boundedText(entry.description, MAX_DESCRIPTION, false) || null,
      state: normalizeCoolifyState(rawStatus),
      rawStatus,
      urls: [],
      environmentId: typeof environmentId === 'number' ? environmentId : null,
    });
  }
  // A credential reflected by the remote service makes the whole response untrustworthy.
  if (secret && JSON.stringify(resources).includes(secret)) throw invalidResponse();
  return resources;
}

export function summarizeCoolify(resources: readonly CoolifyResource[]): CoolifySummary {
  const summary: CoolifySummary = {
    total: resources.length,
    running: 0,
    degraded: 0,
    stopped: 0,
    unknown: 0,
  };
  for (const { state } of resources) summary[state]++;
  return summary;
}

/** Read-only Coolify adapter over the shared transport. */
export function createCoolifyAdapter(transport: IntegrationTransport): IntegrationAdapter<
  CoolifyConfig,
  CoolifySummary
> & {
  inventory(config: CoolifyConfig): Promise<CoolifyInventory>;
} {
  async function get(config: CoolifyConfig, path: string) {
    const url = new URL(config.url);
    const prefix = url.pathname.replace(/\/+$/, '');
    let response;
    try {
      response = await transport({
        origin: url.origin,
        path: `${prefix}${path}`,
        authorization: `Bearer ${config.secret}`,
        maxBodyBytes: MAX_BODY,
      });
    } catch {
      throw unavailable();
    }
    if (response.status === 401 || response.status === 403) throw new CoolifyBackoffError('auth');
    if (response.status === 429)
      throw new CoolifyBackoffError('rate-limited', response.retryAfterSeconds);
    if (response.status !== 200) throw unavailable();
    return response.body;
  }
  async function resources(config: CoolifyConfig): Promise<CoolifyResource[]> {
    const safe = validateCoolifyConfig(config);
    const list = parseCoolifyResources(await get(safe, RESOURCES_PATH), safe.secret);
    if (!list.some(({ type }) => type === 'application')) return list;
    // Addresses are optional: a limited token or a failing endpoint only removes them.
    let body: unknown;
    try {
      body = await get(safe, APPLICATIONS_PATH);
    } catch {
      return list;
    }
    if (!Array.isArray(body)) return list;
    const addresses = new Map<string, string[]>();
    for (const item of body) {
      if (!item || typeof item !== 'object') continue;
      const { uuid, fqdn } = item as Record<string, unknown>;
      if (typeof uuid === 'string' && COOLIFY_UUID_PATTERN.test(uuid))
        addresses.set(uuid, parseCoolifyUrls(fqdn));
    }
    for (const resource of list)
      if (resource.type === 'application') resource.urls = addresses.get(resource.uuid) ?? [];
    if (JSON.stringify(list).includes(safe.secret)) throw invalidResponse();
    return list;
  }
  return {
    type: 'coolify',
    label: 'Coolify',
    capabilities: ['inventory', 'resource-links'],
    validate: validateCoolifyConfig,
    async collect(config) {
      // The summary needs no addresses: one request, which also works with a limited token.
      const safe = validateCoolifyConfig(config);
      return summarizeCoolify(parseCoolifyResources(await get(safe, RESOURCES_PATH), safe.secret));
    },
    async inventory(config) {
      return { resources: await resources(config) };
    },
  };
}
