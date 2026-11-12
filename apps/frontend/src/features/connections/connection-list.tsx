import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { ConnectionMark } from './connection-mark';
import { describeData, hostOf, labels, type Connection } from './connection-model';
import { RowMenu } from './row-menu';
import { formatDateTime, t } from '@/i18n';

type Props = {
  items: Connection[];
  busy: boolean;
  result: { id: number; data: unknown; checkedAt?: string } | null;
  onEdit: (item: Connection) => void;
  onAction: (item: Connection, operation: 'test' | 'data') => void;
  onRemove: (item: Connection) => void;
};

export function ConnectionList({ items, busy, result, onEdit, onAction, onRemove }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Item variant="outline" className="flex-wrap bg-card">
            <ItemMedia>
              <ConnectionMark type={item.type} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{item.name}</ItemTitle>
              <ItemDescription className="flex flex-wrap items-center gap-x-2">
                <span>{labels[item.type] ?? item.type}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[0.8125rem]">{hostOf(item.url)}</span>
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <RowMenu label={t('connections.menu', { name: item.name })} disabled={busy}>
                <DropdownMenuItem onSelect={() => onAction(item, 'test')}>
                  {t('connections.testAction')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAction(item, 'data')}>
                  {t('connections.refreshData')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(item)}>
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onRemove(item)}>
                  {t('common.remove')}
                </DropdownMenuItem>
              </RowMenu>
            </ItemActions>
            {result?.id === item.id && (
              <div className="flex w-full flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
                <p>
                  {t('connections.lastUpdate')}
                  {result.checkedAt
                    ? formatDateTime(result.checkedAt)
                    : t('connections.notReported')}
                </p>
                <p className="font-mono text-[0.8125rem]">
                  {describeData(item.type, result.data) ?? t('connections.invalidData')}
                </p>
              </div>
            )}
          </Item>
        </li>
      ))}
    </ul>
  );
}
