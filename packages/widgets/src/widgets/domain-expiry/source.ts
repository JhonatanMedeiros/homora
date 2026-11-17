import {
  SourceParseError,
  SourcePolicyBlockedError,
  type WidgetSourceContext,
  type WidgetSourceReader,
} from '../../source.js';
import { MAX_DOMAINS, parsePublicDomain } from './definition.js';
import {
  IANA_RDAP_BOOTSTRAP_URL,
  RdapParseError,
  findRdapBaseUrl,
  parseRdapBootstrap,
  parseRdapDomainResponse,
  type RdapBootstrapMap,
} from './rdap.js';

export type DomainExpiryStatus = 'ok' | 'unknown' | 'not-found' | 'error' | 'policy-blocked';

export type DomainExpiryEntry = {
  domain: string;
  status: DomainExpiryStatus;
  expiresAt: number | null;
};

export type DomainExpirySourceParams = {
  domains: string[];
};

export type DomainExpirySourceResult = {
  domains: DomainExpiryEntry[];
  fetchedAt: number;
  stale: boolean;
};

const SOURCE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const SOURCE_CACHE_MAX_ENTRIES = 64;
const BOOTSTRAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RDAP_TIMEOUT_MS = 5000;
const RDAP_MAX_BODY_BYTES = 256 * 1024;
const BOOTSTRAP_MAX_BODY_BYTES = 512 * 1024;

let cachedBootstrap: { map: RdapBootstrapMap; fetchedAt: number } | null = null;
let bootstrapInFlight: Promise<RdapBootstrapMap> | null = null;

/** Clear the in-memory IANA RDAP DNS bootstrap cache (primarily for tests). */
export function clearRdapBootstrapCache(): void {
  cachedBootstrap = null;
  bootstrapInFlight = null;
}

async function getBootstrapMap(context: WidgetSourceContext): Promise<RdapBootstrapMap> {
  const now = context.now();
  if (cachedBootstrap && now - cachedBootstrap.fetchedAt < BOOTSTRAP_CACHE_TTL_MS) {
    return cachedBootstrap.map;
  }

  if (!bootstrapInFlight) {
    bootstrapInFlight = (async () => {
      try {
        const response = await context.fetch(IANA_RDAP_BOOTSTRAP_URL, {
          allowPrivate: false,
          timeoutMs: RDAP_TIMEOUT_MS,
          maxBodyBytes: BOOTSTRAP_MAX_BODY_BYTES,
          headers: { accept: 'application/json' },
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`IANA RDAP bootstrap HTTP ${response.status}`);
        }
        const map = parseRdapBootstrap(response.body);
        cachedBootstrap = { map, fetchedAt: context.now() };
        return map;
      } catch (error) {
        if (error instanceof RdapParseError) {
          throw new SourceParseError(error.message);
        }
        throw error;
      } finally {
        bootstrapInFlight = null;
      }
    })();
  }

  return bootstrapInFlight;
}

async function queryDomainRdap(
  domain: string,
  bootstrap: RdapBootstrapMap,
  context: WidgetSourceContext,
): Promise<DomainExpiryEntry> {
  const baseUrl = findRdapBaseUrl(bootstrap, domain);
  if (!baseUrl) {
    return { domain, status: 'unknown', expiresAt: null };
  }

  const endpoint = `${baseUrl}domain/${encodeURIComponent(domain)}`;
  try {
    const response = await context.fetch(endpoint, {
      allowPrivate: false,
      timeoutMs: RDAP_TIMEOUT_MS,
      maxBodyBytes: RDAP_MAX_BODY_BYTES,
      headers: { accept: 'application/rdap+json, application/json;q=0.8' },
    });

    if (response.status === 404) {
      return { domain, status: 'not-found', expiresAt: null };
    }
    if (response.status < 200 || response.status >= 300) {
      return { domain, status: 'error', expiresAt: null };
    }

    const parsed = parseRdapDomainResponse(response.body);
    if (parsed.expiresAt === null) {
      return { domain, status: 'unknown', expiresAt: null };
    }
    return { domain, status: 'ok', expiresAt: parsed.expiresAt };
  } catch (error) {
    if (error instanceof SourcePolicyBlockedError) {
      return { domain, status: 'policy-blocked', expiresAt: null };
    }
    return { domain, status: 'error', expiresAt: null };
  }
}

export const domainExpirySource: WidgetSourceReader<
  DomainExpirySourceParams,
  DomainExpirySourceResult
> = {
  contract: 'domain-expiry',
  cacheTtlMs: SOURCE_CACHE_TTL_MS,
  maxCacheEntries: SOURCE_CACHE_MAX_ENTRIES,

  parseQuery(query) {
    const raw = typeof query.domains === 'string' ? query.domains.trim() : '';
    if (!raw) return null;

    const parts = raw.split(',');
    if (parts.length === 0 || parts.length > MAX_DOMAINS) return null;

    const domains: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const normalized = parsePublicDomain(part);
      if (!normalized) return null;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        domains.push(normalized);
      }
    }

    const canonical = [...domains].sort().join(',');
    return {
      cacheKey: canonical,
      params: { domains },
    };
  },

  async read(params, context) {
    const bootstrap = await getBootstrapMap(context);
    const entries = await Promise.all(
      params.domains.map((domain) => queryDomainRdap(domain, bootstrap, context)),
    );

    if (entries.every((entry) => entry.status === 'policy-blocked')) {
      throw new SourcePolicyBlockedError('destination-disallowed', 'Blocked by network policy.');
    }
    if (entries.every((entry) => entry.status === 'error')) {
      throw new Error('All RDAP domain lookups failed.');
    }

    return {
      domains: entries,
      fetchedAt: context.now(),
      stale: false,
    };
  },

  project(cached, params) {
    const byDomain = new Map(cached.domains.map((entry) => [entry.domain, entry]));
    return {
      ...cached,
      domains: params.domains.map(
        (domain) => byDomain.get(domain) ?? { domain, status: 'unknown', expiresAt: null },
      ),
    };
  },
};
