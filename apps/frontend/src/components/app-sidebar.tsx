import { LogOut } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { navItems, type Tab } from '@/components/app-nav';
import { t } from '@/i18n';

type Props = { tab: Tab; onTabChange: (tab: Tab) => void; onLogout: () => void };

/** Desktop graphite rail: branding, primary navigation, theme, and sign out. */
export function AppSidebar({ tab, onTabChange, onLogout }: Props) {
  return (
    <div className="sticky top-0 hidden h-svh shrink-0 md:block">
      <Sidebar collapsible="none" className="border-r border-sidebar-border">
        <SidebarHeader className="h-16 justify-center px-4">
          <BrandMark className="text-sidebar-foreground" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label={t('nav.main')}>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        size="lg"
                        isActive={tab === item.id}
                        aria-current={tab === item.id ? 'page' : undefined}
                        onClick={() => onTabChange(item.id)}
                        className="font-label text-base font-semibold tracking-wide data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                      >
                        <item.icon />
                        <span>{t(item.label)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-3 p-4">
          <div className="flex items-center gap-1">
            <ThemeToggle className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            <LocaleSwitcher className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={onLogout}
              aria-label={t('app.logout')}
            >
              <LogOut />
            </Button>
          </div>
          <p className="text-xs text-sidebar-foreground/70">{t('app.localNote')}</p>
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}
