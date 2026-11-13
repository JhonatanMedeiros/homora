import { useState } from 'react';
import type { Service } from '@homora/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { ResourceStateBadge } from '@/components/resource-state';
import { deleteLink, putLink, updateCard } from '@/lib/resource-api';
import { needsReview } from '@homora/integrations/resources/client';
import type { CardResource } from '@/hooks/use-resource-links';
import { t } from '@/i18n';

type Props = {
  service: Service;
  info: CardResource;
  onClose: () => void;
  /** Called after any change so the card list and the links are read again. */
  onChanged: () => void;
};

/**
 * Review of a resource link. Changes reported by Coolify (name, address) are shown next to what the
 * card has; nothing is applied until the user chooses. A missing resource only offers to remove
 * the link: the card is always kept.
 */
export function ResourceReviewDialog({ service, info, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { view, link } = info;
  const found = view.kind === 'found' ? view : null;

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      onChanged();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('resources.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  const acknowledge = () =>
    run(() =>
      putLink(service.id, {
        integrationId: link.integrationId,
        resourceUuid: link.resourceUuid,
        resourceType: link.resourceType,
        name: found!.newName,
        url: found!.newUrl,
      }),
    );
  const updateTheCard = () =>
    run(async () => {
      await updateCard(service, { name: found!.newName, url: found!.newUrl ?? service.url });
      await putLink(service.id, {
        integrationId: link.integrationId,
        resourceUuid: link.resourceUuid,
        resourceType: link.resourceType,
        name: found!.newName,
        url: found!.newUrl,
      });
    });

  const changes: { label: string; before: string; after: string }[] = [];
  if (found?.nameChanged)
    changes.push({ label: t('resources.fieldName'), before: link.seenName, after: found.newName });
  if (found?.urlChanged)
    changes.push({
      label: t('resources.fieldUrl'),
      before: link.seenUrl ?? t('resources.noAddress'),
      after: found.newUrl ?? t('resources.noAddress'),
    });

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resources.reviewTitle', { name: service.name })}</DialogTitle>
          <DialogDescription>
            {view.kind === 'missing'
              ? t('resources.missingBody')
              : view.kind === 'unavailable'
                ? t('resources.unavailableBody')
                : needsReview(view)
                  ? t('resources.changedBody')
                  : t('resources.linkedBody')}
          </DialogDescription>
        </DialogHeader>
        {found && (
          <p className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('resources.cardLabel')}</span>
            <ResourceStateBadge state={found.resource.state} />
          </p>
        )}
        {changes.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {changes.map((change) => (
              <div key={change.label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="font-medium">{change.label}</dt>
                <dd className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-muted-foreground">
                    {t('resources.before')}: <span className="font-mono">{change.before}</span>
                  </span>
                  <span className="truncate">
                    {t('resources.now')}: <span className="font-mono">{change.after}</span>
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => deleteLink(service.id))}
          >
            {t('resources.removeLink')}
          </Button>
          {found && needsReview(found) && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void acknowledge()}
              >
                {t('resources.keepAsIs')}
              </Button>
              <Button type="button" disabled={busy} onClick={() => void updateTheCard()}>
                {busy && <Spinner data-icon="inline-start" />}
                {t('resources.updateCard')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
