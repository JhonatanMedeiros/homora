import { defineWidget } from '../../index.js';

export const MAX_DOMAINS = 5;
export const MAX_DOMAIN_LENGTH = 253;
export const MAX_DOMAIN_TITLE_LENGTH = 80;
export const DEFAULT_WARN_DAYS = 30;
export const MIN_WARN_DAYS = 1;
export const MAX_WARN_DAYS = 365;

const RESERVED_TLDS = new Set([
  'local',
  'localhost',
  'internal',
  'lan',
  'home',
  'corp',
  'arpa',
  'invalid',
  'onion',
]);

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ALPHA_TLD_PATTERN = /^[a-z]{2,}$/;
const PUNYCODE_TLD_PATTERN = /^xn--[a-z0-9]{1,59}$/;

export type DomainExpiryConfig = {
  title: string;
  domains: string[];
  warnDays: number;
};

export const defaultDomainExpiryConfig: DomainExpiryConfig = {
  title: '',
  domains: [],
  warnDays: DEFAULT_WARN_DAYS,
};

/**
 * Validate and normalize a public domain name for RDAP lookup.
 * Rejects URLs, IPs, ports, paths, credentials, single-label hosts, and reserved local TLDs.
 */
export function parsePublicDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_DOMAIN_LENGTH) return null;
  if (/[\s/:?#@\\[\]%]/.test(trimmed)) return null;
  if (trimmed.startsWith('.') || trimmed.endsWith('.') || trimmed.includes('..')) return null;

  let url: URL;
  try {
    url = new URL(`https://${trimmed}`);
  } catch {
    return null;
  }

  const hostname = url.hostname;
  if (!hostname || hostname.length > MAX_DOMAIN_LENGTH) return null;

  const labels = hostname.split('.');
  if (labels.length < 2) return null;
  if (labels.some((label) => !LABEL_PATTERN.test(label))) return null;

  const tld = labels.at(-1)!;
  if (!ALPHA_TLD_PATTERN.test(tld) && !PUNYCODE_TLD_PATTERN.test(tld)) return null;
  if (RESERVED_TLDS.has(tld)) return null;

  return hostname;
}

export const widgetDomainExpiryWidget = defineWidget<DomainExpiryConfig>({
  type: 'domain-expiry',
  version: 1,
  locations: ['page'],
  sizes: ['normal', 'wide'],
  source: null,
  portable: true,
  defaultConfig: defaultDomainExpiryConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => !['title', 'domains', 'warnDays'].includes(key))) {
      return null;
    }

    if (config.title !== undefined && typeof config.title !== 'string') return null;
    const title = typeof config.title === 'string' ? config.title.trim() : '';
    if (title.length > MAX_DOMAIN_TITLE_LENGTH) return null;

    if (!Array.isArray(config.domains)) return null;
    if (config.domains.length === 0 || config.domains.length > MAX_DOMAINS) return null;

    const domains: string[] = [];
    const seen = new Set<string>();
    for (const entry of config.domains) {
      const normalized = parsePublicDomain(entry);
      if (!normalized) return null;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        domains.push(normalized);
      }
    }

    if (
      typeof config.warnDays !== 'number' ||
      !Number.isInteger(config.warnDays) ||
      config.warnDays < MIN_WARN_DAYS ||
      config.warnDays > MAX_WARN_DAYS
    ) {
      return null;
    }

    return { title, domains, warnDays: config.warnDays };
  },
});
