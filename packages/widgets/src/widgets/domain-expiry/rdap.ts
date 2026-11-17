export const IANA_RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

export class RdapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RdapParseError';
  }
}

export type RdapBootstrapMap = Map<string, string[]>;

function normalizeHttpsBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.hash) return null;
  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

/**
 * Parse IANA RDAP DNS bootstrap JSON (RFC 9224) into a suffix -> HTTPS base URLs map.
 */
export function parseRdapBootstrap(body: string): RdapBootstrapMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new RdapParseError('Invalid IANA RDAP bootstrap JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RdapParseError('Invalid IANA RDAP bootstrap structure.');
  }

  const services = (parsed as { services?: unknown }).services;
  if (!Array.isArray(services)) {
    throw new RdapParseError('Missing IANA RDAP bootstrap services list.');
  }

  const map: RdapBootstrapMap = new Map();
  for (const service of services) {
    if (!Array.isArray(service) || service.length < 2) continue;
    const [suffixes, rawUrls] = service as [unknown, unknown];
    if (!Array.isArray(suffixes) || !Array.isArray(rawUrls)) continue;

    const httpsUrls = rawUrls
      .map(normalizeHttpsBaseUrl)
      .filter((url): url is string => url !== null);
    if (httpsUrls.length === 0) continue;

    for (const suffix of suffixes) {
      if (typeof suffix !== 'string') continue;
      const key = suffix
        .trim()
        .toLowerCase()
        .replaceAll(/^\.+|\.+$/g, '');
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, httpsUrls);
      }
    }
  }

  return map;
}

/**
 * Resolve the authoritative HTTPS RDAP base URL for a domain via longest-suffix match (RFC 9224).
 */
export function findRdapBaseUrl(bootstrap: RdapBootstrapMap, domain: string): string | null {
  const labels = domain.toLowerCase().split('.');
  for (let index = 0; index < labels.length; index += 1) {
    const suffix = labels.slice(index).join('.');
    const urls = bootstrap.get(suffix);
    if (urls && urls.length > 0) {
      return urls[0]!;
    }
  }
  return null;
}

export type ParsedRdapDomain = {
  expiresAt: number | null;
};

/**
 * Parse an RDAP domain response (RFC 9083) and extract its registration expiration timestamp.
 * Missing or unparseable expiration events yield `expiresAt: null` (unknown/unavailable, not expired).
 */
export function parseRdapDomainResponse(body: string): ParsedRdapDomain {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new RdapParseError('Invalid RDAP domain JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RdapParseError('Invalid RDAP domain response structure.');
  }

  const events = (parsed as { events?: unknown }).events;
  if (!Array.isArray(events)) {
    return { expiresAt: null };
  }

  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    const action = (event as { eventAction?: unknown }).eventAction;
    const date = (event as { eventDate?: unknown }).eventDate;
    if (typeof action !== 'string' || action.toLowerCase() !== 'expiration') continue;
    if (typeof date !== 'string') continue;
    const timestamp = Date.parse(date);
    if (Number.isFinite(timestamp)) {
      return { expiresAt: timestamp };
    }
  }

  return { expiresAt: null };
}
