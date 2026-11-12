import { useState } from 'react';
import { Ellipsis, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const state = (active: boolean) =>
    active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/80';
  return (
    <>
      <nav
        aria-label={t('nav.sections')}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
      >
        {primary.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => onTabChange(item.id)}
            className={cn(tabClass, state(tab === item.id))}
          >
            <item.icon aria-hidden="true" />
            {t(item.label)}
          </button>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
          className={cn(tabClass, state(moreActive))}
        >
          <Ellipsis aria-hidden="true" />
          {t('nav.more')}
        </button>
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
                <button
                  type="button"
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => {
                    setMoreOpen(false);
                    onTabChange(item.id);
                  }}
                  className="min-h-14 text-left"
                >
                  <ItemMedia variant="icon">
                    <item.icon aria-hidden="true" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t(item.label)}</ItemTitle>
                  </ItemContent>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </button>
              </Item>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
