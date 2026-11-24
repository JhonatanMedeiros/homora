import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { MAX_PAGES } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { cn } from '@homora/ui/lib/utils';
import { PageCreateButton } from '@/components/page-create-button';
import { PageTabMenu } from '@/components/page-tab-menu';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import type { PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

/** More pages than this show a search field. */
const SEARCH_FROM = 6;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: PageRow[];
  activeId: number;
  counts: (pageId: number) => { total: number; down: number };
  onSelect: (id: number) => void;
  /** Present when pages can be changed from here: adds the row actions and the add button. */
  onChanged?: () => unknown | Promise<unknown>;
};

/**
 * Every page in one list: a dialog on desktop and a bottom sheet on phones. It replaces the small
 * overflow menu, so a page is reachable (and tidied) even when its tab is out of view.
 */
export function PageListDialog({
  open,
  onOpenChange,
  pages,
  activeId,
  counts,
  onSelect,
  onChanged,
}: Props) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = needle ? pages.filter((page) => page.name.toLowerCase().includes(needle)) : pages;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
      title={t('pages.all')}
    >
      <div className="flex flex-col gap-3">
        {pages.length > SEARCH_FROM && (
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label={t('pages.search')}
              placeholder={t('pages.search')}
              value={query}
              className="h-11 pl-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
        <ul className="flex max-h-[min(24rem,55svh)] flex-col gap-0.5 overflow-y-auto">
          {shown.map((page) => {
            const { total, down } = counts(page.id);
            const active = page.id === activeId;
            return (
              <li key={page.id} className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={active ? 'secondary' : 'ghost'}
                  aria-current={active ? 'page' : undefined}
                  className="h-11 min-w-0 flex-1 cursor-pointer justify-start gap-2 px-3"
                  onClick={() => {
                    onSelect(page.id);
                    onOpenChange(false);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="flex-1 truncate text-left">{page.name}</span>
                  {down > 0 && (
                    <small className="rounded-full bg-destructive px-1.5 font-mono text-xs text-white">
                      {t('pages.down', { count: down })}
                    </small>
                  )}
                  <small className="font-mono text-xs text-muted-foreground">{total}</small>
                </Button>
                {onChanged && (
                  <PageTabMenu
                    page={page}
                    pages={pages}
                    onChanged={onChanged}
                    triggerClassName="size-11 shrink-0 cursor-pointer"
                  />
                )}
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">
            {t('pages.noMatch')}
          </p>
        )}
        {onChanged && pages.length < MAX_PAGES && (
          <PageCreateButton
            variant="labeled"
            pages={pages}
            onChanged={onChanged}
            onCreated={(id) => {
              onSelect(id);
              onOpenChange(false);
            }}
          />
        )}
      </div>
    </ResponsiveDialog>
  );
}
