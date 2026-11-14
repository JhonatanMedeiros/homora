import { toast } from 'sonner';
import type { Service } from '@homora/shared';
import type { useAcknowledgements } from '@/hooks/use-acknowledgements';
import type { useServices } from '@/hooks/use-services';
import type { useStatusOverview } from '@/hooks/use-status-overview';
import { t } from '@/i18n';

type Input = {
  data: ReturnType<typeof useServices>;
  attention: ReturnType<typeof useAcknowledgements>;
  overview: ReturnType<typeof useStatusOverview>;
};

/** The Home's undoable one-click actions: pinning a card and acknowledging what is down. */
export function useHomeAttentionActions({ data, attention, overview }: Input) {
  async function togglePinned(service: Service) {
    const next = !service.pinned;
    if (!(await data.pin(service.id, next))) {
      toast.error(t('pinned.failed'));
      return;
    }
    toast(t(next ? 'pinned.added' : 'pinned.removed', { name: service.name }), {
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void data.pin(service.id, !next).then((ok) => {
            if (!ok) toast.error(t('pinned.failed'));
          }),
      },
    });
  }
  async function acknowledge(members: Service[], minutes?: number) {
    const ids = members.map((member) => member.id);
    const incidents = Object.fromEntries(ids.map((id) => [id, overview?.open[id]?.id]));
    if (!(await attention.acknowledge(ids, incidents, minutes))) {
      toast.error(t('attention.failed'));
      return;
    }
    toast(t(minutes ? 'attention.muted' : 'attention.done', { count: ids.length }), {
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void attention.clear(ids).then((ok) => {
            if (!ok) toast.error(t('attention.clearFailed'));
          }),
      },
    });
  }
  return { togglePinned, acknowledge };
}
