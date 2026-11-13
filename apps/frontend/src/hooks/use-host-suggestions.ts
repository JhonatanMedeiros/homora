import { useCallback, useState } from 'react';
import type { HostLink } from '@homora/shared';
import type { CardSuggestion } from '@/features/hosts/host-suggestion-model';

export type {
  CardSuggestion,
  SuggestionCandidate,
  SuggestionEvidence,
} from '@/features/hosts/host-suggestion-model';
export type { GuestType } from '@homora/shared';

const json = { 'Content-Type': 'application/json' };

/** Loads suggested hosts on demand only: building them reads guest configurations from Proxmox. */
export function useHostSuggestions() {
  const [items, setItems] = useState<CardSuggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [partial, setPartial] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const response = await fetch('/api/host-suggestions');
      if (!response.ok) throw new Error();
      const body = (await response.json()) as {
        suggestions: CardSuggestion[];
        unavailableConnections: number[];
      };
      setItems(body.suggestions);
      setPartial(body.unavailableConnections.length > 0);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  const link = useCallback(async (serviceId: number, host: HostLink | null) => {
    const response = await fetch(`/api/services/${serviceId}/host`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ host }),
    });
    return response.ok;
  }, []);

  const dismiss = useCallback(async (serviceId: number, host: HostLink, dismissed: boolean) => {
    const response = await fetch(`/api/services/${serviceId}/host-suggestion-dismissal`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ host, dismissed }),
    });
    return response.ok;
  }, []);

  return { items, status, partial, load, link, dismiss };
}
