import { useRef, type DragEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, MoreHorizontal } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useGroupCollapse } from '@/hooks/use-group-collapse';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  category: string;
  count: number;
  organizing: boolean;
  list?: boolean;
  /** Management shows one editable row per line; the home packs two columns. */
  managing?: boolean;
  /** Changes each time something inside the group must be shown; expands the group without saving. */
  revealSignal?: number;
  /** Present only for registered groups (can be renamed and removed). */
  canEdit: boolean;
  canRemove: boolean;
  groupId?: number;
  /** Custom column count for the group; null or omitted falls back to automatic responsive grid. */
  columns?: number | null;
  onColumns?: (columns: number | null) => void;
  /** Pages the group can be on; the menu offers them when there is more than one. */
  pages?: { id: number; name: string }[];
  pageId?: number;
  onPage?: (pageId: number) => void;
  onRename: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  /** While a service is dragged, an empty group becomes a drop zone. */
  emptyDrop?: {
    active: boolean;
    over: boolean;
    onOver: () => void;
    onLeave: () => void;
    onDrop: () => void;
  };
  children: ReactNode;
};

/** Group column choices offered in the menu; larger saved values are shown and applied as 3. */
const MAX_COLUMNS = 3;
/** Complete utility classes (Tailwind must see exact tokens): small screens constrain to 1 or 2 columns. */
const COLUMN_CLASSES: Record<number, string> = {
  1: 'columns-1 gap-3',
  2: 'columns-1 gap-3 sm:columns-2',
  3: 'columns-1 gap-3 sm:columns-2 xl:columns-3',
};
/** Rows are tighter than cards, so the same counts use a smaller gap. */
const ROW_COLUMN_CLASSES: Record<number, string> = {
  1: 'grid grid-cols-1 gap-1.5',
  2: 'grid grid-cols-1 gap-1.5 sm:grid-cols-2',
  3: 'grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3',
};
const effectiveColumns = (columns?: number | null) =>
  columns ? Math.min(Math.max(Math.trunc(columns), 1), MAX_COLUMNS) : null;

export function GroupSection({
  category,
  count,
  organizing,
  list = false,
  managing = false,
  revealSignal,
  canEdit,
  canRemove,
  groupId,
  columns,
  onColumns,
  pages,
  pageId,
  onPage,
  onRename,
  onRemove,
  onMove,
  emptyDrop,
  children,
}: Props) {
  const titleId = `group:${category}`;
  // After Rename the name field takes focus, so the menu must not give it back to its button.
  const keepFocus = useRef(false);
  // Organize mode shows rows even when the saved view is cards; management lists one row per line.
  const rowLayout = list || organizing;
  const cols = effectiveColumns(columns);
  const gridClass =
    rowLayout && managing
      ? 'grid grid-cols-1 gap-1.5'
      : cols
        ? (rowLayout ? ROW_COLUMN_CLASSES : COLUMN_CLASSES)[cols]
        : rowLayout
          ? 'grid grid-cols-1 gap-1.5 lg:grid-cols-2'
          : 'columns-1 gap-3 sm:columns-2 xl:columns-3';
  const { collapsed, toggleCollapsed } = useGroupCollapse(category, revealSignal);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h2
          id={titleId}
          data-homora="group-title"
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <span className="break-words">{category}</span>
          <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
            <span className="sr-only">{t('group.services')}</span>
            {count}
          </span>
        </h2>
        <Separator className="min-w-8 flex-1" />
        {!organizing && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t(collapsed ? 'group.expand' : 'group.collapse', { name: category })}
            aria-expanded={!collapsed}
            aria-controls={`${titleId}:content`}
            onClick={toggleCollapsed}
          >
            <ChevronDown
              className={cn('transition-transform duration-200', collapsed && '-rotate-90')}
            />
          </Button>
        )}
        {organizing && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-11"
              aria-label={t('group.moveUp', { name: category })}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="pointer-coarse:size-11"
              aria-label={t('group.moveDown', { name: category })}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="pointer-coarse:size-11"
                    data-group-edit={groupId}
                    aria-label={t('group.menu', { name: category })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-52"
                  onCloseAutoFocus={(event) => {
                    if (keepFocus.current) {
                      event.preventDefault();
                      keepFocus.current = false;
                      document.getElementById('rename-group')?.focus();
                    }
                  }}
                >
                  {onColumns && (
                    <>
                      <DropdownMenuLabel>{t('group.columnsOnHome')}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={String(effectiveColumns(columns) ?? 'auto')}
                        onValueChange={(value) =>
                          onColumns(value === 'auto' ? null : Number(value))
                        }
                      >
                        <DropdownMenuRadioItem value="auto">
                          {t('group.columnsAuto')}
                        </DropdownMenuRadioItem>
                        {[1, 2, 3].map((count) => (
                          <DropdownMenuRadioItem key={count} value={String(count)}>
                            {t('group.columnsCount', { count })}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {onPage && pages && pages.length > 1 && (
                    <>
                      <DropdownMenuLabel>{t('pages.moveGroupTo')}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={String(pageId ?? '')}
                        onValueChange={(value) => onPage(Number(value))}
                      >
                        {pages.map((page) => (
                          <DropdownMenuRadioItem key={page.id} value={String(page.id)}>
                            {page.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      keepFocus.current = true;
                      onRename();
                    }}
                  >
                    {t('common.rename')}
                  </DropdownMenuItem>
                  {canRemove && (
                    <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                      {t('common.remove')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
      {(!collapsed || organizing) && (
        <div id={`${titleId}:content`} className="motion-group flex flex-col gap-3">
          {count === 0 && (
            <p
              data-group-drop={emptyDrop?.active ? '' : undefined}
              className={cn(
                'text-sm text-muted-foreground',
                emptyDrop?.active &&
                  'rounded-lg border border-dashed px-3 py-4 text-center transition-colors',
                emptyDrop?.over && 'border-primary bg-primary/10 text-foreground',
              )}
              onDragOver={(event: DragEvent) => {
                if (!emptyDrop?.active) return;
                event.preventDefault();
                emptyDrop.onOver();
              }}
              onDragLeave={() => emptyDrop?.onLeave()}
              onDrop={(event: DragEvent) => {
                if (!emptyDrop?.active) return;
                event.preventDefault();
                emptyDrop.onDrop();
              }}
            >
              {emptyDrop?.active ? t('group.dropHere') : t('group.empty')}
            </p>
          )}
          <ul className={gridClass}>{children}</ul>
        </div>
      )}
    </section>
  );
}
