import { toast } from 'sonner';
import { useState } from 'react';
import type { HostLink } from '@homora/shared';
import type {
  CardSuggestion,
  SuggestionCandidate,
  SuggestionDecision,
} from '@/features/hosts/host-suggestion-model';
import { t } from '@/i18n';

export function useHostSuggestionReview({
  items,
  link,
  dismiss,
  onChanged,
}: {
  items: CardSuggestion[];
  link: (serviceId: number, host: HostLink | null) => Promise<boolean>;
  dismiss: (serviceId: number, host: HostLink, dismissed: boolean) => Promise<boolean>;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [decisions, setDecisions] = useState<Record<number, SuggestionDecision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const withCandidate = items.filter((item) => item.candidates.length > 0);
  const withoutCandidate = items.filter((item) => item.candidates.length === 0);

  async function accept(serviceId: number, candidate: SuggestionCandidate) {
    if (!(await link(serviceId, candidate.host))) return false;
    setDecisions((current) => ({ ...current, [serviceId]: { kind: 'accepted', candidate } }));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(serviceId);
      return next;
    });
    return true;
  }

  async function run(task: () => Promise<boolean>) {
    setBusy(true);
    setError('');
    const ok = await task();
    if (!ok) {
      setError(t('hosts.suggest.failed'));
      toast.error(t('hosts.suggest.failed'));
    }
    setBusy(false);
    onChanged();
  }

  async function acceptSelected() {
    await run(async () => {
      let ok = true;
      for (const item of withCandidate) {
        if (!selected.has(item.serviceId) || decisions[item.serviceId]) continue;
        ok = (await accept(item.serviceId, item.candidates[0]!)) && ok;
      }
      return ok;
    });
  }

  async function undo(serviceId: number) {
    const decision = decisions[serviceId];
    if (!decision) return;
    await run(async () => {
      const ok =
        decision.kind === 'accepted'
          ? await link(serviceId, null)
          : await dismiss(serviceId, decision.candidate.host, false);
      if (ok)
        setDecisions((current) => {
          const next = { ...current };
          delete next[serviceId];
          return next;
        });
      return ok;
    });
  }

  async function dismissCandidate(serviceId: number, candidate: SuggestionCandidate) {
    await run(async () => {
      const ok = await dismiss(serviceId, candidate.host, true);
      if (ok)
        setDecisions((current) => ({ ...current, [serviceId]: { kind: 'dismissed', candidate } }));
      return ok;
    });
  }

  return {
    selected,
    setSelected,
    decisions,
    busy,
    error,
    withCandidate,
    withoutCandidate,
    run,
    accept,
    acceptSelected,
    undo,
    dismissCandidate,
  };
}
