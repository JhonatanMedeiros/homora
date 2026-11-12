import type { MessageKey } from '@/i18n';
import {
  Activity,
  Bell,
  Download,
  Globe,
  Home,
  Keyboard,
  Palette,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';

export type SettingsSection = (typeof settingsSections)[number]['id'];

/** Sidebar groups: what the person tweaks about their own view, then how the system behaves. */
export const settingsGroups: { title: MessageKey; sections: SettingsSection[] }[] = [
  { title: 'settings.group.personal', sections: ['appearance', 'home', 'topbar'] },
  {
    title: 'settings.group.system',
    sections: ['notifications', 'monitoring', 'public', 'backup', 'discovery'],
  },
];

/** Subpages of Settings. Each one is a route of its own so it can be linked and reached from the palette. */
export const settingsSections: {
  id:
    | 'appearance'
    | 'home'
    | 'topbar'
    | 'monitoring'
    | 'public'
    | 'backup'
    | 'discovery'
    | 'notifications';
  icon: LucideIcon;
  title: MessageKey;
  description: MessageKey;
}[] = [
  {
    id: 'appearance',
    icon: Palette,
    title: 'settings.section.appearance',
    description: 'settings.section.appearanceHint',
  },
  {
    id: 'home',
    icon: Home,
    title: 'settings.section.home',
    description: 'settings.section.homeHint',
  },
  {
    id: 'topbar',
    icon: Keyboard,
    title: 'settings.section.topbar',
    description: 'settings.section.topbarHint',
  },
  {
    id: 'notifications',
    icon: Bell,
    title: 'settings.section.notifications',
    description: 'settings.section.notificationsHint',
  },
  {
    id: 'monitoring',
    icon: Activity,
    title: 'settings.section.monitoring',
    description: 'settings.section.monitoringHint',
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

export const isSettingsSection = (value: string | undefined): value is SettingsSection =>
  settingsSections.some((section) => section.id === value);

export const settingsPath = (section?: SettingsSection) =>
  section ? `/manage/settings/${section}` : '/manage/settings';
