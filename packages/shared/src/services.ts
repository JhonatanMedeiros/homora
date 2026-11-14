import { BRAND_ICON_NAMES } from '@homora/icons';
import type { HostLink } from './hosts.js';
import type { ServiceLink } from './service-links.js';

/**
 * How a service is probed: HTTP GET (default), ICMP ping, a TCP connection, a DNS lookup of the
 * host, the TLS certificate of the host, or an HTTP GET whose body must contain a text (`keyword`)
 * or whose JSON must hold a value (`json`).
 */
export const CHECK_TYPES = ['http', 'ping', 'tcp', 'dns', 'tls', 'keyword', 'json'] as const;
export type CheckType = (typeof CHECK_TYPES)[number];
export const isCheckType = (value: unknown): value is CheckType =>
  typeof value === 'string' && (CHECK_TYPES as readonly string[]).includes(value);
/** Types that read the response body and therefore need `checkMatch`. */
export const BODY_CHECK_TYPES: readonly CheckType[] = ['keyword', 'json'];
export const CHECK_MATCH_MAX = 200;
/** Days before expiry at which a certificate starts to read as "expiring". */
export const CERT_WARNING_DAYS = 14;
/** A keyword, or `path=value` for the JSON check; printable text only. */
export const isCheckMatch = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= CHECK_MATCH_MAX &&
  !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
export type ExpectedStatus = string | number;

export const isExpectedStatus = (value: unknown): value is ExpectedStatus =>
  (typeof value === 'string' || typeof value === 'number') &&
  /^(?:[1-5][0-9]{2}|2xx|3xx)$/.test(String(value));

export const isCheckPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 2048 &&
  /^\/(?!\/)/.test(value) &&
  !/[\s\\#]/.test(value) &&
  !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
  !value.includes('://');

/** A complete monitoring target, without credentials, query, or fragment. */
export const isCheckUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !value.includes('?') &&
      !value.includes('#')
    );
  } catch {
    return false;
  }
};

export const CHECK_INTERVAL_MIN = 30;
export const CHECK_INTERVAL_MAX = 3600;
export const CHECK_INTERVAL_DEFAULT = 60;

export const OPEN_TARGETS = ['new-tab', 'same-tab'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

export const isServiceAlias = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export type ServiceInput = {
  /** Omitted preserves the existing alias; null removes it. */
  alias?: string | null;
  /** Omitted preserves the current value, or opens a new tab for new services. */
  openTarget?: OpenTarget;
  name: string;
  url: string;
  category: string;
  description: string;
  icon?: string;
  position?: number;
  allowPrivate?: boolean;
  checkInsecure?: boolean;
  /** When omitted preserves current value (or `http` for a new card). */
  checkType?: CheckType;
  /** Seconds between checks; null restores default and omitted preserves the current value. */
  checkInterval?: number | null;
  expectedStatus?: ExpectedStatus | null;
  checkPath?: string | null;
  checkUrl?: string | null;
  /** What `keyword` and `json` checks look for in the response; null clears it. */
  checkMatch?: string | null;
};

/** `isPublic` comes only from the authenticated listing; it is not part of ServiceInput on purpose. */
export type Service = ServiceInput & {
  id: number;
  isPublic?: boolean;
  host?: HostLink | null;
  /** Favorite: shown in the Pinned row of the Home. Not part of the card's configuration version. */
  pinned?: boolean;
  pinnedPosition?: number | null;
  /** Extra addresses, in order; empty or absent when the card has none. */
  links?: ServiceLink[];
};

/** Invalid service input; `code` is stable and message is in English. */
export class ServiceValidationError extends Error {
  constructor(readonly code: 'invalid-url' | 'invalid-name-or-category' | 'invalid-alias') {
    super(
      code === 'invalid-alias'
        ? 'Provide a valid alias.'
        : code === 'invalid-url'
          ? 'Provide a valid HTTP or HTTPS URL without credentials.'
          : 'Provide a valid name and category.',
    );
    this.name = 'ServiceValidationError';
  }
}

/** Built-in icons (`lucide:name`). The UI registers a component for each. */
export const ICON_NAMES = [
  'server',
  'hard-drive',
  'database',
  'cloud',
  'shield',
  'shield-check',
  'lock',
  'key-round',
  'network',
  'router',
  'wifi',
  'globe',
  'cpu',
  'memory-stick',
  'monitor',
  'tv',
  'laptop',
  'smartphone',
  'tablet',
  'printer',
  'camera',
  'video',
  'film',
  'clapperboard',
  'music',
  'headphones',
  'radio',
  'podcast',
  'book',
  'book-open',
  'library',
  'image',
  'images',
  'gamepad-2',
  'download',
  'upload',
  'folder',
  'file-text',
  'notebook-pen',
  'calendar',
  'clock',
  'mail',
  'message-circle',
  'messages-square',
  'rss',
  'bot',
  'brain-circuit',
  'terminal',
  'code',
  'git-branch',
  'container',
  'boxes',
  'package',
  'activity',
  'chart-line',
  'gauge',
  'thermometer',
  'zap',
  'plug',
  'lightbulb',
  'house',
  'building-2',
  'map-pin',
  'shopping-cart',
  'wallet',
  'receipt-text',
  'credit-card',
  'users',
  'user',
  'settings',
  'wrench',
  'cog',
  'bell',
  'search',
  'star',
  'heart',
  'bookmark',
  'link',
  'qr-code',
  'sliders-horizontal',
  'toggle-left',
  'power',
  'refresh-cw',
  'archive',
  'trash-2',
  'chart-bar',
  'rocket',
  'flame',
  'droplets',
  'sun',
  'moon',
  'cctv',
  'speaker',
  'airplay',
  'cast',
  'tv-minimal',
] as const;

export const ICON_MAX_LENGTH = 512;
const ICON_TEXT_MAX_LENGTH = 8;
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalizes a service icon. Accepted formats: short text or emoji (up to 8
 * characters), `lucide:name` or `brand:name` (built-in icons) and http(s) image URL without credentials.
 * Anything else falls back to short text.
 */
export function normalizeIcon(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('lucide:')) {
    const name = raw.slice('lucide:'.length);
    return name.length <= 60 && ICON_NAME.test(name) ? raw : '';
  }
  if (raw.startsWith('brand:')) {
    const name = raw.slice('brand:'.length);
    return (BRAND_ICON_NAMES as readonly string[]).includes(name) ? raw : '';
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!url.username && !url.password && url.href.length <= ICON_MAX_LENGTH) return url.href;
    } catch {
      // Falls through to short text handling below.
    }
    return '';
  }
  return raw.slice(0, ICON_TEXT_MAX_LENGTH);
}

