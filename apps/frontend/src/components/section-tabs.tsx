import { cn } from '@homora/ui/lib/utils';
import { homeSections, navPath, type NavId, type Tab } from '@/components/app-nav';
import { t } from '@/i18n';

type Props = {
  active: Tab;
  onNavigate: (id: NavId) => void;
  /** The tabs share the whole row, each in proportion to its name, as on phones. */
  fill?: boolean;
};

/**
 * Summary, Services and Maintenance: the three views of the Home. They are links, because each has
 * its own address.
 */
export function SectionTabs({ active, onNavigate, fill }: Props) {
  return (
    <nav aria-label={t('nav.homeSections')} data-homora="section-tabs" className="min-w-0">
      <ul className="m-0 flex list-none gap-1 p-0">
        {homeSections.map((item) => (
          <li key={item.id} className={cn('min-w-0', fill && 'flex-auto')}>
            <a
              href={navPath(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onNavigate(item.id);
              }}
              className="flex min-h-9 items-center justify-center rounded-md px-2 text-sm font-medium text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground pointer-coarse:min-h-11"
            >
              <span className="truncate">
                {item.id === 'home' ? t('nav.summary') : t(item.label)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
