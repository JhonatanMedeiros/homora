import { lazy, Suspense, useState } from 'react';
import { AlertsBell } from '@/components/alerts-bell';
import { requestProblemsView } from '@/lib/home-intent';
import { useNavigate } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { CommandPalette } from '@/components/command-palette';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { SafeModeBanner } from '@/components/safe-mode-banner';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { useShortcutsPreference } from '@/hooks/use-shortcuts-preference';
import { useAppearance } from '@/hooks/use-appearance';
import { useCustomCss } from '@/hooks/use-custom-css';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { tabPath, type Tab } from '@/components/app-nav';
import { t } from '@/i18n';
import { Button } from '@/components/ui/button';
import { settingsPath } from '@/features/settings/sections';
import { useServices } from '@/hooks/use-services';
import { ServicesPage, type FocusRequest } from '@/pages/services-page';
import { ServiceDetailPage } from '@/pages/service-detail-page';
import { SectionSkeleton } from '@/components/skeletons';

const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })),
);
const Agents = lazy(() =>
  import('@/features/agents/agents').then((module) => ({ default: module.Agents })),
);
const AccountPage = lazy(() =>
  import('@/pages/account-page').then((module) => ({ default: module.AccountPage })),
);
const ActivityPage = lazy(() =>
  import('@/pages/activity-page').then((module) => ({ default: module.ActivityPage })),
);
const IntegrationsPage = lazy(() =>
  import('@/pages/integrations-page').then((module) => ({ default: module.IntegrationsPage })),
);

type DashboardRoute = {
  tab: Tab;
  managing: boolean;
  form: 'new' | number | null;
  valid: boolean;
  detail: number | null;
};

export function DashboardPage({
  onLogout,
  tab,
  managing,
  form = null,
  valid = true,
  detail = null,
  token,
  setToken,
}: {
  onLogout: () => void;
  token: string;
  setToken: (token: string) => void;
  tab: Tab;
  managing: boolean;
  form?: 'new' | number | null;
  valid?: boolean;
  detail?: number | null;
}) {
  const routerNavigate = useNavigate();
  const navigate = (path: string, replace = false) => routerNavigate(path, { replace });
  const route: DashboardRoute = { tab, managing, form, valid, detail };
  const data = useServices();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const { toggleTheme } = useTheme();
  const { profile, failed: profileFailed, setProfile } = useProfile();
  const viewPrefs = useViewPreferences();
  // Fetches the instance appearance and applies it to the page.
  useAppearance();
  // Adds the custom stylesheet unless this tab is in safe mode (?safe=1).
  useCustomCss();

  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsEnabled] = useShortcutsPreference();
  useShortcuts({
    enabled: shortcutsEnabled,
    // The services pages (home and manage list); the form is a dialog and blocks the keys itself.
    canCreateService: tab === 'services' && route.valid,
    onTogglePalette: () => setPaletteOpen((open) => !open),
    onOpenPalette: () => setPaletteOpen(true),
    onOpenHelp: () => setHelpOpen(true),
    onGo: (target) => navigate(target === 'services' ? '/' : tabPath(target)),
    onNewService: () => navigate('/manage/services/new'),
    onShowProblems: () => {
      requestProblemsView();
      navigate('/');
    },
    // Pages are the tabs of the dashboard only: not in manage mode, not on other sections.
    onGoPage: (index) => {
      const page = data.pages[index];
      if (tab !== 'services' || managing || !page) return false;
      data.selectPage(page.id);
      return true;
    },
  });

  return (
    <AppShell
      tab={tab}
      managing={managing}
      onManageChange={(value) => {
        navigate(value ? '/manage/services' : '/');
      }}
      onTabChange={(next) => {
        navigate(tabPath(next));
      }}
      onLogout={onLogout}
      onOpenPalette={() => setPaletteOpen(true)}
      profile={profile}
      alerts={
        <AlertsBell
          services={data.services}
          statuses={data.statuses}
          blockedIds={data.blockedIds}
          onOpen={() => navigate(tabPath('activity'))}
        />
      }
    >
      <SafeModeBanner
        onEdit={() => {
          routerNavigate(settingsPath('appearance'), { state: { advanced: true } });
          window.setTimeout(
            () => document.getElementById('ui-css')?.scrollIntoView({ behavior: 'smooth' }),
            150,
          );
        }}
      />
      <ShortcutsDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        singleKeysEnabled={shortcutsEnabled}
      />
      <CommandPalette
        shortcutsEnabled={shortcutsEnabled}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        services={data.services}
        statuses={data.statuses}
        blockedIds={data.blockedIds}
        managing={managing}
        onManageChange={(value) => {
          navigate(value ? '/manage/services' : '/');
        }}
        onAddService={() => {
          navigate('/manage/services/new');
        }}
        onToggleTheme={toggleTheme}
        onNavigate={navigate}
        pageName={(service) =>
          data.pages.length > 1
            ? data.pages.find((page) => page.id === data.pageIdOf(service.category))?.name
            : undefined
        }
        onGoToCard={(service) => {
          // The card only exists on the dashboard.
          if (managing || tab !== 'services') navigate('/');
          data.selectPage(data.pageIdOf(service.category));
          setFocusRequest((previous) => ({ id: service.id, nonce: (previous?.nonce ?? 0) + 1 }));
        }}
        view={viewPrefs.view}
        onViewChange={viewPrefs.setView}
        showDescriptions={viewPrefs.showDescriptions}
        onShowDescriptionsChange={viewPrefs.setShowDescriptions}
      />
      {!route.valid ? (
        <section>
          <h1 className="text-3xl">{t('route.notFound')}</h1>
          <Button className="mt-4" onClick={() => navigate('/')}>
            {t('route.home')}
          </Button>
        </section>
      ) : (
        tab === 'services' &&
        (detail !== null ? (
          <ServiceDetailPage
            key={detail}
            id={detail}
            services={data.services}
            loaded={data.loaded}
            statuses={data.statuses}
            blockedIds={data.blockedIds}
            navigate={navigate}
          />
        ) : (
          <ServicesPage
            key={String(managing)}
            data={data}
            focusRequest={focusRequest}
            onFocusHandled={() => setFocusRequest(null)}
            managing={managing}
            formRoute={route.form}
            navigate={navigate}
            onAddService={() => {
              navigate('/manage/services/new');
            }}
          />
        ))
      )}
      {managing && tab === 'integrations' && (
        <Suspense fallback={<SectionSkeleton label={t('common.loading')} />}>
          <IntegrationsPage onImported={data.refresh} />
        </Suspense>
      )}
      {managing && tab === 'activity' && (
        <Suspense fallback={<SectionSkeleton label={t('common.loading')} />}>
          <ActivityPage />
        </Suspense>
      )}
      {tab === 'account' && (
        <Suspense fallback={<SectionSkeleton label={t('common.loading')} />}>
          <AccountPage profile={profile} failed={profileFailed} onProfileChange={setProfile} />
        </Suspense>
      )}
      {managing && tab === 'settings' && (
        <Suspense fallback={<SectionSkeleton label={t('common.loading')} />}>
          <SettingsPage onImported={data.refresh} />
        </Suspense>
      )}
      {managing && tab === 'agents' && (
        <Suspense fallback={<SectionSkeleton label={t('common.loading')} />}>
          <Agents
            services={data.services}
            onApplied={data.refresh}
            token={token}
            setToken={setToken}
            onSetupConnection={(draft) =>
              routerNavigate('/manage/integrations', { state: { connectionDraft: draft } })
            }
          />
        </Suspense>
      )}
    </AppShell>
  );
}
