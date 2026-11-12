import { Spinner } from '@/components/ui/spinner';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { ConnectionMark } from './connection-mark';
import { RowMenu } from './row-menu';
import {
  describeData,
  widgetLabels,
  type Connection,
  type IntegrationWidget,
} from './connection-model';
import { EmptyNote } from '@/components/empty-note';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { t } from '@/i18n';

type Props = {
  items: Connection[] | null;
  widgets: IntegrationWidget[];
  busy: boolean;
  widgetName: string;
  widgetConnection: string;
  cards: { id: number; name: string }[];
  widgetCard: string;
  editingWidget: number | null;
  widgetEditName: string;
  widgetEditCard: string;
  onEditCardChange: (value: string) => void;
  onEdit: (widget: IntegrationWidget) => void;
  onEditNameChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (widget: IntegrationWidget, name: string, card: string) => void;
  onCardChange: (value: string) => void;
  widgetResult: { id: number; data: unknown } | null;
  onNameChange: (value: string) => void;
  onConnectionChange: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onQuery: (widget: IntegrationWidget) => void;
  onRemove: (widget: IntegrationWidget) => void;
};

export function WidgetsSection({
  items,
  widgets,
  busy,
  widgetName,
  widgetConnection,
  cards,
  widgetCard,
  onCardChange,
  editingWidget,
  widgetEditName,
  widgetEditCard,
  onEditCardChange,
  onEdit,
  onEditNameChange,
  onCancelEdit,
  onSaveEdit,
  widgetResult,
  onNameChange,
  onConnectionChange,
  onCreate,
  onQuery,
  onRemove,
}: Props) {
  return (
    <section aria-label={t('widgets.title')} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('widgets.description')}</p>
      {(!items || items.length === 0) && <EmptyNote>{t('widgets.needConnection')}</EmptyNote>}
      {items && items.length > 0 && (
        <form onSubmit={onCreate} className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="font-semibold">{t('widgets.create')}</h2>
            <p className="text-sm text-muted-foreground">{t('widgets.createHint')}</p>
          </div>
          <FieldGroup className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="widget-name">{t('widgets.name')}</FieldLabel>
              <Input
                id="widget-name"
                required
                maxLength={80}
                value={widgetName}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="widget-connection">{t('widgets.connection')}</FieldLabel>
              <FormSelect
                id="widget-connection"
                aria-label={t('widgets.connection')}
                required
                value={widgetConnection}
                onChange={(event) => onConnectionChange(event.target.value)}
              >
                {(items ?? []).map((item) => (
                  <FormSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </FormSelectOption>
                ))}
              </FormSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="widget-card">{t('widgets.card')}</FieldLabel>
              <FormSelect
                id="widget-card"
                aria-label={t('widgets.card')}
                value={widgetCard}
                onChange={(event) => onCardChange(event.target.value)}
              >
                <FormSelectOption value="">{t('widgets.noCard')}</FormSelectOption>
                {cards.map((card) => (
                  <FormSelectOption key={card.id} value={card.id}>
                    {card.name}
                  </FormSelectOption>
                ))}
              </FormSelect>
            </Field>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {t('widgets.create')}
            </Button>
          </FieldGroup>
        </form>
      )}
      {widgets.length === 0 ? (
        <EmptyNote>{t('widgets.empty')}</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {widgets.map((widget) => {
            const connection = items?.find((item) => item.id === widget.integrationId);
            return (
              <li key={widget.id}>
                <Item variant="outline" className="flex-wrap bg-card">
                  <ItemMedia>
                    <ConnectionMark type={widget.type} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{widget.name}</ItemTitle>
                    <ItemDescription>
                      {connection?.name ?? widgetLabels[widget.type] ?? widget.type}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-wrap">
                    {editingWidget === widget.id ? (
                      <>
                        <Input
                          aria-label={t('widgets.name')}
                          maxLength={80}
                          value={widgetEditName}
                          onChange={(event) => onEditNameChange(event.target.value)}
                        />
                        <FormSelect
                          aria-label={t('widgets.cardAria', { name: widget.name })}
                          value={widgetEditCard}
                          onChange={(event) => onEditCardChange(event.target.value)}
                        >
                          <FormSelectOption value="">{t('widgets.noCard')}</FormSelectOption>
                          {cards.map((card) => (
                            <FormSelectOption key={card.id} value={card.id}>
                              {card.name}
                            </FormSelectOption>
                          ))}
                        </FormSelect>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !widgetEditName.trim()}
                          onClick={() => onSaveEdit(widget, widgetEditName)}
                        >
                          {t('widgets.save')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={onCancelEdit}
                        >
                          {t('common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-muted-foreground">
                          {widget.serviceId
                            ? cards.find((card) => card.id === widget.serviceId)?.name
                            : t('widgets.noCard')}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onEdit(widget)}
                        >
                          {t('common.edit')}
                        </Button>
                      </>
                    )}
                    <RowMenu label={t('widgets.menu', { name: widget.name })} disabled={busy}>
                      <DropdownMenuItem disabled={!connection} onSelect={() => onQuery(widget)}>
                        {t('widgets.viewData')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => onRemove(widget)}>
                        {t('common.remove')}
                      </DropdownMenuItem>
                    </RowMenu>
                  </ItemActions>
                  {widgetResult?.id === widget.id && (
                    <p className="w-full rounded-md bg-muted px-3 py-2 font-mono text-[0.8125rem]">
                      {describeData(widget.type, widgetResult.data) ?? t('connections.invalidData')}
                    </p>
                  )}
                </Item>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
