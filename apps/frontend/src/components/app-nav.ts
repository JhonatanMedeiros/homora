import type { MessageKey } from '@/i18n';
import { Bot, LayoutGrid, Server, type LucideIcon } from 'lucide-react';

export type Tab = 'services' | 'integrations' | 'agents';

export const navItems: { id: Tab; label: MessageKey; icon: LucideIcon }[] = [
  { id: 'services', label: 'nav.services', icon: LayoutGrid },
  { id: 'integrations', label: 'nav.integrations', icon: Server },
  { id: 'agents', label: 'nav.agents', icon: Bot },
];
