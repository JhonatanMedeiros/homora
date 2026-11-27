import { useTheme } from '@/hooks/use-theme';
import { isServiceAlias } from '@homora/shared';
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
import { AuthLoading } from '@/features/auth/auth-loading';
import { StatusPage } from '@/pages/status-page';
import { Toaster } from '@homora/ui/sonner';
import { DashboardPage } from '@/pages/dashboard-page';

const validPaths = [
  '/',
  '/services/:id',
  '/manage',
  '/manage/services/new',
  '/manage/services/:id/edit',
  '/manage/probes',
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
    !/[\\%]/.test(path) &&
    (Boolean(matchRoutes(validPaths, path)) ||
      (path.startsWith('/go/') && isServiceAlias(path.slice(4))))
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
  // Services and groups are managed on the Home (Organize); the old list is gone.
  if (matchPath('/manage', pathname)) return <Navigate replace to="/manage/integrations" />;
  if (matchPath('/manage/services', pathname)) return <Navigate replace to="/" />;
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
  const isNew = Boolean(matchPath('/manage/services/new', pathname));
  const id = matchPath('/manage/services/:id/edit', pathname)?.params.id;
  const number = Number(id);
  const isEdit = Boolean(id && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(number));
  const tab: Tab = matchPath('/manage/integrations', pathname)
    ? 'integrations'
    : matchPath('/manage/probes', pathname)
      ? 'probes'
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
    home || detail !== null || isNew || isEdit || (tab !== 'services' && !unknownSettings);
  const account = tab === 'account';
  return (
    <DashboardPage
      token={token}
      setToken={setToken}
      onLogout={onLogout}
      tab={tab}
      managing={valid && !home && !account && detail === null && tab !== 'services'}
      valid={valid}
      form={isNew ? 'new' : isEdit ? number : null}
      detail={detail}
    />
  );
}

function GoAlias() {
  const { pathname } = useLocation();
  const alias = pathname.startsWith('/go/') ? pathname.slice(4) : '';
  const [state, setState] = useState<'loading' | 'missing' | 'error'>('loading');
  useEffect(() => {
    if (!isServiceAlias(alias)) return;
    const controller = new AbortController();
    void fetch(`/api/go/${alias}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
          return;
        }
        if (response.status === 404) {
          setState('missing');
          return;
        }
        if (!response.ok) throw new Error();
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string')
          throw new Error();
        const url = new URL(body.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw new Error();
        if (!controller.signal.aborted) window.location.assign(url.href);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [alias, pathname]);
  return (
    <main role="status">
      {t(
        !isServiceAlias(alias) || state === 'missing'
          ? 'alias.notFound'
          : state === 'error'
            ? 'alias.error'
            : 'alias.loading',
      )}
    </main>
  );
}

function AppRoutes() {
  const {
    status,
    error,
    expired,
    challenge,
    submit,
    submitPasskey,
    submitOidc,
    verifyTwoFactor,
    cancelChallenge,
    logout,
    retry,
  } = useAuth();
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
  const authPage = (
    <AuthPage
      status={status}
      error={error}
      notice={expired ? t('auth.sessionExpired') : undefined}
      challenge={challenge}
      onSubmit={submit}
      onPasskey={submitPasskey}
      onOidc={submitOidc}
      onVerify={verifyTwoFactor}
      onCancelChallenge={cancelChallenge}
      onRetry={retry}
    />
  );
  // The sign-in page only appears once the server answered, or failed and needs a retry.
  if (!status) return error ? authPage : <AuthLoading />;
  if (!status.authenticated) {
    if (location.pathname !== '/login')
      return (
        <Navigate
          replace
          to={`/login?returnTo=${encodeURIComponent(validDestination(location.pathname) ? location.pathname : '/')}`}
        />
      );
    return authPage;
  }
  if (location.pathname === '/login') {
    const destination = new URLSearchParams(location.search).get('returnTo') ?? '/';
    return <Navigate replace to={validDestination(destination) ? destination : '/'} />;
  }
  return (
    <Fragment key={locale}>
      <Routes>
        <Route path="/go/*" element={<GoAlias />} />
        <Route
          path="*"
          element={<DashboardForRoute onLogout={onLogout} token={token} setToken={setToken} />}
        />
      </Routes>
    </Fragment>
  );
}

export function App() {
  const { theme } = useTheme();
  return (
    <BrowserRouter>
      <Toaster theme={theme} position="bottom-center" mobileOffset={{ bottom: 136 }} />
      <Routes>
        {/* Anonymous and outside the authenticated shell: AppRoutes (and its auth calls) never mount here. */}
        <Route path="/status" element={<StatusPage />} />
        <Route path="*" element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
