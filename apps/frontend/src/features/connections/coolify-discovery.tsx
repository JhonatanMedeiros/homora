import { useMemo, useState } from 'react';
import type { CoolifyResource } from '@homora/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { IconPicker } from '@/components/icon-picker';
import { ServiceIcon } from '@/components/service-icon';
import { CoolifyStateBadge } from '@/components/coolify-state';
import { createCard, putLink } from '@/lib/coolify-api';
import { isHttpUrl, sameUrl } from '@/lib/coolify';
import type { CardRef, GroupRef } from '@/hooks/use-coolify-resources';
import type { ResourceLink } from '@homora/shared';
import { t } from '@/i18n';

const MANUAL = '__manual__';
const NEW_GROUP = '__new__';
const DEFAULT_GROUP = 'Coolify';
const DEFAULT_ICON = 'brand:coolify';

type Row = {
  resource: CoolifyResource;
  include: boolean;
  mode: 'create' | 'link';
  linkCard: string;
  name: string;
  urlChoice: string;
  manualUrl: string;
  group: string;
  newGroup: string;
  description: string;
  icon: string;
  allowPrivate: boolean;
  /** Set once the card exists, so a retry after a failed link does not create a second card. */
  createdId?: number;
  outcome?: { ok: true } | { ok: false; message: string };
};

type Props = {
  connectionId: number;
  resources: CoolifyResource[];
  cards: CardRef[];
  groups: GroupRef[];
  links: ResourceLink[];
  onClose: () => void;
  /** Called after at least one card or link was saved. */
  onDone: () => void;
};

const addressOf = (row: Row) => (row.urlChoice === MANUAL ? row.manualUrl : row.urlChoice).trim();
const groupOf = (row: Row) => (row.group === NEW_GROUP ? row.newGroup : row.group).trim();

/** Why a row cannot be saved yet; null when it is ready. */
function problem(row: Row): string | null {
  if (!row.include || row.outcome?.ok) return null;
  if (row.mode === 'link') return row.linkCard ? null : t('coolify.problemCard');
  if (!row.name.trim()) return t('coolify.problemName');
  if (!isHttpUrl(addressOf(row))) return t('coolify.problemUrl');
  if (!groupOf(row) || groupOf(row).length > 40) return t('coolify.problemGroup');
  return null;
}

/**
 * Review before creating cards from Coolify resources. Nothing is created until the user confirms;
 * each row is saved on its own, so a failure is reported on that row instead of hiding it. Cards
 * never enable private-address monitoring unless the user ticks it for that card.
 */
