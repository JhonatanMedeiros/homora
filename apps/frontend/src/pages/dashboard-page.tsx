import { lazy, Suspense, useState, type ReactNode } from 'react';
import { AlertsBell } from '@/components/alerts-bell';
import { useBrowseState } from '@/features/dashboard/use-browse-state';
import { useLocation, useNavigate } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { PageTabs } from '@/components/page-tabs';
import { CommandPalette } from '@/components/command-palette';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { SafeModeBanner } from '@/components/safe-mode-banner';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { useShortcutsPreference } from '@/hooks/use-shortcuts-preference';
import { useAppearance } from '@/hooks/use-appearance';
import { useCustomCss } from '@/hooks/use-custom-css';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useViewPreferences } from '@/features/dashboard/use-view-preferences';
import { navPath, type NavId, type Tab } from '@/components/app-nav';
import { t } from '@/i18n';
import { Button } from '@homora/ui/button';
import { settingsPath } from '@/features/settings/sections';
import { useServices } from '@/hooks/use-services';
import { ServicesPage, type FocusRequest } from '@/pages/services-page';
import { HomePage } from '@/pages/home-page';
import { MaintenancePage } from '@/pages/maintenance-page';
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
const ProbesPage = lazy(() =>
  import('@/pages/probes-page').then((module) => ({ default: module.ProbesPage })),
);
const ActivityPage = lazy(() =>
  import('@/pages/activity-page').then((module) => ({ default: module.ActivityPage })),
);
const IntegrationsPage = lazy(() =>
  import('@/pages/integrations-page').then((module) => ({ default: module.IntegrationsPage })),
);

