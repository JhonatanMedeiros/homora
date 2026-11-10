import { Bot, LayoutGrid, Server, type LucideIcon } from 'lucide-react';

export type Tab = 'services' | 'integrations' | 'agents';

export const navItems: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'services', label: 'Serviços', icon: LayoutGrid },
  { id: 'integrations', label: 'Integrações', icon: Server },
  { id: 'agents', label: 'Agentes', icon: Bot },
];