export function validateService(input: Partial<ServiceInput>): ServiceInput {
  if (input.checkUrl != null && !isCheckUrl(input.checkUrl))
    throw new ServiceValidationError('invalid-url');
  if (input.alias !== undefined && input.alias !== null && !isServiceAlias(input.alias))
    throw new ServiceValidationError('invalid-alias');
  const name = String(input.name ?? '').trim();
  const category = String(input.category ?? '').trim();
  let url: URL;
  try {
    url = new URL(input.url ?? '');
  } catch {
    throw new ServiceValidationError('invalid-url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new ServiceValidationError('invalid-url');
  if (!name || name.length > 80 || !category || category.length > 40)
    throw new ServiceValidationError('invalid-name-or-category');
  return {
    name,
    category,
    url: url.href,
    ...(input.alias !== undefined ? { alias: input.alias } : {}),
    description: String(input.description ?? '')
      .trim()
      .slice(0, 140),
    icon: normalizeIcon(input.icon),
    position:
      Number.isSafeInteger(input.position) && Number(input.position) >= 0
        ? Number(input.position)
        : 0,
    allowPrivate: input.allowPrivate === true,
    ...(input.checkInsecure !== undefined ? { checkInsecure: input.checkInsecure === true } : {}),
    ...(OPEN_TARGETS.some((target) => target === input.openTarget)
      ? { openTarget: input.openTarget }
      : {}),
    ...(isCheckType(input.checkType) ? { checkType: input.checkType } : {}),
    ...(input.expectedStatus === null || isExpectedStatus(input.expectedStatus)
      ? { expectedStatus: input.expectedStatus === null ? null : String(input.expectedStatus) }
      : {}),
    ...(input.checkUrl === null || isCheckUrl(input.checkUrl) ? { checkUrl: input.checkUrl } : {}),
    ...(input.checkPath === null || isCheckPath(input.checkPath)
      ? { checkPath: input.checkPath }
      : {}),
    ...(input.checkMatch === null || isCheckMatch(input.checkMatch)
      ? { checkMatch: input.checkMatch }
      : {}),
    ...(input.checkInterval === null
      ? { checkInterval: null }
      : Number.isSafeInteger(input.checkInterval) &&
          Number(input.checkInterval) >= CHECK_INTERVAL_MIN &&
          Number(input.checkInterval) <= CHECK_INTERVAL_MAX
        ? { checkInterval: Number(input.checkInterval) }
        : {}),
  };
}
