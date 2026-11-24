import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { List } from 'lucide-react';
import { MAX_PAGES } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@homora/ui/button-group';
import { cn } from '@homora/ui/lib/utils';
import { PageCreateButton } from '@/components/page-create-button';
import { PageListDialog } from '@/components/page-list-dialog';
import { PageTabMenu } from '@/components/page-tab-menu';
import type { PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Props = {
  pages: PageRow[];
  activeId: number;
  onSelect: (id: number) => void;
  /** Services on a page, and how many of them are down. */
  counts: (pageId: number) => { total: number; down: number };
  /** Called after a page is created, renamed, moved, or deleted from the bar. */
  onChanged?: () => unknown | Promise<unknown>;
  /** Optional custom menu for the selected page when `onChanged` is not used. */
  menu?: ReactNode;
};

/**
 * The pages of the Home as a bar of tabs under the header: 36px tall (44px on touch), swipeable,
 * each with its counter. The list button opens every page at once, with search and the page
 * actions, so the bar never needs scroll arrows.
 */
export function PageTabs({ pages, activeId, onSelect, counts, onChanged, menu }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const [edge, setEdge] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const syncOverflow = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    const left = node.scrollLeft > 1;
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    setEdge((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    syncOverflow();
    const node = listRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pages.length, syncOverflow]);

  function onTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 || tabs.length < 2) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    const nextPage = pages[nextIndex];
    if (nextTab && nextPage) {
      nextTab.focus();
      onSelect(nextPage.id);
    }
  }

  function onTabListWheel(event: WheelEvent<HTMLDivElement>) {
    const node = listRef.current;
    if (!node || node.scrollWidth <= node.clientWidth) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    }
  }

  const scrollToPage = useCallback((id: number) => {
    const target = listRef.current?.querySelector<HTMLElement>(`[data-page-id="${id}"]`);
    target?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToPage(activeId);
  }, [activeId, scrollToPage]);

  const overflowMask =
    edge.left && edge.right
      ? 'mask-[linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]'
      : edge.left
        ? 'mask-[linear-gradient(to_right,transparent,black_20px)]'
        : edge.right
          ? 'mask-[linear-gradient(to_right,black_calc(100%-20px),transparent)]'
          : undefined;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div
        ref={listRef}
        role="tablist"
        aria-label={t('pages.tabs')}
        data-homora="page-tabs"
        onScroll={syncOverflow}
        onWheel={onTabListWheel}
        onKeyDown={onTabListKeyDown}
        className={cn(
          'flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          overflowMask,
        )}
      >
        {pages.map((page, index) => {
          const { total, down } = counts(page.id);
          const active = page.id === activeId;
          const label = (
            <>
              {page.name}
              <small
                className={cn(
                  'rounded-full px-1.5 font-mono text-xs',
                  active
                    ? 'bg-sidebar-primary/25 text-sidebar-primary'
                    : 'bg-sidebar-accent text-sidebar-foreground/80',
                )}
              >
                {total}
              </small>
              {down > 0 && (
                <small className="rounded-full bg-destructive px-1.5 font-mono text-xs text-white">
                  {t('pages.down', { count: down })}
                </small>
              )}
            </>
          );
          const tabButton = (
            <Button
              key={page.id}
              data-page-id={active && onChanged ? undefined : page.id}
              type="button"
              role="tab"
              variant="ghost"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={index < 9 ? `${page.name} (${index + 1})` : page.name}
              className={
                active
                  ? 'h-9 shrink-0 cursor-pointer gap-2 rounded-lg bg-sidebar-primary/15 px-3.5 text-sm text-sidebar-primary shadow-[inset_0_-2px_0_var(--sidebar-primary)] hover:bg-sidebar-primary/25 hover:text-sidebar-primary pointer-coarse:h-11'
                  : 'h-9 shrink-0 cursor-pointer gap-2 rounded-lg px-3.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:h-11'
              }
              onClick={(event) => {
                onSelect(page.id);
                event.currentTarget.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
              }}
            >
              {label}
            </Button>
          );

          if (active && onChanged) {
            return (
              <ButtonGroup key={page.id} data-page-id={page.id} className="shrink-0">
                {tabButton}
                <ButtonGroupSeparator className="bg-sidebar-primary/25" />
                <PageTabMenu
                  page={page}
                  pages={pages}
                  onChanged={onChanged}
                  triggerClassName="h-9 w-8 cursor-pointer rounded-lg bg-sidebar-primary/15 px-0 text-sidebar-primary shadow-[inset_0_-2px_0_var(--sidebar-primary)] hover:bg-sidebar-primary/25 hover:text-sidebar-primary pointer-coarse:h-11 pointer-coarse:w-11"
                />
              </ButtonGroup>
            );
          }

          return tabButton;
        })}
      </div>
      {onChanged && pages.length < MAX_PAGES && (
        <PageCreateButton pages={pages} onChanged={onChanged} onCreated={onSelect} />
      )}
      {pages.length > 1 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('pages.all')}
            title={t('pages.all')}
            aria-haspopup="dialog"
            className="ml-auto size-9 shrink-0 cursor-pointer text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:size-11"
            onClick={() => setListOpen(true)}
          >
            <List aria-hidden="true" />
          </Button>
          <PageListDialog
            open={listOpen}
            onOpenChange={setListOpen}
            pages={pages}
            activeId={activeId}
            counts={counts}
            onSelect={(id) => {
              onSelect(id);
              scrollToPage(id);
            }}
            onChanged={onChanged}
          />
        </>
      )}
      {menu}
    </div>
  );
}
