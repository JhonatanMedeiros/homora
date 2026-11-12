import { BRAND_ICON_NAMES } from './brand-icons.js';

export * from './appearance.js';
export * from './custom-css.js';
export * from './pages.js';
export { BRAND_ICON_NAMES };
/** Service monitor probe method: HTTP GET (default) or ICMP ping. */
export type CheckType = 'http' | 'ping';
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
export const CHECK_INTERVAL_MIN = 30;
export const CHECK_INTERVAL_MAX = 3600;
export const CHECK_INTERVAL_DEFAULT = 60;

export type ServiceInput = {
  name: string;
  url: string;
  category: string;
  description: string;
  icon?: string;
  position?: number;
  allowPrivate?: boolean;
  /** When omitted preserves current value (or `http` for a new card). */
  checkType?: CheckType;
  /** Seconds between checks; null restores default and omitted preserves current value. */
  checkInterval?: number | null;
  expectedStatus?: ExpectedStatus | null;
  checkPath?: string | null;
};
/** `isPublic` comes only from the authenticated listing; it is not part of ServiceInput on purpose. */
export type Service = ServiceInput & { id: number; isPublic?: boolean; host?: HostLink | null };

/** Invalid service input; `code` is stable and message is in English. */
export class ServiceValidationError extends Error {
  constructor(readonly code: 'invalid-url' | 'invalid-name-or-category') {
    super(
      code === 'invalid-url'
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
    description: String(input.description ?? '')
      .trim()
      .slice(0, 140),
    icon: normalizeIcon(input.icon),
    position:
      Number.isSafeInteger(input.position) && Number(input.position) >= 0
        ? Number(input.position)
        : 0,
    allowPrivate: input.allowPrivate === true,
    ...(input.checkType === 'http' || input.checkType === 'ping'
      ? { checkType: input.checkType }
      : {}),
    ...(input.expectedStatus === null || isExpectedStatus(input.expectedStatus)
      ? { expectedStatus: input.expectedStatus === null ? null : String(input.expectedStatus) }
      : {}),
    ...(input.checkPath === null || isCheckPath(input.checkPath)
      ? { checkPath: input.checkPath }
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

export const UPTIME_RANGES = ['24h', '7d', '30d'] as const;
export type UptimeRange = (typeof UPTIME_RANGES)[number];
export type UptimeBucketStatus = 'up' | 'down' | 'partial' | 'unknown';
/** Availability over a period; `uptimePct` is null while there are too few checks to be meaningful. */
export type UptimeSummary = {
  range: UptimeRange;
  uptimePct: number | null;
  /** Every check in the period under the current configuration, including unknown ones. */
  checks: number;
  downChecks: number;
  unknownChecks: number;
  lastLatencyMs: number | null;
  /** Nearest-rank 95th percentile of successful checks; only present on the single-service endpoint. */
  p95LatencyMs?: number | null;
  /** True when older checks in this period were made under a different configuration and are left out. */
  reconfigured: boolean;
  buckets: { start: string; status: UptimeBucketStatus }[];
};

/** Guest kinds that Proxmox reports in its cluster inventory. */
export type GuestType = 'qemu' | 'lxc';
/** Optional "runs on" link from a card to a Proxmox guest. Stores ids only, never guest names. */
export type HostLink = { connectionId: number; node: string; vmid: number; type: GuestType };
/** Proxmox node names are DNS-like labels. */
export const isNodeName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/.test(value);
export const isVmid = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 100 && Number(value) <= 999_999_999;
/** Returns a normalized link, or null when the value is not a well-formed link. */
export function parseHostLink(value: unknown): HostLink | null {
  if (!value || typeof value !== 'object') return null;
  const { connectionId, node, vmid, type, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  if (!Number.isSafeInteger(connectionId) || Number(connectionId) <= 0) return null;
  if (!isNodeName(node) || !isVmid(vmid) || (type !== 'qemu' && type !== 'lxc')) return null;
  return { connectionId: Number(connectionId), node, vmid, type };
}
export * from './integration-manifest.js';
