import { House, Search, SlidersHorizontal } from 'lucide-react';
import { FloatingNav, FloatingNavItem } from '@/components/floating-nav';
import { t } from '@/i18n';

type Props = {
  onHome: () => void;
  onSearch: () => void;
  onManage: () => void;
};

/** Bottom bar of the Home on phones: Home, Search, Manage in a floating capsule. Notifications are the bell in the header. */
export function DashboardTabs({ onHome, onSearch, onManage }: Props) {
  return (
    <FloatingNav label={t('dashTabs.label')} homora="dashboard-tabs">
      <FloatingNavItem icon={House} label={t('dashTabs.home')} active onClick={onHome} />
      <FloatingNavItem icon={Search} label={t('dashTabs.search')} onClick={onSearch} />
      <FloatingNavItem icon={SlidersHorizontal} label={t('dashTabs.manage')} onClick={onManage} />
    </FloatingNav>
  );
}
