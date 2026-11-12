import type { MessageKey } from '@/i18n';
import { Bell, Download, Globe, PanelTop, ScanSearch, type LucideIcon } from 'lucide-react';

/** Subpages of Settings. Each one is a route of its own so it can be linked and reached from the palette. */
export const settingsSections: {
  id: 'interface' | 'public' | 'backup' | 'discovery' | 'notifications';
  icon: LucideIcon;
  title: MessageKey;
  description: MessageKey;
}[] = [
  {
    id: 'notifications',
    icon: Bell,
    title: 'settings.section.notifications',
    description: 'settings.section.notificationsHint',
  },
  {
    id: 'interface',
    icon: PanelTop,
    title: 'settings.section.interface',
    description: 'settings.section.interfaceHint',
  },
  {
    id: 'public',
    icon: Globe,
    title: 'settings.section.public',
    description: 'settings.section.publicHint',
  },
  {
    id: 'backup',
    icon: Download,
    title: 'settings.section.backup',
    description: 'settings.section.backupHint',
  },
  {
    id: 'discovery',
    icon: ScanSearch,
    title: 'settings.section.discovery',
    description: 'settings.section.discoveryHint',
  },
];

export type SettingsSection = (typeof settingsSections)[number]['id'];

export const isSettingsSection = (value: string | undefined): value is SettingsSection =>
  settingsSections.some((section) => section.id === value);

export const settingsPath = (section?: SettingsSection) =>
  section ? `/manage/settings/${section}` : '/manage/settings';
