import type { ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import { Kbd } from '@homora/ui/kbd';
import { Button } from '@homora/ui/button';
import { cn } from '@homora/ui/lib/utils';
import { SkipLink } from '@/components/skip-link';
import { HeaderStatusSlot } from '@/components/header-status-slot';
import { BrandMark } from '@/components/brand-mark';
import { AccountMenu } from '@/components/account-menu';
import { NavRail } from '@/components/nav-rail';
import { MobileTabs } from '@/components/mobile-tabs';
import { SectionTabs } from '@/components/section-tabs';
import { isHomeSection, navItems, type NavId, type Tab } from '@/components/app-nav';
import { usePendingProposals } from '@/hooks/use-pending-proposals';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Profile } from '@/features/account/account-model';
import { t } from '@/i18n';

type Props = {
  tab: Tab;
  /** Where the person is in the navigation; differs from `tab` only for the map. */
  active: NavId;
  onNavigate: (id: NavId) => void;
  onNewService: () => void;
  onLogout: () => void;
  onOpenPalette: () => void;
  profile: Profile | null;
  /** The alerts bell, when the dashboard has data to count. */
  alerts?: ReactNode;
  /** The Home's page switcher, shown under the top bar where pages apply. */
  pagesNav?: ReactNode;
  /** The page's heading for screen readers, when the page shows none of its own. */
  title?: string;
  /** A single service page: the Home tabs give way to its own breadcrumb. */
  detail?: boolean;
  children: ReactNode;
};

/**
 * The frame of the signed-in app: a navigation rail on wide screens, a top bar everywhere, and a
 * bottom bar on phones. Every section lives inside it.
 */
export function AppShell({
  tab,
  active,
  onNavigate,
  onNewService,
  onLogout,
  onOpenPalette,
  profile,
  alerts,
  pagesNav,
  title,
  detail,
  children,
}: Props) {
  const mobile = useIsMobile();
  const pending = usePendingProposals(tab, true);
  const wide = isHomeSection(tab);
  const sections = wide && !detail;
  const current =
    tab === 'account' ? t('nav.account') : t(navItems.find((item) => item.id === active)!.label);
  const width = wide ? 'max-w-[100rem]' : 'max-w-6xl';
  const account = (placement: 'rail' | 'header') => (
    <AccountMenu
      profile={profile}
      placement={placement}
      onAccount={() => onNavigate('account')}
      onLogout={onLogout}
    />
  );
  return (
    <div className="flex min-h-svh">
      <SkipLink home={tab === 'home' || (tab === 'services' && !detail)} />
      <NavRail
        active={active}
        onNavigate={onNavigate}
        pending={pending}
        account={mobile ? null : account('rail')}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header data-homora="app-header" className="border-b bg-sidebar text-sidebar-foreground">
          <div className="flex min-h-16 items-center gap-1 px-3 sm:gap-2 sm:px-4 md:px-6">
            {mobile && (
              <BrandMark
                iconOnly
                onNavigate={() => onNavigate('home')}
                className="size-11 justify-center"
              />
            )}
            <div className="flex min-w-0 flex-1 items-center gap-4 max-md:hidden">
              {sections ? (
                <SectionTabs active={tab} onNavigate={onNavigate} />
              ) : (
                <nav aria-label={t('nav.location')} className="min-w-0">
                  <ol className="m-0 flex list-none items-center gap-2 p-0 text-sm">
                    <li className="text-sidebar-foreground/60 max-lg:hidden">Homora</li>
                    <li aria-hidden="true" className="text-sidebar-foreground/40 max-lg:hidden">
                      /
                    </li>
                    <li aria-current="page" className="truncate font-medium">
                      {current}
                    </li>
                  </ol>
                </nav>
              )}
            </div>
            <span className="mr-auto md:hidden" />
            <Button
              type="button"
              variant="outline"
              aria-label={t('palette.button')}
              aria-keyshortcuts="Control+K Meta+K"
              onClick={onOpenPalette}
              className="cursor-pointer justify-start gap-2 border-sidebar-border bg-sidebar-accent/40 font-normal text-sidebar-foreground/65 shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-lg:size-11 max-lg:justify-center max-lg:border-0 max-lg:bg-transparent max-lg:p-0 lg:h-9 lg:w-64 lg:px-3 xl:w-72"
            >
              <Search aria-hidden="true" className="size-4 shrink-0 max-lg:size-5" />
              <span className="truncate text-sm max-lg:sr-only">{t('palette.placeholder')}</span>
              <Kbd className="ml-auto bg-sidebar-accent text-sidebar-foreground max-lg:hidden">
                Ctrl K
              </Kbd>
            </Button>
            <HeaderStatusSlot />
            {alerts}
            {mobile ? (
              account('header')
            ) : (
              <Button type="button" onClick={onNewService} className="max-lg:size-11 max-lg:p-0">
                <Plus aria-hidden="true" />
                <span className="max-lg:sr-only">{t('nav.newService')}</span>
              </Button>
            )}
          </div>
          {sections && mobile && (
            <div className="border-t border-sidebar-border/60 px-3 py-1">
              <SectionTabs active={tab} onNavigate={onNavigate} fill />
            </div>
          )}
          {pagesNav && (
            <div
              data-homora="pages-bar"
              className="border-t border-sidebar-border/60 bg-sidebar-accent/20"
            >
              <div className="flex min-h-12 items-center px-3 py-1 sm:px-4 md:px-6">{pagesNav}</div>
            </div>
          )}
        </header>
        <main
          id="content"
          tabIndex={-1}
          className={cn(
            'mx-auto flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-5 pb-28 md:px-6 md:py-8 md:pb-8',
            width,
          )}
        >
          {title && <h1 className="sr-only">{title}</h1>}
          <div key={tab} className="motion-panel flex min-w-0 flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
      <MobileTabs
        active={active}
        onNavigate={onNavigate}
        onNewService={onNewService}
        pending={pending}
      />
    </div>
  );
}
