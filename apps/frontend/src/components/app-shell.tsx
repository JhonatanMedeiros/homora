import type { ReactNode } from 'react';
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  LogOut,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials, type Profile } from '@/features/account/account-model';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { t } from '@/i18n';
import { ThemeToggle } from '@/components/theme-toggle';
import { navItems, type Tab } from '@/components/app-nav';
import { MobileTabs } from '@/components/mobile-tabs';

type Props = {
  tab: Tab;
  managing: boolean;
  onManageChange: (value: boolean) => void;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  onOpenPalette: () => void;
  profile: Profile | null;
  toolbar: ReactNode;
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
  toolbar,
  children,
}: Props) {
  // The account is a page of its own: no sidebar and no search, just a way back.
  const standalone = tab === 'account' && !managing;
  return (
    <div className="min-h-svh bg-background">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-3 px-4 py-2 md:px-8">
          <BrandMark className="text-sidebar-foreground" />
          {!managing && !standalone && (
            <div className="order-last w-full sm:order-none sm:mx-4 sm:max-w-md sm:flex-1">
              {toolbar}
            </div>
          )}
          <span className="mr-auto" />
          <Button
            variant="ghost"
            aria-label={t('palette.button')}
            aria-keyshortcuts="Control+K Meta+K"
            onClick={onOpenPalette}
            className="gap-2 px-2.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Search aria-hidden="true" />
            <Kbd className="hidden bg-sidebar-accent text-sidebar-foreground md:inline-flex">
              Ctrl K
            </Kbd>
          </Button>
          <LocaleSwitcher className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          <ThemeToggle className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                aria-label={t('userMenu.label', { name: profile?.name ?? '' })}
                className="h-11 gap-1.5 rounded-full px-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                    {profile ? initials(profile.name) : <UserRound className="size-4" />}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown aria-hidden="true" className="size-3.5" />
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
              <DropdownMenuItem onSelect={() => onTabChange('activity')}>
                <Activity /> {t('nav.activity')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogout}>
                <LogOut /> {t('app.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            onClick={() => onManageChange(!(managing || standalone))}
            className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {managing || standalone ? <ArrowLeft /> : <Settings />}{' '}
            {managing || standalone ? t('manage.back') : t('manage.open')}
          </Button>
        </div>
      </header>
      <main
        className={`mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-8 ${managing ? 'pb-24 md:pb-8' : ''}`}
      >
        {!managing && !standalone && (
          <>
            <h1 className="sr-only">{t('home.title')}</h1>
            <p className="sr-only">{t('home.description')}</p>
          </>
        )}
        {managing ? (
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <aside className="hidden shrink-0 md:sticky md:top-8 md:block md:w-52">
              <div className="mb-3 px-3">
                <p className="font-label text-xl font-semibold">{t('manage.title')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('manage.description')}</p>
              </div>
              <nav aria-label={t('manage.title')} className="flex flex-wrap gap-1 md:flex-col">
                {navItems.map((item) => (
                  <Button
                    key={item.id}
                    variant={tab === item.id ? 'secondary' : 'ghost'}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => onTabChange(item.id)}
                    className="justify-start"
                  >
                    <item.icon />
                    {t(item.label)}
                  </Button>
                ))}
              </nav>
            </aside>
            <div key={tab} className="motion-panel min-w-0 flex-1">
              {children}
            </div>
          </div>
        ) : standalone ? (
          <div className="motion-panel mx-auto w-full max-w-3xl">{children}</div>
        ) : (
          children
        )}
      </main>
      {managing && <MobileTabs tab={tab} onTabChange={onTabChange} />}
    </div>
  );
}
