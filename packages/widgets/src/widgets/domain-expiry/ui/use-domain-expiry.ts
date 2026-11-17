import { useEffect, useState } from 'react';
import { WidgetSourceError, type WidgetHost } from '../../../ui/host.js';
import { MAX_DOMAINS, parsePublicDomain } from '../definition.js';
import type { DomainExpirySourceResult } from '../source.js';

export type DomainExpiryReading =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'policy-blocked' }
  | { status: 'error' }
  | { status: 'ready'; data: DomainExpirySourceResult; stale: boolean };

const REFRESH_INTERVAL_MS = 60 * 60_000;

function normalizeDomains(domains: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const domain of domains) {
    const parsed = parsePublicDomain(domain);
    if (!parsed) return [];
    if (!seen.has(parsed)) {
      seen.add(parsed);
      result.push(parsed);
    }
  }
  return result.length > 0 && result.length <= MAX_DOMAINS ? result : [];
}

export function useDomainExpiry(
  domains: readonly string[],
  readSource: WidgetHost['readSource'],
): DomainExpiryReading {
  const validDomains = normalizeDomains(domains);
  const key = validDomains.length > 0 ? validDomains.join(',') : '';

  const [state, setState] = useState<{
    key: string;
    data: DomainExpirySourceResult | null;
    error: 'none' | 'policy-blocked' | 'fetch-failed';
  }>({ key, data: null, error: 'none' });

  useEffect(() => {
    if (!key) return;
    let active = true;
    let controller: AbortController | undefined;

    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!readSource) {
          throw new WidgetSourceError('fetch-failed', 'Domain expiry source unavailable');
        }
        const data = await readSource<DomainExpirySourceResult>(
          'domain-expiry',
          { domains: key },
          request.signal,
        );
        if (active && !request.signal.aborted) {
          setState({ key, data, error: 'none' });
        }
      } catch (err) {
        if (!active || request.signal.aborted) return;
        const isPolicy =
          err instanceof WidgetSourceError
            ? err.code === 'policy-blocked'
            : typeof err === 'object' &&
              err !== null &&
              'code' in err &&
              (err as { code?: unknown }).code === 'policy-blocked';
        if (isPolicy) {
          setState({ key, data: null, error: 'policy-blocked' });
          return;
        }
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : null,
          error: 'fetch-failed',
        }));
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, readSource]);

  if (!key) return { status: 'unconfigured' };
  if (state.key !== key) return { status: 'loading' };
  if (state.error === 'policy-blocked') return { status: 'policy-blocked' };
  if (!state.data) return { status: state.error === 'fetch-failed' ? 'error' : 'loading' };
  return {
    status: 'ready',
    data: state.data,
    stale: state.data.stale || state.error === 'fetch-failed',
  };
}
