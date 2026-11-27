import { useState } from 'react';
import { Ellipsis, Plus } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Separator } from '@homora/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import { FloatingNav, FloatingNavItem } from '@/components/floating-nav';
import { moreNavItems, primaryNavItems, type NavId } from '@/components/app-nav';
import { t } from '@/i18n';

type Props = {
  active: NavId;
  onNavigate: (id: NavId) => void;
  onNewService: () => void;
  /** Agent proposals waiting for review. */
  pending: number;
};

/** Bottom navigation on phones: the main sections plus "More", in a floating capsule. */
export function MobileTabs({ active, onNavigate, onNewService, pending }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreNavItems.some((item) => item.id === active);
  const pendingText =
    pending === 1 ? t('nav.pending.one') : t('nav.pending.other', { count: pending });
  return (
    <>
      <FloatingNav label={t('nav.sections')} homora="mobile-nav">
        {primaryNavItems.map((item) => (
          <FloatingNavItem
            key={item.id}
            icon={item.icon}
            label={t(item.label)}
            active={active === item.id}
            badge={item.id === 'agents' && pending > 0 ? pendingText : undefined}
            onClick={() => onNavigate(item.id)}
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
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>{t('nav.moreSections')}</SheetTitle>
            <SheetDescription className="sr-only">{t('nav.moreSections')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-0.5 px-3">
            {moreNavItems.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-current={active === item.id ? 'page' : undefined}
                onClick={() => {
                  setMoreOpen(false);
                  onNavigate(item.id);
                }}
                className="h-13 w-full justify-start gap-3.5 px-3.5 text-base font-medium aria-[current=page]:text-accent-text [&_svg]:size-5.5"
              >
                <item.icon aria-hidden="true" />
                {t(item.label)}
                {item.id === 'agents' && pending > 0 && (
                  <Badge className="ml-auto">{pending}</Badge>
                )}
              </Button>
            ))}
            <Separator className="my-1" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMoreOpen(false);
                onNewService();
              }}
              className="h-13 w-full justify-start gap-3.5 px-3.5 text-base font-semibold text-accent-text [&_svg]:size-5.5"
            >
              <Plus aria-hidden="true" />
              {t('nav.newService')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
