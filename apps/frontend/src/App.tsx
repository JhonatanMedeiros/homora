import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SearchField } from '@/components/search-field';
import { QuickResults } from '@/components/quick-results';
import type { Tab } from '@/components/app-nav';
import { useAuth } from '@/hooks/use-auth';
import { useServices } from '@/hooks/use-services';
import { Agents } from '@/features/agents/agents';
import { AuthPage } from '@/pages/auth-page';
import { IntegrationsPage } from '@/pages/integrations-page';
import { ServicesPage } from '@/pages/services-page';

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('services');
  const [query, setQuery] = useState('');
  const [managing, setManaging] = useState(false);
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
        setManaging(value);
        setTab('services');
        setQuery('');
      }}
      onTabChange={(next) => {
        setTab(next);
      }}
      onLogout={onLogout}
      toolbar={
        <div className="relative">
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
      {tab === 'services' && (
        <ServicesPage
          key={String(managing)}
          query={query}
          data={data}
          openFirstRef={openFirst}
          managing={managing}
          onManage={() => {
            setManaging(true);
          }}
        />
      )}
      {managing && tab === 'integrations' && <IntegrationsPage />}
      {managing && tab === 'agents' && <Agents services={data.services} onApplied={data.refresh} />}
    </AppShell>
  );
}

export function App() {
  const { status, error, submit, logout } = useAuth();
  if (status?.authenticated) return <Dashboard onLogout={() => void logout()} />;
  return <AuthPage status={status} error={error} onSubmit={submit} />;
}
