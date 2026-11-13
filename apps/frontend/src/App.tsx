import { Fragment, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  matchPath,
  matchRoutes,
} from 'react-router';
import { AppShell } from '@/components/app-shell';
import { CommandPalette } from '@/components/command-palette';
import { ShortcutsDialog } from '@/components/shortcuts-dialog';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { useShortcutsPreference } from '@/hooks/use-shortcuts-preference';
import { SafeModeBanner } from '@/components/safe-mode-banner';
import { useAppearance } from '@/hooks/use-appearance';
import { useCustomCss } from '@/hooks/use-custom-css';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { tabPath, type Tab } from '@/components/app-nav';
import { t, useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { SettingsPage } from '@/pages/settings-page';
import { isSettingsSection, settingsPath, settingsSections } from '@/features/settings/sections';
import { useAuth } from '@/hooks/use-auth';
import { useServices } from '@/hooks/use-services';
import { Agents } from '@/features/agents/agents';
import { Toaster } from '@/components/ui/sonner';
import { AuthPage } from '@/pages/auth-page';
import { AccountPage } from '@/pages/account-page';
import { ActivityPage } from '@/pages/activity-page';
import { IntegrationsPage } from '@/pages/integrations-page';
import { ServicesPage, type FocusRequest } from '@/pages/services-page';
import { StatusPage } from '@/pages/status-page';
import { ServiceDetailPage } from '@/pages/service-detail-page';

type DashboardRoute = {
  tab: Tab;
  managing: boolean;
  form: 'new' | number | null;
  valid: boolean;
  detail: number | null;
};
const validPaths = [
  '/',
  '/services/:id',
  '/manage',
  '/manage/services',
  '/manage/services/new',
  '/manage/services/:id/edit',
  '/manage/integrations',
  '/manage/agents',
  '/manage/activity',
  '/account',
  '/manage/account',
  '/manage/settings',
  ...settingsSections.map((section) => settingsPath(section.id)),
].map((path) => ({ path }));
function validDestination(path: string) {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('?') &&
    !path.includes('#') &&
    Boolean(matchRoutes(validPaths, path))
  );
}

function Dashboard({
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
      {managing && tab === 'integrations' && <IntegrationsPage onImported={data.refresh} />}
      {managing && tab === 'activity' && <ActivityPage />}
      {tab === 'account' && (
        <AccountPage profile={profile} failed={profileFailed} onProfileChange={setProfile} />
      )}
      {managing && tab === 'settings' && <SettingsPage onImported={data.refresh} />}
      {managing && tab === 'agents' && (
        <Agents
          services={data.services}
          onApplied={data.refresh}
          token={token}
          setToken={setToken}
          onSetupConnection={(draft) =>
            routerNavigate('/manage/integrations', { state: { connectionDraft: draft } })
          }
        />
      )}
      {/* Above the fixed mobile bar of organize mode. */}
      <Toaster position="bottom-center" mobileOffset={{ bottom: 136 }} />
    </AppShell>
  );
}

function DashboardForRoute({
  onLogout,
  token,
  setToken,
}: {
  onLogout: () => void;
  token: string;
  setToken: (token: string) => void;
}) {
  const { pathname } = useLocation();
  if (matchPath('/manage', pathname)) return <Navigate replace to="/manage/services" />;
  // The account used to be a management tab; keep old links working.
  if (matchPath('/manage/account', pathname)) return <Navigate replace to="/account" />;
  // Settings pages that moved: Docker discovery now lives under Integrations; alerts are one page.
  if (matchPath('/manage/settings/discovery', pathname))
    return <Navigate replace to="/manage/integrations" />;
  if (
    matchPath('/manage/settings/:old', pathname)?.params.old?.match(/^(notifications|monitoring)$/)
  )
    return <Navigate replace to={settingsPath('alerts')} />;
  const home = Boolean(matchPath('/', pathname));
  const isList = Boolean(matchPath('/manage/services', pathname));
  const isNew = Boolean(matchPath('/manage/services/new', pathname));
  const id = matchPath('/manage/services/:id/edit', pathname)?.params.id;
  const number = Number(id);
  const isEdit = Boolean(id && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(number));
  const tab: Tab = matchPath('/manage/integrations', pathname)
    ? 'integrations'
    : matchPath('/manage/agents', pathname)
      ? 'agents'
      : matchPath('/manage/activity', pathname)
        ? 'activity'
        : matchPath('/account', pathname)
          ? 'account'
          : matchPath({ path: '/manage/settings', end: false }, pathname)
            ? 'settings'
            : 'services';
  const settingsSection = matchPath('/manage/settings/:section', pathname)?.params.section;
  const unknownSettings =
    Boolean(matchPath('/manage/settings/*', pathname)) &&
    !matchPath('/manage/settings', pathname) &&
    !isSettingsSection(settingsSection);
  const detailId = matchPath('/services/:id', pathname)?.params.id;
  const detail =
    detailId && /^[1-9]\d*$/.test(detailId) && Number.isSafeInteger(Number(detailId))
      ? Number(detailId)
      : null;
  const valid =
    home ||
    detail !== null ||
    isList ||
    isNew ||
    isEdit ||
    (tab !== 'services' && !unknownSettings);
  const account = tab === 'account';
  return (
    <Dashboard
      token={token}
      setToken={setToken}
      onLogout={onLogout}
      tab={tab}
      managing={valid && !home && !account && detail === null}
      valid={valid}
      form={isNew ? 'new' : isEdit ? number : null}
      detail={detail}
    />
  );
}

function AppRoutes() {
  const { status, error, submit, logout, retry } = useAuth();
  const [token, setToken] = useState('');
  useEffect(() => {
    if (!token) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [token]);
  const { locale } = useI18n();
  const location = useLocation();
  const onLogout = () => {
    if (token && !window.confirm(t('token.leaveWarning'))) return;
    setToken('');
    void logout();
  };
  if (!status) return <AuthPage status={status} error={error} onSubmit={submit} onRetry={retry} />;
  if (!status.authenticated) {
    if (location.pathname !== '/login')
      return (
        <Navigate
          replace
          to={`/login?returnTo=${encodeURIComponent(validDestination(location.pathname) ? location.pathname : '/')}`}
        />
      );
    return <AuthPage status={status} error={error} onSubmit={submit} onRetry={retry} />;
  }
  if (location.pathname === '/login') {
    const destination = new URLSearchParams(location.search).get('returnTo') ?? '/';
    return <Navigate replace to={validDestination(destination) ? destination : '/'} />;
  }
  return (
    <Fragment key={locale}>
      <Routes>
        <Route
          path="*"
          element={<DashboardForRoute onLogout={onLogout} token={token} setToken={setToken} />}
        />
      </Routes>
    </Fragment>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Anonymous and outside the authenticated shell: AppRoutes (and its auth calls) never mount here. */}
        <Route path="/status" element={<StatusPage />} />
        <Route path="*" element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
