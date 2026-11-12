import type { PageRow } from '@/hooks/use-pages';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { t } from '@/i18n';

type Props = {
  pages: PageRow[];
  activeId: number;
  onSelect: (id: number) => void;
  /** Services on a page, and how many of them are down. */
  counts: (pageId: number) => { total: number; down: number };
};

/** The pages of the Home as a tab strip: one swipeable row on phones, with counters. */
export function PageTabs({ pages, activeId, onSelect, counts }: Props) {
  return (
    <Tabs value={String(activeId)} onValueChange={(value) => onSelect(Number(value))}>
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
  );
}
