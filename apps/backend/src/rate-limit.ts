/** Fixed-window in-memory IP rate limiter bounded to `maxEntries` distinct IPs. */
export function createIpRateLimiter({
  max,
  windowMs = 60_000,
  maxEntries = 10_000,
}: {
  max: number;
  windowMs?: number;
  maxEntries?: number;
}) {
  const attempts = new Map<string, { count: number; until: number }>();

  return function allow(ip: string, now = Date.now()): boolean {
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    if (!attempts.has(ip) && attempts.size >= maxEntries) return false;
    const entry = attempts.get(ip) ?? { count: 0, until: now + windowMs };
    entry.count++;
    attempts.set(ip, entry);
    return entry.count <= max;
  };
}
