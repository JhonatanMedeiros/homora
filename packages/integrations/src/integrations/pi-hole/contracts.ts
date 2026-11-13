export type Blocking = 'enabled' | 'disabled' | 'failed' | 'unknown';
export type Summary = {
  queries: number;
  blocked: number;
  percent: number;
  domains: number;
  blocking: Blocking;
};
const invalid = () => new Error('Invalid response from Pi-hole.');
export function parseSummary(body: unknown): Summary {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const value = body as {
    queries?: { total?: unknown; blocked?: unknown; percent_blocked?: unknown };
    gravity?: { domains_being_blocked?: unknown };
  };
  const { total, blocked, percent_blocked: percent } = value.queries ?? {};
  const domains = value.gravity?.domains_being_blocked;
  if (
    ![total, blocked, domains].every(
      (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
    ) ||
    typeof percent !== 'number' ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100
  )
    throw invalid();
  return {
    queries: total as number,
    blocked: blocked as number,
    percent,
    domains: domains as number,
    blocking: 'unknown',
  };
}

export function parseBlocking(value: unknown): Blocking {
  if (!value || typeof value !== 'object' || !('blocking' in value)) return 'unknown';
  const status = value.blocking;
  return status === 'enabled' || status === 'disabled' || status === 'failed' ? status : 'unknown';
}
