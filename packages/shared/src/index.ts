import { BRAND_ICON_NAMES } from './brand-icons.js';

export * from './appearance.js';
export * from './custom-css.js';
export * from './pages.js';
export { BRAND_ICON_NAMES };
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
  /** What `keyword` and `json` checks look for in the response; null clears it. */
  checkMatch?: string | null;
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
    ...(isCheckType(input.checkType) ? { checkType: input.checkType } : {}),
    ...(input.expectedStatus === null || isExpectedStatus(input.expectedStatus)
      ? { expectedStatus: input.expectedStatus === null ? null : String(input.expectedStatus) }
      : {}),
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

export const UPTIME_RANGES = ['24h', '7d', '30d'] as const;
export type UptimeRange = (typeof UPTIME_RANGES)[number];
export type UptimeBucketStatus = 'up' | 'down' | 'partial' | 'unknown';
/** One period of the history bar. Latency and failure detail are absent when the period has no checks. */
export type UptimeBucket = {
  start: string;
  status: UptimeBucketStatus;
  /** Checks of every kind made in the period. */
  checks?: number;
  /** Mean latency of the successful checks, in milliseconds. */
  avgLatencyMs?: number | null;
  /** Why the most recent failed check of the period failed (the monitor's vocabulary). */
  reason?: string;
  httpStatus?: number | null;
};

/**
 * How a service's health is read (see `service_monitor_settings`). `failureThreshold` is the
 * number of consecutive failed checks before an incident opens and an alert is sent; `recoveryThreshold`
 * the number of consecutive successes before it closes; `degradedLatencyMs` the latency above
 * which an online service reads "Degraded" (null: never).
 */
export type MonitorSettings = {
  failureThreshold: number;
  recoveryThreshold: number;
  degradedLatencyMs: number | null;
};
export const DEFAULT_MONITOR_SETTINGS: MonitorSettings = {
  failureThreshold: 1,
  recoveryThreshold: 1,
  degradedLatencyMs: null,
};
export const THRESHOLD_MAX = 10;
export const DEGRADED_LATENCY_MIN = 50;
export const DEGRADED_LATENCY_MAX = 60_000;
/** Returns normalized settings, or null when the value is not a well-formed settings object. */
export function parseMonitorSettings(value: unknown): MonitorSettings | null {
  if (!value || typeof value !== 'object') return null;
  const { failureThreshold, recoveryThreshold, degradedLatencyMs, ...rest } = value as Record<
    string,
    unknown
  >;
  if (Object.keys(rest).length) return null;
  const threshold = (n: unknown): n is number =>
    Number.isSafeInteger(n) && Number(n) >= 1 && Number(n) <= THRESHOLD_MAX;
  if (!threshold(failureThreshold) || !threshold(recoveryThreshold)) return null;
  if (degradedLatencyMs !== null) {
    if (
      !Number.isSafeInteger(degradedLatencyMs) ||
      Number(degradedLatencyMs) < DEGRADED_LATENCY_MIN ||
      Number(degradedLatencyMs) > DEGRADED_LATENCY_MAX
    )
      return null;
  }
  return {
    failureThreshold,
    recoveryThreshold,
    degradedLatencyMs: degradedLatencyMs === null ? null : Number(degradedLatencyMs),
  };
}
/** An online service that answered slower than its limit; failing or unknown services never are. */
export function isDegraded(
  settings: Pick<MonitorSettings, 'degradedLatencyMs'> | undefined,
  status: string | undefined,
  latencyMs: number | null | undefined,
): boolean {
  return (
    status === 'available' &&
    typeof settings?.degradedLatencyMs === 'number' &&
    typeof latencyMs === 'number' &&
    latencyMs > settings.degradedLatencyMs
  );
}

/** A period in which a service was down. `endedAt` is null while it is still down. */
export type Incident = {
  id: number;
  serviceId: number;
  startedAt: number;
  endedAt: number | null;
  reason: string;
  httpStatus: number | null;
  failedChecks: number;
};
/** Fleet-wide numbers for the dashboard banner. Times are milliseconds. */
export type StatusOverview = {
  generatedAt: string;
  /** Only services whose settings differ from the defaults. */
  settings: Record<number, MonitorSettings>;
  /** The incident each service is in right now. */
  open: Record<number, Incident>;
  /** Incidents that started in the last 7 days, and in the 7 days before that. */
  incidents7d: number;
  incidentsPrevious7d: number;
  /** Mean duration of the incidents that ended in the last 30 days; null when there were none. */
  mttrMs: number | null;
  /** Longest stretch in the last 30 days without any open incident. */
  longestCleanMs: number;
  /** Availability over the last 30 days across all services, against the configured target. */
  sla: { targetPct: number; actualPct: number | null };
};
export const SLA_TARGET_DEFAULT = 99.9;
/** Availability over a period; `uptimePct` is null while there are too few checks to be meaningful. */
export type UptimeSummary = {
  range: UptimeRange;
  uptimePct: number | null;
  /** Every check in the period under the current configuration, including unknown ones. */
  checks: number;
  downChecks: number;
  unknownChecks: number;
  lastLatencyMs: number | null;
  /** Availability of the period right before this one (same length), or null without enough data. */
  previousUptimePct?: number | null;
  /** Nearest-rank 95th percentile of successful checks; only present on the single-service endpoint. */
  p95LatencyMs?: number | null;
  /** True when older checks in this period were made under a different configuration and are left out. */
  reconfigured: boolean;
  buckets: UptimeBucket[];
};

/** A scheduled maintenance window of one service (epoch milliseconds). */
export type Maintenance = {
  id: number;
  serviceId: number;
  startsAt: number;
  endsAt: number;
  note: string;
};
export const MAINTENANCE_NOTE_MAX = 140;
/** A window is at least a minute and at most 30 days long. */
export const MAINTENANCE_MIN_MS = 60_000;
export const MAINTENANCE_MAX_MS = 30 * 24 * 3_600_000;
/** What the dashboard needs: windows open now and the ones still to come, soonest first. */
export type MaintenanceOverview = { windows: Maintenance[] };

/** Median and 95th percentile of the successful checks of one slot of the latency chart. */
export type LatencyPoint = {
  start: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  checks: number;
};
export type LatencySeries = {
  range: UptimeRange;
  bucketMs: number;
  start: number;
  points: LatencyPoint[];
  p50: number | null;
  p95: number | null;
  max: number | null;
};
/** Extra data of the service detail page. `heat` rows are hourly counts of checks. */
export type ServiceInsights = {
  generatedAt: number;
  heat: { hour: number; up: number; down: number; unknown: number }[];
  reasons: { reason: string; httpStatus: number | null; count: number }[];
  recent: {
    observedAt: number;
    status: 'available' | 'unavailable' | 'unknown';
    reason: string;
    httpStatus: number | null;
    latencyMs: number | null;
  }[];
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
export * from './coolify.js';

export const TAG_MAX_LENGTH = 24;
export const TAGS_MAX_PER_SERVICE = 6;
/** Lower-case, trimmed, inner whitespace collapsed to "-"; `null` when nothing usable is left. */
export function normalizeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replace(/\s+/g, '-');
  return tag.length > 0 &&
    tag.length <= TAG_MAX_LENGTH &&
    ![...tag].some((char) => char.charCodeAt(0) < 32 || char === '<' || char === '>')
    ? tag
    : null;
}
export type TagsOverview = { tags: Record<number, string[]> };
