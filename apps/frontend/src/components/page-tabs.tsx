import type { PageRow } from '@/hooks/use-pages';
import { Tabs, TabsList, TabsTrigger } from '@homora/ui/tabs';
import type { ReactNode } from 'react';
import { t } from '@/i18n';

type Props = {
  pages: PageRow[];
  activeId: number;
  onSelect: (id: number) => void;
  /** Services on a page, and how many of them are down. */
  counts: (pageId: number) => { total: number; down: number };
  /** Menu of the selected page (rename, move, delete); absent where pages cannot be changed. */
  menu?: ReactNode;
};

/** The pages of the Home as a tab strip: one swipeable row on phones, with counters. */
export function PageTabs({ pages, activeId, onSelect, counts, menu }: Props) {
  return (
    <div className="flex items-start gap-1">
      <Tabs
        className="min-w-0 flex-1"
        value={String(activeId)}
        onValueChange={(value) => onSelect(Number(value))}
      >
        <TabsList
          aria-label={t('pages.tabs')}
          variant="line"
          data-homora="page-tabs"
          className="h-auto w-full max-w-full justify-start overflow-x-auto overscroll-x-contain border-b pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pages.map((page, index) => {
            const { total, down } = counts(page.id);
            return (
              <TabsTrigger
                key={page.id}
                value={String(page.id)}
                className="flex-none shrink-0 px-3 pointer-coarse:min-h-11"
                title={index < 9 ? `${page.name} (${index + 1})` : page.name}
                onClick={(event) =>
                  event.currentTarget.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
                }
              >
                {page.name}
                <small className="font-mono text-xs opacity-80">{total}</small>
                {down > 0 && (
                  <small className="rounded-full bg-destructive px-1.5 font-mono text-xs text-white">
                    {t('pages.down', { count: down })}
                  </small>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {menu}
    </div>
  );
}
