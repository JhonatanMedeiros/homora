import { useState } from 'react';
import { toast } from 'sonner';
import type { Service } from '@homora/shared';
import {
  useHostSuggestions,
  type SuggestionCandidate,
} from '@/features/hosts/use-host-suggestions';
import { t } from '@/i18n';

/**
 * Suggested guests for the services that are not linked. Nothing is read from the infrastructure
 * until the person asks (the lookup reads guest configurations), and dismissing is remembered by
 * the server so the same guess does not come back.
 */
export function useHostMapSuggestions(services: Service[]) {
  const { items, status, partial, load, dismiss } = useHostSuggestions();
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const open = new Set(
    services.filter((service) => !service.host && !service.hostExternal).map((s) => s.id),
  );
  const candidateOf = (serviceId: number): SuggestionCandidate | undefined =>
    hidden.has(serviceId) || !open.has(serviceId)
      ? undefined
      : items.find((item) => item.serviceId === serviceId)?.candidates[0];
  /** Only a strong, unambiguous match is linked in bulk; the rest need a person's eye. */
  const bulk = items.flatMap((item) => {
    const candidate = candidateOf(item.serviceId);
    return candidate && candidate.strength === 'strong' && !candidate.ambiguous
      ? [{ serviceId: item.serviceId, candidate }]
      : [];
  });

  async function dismissFor(service: Service) {
    const candidate = candidateOf(service.id);
    if (!candidate) return;
    if (!(await dismiss(service.id, candidate.host, true))) {
      toast.error(t('hosts.suggest.failed'));
      return;
    }
    setHidden((current) => new Set(current).add(service.id));
    toast.success(t('map.suggest.dismissedOne', { name: service.name }), {
      action: {
        label: t('map.undo'),
        onClick: () => {
          void dismiss(service.id, candidate.host, false);
          setHidden((current) => {
            const next = new Set(current);
            next.delete(service.id);
            return next;
          });
        },
      },
    });
  }

  return {
    status,
    partial,
    load,
    candidateOf,
    bulk,
    dismissFor,
    loaded: status === 'ready',
  };
}
