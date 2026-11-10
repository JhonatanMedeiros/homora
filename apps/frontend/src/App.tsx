import { Fragment, useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SearchField } from '@/components/search-field';
import type { Tab } from '@/components/app-nav';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/i18n';
import { useServices } from '@/hooks/use-services';
import { Agents } from '@/features/agents/agents';
import { AuthPage } from '@/pages/auth-page';
import { IntegrationsPage } from '@/pages/integrations-page';
import { ServicesPage } from '@/pages/services-page';

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('services');
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
      onTabChange={setTab}
      onLogout={onLogout}
      toolbar={
        <SearchField
          ref={search}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTab('services');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openFirst.current?.();
            if (e.key === 'Escape') setQuery('');
          }}
        />
      }
    >
      {tab === 'services' && <ServicesPage query={query} data={data} openFirstRef={openFirst} />}
      {tab === 'integrations' && <IntegrationsPage />}
      {tab === 'agents' && <Agents services={data.services} onApplied={data.refresh} />}
    </AppShell>
  );
}

export function App() {
  const { status, error, submit, logout } = useAuth();
  // Trocar de idioma remonta a interface; a sessão (useAuth) é preservada.
  const { locale } = useI18n();
  return (
    <Fragment key={locale}>
      {status?.authenticated ? (
        <Dashboard onLogout={() => void logout()} />
      ) : (
        <AuthPage status={status} error={error} onSubmit={submit} />
      )}
    </Fragment>
  );
}
