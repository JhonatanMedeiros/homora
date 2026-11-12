import type { Service } from '@homora/shared';
import { hostOf, type Availability, type ServiceStatus } from '@/lib/services';

export type PaletteSort = 'relevance' | 'name' | 'status';

export type ParsedQuery = {
  /** Free text left after the prefixes are removed. */
  text: string;
  status: Availability | null;
  group: string | null;
  /** True when a recognised prefix with a value is present. */
  filtered: boolean;
};

const STATUS_ALIASES: Record<string, Availability> = {
  down: 'unavailable',
  fora: 'unavailable',
  unavailable: 'unavailable',
  up: 'available',
  online: 'available',
  available: 'available',
  unknown: 'unknown',
  desconhecido: 'unknown',
};

// key:value or key:"value with spaces"
const PREFIX = /(?:^|\s)(status|grupo|group):(?:"([^"]*)"|(\S*))/gi;

/** Splits `status:down grupo:Apps jelly` into filters and the remaining search text. */
export function parseQuery(input: string): ParsedQuery {
  let status: Availability | null = null;
  let group: string | null = null;
  const text = input
    .replace(PREFIX, (match, key: string, quoted: string | undefined, bare: string | undefined) => {
      const value = (quoted ?? bare ?? '').trim();
      // A prefix still being typed (`status:`) is dropped so it does not hide everything.
      if (!value) return ' ';
      if (key.toLowerCase() === 'status') {
        const parsed = STATUS_ALIASES[value.toLowerCase()];
        // Unknown status values are kept as text, so nothing matches instead of everything.
        if (!parsed) return match;
        status = parsed;
      } else {
        group = value;
      }
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, status, group, filtered: status !== null || group !== null };
}

/** Name, group, description and host, the fields the search covers. */
export const searchFields = (service: Service) =>
  `${service.name} ${service.category} ${service.description} ${hostOf(service.url)} ${service.url}`;

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** 0 means no match; substring matches rank above scattered-letter matches and earlier is better. */
export function score(haystack: string, needle: string): number {
  const text = fold(haystack);
  const query = fold(needle).trim();
  if (!query) return 1;
  const at = text.indexOf(query);
  if (at >= 0) return 1 - (at / (text.length + 1)) * 0.5;
  let from = 0;
  for (const char of query.replaceAll(/\s+/g, '')) {
    const next = text.indexOf(char, from);
    if (next < 0) return 0;
    from = next + 1;
  }
  return 0.1;
}

/** Applies status and group prefixes; the text part is left to the palette's own ranking. */
export function filterServices(
  services: Service[],
  statuses: Record<number, ServiceStatus>,
  blockedIds: Set<number>,
  parsed: ParsedQuery,
): Service[] {
  return services.filter((service) => {
    if (parsed.group && fold(service.category) !== fold(parsed.group)) return false;
    if (parsed.status) {
      const current = statuses[service.id]?.status ?? 'unknown';
      // Services that are not monitored by policy are not "down" even if the last probe failed.
      if (parsed.status === 'unavailable' && blockedIds.has(service.id)) return false;
      if (current !== parsed.status) return false;
    }
    return true;
  });
}

/** Orders services for the palette; `relevance` keeps the incoming order for the ranker to refine. */
export function sortServices(
  services: Service[],
  statuses: Record<number, ServiceStatus>,
  sort: PaletteSort,
): Service[] {
  if (sort === 'relevance') return services;
  const rank = (service: Service) => {
    const status = statuses[service.id]?.status ?? 'unknown';
    return status === 'unavailable' ? 0 : status === 'unknown' ? 1 : 2;
  };
  return [...services].sort((a, b) =>
    sort === 'status'
      ? rank(a) - rank(b) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  );
}
