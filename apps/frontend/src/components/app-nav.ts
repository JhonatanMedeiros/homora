import type { MessageKey } from '@/i18n';
import {
  Activity,
  Bot,
  LayoutGrid,
  Server,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export type Tab = 'services' | 'integrations' | 'agents' | 'activity' | 'settings' | 'account';

export const navItems: { id: Tab; label: MessageKey; icon: LucideIcon }[] = [
  { id: 'services', label: 'nav.services', icon: LayoutGrid },
  { id: 'integrations', label: 'nav.integrations', icon: Server },
  { id: 'agents', label: 'nav.agents', icon: Bot },
  { id: 'activity', label: 'nav.activity', icon: Activity },
  { id: 'settings', label: 'nav.settings', icon: Settings },
  { id: 'account', label: 'nav.account', icon: UserRound },
];
