import { Bell, House, Search, SlidersHorizontal } from 'lucide-react';
import { FloatingNav, FloatingNavItem } from '@/components/floating-nav';
import { t } from '@/i18n';

type Props = {
  onHome: () => void;
  onSearch: () => void;
  onAlerts: () => void;
  onManage: () => void;
  /** Offline services nobody has acknowledged: a small count over the bell. */
  alertCount?: number;
};

/** Bottom bar of the Home on phones: Home, Search, Alerts, Manage in a floating capsule. */
export function DashboardTabs({ onHome, onSearch, onAlerts, onManage, alertCount }: Props) {
  return (
    <FloatingNav label={t('dashTabs.label')} homora="dashboard-tabs">
      <FloatingNavItem icon={House} label={t('dashTabs.home')} active onClick={onHome} />
      <FloatingNavItem icon={Search} label={t('dashTabs.search')} onClick={onSearch} />
      <FloatingNavItem
        icon={Bell}
        label={t('dashTabs.alerts')}
        onClick={onAlerts}
        badge={alertCount}
      />
      <FloatingNavItem icon={SlidersHorizontal} label={t('dashTabs.manage')} onClick={onManage} />
    </FloatingNav>
  );
}
