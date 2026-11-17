const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET_PATTERN = /^[0-9a-fA-F]{1,4}$/;

/** Validate and normalize an IPv4 address string, rejecting leading zeros and out-of-range octets. */
export function normalizeIpv4(raw: string): string | null {
  const trimmed = raw.trim();
  const match = IPV4_PATTERN.exec(trimmed);
  if (!match) return null;

  const octets: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const part = match[i];
    if (part.length > 1 && part.startsWith('0')) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    octets.push(value);
  }
  return octets.join('.');
}

function parseHextetSide(side: string, allowTrailingIpv4: boolean): number[] | null {
  if (side === '') return [];
  const segments = side.split(':');
  const hextets: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '') return null;
    const isLast = i === segments.length - 1;
    if (allowTrailingIpv4 && isLast && seg.includes('.')) {
      const ipv4 = normalizeIpv4(seg);
      if (!ipv4) return null;
      const [a, b, c, d] = ipv4.split('.').map(Number);
      hextets.push((a << 8) | b, (c << 8) | d);
      continue;
    }
    if (!HEXTET_PATTERN.test(seg)) return null;
    hextets.push(Number.parseInt(seg, 16));
  }

  return hextets;
}

/** Validate and normalize an IPv6 address into RFC 5952 canonical compressed lowercase form. */
export function normalizeIpv6(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('%') || trimmed.includes('[') || trimmed.includes(']')) {
    return null;
  }

  const parts = trimmed.split('::');
  if (parts.length > 2) return null;

  const hasCompression = parts.length === 2;
  const leftRaw = parts[0];
  const rightRaw = hasCompression ? parts[1] : '';

  if (!hasCompression && leftRaw === '') return null;

  const left = parseHextetSide(leftRaw, !hasCompression);
  if (!left) return null;

  let hextets: number[];
  if (hasCompression) {
    const right = parseHextetSide(rightRaw, true);
    if (!right) return null;
    const explicitCount = left.length + right.length;
    if (explicitCount >= 8) return null;
    const zeroFill = Array.from({ length: 8 - explicitCount }, () => 0);
    hextets = [...left, ...zeroFill, ...right];
  } else {
    if (left.length !== 8) return null;
    hextets = left;
  }

  // RFC 5952: compress the longest run of >= 2 zero hextets (leftmost wins ties).
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  let runLen = 0;

  for (let i = 0; i < 8; i++) {
    if (hextets[i] === 0) {
      if (runStart === -1) runStart = i;
      runLen++;
      if (runLen > bestLen) {
        bestStart = runStart;
        bestLen = runLen;
      }
    } else {
      runStart = -1;
      runLen = 0;
    }
  }

  if (bestLen < 2) {
    return hextets.map((h) => h.toString(16)).join(':');
  }

  const before = hextets
    .slice(0, bestStart)
    .map((h) => h.toString(16))
    .join(':');
  const after = hextets
    .slice(bestStart + bestLen)
    .map((h) => h.toString(16))
    .join(':');

  return `${before}::${after}`;
}

/** Mask an IP address for display when `maskByDefault` is active. */
export function maskIpAddress(family: 'ipv4' | 'ipv6'): string {
  return family === 'ipv4' ? '•••.•••.•••.•••' : '••••:••••:••••:••••';
}
