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
import { NativeSelect } from '@/components/native-select';
import { t } from '@/i18n';

type Props = {
  items: Connection[] | null;
  widgets: IntegrationWidget[];
  busy: boolean;
  widgetName: string;
  widgetConnection: string;
  cards: { id: number; name: string }[];
  widgetCard: string;
  onCardChange: (value: string) => void;
  onMoveWidget: (widget: IntegrationWidget, value: string) => void;
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
  onMoveWidget,
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
        <form onSubmit={onCreate}>
          <FieldGroup className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="widget-connection">{t('widgets.connection')}</FieldLabel>
              <NativeSelect
                id="widget-connection"
                required
                value={widgetConnection}
                onChange={(event) => onConnectionChange(event.target.value)}
              >
                {(items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
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
              <FieldLabel htmlFor="widget-card">{t('widgets.card')}</FieldLabel>
              <NativeSelect
                id="widget-card"
                value={widgetCard}
                onChange={(event) => onCardChange(event.target.value)}
              >
                <option value="">{t('widgets.noCard')}</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" disabled={busy}>
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
                    <NativeSelect
                      aria-label={t('widgets.cardAria', { name: widget.name })}
                      value={widget.serviceId ?? ''}
                      disabled={busy}
                      onChange={(event) => onMoveWidget(widget, event.target.value)}
                    >
                      <option value="">{t('widgets.noCard')}</option>
                      {cards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name}
                        </option>
                      ))}
                    </NativeSelect>
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
