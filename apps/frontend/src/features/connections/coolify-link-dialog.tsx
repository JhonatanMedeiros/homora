import { useState } from 'react';
import type { CoolifyResource, ResourceLink } from '@homora/shared';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { putLink } from '@/lib/coolify-api';
import type { CardRef } from '@/hooks/use-coolify-resources';
import { t } from '@/i18n';

type Props = {
  connectionId: number;
  resource: CoolifyResource;
  cards: CardRef[];
  links: ResourceLink[];
  onClose: () => void;
  onDone: () => void;
};

/** Links one resource to an existing card. Linking never edits the card itself. */
export function CoolifyLinkDialog({
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
      onDone();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('coolify.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('coolify.linkTitle', { name: resource.name })}</DialogTitle>
          <DialogDescription>{t('coolify.linkBody')}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="coolify-link-card">{t('coolify.card')}</FieldLabel>
          <FormSelect
            id="coolify-link-card"
            value={card}
            onChange={(event) => setCard(event.target.value)}
          >
            <FormSelectOption value="">{t('coolify.chooseCard')}</FormSelectOption>
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
              {t('coolify.alreadyLinkedElsewhere', { cards: alreadyOn.join(', ') })}
            </AlertDescription>
          </Alert>
        )}
        {replaced && (
          <Alert>
            <AlertDescription>
              {t('coolify.cardHasLink', { card: name(replaced.serviceId) })}
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
            {t('coolify.link')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
