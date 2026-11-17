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
} from '@homora/ui/item';
import { PublicStatusSettings } from '@/features/public-status/public-status-settings';
import { SettingsSearch } from '@/features/settings/settings-search';
import { AlertsSettings } from '@/features/settings/alerts-settings';
import { HomeSettings } from '@/features/settings/home-settings';
import { InterfaceSettings } from '@/features/settings/interface-settings';
import { TopBarSettings } from '@/features/settings/top-bar-settings';
import {
  isSettingsSection,
  settingsPath,
  settingsSections,
  type SettingsSection,
} from '@/features/settings/sections';
import { ConfigTransfer } from '@/features/transfer/config-transfer';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

/**
 * Settings has a few short tabs. On phones the list and each subpage take turns on screen; from `md`
 * up the tabs sit above the page. The subpage is always in the URL, so it can be linked and reached
 * from the palette.
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
        <PageHeader
          title={t('settings.title')}
          description={t('settings.description')}
          actions={<SettingsSearch />}
        />
      </div>
      <nav aria-label={t('settings.title')} className="flex flex-col gap-6">
        <ItemGroup className={cn('gap-2 md:hidden', open && 'hidden')}>
          {settingsSections.map((section) => (
            <Item key={section.id} asChild variant="outline" size="sm">
              <Link to={settingsPath(section.id)}>
                <ItemMedia variant="icon">
                  <section.icon aria-hidden="true" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t(section.title)}</ItemTitle>
                  <ItemDescription>{t(section.description)}</ItemDescription>
                </ItemContent>
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </Link>
            </Item>
          ))}
        </ItemGroup>
        <ul className="-mt-2 hidden gap-1 overflow-x-auto border-b [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden">
          {settingsSections.map((section) => (
            <li key={section.id}>
              <Link
                to={settingsPath(section.id)}
                aria-current={open === section.id ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  current === section.id && 'border-primary text-foreground',
                )}
              >
                {t(section.title)}
              </Link>
            </li>
          ))}
        </ul>
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
        {current === 'alerts' && <AlertsSettings />}
        {current === 'public' && <PublicStatusSettings />}
        {current === 'backup' && <ConfigTransfer onImported={onImported} />}
      </div>
    </section>
  );
}
