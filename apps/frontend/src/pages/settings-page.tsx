import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router';
import { PageHeader } from '@/components/page-header';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Discovery } from '@/features/discovery/discovery';
import { PublicStatusSettings } from '@/features/public-status/public-status-settings';
import {
  HomeSettings,
  InterfaceSettings,
  TopBarSettings,
} from '@/features/settings/interface-settings';
import { MonitoringSettings } from '@/features/settings/monitoring-settings';
import { NotificationSettings } from '@/features/settings/notification-settings';
import {
  isSettingsSection,
  settingsPath,
  settingsGroups,
  settingsSections,
  type SettingsSection,
} from '@/features/settings/sections';
import { ConfigTransfer } from '@/features/transfer/config-transfer';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/**
 * Settings is a hub. On phones the list and each subpage take turns on screen; from `md` up they
 * sit side by side. The subpage is always in the URL, so it can be linked and reached from the palette.
 */
export function SettingsPage({ onImported }: { onImported: () => void | Promise<void> }) {
  const { pathname } = useLocation();
  const param = matchPath('/manage/settings/:section', pathname)?.params.section;
  const open: SettingsSection | null = isSettingsSection(param) ? param : null;
  // Wide screens always show a subpage; phones show the list until one is chosen.
  const current = open ?? 'appearance';
  return (
    <section aria-label={t('settings.title')} className="flex flex-col gap-6">
      <div className={cn(open && 'hidden md:block')}>
        <PageHeader title={t('settings.title')} description={t('settings.description')} />
      </div>
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start">
        <nav
          aria-label={t('settings.title')}
          className={cn('md:sticky md:top-8', open && 'hidden md:block')}
        >
          <div className="flex flex-col gap-5">
            {settingsGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(group.title)}
                </h2>
                <ItemGroup className="gap-1.5 md:gap-0.5">
                  {group.sections.map((id) => {
                    const section = settingsSections.find((item) => item.id === id)!;
                    return (
                      <Item
                        key={id}
                        asChild
                        variant="outline"
                        size="sm"
                        className={cn(
                          'md:border-transparent md:py-2',
                          current === id && 'md:border-border md:bg-muted',
                        )}
                      >
                        <Link to={settingsPath(id)} aria-current={open === id ? 'page' : undefined}>
                          <ItemMedia variant="icon">
                            <section.icon aria-hidden="true" />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>{t(section.title)}</ItemTitle>
                            <ItemDescription className="md:hidden">
                              {t(section.description)}
                            </ItemDescription>
                          </ItemContent>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 text-muted-foreground md:hidden"
                          />
                        </Link>
                      </Item>
                    );
                  })}
                </ItemGroup>
              </div>
            ))}
          </div>
        </nav>
        <div className={cn('flex min-w-0 flex-col gap-6', !open && 'hidden md:flex')}>
          <Link
            to={settingsPath()}
            className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium md:hidden"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {t('settings.title')}
          </Link>
          {current === 'appearance' && <InterfaceSettings />}
          {current === 'home' && <HomeSettings onChanged={onImported} />}
          {current === 'topbar' && <TopBarSettings />}
          {current === 'monitoring' && <MonitoringSettings />}
          {current === 'public' && <PublicStatusSettings />}
          {current === 'notifications' && <NotificationSettings />}
          {current === 'backup' && <ConfigTransfer onImported={onImported} />}
          {current === 'discovery' && <Discovery onImported={onImported} />}
        </div>
      </div>
    </section>
  );
}
