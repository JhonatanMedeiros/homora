export const SIGN_IN_WINDOW_SECONDS = 15 * 60;
// Better Auth counts every request to the sign-in path, not only failed attempts.
export const SIGN_IN_MAX_ATTEMPTS = 10;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

/**
 * Rate-limit counters kept in this instance's memory. Better Auth's built-in memory store is
 * shared by every instance in the process, so a private one keeps instances independent. The
 * window starts at the first request and counters reset when the backend restarts.
 */
export function createRateLimitStorage(now: () => number = Date.now) {
  const entries = new Map<string, { count: number; start: number; end: number }>();
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const time = now();
      for (const [name, entry] of entries) if (time >= entry.end) entries.delete(name);
      const current = entries.get(key);
      if (!current) {
        // Oldest entries go first when a flood of distinct clients fills the table.
        for (const name of entries.keys()) {
          if (entries.size < MAX_RATE_LIMIT_ENTRIES) break;
          entries.delete(name);
        }
        entries.set(key, { count: 1, start: time, end: time + rule.window * 1000 });
        return { allowed: true, retryAfter: null };
      }
      if (current.count >= rule.max)
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.end - time) / 1000)) };
      current.count++;
      return { allowed: true, retryAfter: null };
    },
  };
}
