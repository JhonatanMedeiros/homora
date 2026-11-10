import { cn } from '@/lib/utils';
import { navItems, type Tab } from '@/components/app-nav';
import { t } from '@/i18n';

type Props = { tab: Tab; onTabChange: (tab: Tab) => void };

/** Navegação inferior no celular, com alvos de 56px. */
export function MobileTabs({ tab, onTabChange }: Props) {
  return (
    <nav
      aria-label={t('nav.sections')}
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => onTabChange(item.id)}
          className={cn(
            'flex h-14 flex-col items-center justify-center gap-0.5 font-label text-sm font-semibold tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset [&_svg]:size-5',
            tab === item.id ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/80',
          )}
        >
          <item.icon aria-hidden="true" />
          {t(item.label)}
        </button>
      ))}
    </nav>
  );
}