export function CoolifyDiscovery({
  connectionId,
  resources,
  cards,
  groups,
  links,
  onClose,
  onDone,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    resources.map((resource) => {
      const linked = links.find(
        (link) => link.integrationId === connectionId && link.resourceUuid === resource.uuid,
      );
      const duplicate = cards.find((card) => resource.urls.some((url) => sameUrl(url, card.url)));
      const hasDefault = groups.some((item) => item.name === DEFAULT_GROUP);
      return {
        resource,
        include: !linked,
        mode: duplicate && !linked ? 'link' : 'create',
        linkCard: duplicate ? String(duplicate.id) : '',
        name: resource.name.slice(0, 80),
        urlChoice: resource.urls[0] ?? MANUAL,
        manualUrl: '',
        group: hasDefault ? DEFAULT_GROUP : NEW_GROUP,
        newGroup: hasDefault ? '' : DEFAULT_GROUP,
        description: (resource.description ?? '').slice(0, 140),
        icon: DEFAULT_ICON,
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
          // The address the card already uses, when Coolify reports it; else the first one.
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
          const message = failure instanceof Error ? failure.message : t('coolify.actionFailed');
          setRows((cur) =>
            cur.map((r) =>
              r.resource.uuid === uuid
                ? {
                    ...r,
                    outcome: {
                      ok: false,
                      message:
                        row.mode === 'create'
                          ? t('coolify.createdNotLinked', { message })
                          : message,
                    },
                  }
                : r,
            ),
          );
        }
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : t('coolify.actionFailed');
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
          <DialogTitle>{t('coolify.discoveryTitle')}</DialogTitle>
          <DialogDescription>{t('coolify.discoveryBody')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const uuid = row.resource.uuid;
              const duplicate = cards.find((card) =>
                row.resource.urls.some((url) => sameUrl(url, card.url)),
              );
              const linkedTo = links.find(
                (link) => link.integrationId === connectionId && link.resourceUuid === uuid,
              );
              const linkedCard = linkedTo && cards.find((card) => card.id === linkedTo.serviceId);
              const issue = problem(row);
              return (
                <li key={uuid} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Checkbox
                      id={`discover-include-${uuid}`}
                      checked={row.include}
                      disabled={busy || row.outcome?.ok}
                      onCheckedChange={(checked) => change(uuid, { include: checked === true })}
                    />
                    <FieldLabel htmlFor={`discover-include-${uuid}`} className="font-medium">
                      {row.resource.name}
                    </FieldLabel>
                    <span className="text-xs text-muted-foreground">
                      {t(
                        row.resource.type === 'application'
                          ? 'coolify.type.application'
                          : 'coolify.type.service',
                      )}
                    </span>
                    <CoolifyStateBadge state={row.resource.state} />
                    {row.outcome?.ok && (
                      <span role="status" className="text-xs font-medium text-success">
                        {t('coolify.rowSaved')}
                      </span>
                    )}
                  </div>
                  {linkedTo && (
                    <Alert className="mt-2">
                      <AlertDescription>
                        {t('coolify.alreadyLinked', {
                          card: linkedCard?.name ?? String(linkedTo.serviceId),
                        })}
                      </AlertDescription>
                    </Alert>
                  )}
                  {row.outcome && !row.outcome.ok && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertDescription>{row.outcome.message}</AlertDescription>
                    </Alert>
                  )}
                  {row.include && !row.outcome?.ok && (
                    <FieldGroup className="mt-3 gap-3">
                      {duplicate && (
                        <Alert>
                          <AlertDescription>
                            {t('coolify.duplicate', { card: duplicate.name })}
                          </AlertDescription>
                        </Alert>
                      )}
                      <Field>
                        <FieldLabel htmlFor={`discover-mode-${uuid}`}>
                          {t('coolify.action')}
                        </FieldLabel>
                        <FormSelect
                          id={`discover-mode-${uuid}`}
                          value={row.mode}
                          disabled={busy || row.createdId !== undefined}
                          onChange={(event) =>
                            change(uuid, { mode: event.target.value as Row['mode'] })
                          }
                        >
                          <FormSelectOption value="create">
                            {t('coolify.actionCreate')}
                          </FormSelectOption>
                          <FormSelectOption value="link">
                            {t('coolify.actionLink')}
                          </FormSelectOption>
                        </FormSelect>
                      </Field>
                      {row.mode === 'link' ? (
                        <Field>
                          <FieldLabel htmlFor={`discover-card-${uuid}`}>
                            {t('coolify.card')}
                          </FieldLabel>
                          <FormSelect
                            id={`discover-card-${uuid}`}
                            value={row.linkCard}
                            disabled={busy}
                            onChange={(event) => change(uuid, { linkCard: event.target.value })}
                          >
                            <FormSelectOption value="">{t('coolify.chooseCard')}</FormSelectOption>
                            {cards.map((card) => (
                              <FormSelectOption key={card.id} value={String(card.id)}>
                                {card.name}
                              </FormSelectOption>
                            ))}
                          </FormSelect>
                        </Field>
                      ) : (
                        <>
                          <Field>
                            <FieldLabel htmlFor={`discover-name-${uuid}`}>
                              {t('coolify.fieldName')}
                            </FieldLabel>
                            <Input
                              id={`discover-name-${uuid}`}
                              maxLength={80}
                              value={row.name}
                              disabled={busy}
                              onChange={(event) => change(uuid, { name: event.target.value })}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`discover-url-${uuid}`}>
                              {t('coolify.fieldUrl')}
                            </FieldLabel>
                            {row.resource.urls.length > 0 && (
                              <FormSelect
                                id={`discover-url-${uuid}`}
                                value={row.urlChoice}
                                disabled={busy}
                                onChange={(event) =>
                                  change(uuid, { urlChoice: event.target.value })
                                }
                              >
                                {row.resource.urls.map((url) => (
                                  <FormSelectOption key={url} value={url}>
                                    {url}
                                  </FormSelectOption>
                                ))}
                                <FormSelectOption value={MANUAL}>
                                  {t('coolify.urlManual')}
                                </FormSelectOption>
                              </FormSelect>
                            )}
                            {row.urlChoice === MANUAL && (
                              <Input
                                id={
                                  row.resource.urls.length > 0 ? undefined : `discover-url-${uuid}`
                                }
                                type="url"
                                inputMode="url"
                                aria-label={t('coolify.urlManualLabel')}
                                value={row.manualUrl}
                                placeholder="https://app.example"
                                disabled={busy}
                                onChange={(event) =>
                                  change(uuid, { manualUrl: event.target.value })
                                }
                              />
                            )}
                            {row.resource.urls.length === 0 && (
                              <FieldDescription>{t('coolify.noAddressHint')}</FieldDescription>
                            )}
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`discover-group-${uuid}`}>
                              {t('coolify.group')}
                            </FieldLabel>
                            <FormSelect
                              id={`discover-group-${uuid}`}
                              value={row.group}
                              disabled={busy}
                              onChange={(event) => change(uuid, { group: event.target.value })}
                            >
                              {groupNames.map((name) => (
                                <FormSelectOption key={name} value={name}>
                                  {name}
                                </FormSelectOption>
                              ))}
                              <FormSelectOption value={NEW_GROUP}>
                                {t('coolify.groupNew')}
                              </FormSelectOption>
                            </FormSelect>
                            {row.group === NEW_GROUP && (
                              <Input
                                aria-label={t('coolify.groupNewLabel')}
                                maxLength={40}
                                value={row.newGroup}
                                disabled={busy}
                                onChange={(event) => change(uuid, { newGroup: event.target.value })}
                              />
                            )}
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`discover-description-${uuid}`}>
                              {t('coolify.description')}
                            </FieldLabel>
                            <Input
                              id={`discover-description-${uuid}`}
                              maxLength={140}
                              value={row.description}
                              disabled={busy}
                              onChange={(event) =>
                                change(uuid, { description: event.target.value })
                              }
                            />
                          </Field>
                          <Field orientation="horizontal">
                            <span
                              aria-hidden="true"
                              className="flex size-9 items-center justify-center"
                            >
                              <ServiceIcon icon={row.icon} name={row.name || row.resource.name} />
                            </span>
                            <IconPicker
                              iconOnly
                              value={row.icon}
                              onChange={(icon) => change(uuid, { icon })}
                            />
                            <FieldLabel>{t('coolify.icon')}</FieldLabel>
                          </Field>
                          <Field orientation="horizontal" className="items-start">
                            <Checkbox
                              id={`discover-private-${uuid}`}
                              checked={row.allowPrivate}
                              disabled={busy}
                              onCheckedChange={(checked) =>
                                change(uuid, { allowPrivate: checked === true })
                              }
                            />
                            <div className="flex flex-col gap-1">
                              <FieldLabel htmlFor={`discover-private-${uuid}`}>
                                {t('coolify.allowPrivate')}
                              </FieldLabel>
                              <FieldDescription>{t('coolify.allowPrivateHint')}</FieldDescription>
                            </div>
                          </Field>
                        </>
                      )}
                      {issue && (
                        <p role="alert" className="text-xs text-destructive">
                          {issue}
                        </p>
                      )}
                    </FieldGroup>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        {(successes > 0 || failures > 0) && (
          <p role="status" className="text-sm">
            {t('coolify.summary', { saved: successes, failed: failures })}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {saved ? t('coolify.close') : t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy || blocked || pending === 0}
            onClick={() => void confirm()}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {t('coolify.confirm', { count: pending })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
