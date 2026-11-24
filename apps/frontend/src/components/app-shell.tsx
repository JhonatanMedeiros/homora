import { HeaderStatusSlot } from '@/components/header-status-slot';
import { useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  LogOut,
  Search,
  Settings,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Kbd } from '@homora/ui/kbd';
import { Avatar, AvatarFallback } from '@homora/ui/avatar';
import { Button } from '@homora/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homora/ui/dropdown-menu';
import { initials, type Profile } from '@/features/account/account-model';
import { BrandMark } from '@/components/brand-mark';
import { t } from '@/i18n';
import { navGroups, navItems, type Tab } from '@/components/app-nav';
import { usePendingProposals } from '@/hooks/use-pending-proposals';
import { MobileTabs } from '@/components/mobile-tabs';
import { VersionMenuItem } from '@/components/version-menu-item';
import { Badge } from '@homora/ui/badge';
import { releaseUrl, useBuildVersion } from '@/hooks/use-build-version';
import { hasUpdate } from '@/features/releases/release-feed';
import { useReleaseFeed } from '@/features/releases/use-release-feed';
import { ReleasesDialog } from '@/features/releases/releases-dialog';

type Props = {
  tab: Tab;
  managing: boolean;
  onManageChange: (value: boolean) => void;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  onOpenPalette: () => void;
  profile: Profile | null;
  /** The alerts bell, when the dashboard has data to count. */
  alerts?: ReactNode;
  /** Home page switcher pills rendered in the header outside management/account views. */
  pagesNav?: ReactNode;
  children: ReactNode;
};

