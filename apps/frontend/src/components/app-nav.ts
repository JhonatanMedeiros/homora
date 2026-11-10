import type { MessageKey } from '@/i18n';
import { Bot, LayoutGrid, Server, Settings, type LucideIcon } from 'lucide-react';

export type Tab = 'services' | 'integrations' | 'agents' | 'settings';

export const navItems: { id: Tab; label: MessageKey; icon: LucideIcon }[] = [
  { id: 'services', label: 'nav.services', icon: LayoutGrid },
  { id: 'integrations', label: 'nav.integrations', icon: Server },
  { id: 'agents', label: 'nav.agents', icon: Bot },
  { id: 'settings', label: 'nav.settings', icon: Settings },
];
