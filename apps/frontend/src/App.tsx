import { Fragment, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  matchRoutes,
} from 'react-router';
import { AppShell } from '@/components/app-shell';
import { SearchField } from '@/components/search-field';
import { QuickResults } from '@/components/quick-results';
import type { Tab } from '@/components/app-nav';
import { lower, t, useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { SettingsPage } from '@/pages/settings-page';
import { useAuth } from '@/hooks/use-auth';
import { useServices } from '@/hooks/use-services';
import { Agents } from '@/features/agents/agents';
import { AuthPage } from '@/pages/auth-page';
import { IntegrationsPage } from '@/pages/integrations-page';
import { ServicesPage } from '@/pages/services-page';

type DashboardRoute = { tab: Tab; managing: boolean; form: 'new' | number | null; valid: boolean };
const validPaths = [
  '/',
  '/manage',
  '/manage/services',
  '/manage/services/new',
  '/manage/services/:id/edit',
  '/manage/integrations',
  '/manage/agents',
  '/manage/settings',
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
}) {
  const routerNavigate = useNavigate();
  const navigate = (path: string, replace = false) => routerNavigate(path, { replace });
  const route: DashboardRoute = { tab, managing, form, valid };
  const [query, setQuery] = useState('');
  const data = useServices();
  const search = useRef<HTMLInputElement>(null);
  const openFirst = useRef<(() => void) | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable);
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  return (
    <AppShell
      tab={tab}
      managing={managing}
      onManageChange={(value) => {
        navigate(value ? '/manage/services' : '/');
      }}
      onTabChange={(next) => {
        navigate(`/manage/${next}`);
      }}
      onLogout={onLogout}
      toolbar={
        <div className="relative">
          <SearchField
            ref={search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const needle = lower(query.trim());
                const first =
                  needle &&
                  data.services.find((service) =>
                    lower(
                      `${service.name} ${service.category} ${service.description} ${service.url}`,
                    ).includes(needle),
                  );
                if (first) window.open(first.url, '_blank', 'noopener,noreferrer');
              }
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'ArrowDown' && query.trim()) {
                e.preventDefault();
                document.querySelector<HTMLAnchorElement>('[data-quick-result]')?.focus();
              }
            }}
          />
          <QuickResults
            query={query}
            services={data.services}
            statuses={data.statuses}
            blockedIds={data.blockedIds}
            onClose={() => {
              setQuery('');
              search.current?.focus();
            }}
          />
        </div>
      }
    >
      {!route.valid ? (
        <section>
          <h1 className="text-3xl">{t('route.notFound')}</h1>
          <Button className="mt-4" onClick={() => navigate('/')}>
            {t('route.home')}
          </Button>
        </section>
      ) : (
        tab === 'services' && (
          <ServicesPage
            key={String(managing)}
            query={query}
            data={data}
            openFirstRef={openFirst}
            managing={managing}
            formRoute={route.form}
            navigate={navigate}
            onManage={() => {
              navigate('/manage/services');
            }}
          />
        )
      )}
      {managing && tab === 'integrations' && <IntegrationsPage />}
      {managing && tab === 'settings' && <SettingsPage onImported={data.refresh} />}
      {managing && tab === 'agents' && (
        <Agents
          services={data.services}
          onApplied={data.refresh}
          token={token}
          setToken={setToken}
        />
      )}
    </AppShell>
  );
}

function EditServiceRoute({
  onLogout,
  token,
  setToken,
}: {
  onLogout: () => void;
  token: string;
  setToken: (token: string) => void;
}) {
  const { id } = useParams();
  const number = Number(id);
  if (!id || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(number))
    return (
      <Dashboard
        token={token}
        setToken={setToken}
        onLogout={onLogout}
        tab="services"
        managing={false}
        valid={false}
      />
    );
  return (
    <Dashboard
      token={token}
      setToken={setToken}
      onLogout={onLogout}
      tab="services"
      managing
      form={number}
    />
  );
}

function AppRoutes() {
  const { status, error, submit, logout } = useAuth();
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
  if (!status) return <AuthPage status={status} error={error} onSubmit={submit} />;
  if (!status.authenticated) {
    if (location.pathname !== '/login')
      return (
        <Navigate
          replace
          to={`/login?returnTo=${encodeURIComponent(validDestination(location.pathname) ? location.pathname : '/')}`}
        />
      );
    return <AuthPage status={status} error={error} onSubmit={submit} />;
  }
  if (location.pathname === '/login') {
    const destination = new URLSearchParams(location.search).get('returnTo') ?? '/';
    return <Navigate replace to={validDestination(destination) ? destination : '/'} />;
  }
  return (
    <Fragment key={locale}>
      <Routes>
        <Route
          path="/"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="services"
              managing={false}
            />
          }
        />
        <Route path="/manage" element={<Navigate replace to="/manage/services" />} />
        <Route
          path="/manage/services"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="services"
              managing
            />
          }
        />
        <Route
          path="/manage/services/new"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="services"
              managing
              form="new"
            />
          }
        />
        <Route
          path="/manage/services/:id/edit"
          element={<EditServiceRoute onLogout={onLogout} token={token} setToken={setToken} />}
        />
        <Route
          path="/manage/integrations"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="integrations"
              managing
            />
          }
        />
        <Route
          path="/manage/agents"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="agents"
              managing
            />
          }
        />
        <Route
          path="/manage/settings"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="settings"
              managing
            />
          }
        />
        <Route
          path="*"
          element={
            <Dashboard
              token={token}
              setToken={setToken}
              onLogout={onLogout}
              tab="services"
              managing={false}
              valid={false}
            />
          }
        />
      </Routes>
    </Fragment>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
