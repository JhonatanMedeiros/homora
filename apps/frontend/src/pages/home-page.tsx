import type { Service } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { PageWidgets } from '@/components/page-widgets';
import { WidgetStatusFilterContext } from '@/components/widget-host';
import { ServiceDrawer } from '@/components/service-drawer';
import { ServicesEmpty } from '@/components/services-empty';
import { SectionSkeleton } from '@/components/skeletons';
import { StaleStatusAlert } from '@/components/stale-status-alert';
import { PinnedRow } from '@/features/dashboard/pinned-row';
import type { BrowseState } from '@/features/dashboard/use-browse-state';
import { useViewPreferences } from '@/features/dashboard/use-view-preferences';
import { defaultSelection, detailsFor } from '@/features/home/details-props';
import { HealthPill } from '@/features/home/health-pill';
import { HomeSidebar } from '@/features/home/home-sidebar';
import { ServicePanel } from '@/features/home/service-panel';
import {
  AvailabilityCard,
  LatencyCard,
  NothingToDo,
  SlowList,
  StateStrip,
  SummaryCard,
  UpcomingMaintenance,
} from '@/features/home/summary-cards';
import { LoadErrorAlert } from '@/components/load-error-alert';
import { useDetailsSelection } from '@/features/home/use-details-selection';
import { useHomeArea } from '@/features/home/use-home-area';
import { averageUptime, HealthFigures } from '@/features/uptime/health-figures';
import { ProbableCauses } from '@/features/uptime/probable-causes';
import { useMinWidth } from '@/hooks/use-min-width';
import { useIsMobile } from '@/hooks/use-mobile';
import type { useServices } from '@/hooks/use-services';
import { t } from '@/i18n';

type Props = {
  data: ReturnType<typeof useServices>;
  browse: BrowseState;
  navigate: (path: string, replace?: boolean) => void;
  onEditService: (id: number, section?: 'access') => void;
};

/**
 * The Home: pinned services one click away, what needs attention, and the health of everything in
 * numbers. The cards themselves live in the Services view.
 */
export function HomePage({ data, browse, navigate, onEditService }: Props) {
  const { services, statuses, blockedIds, pages, groupRows, activePageId } = data;
  const { uptimeRange, setUptimeRange, setArrange } = useViewPreferences();
  const { sources, hostData, model, health, actions, categories } = useHomeArea(
    data,
    browse,
    uptimeRange,
  );
  const mobile = useIsMobile();
  const wide = useMinWidth(1280) && !mobile && services.length > 0;
  const selection = useDetailsSelection(wide);
  const { overview, clock } = sources;
  const selected = services.find((service) => service.id === selection.selectedId) ?? null;
  const sheetService = services.find((service) => service.id === selection.sheetId) ?? null;
  const toServices = () => navigate('/services');
  const toProbes = () => navigate('/manage/probes');
  const openEntry = (id: number) => {
    if (health.probeIds.has(id)) toProbes();
    else selection.open(id);
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
  const panelService = selected ?? defaultSelection(services, health.isDown, health.quietNow);
  const pinned = services
    .filter((service) => service.pinned)
    .sort((a, b) => (a.pinnedPosition ?? Infinity) - (b.pinnedPosition ?? Infinity));
  const { downNow, entries, summary, quietNow } = health;
  const ready = data.loaded && !data.loadError;
  const empty = ready && entries.length === 0;

  const body = (
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
      {ready && !empty && (
        <>
          <PinnedRow
            services={pinned}
            statuses={statuses}
            blockedIds={blockedIds}
            onDetails={(service) => selection.open(service.id)}
          />
          {summary.measurement ? (
            <SummaryCard title={t('homeview.attention')}>
              <div className="flex flex-col items-start gap-1 text-sm">
                <p className="font-medium">{summary.title}</p>
                <p className="text-muted-foreground">{summary.subtitle}</p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => navigate('/manage/integrations')}
                >
                  {t('banner.measurement.action')}
                </Button>
              </div>
            </SummaryCard>
          ) : downNow.length > 0 ? (
            <>
              <ProbableCauses
                alwaysOpen
                down={downNow.filter((service) => !quietNow(service.id))}
                quiet={downNow.filter((service) => quietNow(service.id))}
                incidents={overview?.open}
                impacts={model.impacts}
                onOpen={(service) => openEntry(service.id)}
                onAcknowledge={(members, minutes) => void actions.acknowledge(members, minutes)}
                onShowAgain={(members) =>
                  void sources.attention.clear(members.map((member) => member.id))
                }
              />
              {summary.slow.length > 0 && (
                <SummaryCard title={t('homeview.attention.slow')}>
                  <SlowList lines={summary.slow} />
                </SummaryCard>
              )}
            </>
          ) : (
            <SummaryCard title={t('homeview.attention')}>
              {summary.slow.length === 0 ? (
                <NothingToDo certain={!data.statusError && summary.unknown === 0} />
              ) : (
                <>
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t('homeview.attention.slow')}
                  </h3>
                  <SlowList lines={summary.slow} />
                </>
              )}
            </SummaryCard>
          )}
          <section aria-label={t('homeview.figures')}>
            <HealthFigures
              average={averageUptime(entries, sources.uptime)}
              monitored={entries.length - summary.blocked}
              range={uptimeRange}
              overview={overview}
              certs={summary.certs}
            />
          </section>
          <StateStrip
            counts={health.countsWithProbes}
            onSelect={(filter) => {
              browse.setStatusFilter(filter);
              setArrange('group');
              toServices();
            }}
          />
          <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
            <AvailabilityCard sla={overview?.sla} />
            <LatencyCard
              entries={entries}
              statuses={statuses}
              settings={overview?.settings}
              onSelect={openEntry}
            />
          </div>
          <UpcomingMaintenance
            windows={sources.maintenance.windows}
            now={clock}
            nameOf={(id) =>
              entries.find((entry) => entry.id === id)?.name ?? t('maintview.unknownService')
            }
            onAll={() => navigate('/maintenance')}
          />
        </>
      )}
      {ready && (
        <WidgetStatusFilterContext.Provider
          value={(filter) => {
            browse.setStatusFilter(filter);
            toServices();
          }}
        >
          <PageWidgets
            pageId={activePageId}
            showAdd={!mobile}
            pages={pages}
            groups={groupRows.map((group) => ({ name: group.name, pageId: group.pageId ?? null }))}
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
  if (!wide) return body;
  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)_19rem] gap-6">
      <HomeSidebar
        data={data}
        hostData={hostData}
        health={health}
        browse={browse}
        categories={categories}
        onShowHosts={() => {
          setArrange('host');
          toServices();
        }}
        onProbes={toProbes}
        onChosen={() => {
          setArrange('group');
          toServices();
        }}
      />
      {body}
      <div className="min-w-0">
        <ServicePanel
          windows={summary.windows}
          details={panelService ? details(panelService) : null}
          onSelect={openEntry}
          onReviewProposals={() => navigate('/manage/agents')}
        />
      </div>
    </div>
  );
}
