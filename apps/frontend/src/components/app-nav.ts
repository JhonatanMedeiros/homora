import type { MessageKey } from '@/i18n';
import {
  Activity,
  Bot,
  CalendarClock,
  House,
  LayoutGrid,
  Radar,
  Server,
  Settings,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

export type Tab =
  | 'home'
  | 'services'
  | 'maintenance'
  | 'probes'
  | 'integrations'
  | 'agents'
  | 'activity'
  | 'settings'
  | 'account';

/** A place in the navigation. The map is a way of arranging Services, so it is not a tab. */
export type NavId = Tab | 'map';

export type NavItem = { id: Exclude<NavId, 'account'>; label: MessageKey; icon: LucideIcon };

/** Every destination, in the order the command palette lists them. The account has its own menu. */
export const navItems: NavItem[] = [
  { id: 'home', label: 'nav.home', icon: House },
  { id: 'services', label: 'nav.services', icon: LayoutGrid },
  { id: 'map', label: 'nav.map', icon: Waypoints },
  { id: 'maintenance', label: 'nav.maintenance', icon: CalendarClock },
  { id: 'probes', label: 'nav.probes', icon: Radar },
  { id: 'integrations', label: 'nav.integrations', icon: Server },
  { id: 'agents', label: 'nav.agents', icon: Bot },
  { id: 'activity', label: 'nav.activity', icon: Activity },
  { id: 'settings', label: 'nav.settings', icon: Settings },
];

const pick = (ids: NavItem['id'][]) => ids.map((id) => navItems.find((item) => item.id === id)!);

/** The desktop rail. Maintenance is a section of the Home, reached from its own tabs. */
export const railItems = pick([
  'home',
  'services',
  'map',
  'probes',
  'integrations',
  'agents',
  'activity',
  'settings',
]);

/** The phone's bottom bar; everything else is under "More". */
export const primaryNavItems = pick(['home', 'services', 'agents']);
export const moreNavItems = pick([
  'maintenance',
  'map',
  'probes',
  'integrations',
  'activity',
  'settings',
]);

/** The sections that share the Home sidebar and its tabs. */
export const homeSections = pick(['home', 'services', 'maintenance']);
export const isHomeSection = (tab: Tab) =>
  tab === 'home' || tab === 'services' || tab === 'maintenance';

/** Router path of a destination. The map shares the Services path. */
export function navPath(id: NavId): string {
  if (id === 'home') return '/';
  if (id === 'map') return '/services';
  if (id === 'services' || id === 'maintenance' || id === 'account') return `/${id}`;
  return `/manage/${id}`;
}
