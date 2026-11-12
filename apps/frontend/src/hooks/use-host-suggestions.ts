import { useCallback, useState } from 'react';
import type { GuestType, HostLink } from '@homora/shared';

export type SuggestionEvidence = {
  kind: 'config-address' | 'guest-agent' | 'docker-source';
  address?: string;
};
export type SuggestionCandidate = {
  host: HostLink;
  name: string;
  status: string;
  strength: 'strong' | 'medium';
  evidence: SuggestionEvidence[];
  ambiguous: boolean;
};
export type CardSuggestion = { serviceId: number; candidates: SuggestionCandidate[] };
export type { GuestType };

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
