import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { IconPicker } from '@/components/icon-picker';
import { Input } from '@/components/ui/input';
import { ServiceIcon } from '@/components/service-icon';
import { ResourceStateBadge } from '@/components/resource-state';
import type { CardRef } from '@/hooks/use-resource-inventory';
import { sameUrl } from '@homora/integrations/resources/client';
import { t } from '@/i18n';
import { MANUAL, NEW_GROUP, problem, type Row } from './resource-discovery-model';
import type { ResourceLink } from '@homora/integrations';

export function ResourceDiscoveryRow({
  row,
  connectionId,
  cards,
  links,
  groupNames,
  busy,
  onChange,
}: {
  row: Row;
  connectionId: number;
  cards: CardRef[];
  links: ResourceLink[];
  groupNames: string[];
  busy: boolean;
  onChange: (uuid: string, patch: Partial<Row>) => void;
}) {
  const uuid = row.resource.uuid;
  const duplicate = cards.find((card) => row.resource.urls.some((url) => sameUrl(url, card.url)));
  const linkedTo = links.find(
    (link) => link.integrationId === connectionId && link.resourceUuid === uuid,
  );
  const linkedCard = linkedTo && cards.find((card) => card.id === linkedTo.serviceId);
  const issue = problem(row);

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          id={`discover-include-${uuid}`}
          checked={row.include}
          disabled={busy || row.outcome?.ok}
          onCheckedChange={(checked) => onChange(uuid, { include: checked === true })}
        />
        <FieldLabel htmlFor={`discover-include-${uuid}`} className="font-medium">
          {row.resource.name}
        </FieldLabel>
        <span className="text-xs text-muted-foreground">
          {t(
            row.resource.type === 'application'
              ? 'resources.type.application'
              : 'resources.type.service',
          )}
        </span>
        <ResourceStateBadge state={row.resource.state} />
        {row.outcome?.ok && (
          <span role="status" className="text-xs font-medium text-success">
            {t('resources.rowSaved')}
          </span>
        )}
      </div>
      {linkedTo && (
        <Alert className="mt-2">
          <AlertDescription>
            {t('resources.alreadyLinked', {
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
                {t('resources.duplicate', { card: duplicate.name })}
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor={`discover-mode-${uuid}`}>{t('resources.action')}</FieldLabel>
            <FormSelect
              id={`discover-mode-${uuid}`}
              value={row.mode}
              disabled={busy || row.createdId !== undefined}
              onChange={(event) => onChange(uuid, { mode: event.target.value as Row['mode'] })}
            >
              <FormSelectOption value="create">{t('resources.actionCreate')}</FormSelectOption>
              <FormSelectOption value="link">{t('resources.actionLink')}</FormSelectOption>
            </FormSelect>
          </Field>
          {row.mode === 'link' ? (
            <Field>
              <FieldLabel htmlFor={`discover-card-${uuid}`}>{t('resources.card')}</FieldLabel>
              <FormSelect
                id={`discover-card-${uuid}`}
                value={row.linkCard}
                disabled={busy}
                onChange={(event) => onChange(uuid, { linkCard: event.target.value })}
              >
                <FormSelectOption value="">{t('resources.chooseCard')}</FormSelectOption>
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
                  {t('resources.fieldName')}
                </FieldLabel>
                <Input
                  id={`discover-name-${uuid}`}
                  maxLength={80}
                  value={row.name}
                  disabled={busy}
                  onChange={(event) => onChange(uuid, { name: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`discover-url-${uuid}`}>{t('resources.fieldUrl')}</FieldLabel>
                {row.resource.urls.length > 0 && (
                  <FormSelect
                    id={`discover-url-${uuid}`}
                    value={row.urlChoice}
                    disabled={busy}
                    onChange={(event) => onChange(uuid, { urlChoice: event.target.value })}
                  >
                    {row.resource.urls.map((url) => (
                      <FormSelectOption key={url} value={url}>
                        {url}
                      </FormSelectOption>
                    ))}
                    <FormSelectOption value={MANUAL}>{t('resources.urlManual')}</FormSelectOption>
                  </FormSelect>
                )}
                {row.urlChoice === MANUAL && (
                  <Input
                    id={row.resource.urls.length > 0 ? undefined : `discover-url-${uuid}`}
                    type="url"
                    inputMode="url"
                    aria-label={t('resources.urlManualLabel')}
                    value={row.manualUrl}
                    placeholder="https://app.example"
                    disabled={busy}
                    onChange={(event) => onChange(uuid, { manualUrl: event.target.value })}
                  />
                )}
                {row.resource.urls.length === 0 && (
                  <FieldDescription>{t('resources.noAddressHint')}</FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={`discover-group-${uuid}`}>{t('resources.group')}</FieldLabel>
                <FormSelect
                  id={`discover-group-${uuid}`}
                  value={row.group}
                  disabled={busy}
                  onChange={(event) => onChange(uuid, { group: event.target.value })}
                >
                  {groupNames.map((name) => (
                    <FormSelectOption key={name} value={name}>
                      {name}
                    </FormSelectOption>
                  ))}
                  <FormSelectOption value={NEW_GROUP}>{t('resources.groupNew')}</FormSelectOption>
                </FormSelect>
                {row.group === NEW_GROUP && (
                  <Input
                    aria-label={t('resources.groupNewLabel')}
                    maxLength={40}
                    value={row.newGroup}
                    disabled={busy}
                    onChange={(event) => onChange(uuid, { newGroup: event.target.value })}
                  />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={`discover-description-${uuid}`}>
                  {t('resources.description')}
                </FieldLabel>
                <Input
                  id={`discover-description-${uuid}`}
                  maxLength={140}
                  value={row.description}
                  disabled={busy}
                  onChange={(event) => onChange(uuid, { description: event.target.value })}
                />
              </Field>
              <Field orientation="horizontal">
                <span aria-hidden="true" className="flex size-9 items-center justify-center">
                  <ServiceIcon icon={row.icon} name={row.name || row.resource.name} />
                </span>
                <IconPicker
                  iconOnly
                  value={row.icon}
                  onChange={(icon) => onChange(uuid, { icon })}
                />
                <FieldLabel>{t('resources.icon')}</FieldLabel>
              </Field>
              <Field orientation="horizontal" className="items-start">
                <Checkbox
                  id={`discover-private-${uuid}`}
                  checked={row.allowPrivate}
                  disabled={busy}
                  onCheckedChange={(checked) => onChange(uuid, { allowPrivate: checked === true })}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor={`discover-private-${uuid}`}>
                    {t('resources.allowPrivate')}
                  </FieldLabel>
                  <FieldDescription>{t('resources.allowPrivateHint')}</FieldDescription>
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
}
