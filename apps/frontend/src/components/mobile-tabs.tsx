import { useState } from 'react';
import { Ellipsis, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { navItems, primaryNavIds, type Tab } from '@/components/app-nav';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { t } from '@/i18n';

type Props = { tab: Tab; onTabChange: (tab: Tab) => void };

const tabClass =
  'flex h-14 flex-col items-center justify-center gap-0.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset [&_svg]:size-5';

/** Bottom navigation on phones: the main sections plus "More", with 56px touch targets. */
export function MobileTabs({ tab, onTabChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = navItems.filter((item) => primaryNavIds.includes(item.id));
  const more = navItems.filter((item) => !primaryNavIds.includes(item.id));
  const moreActive = more.some((item) => item.id === tab);
  return (
    <>
      <nav
        aria-label={t('nav.sections')}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
      >
        {primary.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={tab === item.id ? 'default' : 'ghost'}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => onTabChange(item.id)}
            className={cn(
              tabClass,
              'w-full rounded-none px-1 py-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <item.icon aria-hidden="true" />
            {t(item.label)}
          </Button>
        ))}
        <Button
          type="button"
          variant={moreActive ? 'default' : 'ghost'}
          aria-haspopup="dialog"
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
          className={cn(
            tabClass,
            'w-full rounded-none px-1 py-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <Ellipsis aria-hidden="true" />
          {t('nav.more')}
        </Button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>{t('nav.moreSections')}</SheetTitle>
            <SheetDescription className="sr-only">{t('nav.moreSections')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            {more.map((item) => (
              <Item key={item.id} asChild variant="outline" size="sm">
                <Button
                  type="button"
                  variant="ghost"
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => {
                    setMoreOpen(false);
                    onTabChange(item.id);
                  }}
                  className="min-h-14 w-full justify-start text-left"
                >
                  <ItemMedia variant="icon">
                    <item.icon aria-hidden="true" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t(item.label)}</ItemTitle>
                  </ItemContent>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </Button>
              </Item>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
