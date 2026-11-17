import { Plus } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@homora/ui/dropdown-menu';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@homora/ui/item';
import { ConnectionMark } from './connection-mark';
import { RowMenu } from './row-menu';
import {
  describeData,
  widgetLabels,
  type Connection,
  type IntegrationWidget,
} from './connection-model';
import { EmptyNote } from '@/components/empty-note';
import { t } from '@/i18n';

type Props = {
  items: Connection[] | null;
  widgets: IntegrationWidget[];
  busy: boolean;
  cards: { id: number; name: string }[];
  widgetResult: { id: number; data: unknown } | null;
  onNew: () => void;
  onEdit: (widget: IntegrationWidget) => void;
  onQuery: (widget: IntegrationWidget) => void;
  onRemove: (widget: IntegrationWidget) => void;
};

/** Widgets show one reading from a connection inside a card. Create and edit open a dialog. */
export function WidgetsSection({
  items,
  widgets,
  busy,
  cards,
  widgetResult,
  onNew,
  onEdit,
  onQuery,
  onRemove,
}: Props) {
  const canCreate = Boolean(items && items.length > 0);
  return (
    <section aria-label={t('widgets.title')} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t('widgets.description')}</p>
        <Button type="button" disabled={!canCreate} onClick={onNew}>
          <Plus data-icon="inline-start" />
          {t('widgets.new')}
        </Button>
      </div>
      {!canCreate && <EmptyNote>{t('widgets.needConnection')}</EmptyNote>}
      {widgets.length === 0 ? (
        canCreate && <EmptyNote>{t('widgets.empty')}</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {widgets.map((widget) => {
            const connection = items?.find((item) => item.id === widget.integrationId);
            const card = widget.serviceId
              ? cards.find((entry) => entry.id === widget.serviceId)?.name
              : undefined;
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
                      {' · '}
                      {card ?? t('widgets.noCard')}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onEdit(widget)}
                    >
                      {t('common.edit')}
                    </Button>
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
