import type { CSSProperties, ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { AppSidebar } from '@/components/app-sidebar';
import { MobileTabs } from '@/components/mobile-tabs';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Tab } from '@/components/app-nav';
import { t } from '@/i18n';

type Props = {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  /** Conteúdo da barra superior (a busca). */
  toolbar: ReactNode;
  children: ReactNode;
};

export function AppShell({ tab, onTabChange, onLogout, toolbar, children }: Props) {
  return (
    <SidebarProvider style={{ '--sidebar-width': '14.5rem' } as CSSProperties}>
      <AppSidebar tab={tab} onTabChange={onTabChange} onLogout={onLogout} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background px-4 md:px-8">
          <BrandMark compact className="md:hidden" />
          <div className="min-w-0 flex-1">{toolbar}</div>
          <div className="flex items-center md:hidden">
            <ThemeToggle />
            <LocaleSwitcher />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onLogout}
              aria-label={t('app.logout')}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-6 pb-24 md:px-8 md:pb-12">
          {children}
        </main>
      </SidebarInset>
      <MobileTabs tab={tab} onTabChange={onTabChange} />
    </SidebarProvider>
  );
}