export function DashboardPage({
  onLogout,
  tab,
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
  form?: 'new' | number | null;
  valid?: boolean;
  detail?: number | null;
}) {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const navigate = (path: string, replace = false) => routerNavigate(path, { replace });
  const data = useServices();
  const browse = useBrowseState(data.activePageId);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const { toggleTheme } = useTheme();
  const { profile, failed: profileFailed, setProfile } = useProfile();
  const viewPrefs = useViewPreferences();
  // Fetches the instance appearance and applies it to the page.
  useAppearance();
  // Adds the custom stylesheet unless this tab is in safe mode (?safe=1).
  useCustomCss();

  const mapView = tab === 'services' && detail === null && viewPrefs.arrange === 'map';
  const active: NavId = mapView ? 'map' : tab;
  /** The pages apply to the Summary and to the Services view. */
  const paged = valid && detail === null && (tab === 'home' || tab === 'services');

  const go = (id: NavId) => {
    // The map is an arrangement of Services: choosing it, or leaving it, changes that preference.
    if (id === 'map') viewPrefs.setArrange('map');
    else if (id === 'services' && viewPrefs.arrange === 'map') viewPrefs.setArrange('group');
    navigate(navPath(id));
  };
  const addService = () => navigate('/manage/services/new');

  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsEnabled] = useShortcutsPreference();
  useShortcuts({
    enabled: shortcutsEnabled,
    // Where services are shown; the form is a dialog and blocks the keys itself.
    canCreateService: valid && (tab === 'home' || tab === 'services'),
    onTogglePalette: () => setPaletteOpen((open) => !open),
    onOpenPalette: () => setPaletteOpen(true),
    onOpenHelp: () => setHelpOpen(true),
    onGo: go,
    onNewService: addService,
    onShowProblems: () => {
      browse.setStatusFilter('down');
      if (viewPrefs.arrange !== 'group') viewPrefs.setArrange('group');
      navigate('/services');
    },
    onGoPage: (index) => {
      const page = data.pages[index];
      if (!paged || !page) return false;
      data.selectPage(page.id);
      return true;
    },
  });

  const section = (page: ReactNode) => (
    <Suspense fallback={<SectionSkeleton label={t('common.loading')} />}>{page}</Suspense>
  );

  return (
    <AppShell
      tab={tab}
      active={active}
      detail={detail !== null}
      title={
        !valid || detail !== null
          ? undefined
          : tab === 'home'
            ? t('home.title')
            : tab === 'services'
              ? t('nav.services')
              : undefined
      }
      onNavigate={go}
      onNewService={addService}
      onLogout={onLogout}
      onOpenPalette={() => setPaletteOpen(true)}
      profile={profile}
      pagesNav={
        paged && data.pages.length > 0 ? (
          <PageTabs
            pages={data.pages}
            activeId={data.activePageId}
            onSelect={(id) => {
              data.selectPage(id);
              if (viewPrefs.arrange !== 'group') viewPrefs.setArrange('group');
            }}
            counts={(pageId) => {
              const onThis = data.services.filter((s) => data.pageIdOf(s.category) === pageId);
              const down = onThis.filter(
                (s) => data.statuses[s.id]?.status === 'unavailable' && !data.blockedIds.has(s.id),
              ).length;
              return { total: onThis.length, down };
            }}
            onChanged={() => data.refresh()}
          />
        ) : undefined
      }
      alerts={
        <AlertsBell
          onService={(id, probe) => routerNavigate(probe ? '/manage/probes' : `/services/${id}`)}
          onProposals={() => go('agents')}
        />
      }
    >
      <SafeModeBanner
        onEdit={() => {
          routerNavigate(settingsPath('appearance'), { state: { advanced: true } });
          window.setTimeout(
            () => document.querySelector('#ui-css')?.scrollIntoView({ behavior: 'smooth' }),
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
        onShowMap={() => go('map')}
        onAddService={addService}
        onToggleTheme={toggleTheme}
        onNavigate={navigate}
        pageName={(service) =>
          data.pages.length > 1
            ? data.pages.find((page) => page.id === data.pageIdOf(service.category))?.name
            : undefined
        }
        onGoToCard={(service) => {
          // The card only exists in the Services view, arranged by group.
          if (viewPrefs.arrange !== 'group') viewPrefs.setArrange('group');
          if (tab !== 'services' || detail !== null) navigate('/services');
          data.selectPage(data.pageIdOf(service.category));
          setFocusRequest((previous) => ({ id: service.id, nonce: (previous?.nonce ?? 0) + 1 }));
        }}
        view={viewPrefs.view}
        onViewChange={viewPrefs.setView}
        showDescriptions={viewPrefs.showDescriptions}
        onShowDescriptionsChange={viewPrefs.setShowDescriptions}
      />
      {valid ? (
        detail !== null ? (
          <ServiceDetailPage
            key={detail}
            id={detail}
            services={data.services}
            loaded={data.loaded}
            statuses={data.statuses}
            blockedIds={data.blockedIds}
            navigate={navigate}
          />
        ) : tab === 'home' ? (
          <HomePage
            data={data}
            browse={browse}
            navigate={navigate}
            onEditService={(id, formSection) =>
              routerNavigate(`/manage/services/${id}/edit`, { state: { section: formSection } })
            }
          />
        ) : tab === 'maintenance' ? (
          <MaintenancePage data={data} browse={browse} navigate={navigate} />
        ) : tab === 'services' ? (
          <ServicesPage
            data={data}
            browse={browse}
            focusRequest={focusRequest}
            onFocusHandled={() => setFocusRequest(null)}
            formRoute={form}
            formSection={location.state?.section === 'access' ? 'access' : undefined}
            navigate={navigate}
            onAddService={addService}
          />
        ) : tab === 'integrations' ? (
          section(<IntegrationsPage onImported={data.refresh} />)
        ) : tab === 'probes' ? (
          section(<ProbesPage />)
        ) : tab === 'activity' ? (
          section(<ActivityPage />)
        ) : tab === 'account' ? (
          section(
            <AccountPage profile={profile} failed={profileFailed} onProfileChange={setProfile} />,
          )
        ) : tab === 'settings' ? (
          section(<SettingsPage onImported={data.refresh} />)
        ) : (
          section(
            <Agents
              services={data.services}
              onApplied={data.refresh}
              token={token}
              setToken={setToken}
              onSetupConnection={(draft) =>
                routerNavigate('/manage/integrations', { state: { connectionDraft: draft } })
              }
            />,
          )
        )
      ) : (
        <section>
          <h1 className="text-3xl">{t('route.notFound')}</h1>
          <Button className="mt-4" onClick={() => navigate('/')}>
            {t('route.home')}
          </Button>
        </section>
      )}
    </AppShell>
  );
}
