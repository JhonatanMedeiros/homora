import { Bell, House, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

type Props = {
  onHome: () => void;
  onSearch: () => void;
  onAlerts: () => void;
  onManage: () => void;
};

const item =
  'flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-none px-1 py-0 text-sm font-medium outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset [&_svg]:size-5';

/** Bottom bar of the Home on phones: Home, Search, Alerts, Manage, each a 56 px target. */
export function DashboardTabs({ onHome, onSearch, onAlerts, onManage }: Props) {
  return (
    <nav
      aria-label={t('dashTabs.label')}
      data-homora="dashboard-tabs"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
    >
      <Button type="button" variant="default" aria-current="page" onClick={onHome} className={item}>
        <House aria-hidden="true" />
        {t('dashTabs.home')}
      </Button>
      <Button type="button" variant="ghost" onClick={onSearch} className={cn(item)}>
        <Search aria-hidden="true" />
        {t('dashTabs.search')}
      </Button>
      <Button type="button" variant="ghost" onClick={onAlerts} className={cn(item)}>
        <Bell aria-hidden="true" />
        {t('dashTabs.alerts')}
      </Button>
      <Button type="button" variant="ghost" onClick={onManage} className={cn(item)}>
        <Settings2 aria-hidden="true" />
        {t('dashTabs.manage')}
      </Button>
    </nav>
  );
}
