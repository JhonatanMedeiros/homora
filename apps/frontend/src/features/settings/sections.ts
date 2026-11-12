import type { MessageKey } from '@/i18n';
import { Bell, Download, Globe, Home, Keyboard, Palette, type LucideIcon } from 'lucide-react';

/** Subpages of Settings. Each one is a route of its own so it can be linked and reached from the palette. */
export const settingsSections: {
  id: 'appearance' | 'home' | 'topbar' | 'alerts' | 'public' | 'backup';
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
    id: 'alerts',
    icon: Bell,
    title: 'settings.section.alerts',
    description: 'settings.section.alertsHint',
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
];

export type SettingsSection = (typeof settingsSections)[number]['id'];

export const isSettingsSection = (value: string | undefined): value is SettingsSection =>
  settingsSections.some((section) => section.id === value);

export const settingsPath = (section?: SettingsSection) =>
  section ? `/manage/settings/${section}` : '/manage/settings';
