import type { MessageKey } from '@/i18n';
import { Activity, Bot, LayoutGrid, Server, Settings, type LucideIcon } from 'lucide-react';

export type Tab = 'services' | 'integrations' | 'agents' | 'activity' | 'settings' | 'account';

/** Sections of the management area. The account lives outside it, under the user menu. */
export const navItems: { id: Exclude<Tab, 'account'>; label: MessageKey; icon: LucideIcon }[] = [
  { id: 'services', label: 'nav.services', icon: LayoutGrid },
  { id: 'integrations', label: 'nav.integrations', icon: Server },
  { id: 'agents', label: 'nav.agents', icon: Bot },
  { id: 'activity', label: 'nav.activity', icon: Activity },
  { id: 'settings', label: 'nav.settings', icon: Settings },
];

/** Sections that get a slot in the phone's bottom bar; the rest go under "More". */
export const primaryNavIds: Tab[] = ['services', 'integrations', 'agents'];

/** Router path of a section; the account lives outside the management area. */
export const tabPath = (tab: Tab) => (tab === 'account' ? '/account' : `/manage/${tab}`);
