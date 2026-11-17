import { createContext, useContext, type ReactNode } from 'react';
import { WidgetHostProvider, type WidgetHost as Host } from '@homora/widgets/ui';
import { tOr, useI18n } from '@/i18n';

async function getJson(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error('Monitoring source failed');
  return response.json();
}
async function readSummary(groups: number[], pages: number[], signal: AbortSignal) {
  const query = new URLSearchParams();
  if (groups.length > 0) query.set('groups', groups.join(','));
  if (pages.length > 0) query.set('pages', pages.join(','));
  return getJson(`/api/widget-sources/monitoring/summary?${query}`, signal);
}
async function readScopes(signal: AbortSignal) {
  const [groups, pages] = await Promise.all([
    getJson('/api/groups', signal),
    getJson('/api/pages', signal),
  ]);
  return { groups, pages };
}

type FilterStatus = NonNullable<NonNullable<Host['monitoring']>['filterStatus']>;
export const WidgetStatusFilterContext = createContext<FilterStatus | undefined>(undefined);

export function WidgetHost({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const filterStatus = useContext(WidgetStatusFilterContext);
  return (
    <WidgetHostProvider
      value={{
        locale,
        t: (key, params) => tOr(key, key, params),
        monitoring: {
          readSummary,
          readScopes,
          filterStatus,
        },
      }}
    >
      {children}
    </WidgetHostProvider>
  );
}
