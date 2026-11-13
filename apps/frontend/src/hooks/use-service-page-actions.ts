import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Service } from '@homora/shared';
import { toast } from 'sonner';
import { t } from '@/i18n';
import type { useServices } from '@/hooks/use-services';

type ServicesData = ReturnType<typeof useServices>;

export function useServicePageActions({
  data,
  sortedIn,
  announce,
  setSelected,
  setSrNote,
}: {
  data: ServicesData;
  sortedIn: ServicesData['sortedIn'];
  announce: (message: string) => void;
  setSelected: Dispatch<SetStateAction<string | null>>;
  setSrNote: Dispatch<SetStateAction<string>>;
}) {
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);

  async function remove(service: Service) {
    if (confirming !== service.id) {
      setConfirming(service.id);
      return;
    }
    setConfirming(null);
    try {
      if (!(await data.deleteService(service.id))) throw Error();
      setSelected(null);
      await data.refresh();
      announce(t('page.removed'));
    } catch {
      setMessage(t('error.remove'));
    }
  }

  async function moveToGroup(service: Service, group: string) {
    // Capture the order before moving so Undo restores the original position too.
    const originalOrder = sortedIn(service.category).map((item) => item.id);
    const failure = await data.moveServiceToGroup(service, group);
    if (failure) {
      setMessage(failure);
      return;
    }
    toast(t('page.moved', { name: service.name, group }), {
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void data.restoreService(service, originalOrder).then((undoFailure) => {
            if (undoFailure) setMessage(undoFailure);
          }),
      },
    });
  }

  async function reorder(
    task: Promise<string | null>,
    index?: number,
    service?: Service,
    total?: number,
  ) {
    const failure = await task;
    if (failure) setMessage(failure);
    else if (service && index !== undefined && total)
      setSrNote(t('organize.position', { name: service.name, position: index + 1, total }));
  }

  return { message, setMessage, confirming, setConfirming, remove, moveToGroup, reorder };
}
