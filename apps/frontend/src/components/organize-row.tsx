import type { DragEvent } from 'react';
import type { Service } from '@homora/shared';
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal } from 'lucide-react';
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
  first: boolean;
  last: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onMove: (direction: -1 | 1) => void;
  onMoveToTop: () => void;
  onMoveToGroup: (group: string) => void;
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
  first,
  last,
  dragging,
  dropTarget,
  onMove,
  onMoveToTop,
  onMoveToGroup,
  dragProps,
}: Props) {
  return (
    <li draggable className="flex min-w-0" {...dragProps}>
      <Item
        variant="outline"
        size="sm"
        className={cn(
          'w-full flex-row items-center gap-2 bg-card px-2 py-1.5',
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
        <ItemActions className="gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-11"
            disabled={first}
            aria-label={t('card.moveUp', { name: s.name })}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="pointer-coarse:size-11"
            disabled={last}
            aria-label={t('card.moveDown', { name: s.name })}
            onClick={() => onMove(1)}
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
                aria-label={t('card.options', { name: s.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{s.name}</DropdownMenuLabel>
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
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
    </li>
  );
}
