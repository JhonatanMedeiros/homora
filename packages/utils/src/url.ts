export type HttpUrlOptions = {
  httpsOnly?: boolean;
  allowPath?: boolean;
  allowQuery?: boolean;
  allowHash?: boolean;
  maxLength?: number;
};

/**
 * Parses `value` as an HTTP(S) URL without embedded credentials. Returns `null` when invalid or
 * when any constraint in `options` fails.
 */
export function parseHttpUrl(value: unknown, options: HttpUrlOptions = {}): URL | null {
  if (typeof value !== 'string') return null;
  if (options.maxLength !== undefined && value.length > options.maxLength) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const allowedProtocols = options.httpsOnly ? ['https:'] : ['http:', 'https:'];
  if (!allowedProtocols.includes(url.protocol) || url.username || url.password) return null;
  if (options.allowQuery === false && url.search) return null;
  if (options.allowHash === false && url.hash) return null;
  if (options.allowPath === false && url.pathname !== '/') return null;
  return url;
}

/** True when `value` is an HTTP or HTTPS URL without embedded credentials. */
export function isHttpUrl(value: unknown, maxLength?: number): value is string {
  return parseHttpUrl(value, { maxLength }) !== null;
}

/** Extracts `host` (hostname and port) from a URL, falling back to the original string. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Addresses compare by protocol, host and path, ignoring case, trailing slash and default port. */
export function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const key = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
      return value.trim().toLowerCase();
    }
  };
  return key(a) === key(b);
}

/** Addresses that typically resolve to local/private networks without DNS resolution. */
export function isPrivateHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replaceAll(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
  if (/^(10|127)\./.test(host) || host.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith('169.254.')) return true;
  return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith('fe80:');
}