export function AppShell({
  tab,
  managing,
  onManageChange,
  onTabChange,
  onLogout,
  onOpenPalette,
  profile,
  alerts,
  pagesNav,
  children,
}: Props) {
  // The account is a page of its own: no sidebar, just a way back.
  const standalone = tab === 'account' && !managing;
  const pendingProposals = usePendingProposals(tab, managing);
  const [releasesOpen, setReleasesOpen] = useState(false);
  const build = useBuildVersion();
  const feed = useReleaseFeed();
  const installedTag = build?.releaseTag ?? null;
  const updateAvailable = !feed.demo && hasUpdate(installedTag, feed.releases);
  return (
    <div className="min-h-svh">
      <header data-homora="app-header" className="bg-sidebar text-sidebar-foreground">
        <div
          className={`mx-auto flex min-h-16 flex-wrap items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-4 md:px-8 ${managing ? 'max-w-none md:px-6' : tab === 'services' ? 'max-w-[90rem]' : 'max-w-6xl'}`}
        >
          <div className="contents md:flex md:min-w-0 md:flex-1 md:items-center md:gap-3">
            <BrandMark
              compact
              onNavigate={() => onTabChange('services')}
              className={`text-sidebar-foreground ${managing || standalone ? 'max-md:hidden' : ''}`}
            />
            {build &&
              !managing &&
              !standalone &&
              (build.releaseTag ? (
                <a
                  href={releaseUrl(build.releaseTag)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden shrink-0 text-xs text-sidebar-foreground/70 underline-offset-4 hover:underline sm:inline"
                >
                  v{build.version}
                </a>
              ) : (
                <span className="hidden shrink-0 text-xs text-sidebar-foreground/70 sm:inline">
                  v{build.version}
                </span>
              ))}
          </div>
          <span className="mr-auto md:hidden" />
          <Button
            type="button"
            variant="outline"
            aria-label={t('palette.button')}
            aria-keyshortcuts="Control+K Meta+K"
            onClick={onOpenPalette}
            className="order-2 h-9 w-full cursor-pointer justify-start gap-2 border-sidebar-border bg-sidebar-accent/40 px-3 font-normal text-sidebar-foreground/65 shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:order-none md:w-56 md:shrink-0 lg:w-72 xl:w-80"
          >
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate text-sm">{t('palette.placeholder')}</span>
            <Kbd className="ml-auto hidden bg-sidebar-accent text-sidebar-foreground md:inline-flex">
              Ctrl K
            </Kbd>
          </Button>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2 md:flex-1 md:justify-end">
            <HeaderStatusSlot />
            {alerts}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label={`${t('userMenu.label', { name: profile?.name ?? '' })}${updateAvailable ? ` · ${t('releases.update')}` : ''}`}
                  className="h-11 gap-1 rounded-full px-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent sm:gap-1.5 sm:px-1.5"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {profile ? initials(profile.name) : <UserRound className="size-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                  {updateAvailable && (
                    <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {profile && (
                  <>
                    <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
                      <span className="text-sm font-medium text-foreground">{profile.name}</span>
                      <span className="text-xs text-muted-foreground">{profile.email}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={() => onTabChange('account')}>
                  <UserRound /> {t('nav.account')}
                </DropdownMenuItem>
                {!managing && !standalone && (
                  <DropdownMenuItem onSelect={() => onManageChange(true)}>
                    <Settings /> {t('manage.open')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => onTabChange('activity')}>
                  <Activity /> {t('nav.activity')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setReleasesOpen(true)}>
                  <Sparkles /> {t('releases.title')}
                  {updateAvailable && <Badge className="ml-auto">{t('releases.update')}</Badge>}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href="https://github.com/JhonatanMedeiros/homora"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink /> GitHub
                  </a>
                </DropdownMenuItem>
                <VersionMenuItem />
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut /> {t('app.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {(managing || standalone) && (
            <Button
              variant="outline"
              onClick={() => onManageChange(false)}
              className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:order-first max-md:-ml-2 max-md:size-11 max-md:border-0 max-md:px-0"
            >
              <ArrowLeft /> <span className="max-md:sr-only">{t('manage.back')}</span>
            </Button>
          )}
        </div>
        {pagesNav && !managing && !standalone && (
          <div
            data-homora="pages-bar"
            className="border-t border-sidebar-border/60 bg-sidebar-accent/20"
          >
            <div
              className={`mx-auto flex min-h-12 items-center px-3 py-1 sm:px-4 md:px-8 ${tab === 'services' ? 'max-w-[90rem]' : 'max-w-6xl'}`}
            >
              {pagesNav}
            </div>
          </div>
        )}
      </header>
      <ReleasesDialog
        open={releasesOpen}
        onOpenChange={setReleasesOpen}
        status={feed.status}
        releases={feed.releases}
        currentTag={installedTag}
        demo={feed.demo}
        retry={feed.retry}
      />
      <main
        className={
          managing
            ? 'flex w-full flex-col pb-28 md:pb-0'
            : `mx-auto flex w-full ${tab === 'services' ? 'max-w-[90rem]' : 'max-w-6xl'} flex-col gap-8 px-4 py-8 md:px-8 md:py-8 ${tab === 'services' ? 'pb-24 md:pb-8' : ''}`
        }
      >
        {!managing && !standalone && (
          <>
            <h1 className="sr-only">{t('home.title')}</h1>
            <p className="sr-only">{t('home.description')}</p>
          </>
        )}
        {managing ? (
          <div className="flex md:min-h-[calc(100svh-4rem)] md:flex-row">
            <aside className="hidden shrink-0 border-r bg-sidebar/40 p-3 md:sticky md:top-0 md:block md:h-[calc(100svh-4rem)] md:w-60 md:self-start md:overflow-y-auto">
              <nav aria-label={t('manage.title')} className="flex flex-col gap-5">
                {navGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-1">
                    <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t(group.label)}
                    </p>
                    {group.items.map((id) => {
                      const item = navItems.find((entry) => entry.id === id)!;
                      return (
                        <Button
                          key={item.id}
                          variant={tab === item.id ? 'secondary' : 'ghost'}
                          aria-current={tab === item.id ? 'page' : undefined}
                          onClick={() => onTabChange(item.id)}
                          className="justify-start"
                        >
                          <item.icon />
                          {t(item.label)}
                          {item.id === 'agents' && pendingProposals > 0 && (
                            <span
                              className="ml-auto rounded-full bg-primary px-2 font-mono text-xs text-primary-foreground tabular-nums"
                              role="status"
                            >
                              {pendingProposals}
                              <span className="sr-only"> {t('agents.proposals')}</span>
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </aside>
            <div key={tab} className="motion-panel min-w-0 flex-1 px-4 py-8 md:px-10">
              <div className="mx-auto w-full max-w-5xl">{children}</div>
            </div>
          </div>
        ) : standalone ? (
          <div className="motion-panel w-full">{children}</div>
        ) : (
          children
        )}
      </main>
      {managing && (
        <MobileTabs tab={tab} onTabChange={onTabChange} onHome={() => onManageChange(false)} />
      )}
    </div>
  );
}
