import { useMemo, useState } from 'react';
import type { IntegrationResource } from '@homora/shared';
import { integrationDefinition } from '@homora/integrations';
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
import { createCard, putLink } from '@/lib/resource-api';
import { sameUrl } from '@homora/integrations/resources/client';
import type { CardRef, GroupRef } from '@/hooks/use-resource-inventory';
import type { ResourceLink } from '@homora/shared';
import { t } from '@/i18n';
import { ResourceDiscoveryRow } from './resource-discovery-row';
import {
  addressOf,
  groupOf,
  MANUAL,
  NEW_GROUP,
  problem,
  type Row,
} from './resource-discovery-model';

type Props = {
  connectionId: number;
  integrationType: string;
  resources: IntegrationResource[];
  cards: CardRef[];
  groups: GroupRef[];
  links: ResourceLink[];
  onClose: () => void;
  /** Called after at least one card or link was saved. */
  onDone: () => void;
};

/**
 * Review before creating cards from integration resources. Nothing is created until the user confirms;
 * each row is saved on its own, so a failure is reported on that row instead of hiding it. Cards
 * never enable private-address monitoring unless the user ticks it for that card.
 */
export function ResourceDiscovery({
  connectionId,
  integrationType,
  resources,
  cards,
  groups,
  links,
  onClose,
  onDone,
}: Props) {
  const definition = integrationDefinition(integrationType);
  const defaultGroup = (definition?.label ?? 'Services').slice(0, 40);
  const defaultIcon = definition?.brandIcon ? `brand:${definition.brandIcon}` : '';
  const [rows, setRows] = useState<Row[]>(() =>
    resources.map((resource) => {
      const linked = links.find(
        (link) => link.integrationId === connectionId && link.resourceUuid === resource.uuid,
      );
      const duplicate = cards.find((card) => resource.urls.some((url) => sameUrl(url, card.url)));
      const hasDefault = groups.some((item) => item.name === defaultGroup);
      return {
        resource,
        include: !linked,
        mode: duplicate && !linked ? 'link' : 'create',
        linkCard: duplicate ? String(duplicate.id) : '',
        name: resource.name.slice(0, 80),
        urlChoice: resource.urls[0] ?? MANUAL,
        manualUrl: '',
        group: hasDefault ? defaultGroup : NEW_GROUP,
        newGroup: hasDefault ? '' : defaultGroup,
        description: (resource.description ?? '').slice(0, 140),
        icon: defaultIcon,
        allowPrivate: false,
      } satisfies Row;
    }),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const change = (uuid: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) =>
        row.resource.uuid === uuid ? { ...row, ...patch, outcome: undefined } : row,
      ),
    );
  const included = rows.filter((row) => row.include && !row.outcome?.ok);
  const blocked = included.some((row) => problem(row) !== null);
  const groupNames = useMemo(() => groups.map((group) => group.name), [groups]);

  async function confirm() {
    setBusy(true);
    let any = false;
    for (const row of rows) {
      if (!row.include || row.outcome?.ok) continue;
      const uuid = row.resource.uuid;
      try {
        let serviceId: number;
        let url: string | null = addressOf(row) || row.resource.urls[0] || null;
        if (row.mode === 'link') {
          serviceId = Number(row.linkCard);
          // The address the card already uses, when the integration reports it; else the first one.
          const card = cards.find((item) => item.id === serviceId);
          url =
            row.resource.urls.find((item) => sameUrl(item, card?.url)) ??
            row.resource.urls[0] ??
            null;
        } else {
          serviceId =
            row.createdId ??
            (await createCard({
              name: row.name.trim(),
              url: addressOf(row),
              category: groupOf(row),
              ...(row.description.trim() ? { description: row.description.trim() } : {}),
              ...(row.icon ? { icon: row.icon } : {}),
              allowPrivate: row.allowPrivate,
            }));
          if (row.createdId === undefined)
            setRows((cur) =>
              cur.map((r) => (r.resource.uuid === uuid ? { ...r, createdId: serviceId } : r)),
            );
          any = true;
        }
        try {
          await putLink(serviceId, {
            integrationId: connectionId,
            resourceUuid: uuid,
            resourceType: row.resource.type,
            name: row.resource.name,
            url,
          });
          any = true;
          setRows((cur) =>
            cur.map((r) => (r.resource.uuid === uuid ? { ...r, outcome: { ok: true } } : r)),
          );
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : t('resources.actionFailed');
          setRows((cur) =>
            cur.map((r) =>
              r.resource.uuid === uuid
                ? {
                    ...r,
                    outcome: {
                      ok: false,
                      message:
                        row.mode === 'create'
                          ? t('resources.createdNotLinked', { message })
                          : message,
                    },
                  }
                : r,
            ),
          );
        }
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : t('resources.actionFailed');
        setRows((cur) =>
          cur.map((r) =>
            r.resource.uuid === uuid ? { ...r, outcome: { ok: false, message } } : r,
          ),
        );
      }
    }
    setBusy(false);
    if (any) {
      setSaved(true);
      onDone();
    }
  }

  const failures = rows.filter((row) => row.outcome && !row.outcome.ok).length;
  const successes = rows.filter((row) => row.outcome?.ok).length;
  const pending = included.length;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('resources.discoveryTitle')}</DialogTitle>
          <DialogDescription>{t('resources.discoveryBody')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-3">
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <ResourceDiscoveryRow
                key={row.resource.uuid}
                row={row}
                connectionId={connectionId}
                cards={cards}
                links={links}
                groupNames={groupNames}
                busy={busy}
                onChange={change}
              />
            ))}
          </ul>
        </div>
        {(successes > 0 || failures > 0) && (
          <p role="status" className="text-sm">
            {t('resources.summary', { saved: successes, failed: failures })}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {saved ? t('resources.close') : t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy || blocked || pending === 0}
            onClick={() => void confirm()}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {t('resources.confirm', { count: pending })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
