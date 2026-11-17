import { useState } from 'react';
import { Ellipsis, House } from 'lucide-react';
import { FloatingNav, FloatingNavItem } from '@/components/floating-nav';
import { Button } from '@homora/ui/button';
import { navItems, primaryNavIds, type Tab } from '@/components/app-nav';
import { Separator } from '@homora/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import { t } from '@/i18n';

type Props = { tab: Tab; onTabChange: (tab: Tab) => void; onHome: () => void };

/** Bottom navigation on phones: the main sections plus "More", in a floating capsule. */
export function MobileTabs({ tab, onTabChange, onHome }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = navItems.filter((item) => primaryNavIds.includes(item.id));
  const more = navItems.filter((item) => !primaryNavIds.includes(item.id));
  const moreActive = more.some((item) => item.id === tab);
  return (
    <>
      <FloatingNav label={t('nav.sections')}>
        {primary.map((item) => (
          <FloatingNavItem
            key={item.id}
            icon={item.icon}
            label={t(item.label)}
            active={tab === item.id}
            onClick={() => onTabChange(item.id)}
          />
        ))}
        <FloatingNavItem
          icon={Ellipsis}
          label={t('nav.more')}
          active={moreActive}
          popup
          onClick={() => setMoreOpen(true)}
        />
      </FloatingNav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>{t('nav.moreSections')}</SheetTitle>
            <SheetDescription className="sr-only">{t('nav.moreSections')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-0.5 px-3">
            {more.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => {
                  setMoreOpen(false);
                  onTabChange(item.id);
                }}
                className="h-13 w-full justify-start gap-3.5 px-3.5 text-base font-medium aria-[current=page]:text-accent-text [&_svg]:size-5.5"
              >
                <item.icon aria-hidden="true" />
                {t(item.label)}
              </Button>
            ))}
            <Separator className="my-1" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMoreOpen(false);
                onHome();
              }}
              className="h-13 w-full justify-start gap-3.5 px-3.5 text-base font-semibold text-accent-text [&_svg]:size-5.5"
            >
              <House aria-hidden="true" />
              {t('manage.back')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
