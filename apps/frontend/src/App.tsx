import { Fragment, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  matchPath,
  matchRoutes,
} from 'react-router';
import { t, useI18n } from '@/i18n';
import type { Tab } from '@/components/app-nav';
import { isSettingsSection, settingsPath, settingsSections } from '@/features/settings/sections';
import { useAuth } from '@/hooks/use-auth';
import { AuthPage } from '@/pages/auth-page';
import { StatusPage } from '@/pages/status-page';
import { DashboardPage } from '@/pages/dashboard-page';

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
    <DashboardPage
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
