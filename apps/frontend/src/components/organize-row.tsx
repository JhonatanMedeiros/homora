import type { DragEvent } from 'react';
import type { Service } from '@homora/shared';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ServiceIcon } from '@/components/service-icon';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { hostOf } from '@/lib/services';

type Props = {
  service: Service;
  /** Groups the service can move to (the current one is left out). */
  otherGroups: string[];
  /** Page of a group, shown beside its name when the groups of several pages are listed. */
  pageLabel?: (group: string) => string | undefined;
  first: boolean;
  last: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onMove: (direction: -1 | 1) => void;
  onMoveToTop: () => void;
  onMoveToGroup: (group: string) => void;
  /** Opens the edit form. */
  onEdit: () => void;
  /** First call asks for confirmation (`confirmingRemoval`), the second removes. */
  confirmingRemoval: boolean;
  onRemove: () => void;
  onCancelRemoval: () => void;
  dragProps: {
    onDragStart: (event: DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
};

/**
 * Service row in organize mode: a compact line with a drag handle (hidden on touch),
 * arrows, and a menu that also moves the service to another group.
 */
export function OrganizeRow({
  service: s,
  otherGroups,
  pageLabel,
  first,
  last,
  dragging,
  dropTarget,
  onMove,
  onMoveToTop,
  onMoveToGroup,
  onEdit,
  confirmingRemoval,
  onRemove,
  onCancelRemoval,
  dragProps,
}: Props) {
  return (
    <li draggable className="flex min-w-0" {...dragProps}>
      <Item
        variant="outline"
        size="sm"
        className={cn(
          'organize-surface w-full flex-row items-center gap-2 bg-card px-2 py-1.5',
          'cursor-grab pointer-coarse:cursor-default',
          dragging && 'opacity-50',
          dropTarget && 'border-primary bg-primary/10',
        )}
      >
        <GripVertical
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground pointer-coarse:hidden"
        />
        <ItemMedia
          variant="icon"
          aria-hidden="true"
          className="size-8 rounded-md bg-secondary text-sm font-semibold"
        >
          <ServiceIcon icon={s.icon} name={s.name} />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0">
          <ItemTitle className="w-full text-sm">
            <span className="truncate">{s.name}</span>
          </ItemTitle>
          <span className="truncate font-mono text-xs text-muted-foreground">{hostOf(s.url)}</span>
        </ItemContent>
        {/* aria-disabled (not disabled) so focus stays on the arrow when the row reaches an end. */}
        <ItemActions className="gap-0.5">
          {confirmingRemoval && (
            <>
              <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
                <Trash2 />
                {t('card.confirmRemoveShort')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onCancelRemoval}>
                {t('common.cancel')}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-11 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={first}
            aria-label={t('card.moveUp', { name: s.name })}
            onClick={() => !first && onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-11 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={last}
            aria-label={t('card.moveDown', { name: s.name })}
            onClick={() => !last && onMove(1)}
          >
            <ArrowDown />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="pointer-coarse:size-11"
                data-service-edit={s.id}
                aria-label={t('card.options', { name: s.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{s.name}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={first} onSelect={onMoveToTop}>
                {t('card.moveTop')}
              </DropdownMenuItem>
              {otherGroups.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{t('card.moveToGroup')}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {otherGroups.map((group) => (
                        <DropdownMenuItem key={group} onSelect={() => onMoveToGroup(group)}>
                          {group}
                          {pageLabel?.(group) && (
                            <span className="ml-auto pl-3 text-xs text-muted-foreground">
                              {pageLabel(group)}
                            </span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Trash2 />
                {t('common.remove')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
    </li>
  );
}
