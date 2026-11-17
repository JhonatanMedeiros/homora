import {
  SourceParseError,
  SourcePolicyBlockedError,
  type WidgetSourceContext,
  type WidgetSourceReader,
} from '../../source.js';
import {
  PUBLIC_IP_FAMILIES,
  PUBLIC_IP_PROVIDERS,
  type PublicIpFamily,
  type PublicIpProvider,
} from './definition.js';
import { normalizeIpv4, normalizeIpv6 } from './ip.js';

export type PublicIpSourceParams = {
  provider: PublicIpProvider;
  addressFamily: PublicIpFamily;
};

export type PublicIpSourceResult = {
  provider: PublicIpProvider;
  addressFamily: PublicIpFamily;
  ipv4: string | null;
  ipv6: string | null;
  ipv6Unavailable: boolean;
  fetchedAt: number;
  stale: boolean;
};

const PUBLIC_IP_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_IP_CACHE_MAX_ENTRIES = 16;
const PUBLIC_IP_TIMEOUT_MS = 5000;
const PUBLIC_IP_MAX_BODY_BYTES = 4096;

type ProviderSpec = {
  ipv4Url: string;
  ipv6Url: string;
  format: 'json' | 'text';
};

export const PUBLIC_IP_PROVIDER_ENDPOINTS: Record<PublicIpProvider, ProviderSpec> = {
  ipify: {
    ipv4Url: 'https://api.ipify.org?format=json',
    ipv6Url: 'https://api6.ipify.org?format=json',
    format: 'json',
  },
  icanhazip: {
    ipv4Url: 'https://ipv4.icanhazip.com',
    ipv6Url: 'https://ipv6.icanhazip.com',
    format: 'text',
  },
};

function parseProviderResponse(
  body: string,
  format: 'json' | 'text',
  family: 'ipv4' | 'ipv6',
): string {
  let rawIp: string;
  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new SourceParseError('Invalid JSON response from IP provider.');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof (parsed as { ip?: unknown }).ip !== 'string'
    ) {
      throw new SourceParseError('Missing IP field in provider response.');
    }
    rawIp = (parsed as { ip: string }).ip;
  } else {
    rawIp = body;
  }

  const normalized = family === 'ipv4' ? normalizeIpv4(rawIp) : normalizeIpv6(rawIp);
  if (!normalized) {
    throw new SourceParseError(`Invalid ${family.toUpperCase()} address in provider response.`);
  }
  return normalized;
}

async function fetchFamily(
  url: string,
  format: 'json' | 'text',
  family: 'ipv4' | 'ipv6',
  context: WidgetSourceContext,
): Promise<string> {
  const response = await context.fetch(url, {
    allowPrivate: false,
    timeoutMs: PUBLIC_IP_TIMEOUT_MS,
    maxBodyBytes: PUBLIC_IP_MAX_BODY_BYTES,
    headers: {
      accept: format === 'json' ? 'application/json' : 'text/plain',
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }

  return parseProviderResponse(response.body, format, family);
}

export const publicIpSource: WidgetSourceReader<PublicIpSourceParams, PublicIpSourceResult> = {
  contract: 'public-ip',
  cacheTtlMs: PUBLIC_IP_CACHE_TTL_MS,
  maxCacheEntries: PUBLIC_IP_CACHE_MAX_ENTRIES,

  parseQuery(query) {
    const provider = query.provider;
    if (
      typeof provider !== 'string' ||
      !(PUBLIC_IP_PROVIDERS as readonly string[]).includes(provider)
    ) {
      return null;
    }

    const addressFamily = query.addressFamily;
    if (
      typeof addressFamily !== 'string' ||
      !(PUBLIC_IP_FAMILIES as readonly string[]).includes(addressFamily)
    ) {
      return null;
    }

    return {
      cacheKey: `${provider}\0${addressFamily}`,
      params: {
        provider: provider as PublicIpProvider,
        addressFamily: addressFamily as PublicIpFamily,
      },
    };
  },

  async read(params, context) {
    const spec = PUBLIC_IP_PROVIDER_ENDPOINTS[params.provider];

    if (params.addressFamily === 'ipv4') {
      const ipv4 = await fetchFamily(spec.ipv4Url, spec.format, 'ipv4', context);
      return {
        provider: params.provider,
        addressFamily: params.addressFamily,
        ipv4,
        ipv6: null,
        ipv6Unavailable: false,
        fetchedAt: context.now(),
        stale: false,
      };
    }

    if (params.addressFamily === 'ipv6') {
      const ipv6 = await fetchFamily(spec.ipv6Url, spec.format, 'ipv6', context);
      return {
        provider: params.provider,
        addressFamily: params.addressFamily,
        ipv4: null,
        ipv6,
        ipv6Unavailable: false,
        fetchedAt: context.now(),
        stale: false,
      };
    }

    const [v4Result, v6Result] = await Promise.allSettled([
      fetchFamily(spec.ipv4Url, spec.format, 'ipv4', context),
      fetchFamily(spec.ipv6Url, spec.format, 'ipv6', context),
    ]);

    if (v4Result.status === 'rejected' && v4Result.reason instanceof SourcePolicyBlockedError) {
      throw v4Result.reason;
    }
    if (v6Result.status === 'rejected' && v6Result.reason instanceof SourcePolicyBlockedError) {
      throw v6Result.reason;
    }

    const ipv4 = v4Result.status === 'fulfilled' ? v4Result.value : null;
    const ipv6 = v6Result.status === 'fulfilled' ? v6Result.value : null;

    if (ipv4 === null && ipv6 === null) {
      throw v4Result.status === 'rejected' ? v4Result.reason : new Error('Failed to fetch IP');
    }

    return {
      provider: params.provider,
      addressFamily: params.addressFamily,
      ipv4,
      ipv6,
      ipv6Unavailable: ipv6 === null,
      fetchedAt: context.now(),
      stale: false,
    };
  },
};
