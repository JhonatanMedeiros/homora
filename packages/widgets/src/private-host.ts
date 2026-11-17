// Addresses that the monitor network policy only polls with explicit authorization.
export function isHomePrivateHost(url: string) {
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
