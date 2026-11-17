import { toast } from 'sonner';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Plus } from 'lucide-react';
import { MAX_PAGES, PAGE_NAME_MAX } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@homora/ui/button-group';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@homora/ui/dialog';
import { Input } from '@homora/ui/input';
import { cn } from '@homora/ui/lib/utils';
import { FormError } from '@/components/form-error';
import { PageTabMenu } from '@/components/page-tab-menu';
import { addPage, type PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Props = {
  pages: PageRow[];
  activeId: number;
  onSelect: (id: number) => void;
  /** Services on a page, and how many of them are down. */
  counts: (pageId: number) => { total: number; down: number };
  /** Called after a page is created, renamed, moved, or deleted from the header. */
  onChanged?: () => unknown | Promise<unknown>;
  /** Optional custom menu for the selected page when `onChanged` is not used. */
  menu?: ReactNode;
};

function PageCreateButton({
  pages,
  onChanged,
  onCreated,
}: {
  pages: PageRow[];
  onChanged: () => unknown | Promise<unknown>;
  onCreated: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const previousIds = new Set(pages.map((page) => page.id));
    let createdId: number | undefined;
    const failure = await addPage(draft, (next) => {
      const created = next.find((page) => !previousIds.has(page.id));
      if (created) createdId = created.id;
    });
    if (failure) {
      setError(failure);
      toast.error(failure);
      return;
    }
    setError('');
    setOpen(false);
    setDraft('');
    toast.success(t('pages.saved'));
    await onChanged();
    if (createdId !== undefined) onCreated(createdId);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('pages.add')}
        title={t('pages.add')}
        className="size-8 shrink-0 cursor-pointer text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:size-11"
        onClick={() => {
          setDraft('');
          setError('');
          setOpen(true);
        }}
      >
        <Plus aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t('pages.add')}</DialogTitle>
            </DialogHeader>
            <Input
              aria-label={t('pages.name')}
              maxLength={PAGE_NAME_MAX}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
            />
            <FormError>{error}</FormError>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('pages.cancel')}
              </Button>
              <Button type="submit" disabled={!draft.trim()}>
                {t('pages.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The pages of the Home as header pills using ButtonGroup: swipeable on phones, with counters and actions. */
export function PageTabs({ pages, activeId, onSelect, counts, onChanged, menu }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
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

  const overflowMask =
    edge.left && edge.right
      ? 'mask-[linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]'
      : edge.left
        ? 'mask-[linear-gradient(to_right,transparent,black_16px)]'
        : edge.right
          ? 'mask-[linear-gradient(to_right,black_calc(100%-16px),transparent)]'
          : undefined;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div
        ref={listRef}
        role="tablist"
        aria-label={t('pages.tabs')}
        data-homora="page-tabs"
        onScroll={syncOverflow}
        onKeyDown={onTabListKeyDown}
        className={cn(
          'flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          overflowMask,
        )}
      >
        {pages.map((page, index) => {
          const { total, down } = counts(page.id);
          const active = page.id === activeId;
          const label = (
            <>
              {page.name}
              <small className="font-mono text-xs opacity-75">{total}</small>
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
              type="button"
              role="tab"
              variant="ghost"
              size="sm"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={index < 9 ? `${page.name} (${index + 1})` : page.name}
              className={
                active
                  ? 'h-8 shrink-0 cursor-pointer gap-1.5 bg-sidebar-primary/15 px-3 text-sidebar-primary hover:bg-sidebar-primary/25 hover:text-sidebar-primary pointer-coarse:h-11'
                  : 'h-8 shrink-0 cursor-pointer gap-1.5 px-3 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:h-11'
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
              <ButtonGroup key={page.id} className="shrink-0">
                {tabButton}
                <ButtonGroupSeparator className="bg-sidebar-primary/25" />
                <PageTabMenu
                  page={page}
                  pages={pages}
                  onChanged={onChanged}
                  triggerClassName="h-8 w-7 cursor-pointer bg-sidebar-primary/15 px-0 text-sidebar-primary hover:bg-sidebar-primary/25 hover:text-sidebar-primary pointer-coarse:h-11 pointer-coarse:w-9"
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
      {menu}
    </div>
  );
}
