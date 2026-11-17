import { ArrowLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@homora/ui/button';
import type { HostConnection } from '@/features/hosts/hosts';
import { t } from '@/i18n';

type Props = {
  connections: HostConnection[];
  onHome?: () => void;
  onRefresh: () => void;
  onListView: () => void;
};

/** Breadcrumb and navigation actions for the full-screen host map. */
export function HostMapHeader({ connections, onHome, onRefresh, onListView }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-sidebar px-4 py-1.5 text-sidebar-foreground">
      <BrandMark compact className="text-base" />
      <nav aria-label={t('map.title')} className="flex items-center gap-1.5 text-sm">
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        {onHome ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 text-muted-foreground"
            onClick={onHome}
          >
            {t('map.breadcrumbHome')}
          </Button>
        ) : (
          <span className="px-2 text-muted-foreground">{t('map.breadcrumbHome')}</span>
        )}
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 aria-current="page" className="font-semibold">
          {t('map.title')}
        </h2>
      </nav>
      <span className="mr-auto" />
      {connections.length > 0 && (
        <span className="hidden truncate text-xs text-muted-foreground md:inline">
          {t('map.cluster', { name: connections.map((connection) => connection.name).join(', ') })}
        </span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
        <RefreshCw data-icon="inline-start" />
        {t('map.refresh')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onListView}>
        <ArrowLeft data-icon="inline-start" />
        {t('map.hostList')}
      </Button>
    </header>
  );
}
