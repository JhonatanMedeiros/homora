import type { Service } from '@homora/shared';
import { WidgetStatusFilterContext } from '@/components/widget-host';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { ServiceDrawer } from '@/components/service-drawer';
import { ServicesEmpty } from '@/components/services-empty';
import { SectionSkeleton } from '@/components/skeletons';
import { StaleStatusAlert } from '@/components/stale-status-alert';
import type { StatusFilter } from '@/features/dashboard/status-filter-model';
import type { BrowseState } from '@/features/dashboard/use-browse-state';
import { useViewPreferences } from '@/features/dashboard/use-view-preferences';
import { detailsFor } from '@/features/home/details-props';
import { HealthPill } from '@/features/home/health-pill';
import { useDetailsSelection } from '@/features/home/use-details-selection';
import { useHomeArea } from '@/features/home/use-home-area';
import { summaryBlocks } from '@/features/summary/summary-blocks';
import { SummaryBoard } from '@/features/summary/summary-board';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePendingProposals } from '@/hooks/use-pending-proposals';
import type { useServices } from '@/hooks/use-services';
import { t } from '@/i18n';

type Props = {
  data: ReturnType<typeof useServices>;
  browse: BrowseState;
  navigate: (path: string, replace?: boolean) => void;
  onEditService: (id: number, section?: 'access') => void;
};

/**
 * The Home: a grid of widgets, arranged per page. By default it opens with pinned
 * services, what needs attention and the health of everything. The cards live in Services.
 */
export function HomePage({ data, browse, navigate, onEditService }: Props) {
  const { services, pages, groupRows, activePageId } = data;
  const { uptimeRange, setUptimeRange, setArrange } = useViewPreferences();
  const area = useHomeArea(data, browse, uptimeRange);
  const { sources, model, health, actions } = area;
  const mobile = useIsMobile();
  const pending = usePendingProposals('summary', true);
  const selection = useDetailsSelection(false);
  const sheetService = services.find((service) => service.id === selection.sheetId) ?? null;
  const toServices = () => navigate('/services');
  const toProbes = () => navigate('/manage/probes');
  const openEntry = (id: number) => {
    if (health.probeIds.has(id)) toProbes();
    else selection.open(id);
  };
  const showState = (filter: StatusFilter) => {
    browse.setStatusFilter(filter);
    setArrange('group');
    toServices();
  };
  const details = (service: Service) =>
    detailsFor(service, {
      data,
      sources,
      health,
      range: uptimeRange,
      onRangeChange: setUptimeRange,
      onTogglePinned: (item) => void actions.togglePinned(item),
      onShowMap: () => {
        selection.close();
        setArrange('map');
        toServices();
      },
      onAllowMonitoring: (item) => onEditService(item.id, 'access'),
    });
  const ready = data.loaded && !data.loadError;
  const empty = ready && health.entries.length === 0;
  const blocks =
    ready && !empty
      ? summaryBlocks({
          data,
          sources,
          health,
          area,
          range: uptimeRange,
          pending,
          openService: selection.open,
          openEntry,
          navigate,
          showState,
          showHost: (item) => {
            browse.setNodeFilter({ connectionId: item.connectionId, node: item.node });
            setArrange('host');
            toServices();
          },
        })
      : null;

  return (
    <section aria-label={t('nav.summary')} className="flex min-w-0 flex-col gap-4 md:gap-5">
      <HealthPill
        data={data}
        sources={sources}
        health={health}
        impacts={model.impacts}
        range={uptimeRange}
        onService={selection.open}
        onProbes={toProbes}
        onConnections={() => navigate('/manage/integrations')}
        onAcknowledge={(members, minutes) => void actions.acknowledge(members, minutes)}
      />
      <StaleStatusAlert data={data} />
      {data.loadError && (
        <LoadErrorAlert message={data.loadError} onRetry={() => void data.refresh()} />
      )}
      {!data.loaded && !data.loadError && <SectionSkeleton label={t('common.loading')} />}
      {empty && (
        <ServicesEmpty hasServices={false} onAdd={() => navigate('/manage/services/new')} />
      )}
      {ready && (
        <WidgetStatusFilterContext.Provider
          value={(filter) => {
            browse.setStatusFilter(filter);
            toServices();
          }}
        >
          <SummaryBoard
            key={activePageId}
            pageId={activePageId}
            pages={pages}
            groups={groupRows.map((group) => ({ name: group.name, pageId: group.pageId ?? null }))}
            phone={mobile}
            blocks={blocks}
            openMonitor={(id, hasService) => (hasService ? selection.open(id) : toProbes())}
          />
        </WidgetStatusFilterContext.Provider>
      )}
      <ServiceDrawer
        {...(sheetService
          ? details(sheetService)
          : { blocked: false, range: uptimeRange, onRangeChange: setUptimeRange })}
        service={sheetService}
        onClose={selection.close}
      />
    </section>
  );
}
