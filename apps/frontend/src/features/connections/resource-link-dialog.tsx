import { toast } from 'sonner';
import { useState } from 'react';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Field, FieldLabel } from '@homora/ui/field';
import { Spinner } from '@homora/ui/spinner';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { putLink } from '@/lib/resource-api';
import type { CardRef } from '@/hooks/use-resource-inventory';
import { t } from '@/i18n';
import type { IntegrationResource, ResourceLink } from '@homora/integrations';

type Props = {
  connectionId: number;
  resource: IntegrationResource;
  cards: CardRef[];
  links: ResourceLink[];
  onClose: () => void;
  onDone: () => void;
};

/** Links one resource to an existing card. Linking never edits the card itself. */
export function ResourceLinkDialog({
  connectionId,
  resource,
  cards,
  links,
  onClose,
  onDone,
}: Props) {
  const [card, setCard] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = (id: number) => cards.find((item) => item.id === id)?.name ?? String(id);
  const alreadyOn = links
    .filter((link) => link.integrationId === connectionId && link.resourceUuid === resource.uuid)
    .map((link) => name(link.serviceId));
  const replaced = links.find((link) => String(link.serviceId) === card);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const target = cards.find((item) => String(item.id) === card);
      await putLink(Number(card), {
        integrationId: connectionId,
        resourceUuid: resource.uuid,
        resourceType: resource.type,
        name: resource.name,
        url: resource.urls.find((url) => url === target?.url) ?? resource.urls[0] ?? null,
      });
      toast.success(t('resources.changeSaved'));
      onDone();
      onClose();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t('resources.actionFailed');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resources.linkTitle', { name: resource.name })}</DialogTitle>
          <DialogDescription>{t('resources.linkBody')}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="resource-link-card">{t('resources.card')}</FieldLabel>
          <FormSelect
            id="resource-link-card"
            value={card}
            onChange={(event) => setCard(event.target.value)}
          >
            <FormSelectOption value="">{t('resources.chooseCard')}</FormSelectOption>
            {cards.map((item) => (
              <FormSelectOption key={item.id} value={String(item.id)}>
                {item.name}
              </FormSelectOption>
            ))}
          </FormSelect>
        </Field>
        {alreadyOn.length > 0 && (
          <Alert>
            <AlertDescription>
              {t('resources.alreadyLinkedElsewhere', { cards: alreadyOn.join(', ') })}
            </AlertDescription>
          </Alert>
        )}
        {replaced && (
          <Alert>
            <AlertDescription>
              {t('resources.cardHasLink', { card: name(replaced.serviceId) })}
            </AlertDescription>
          </Alert>
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
          <Button type="button" disabled={busy || !card} onClick={() => void save()}>
            {busy && <Spinner data-icon="inline-start" />}
            {t('resources.link')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
