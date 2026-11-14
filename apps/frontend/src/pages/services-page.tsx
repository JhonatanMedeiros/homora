import { PageWidgets } from '@/components/page-widgets';
import { toast } from 'sonner';
import { useAcknowledgements } from '@/hooks/use-acknowledgements';
import { isQuiet } from '@/lib/acknowledgements';
import { onProblemsRequest, takeProblemsRequest } from '@/lib/home-intent';
import { lazy, Suspense, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Service } from '@homora/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/hooks/use-dependencies';
import { dependentsOf } from '@/lib/dependencies';
import { hostLabel } from '@/lib/hosts';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useUptime } from '@/hooks/use-uptime';
import { PageTabs } from '@/components/page-tabs';
import { CategoryFilter } from '@/components/category-filter';
import { StatusFilter } from '@/components/status-filter';
import { StatusBanner } from '@/components/status-banner';
import { setHomeSearch, useHomeSearch } from '@/lib/home-search';
import { PageTabMenu } from '@/components/page-tab-menu';
import { PinnedRow } from '@/components/pinned-row';
import { HomeRail } from '@/components/home-rail';
import { useProbeList } from '@/hooks/use-probes';
import { describeStatus } from '@/lib/status-text';
import { useMinWidth } from '@/hooks/use-min-width';
import { ServiceDrawer } from '@/components/service-drawer';
import { ProbableCauses } from '@/components/probable-causes';
import { ServiceOptionsSheet } from '@/components/service-options-sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTags } from '@/hooks/use-tags';
import { useStatusOverview } from '@/hooks/use-status-overview';
import { activeWindows, useMaintenance } from '@/hooks/use-maintenance';
import { useNow } from '@/hooks/use-now';
import type { StatusFilter as StatusFilterValue } from '@/lib/status-filter';
import { FormError } from '@/components/form-error';
import { useTopBar } from '@/hooks/use-top-bar';
import { ServicesSkeleton } from '@/components/skeletons';
import { ServiceGroups } from '@/components/service-groups';
import { ServiceDashboardHeader } from '@/components/service-dashboard-header';
import { useCardWidgets } from '@/hooks/use-card-widgets';
import { useResourceLinks } from '@/hooks/use-resource-links';
import { ServicePageOverlays } from '@/components/service-page-overlays';
import { ServicePageEditor } from '@/components/service-page-editor';
import { useServiceEditor } from '@/hooks/use-service-editor';
import { useServiceGroups } from '@/hooks/use-service-groups';
import { useServicePageModel } from '@/hooks/use-service-page-model';
import { useServicePageFocus, type FocusRequest } from '@/hooks/use-service-page-focus';
import { ServicesEmpty } from '@/components/services-empty';
import { OrganizeToggle } from '@/components/service-view-toolbar';
import type { useServices } from '@/hooks/use-services';
import { useServicePageActions } from '@/hooks/use-service-page-actions';
import { t } from '@/i18n';

const HostView = lazy(() =>
  import('@/components/host-view').then((module) => ({ default: module.HostView })),
);
const HostMap = lazy(() =>
  import('@/components/host-map').then((module) => ({ default: module.HostMap })),
);

/** Main screen: service groups with status, search, edit, and Organize mode. */
type Props = {
  formRoute: 'new' | number | null;
  navigate: (path: string, replace?: boolean) => void;
  onAddService: () => void;
  data: ReturnType<typeof useServices>;
  /** Set by the command palette: scroll to this service and highlight it briefly. */
  focusRequest?: FocusRequest | null;
  /** Called once the request was served, so remounting the page later does not scroll again. */
  onFocusHandled?: () => void;
};

export type { FocusRequest } from '@/hooks/use-service-page-focus';

export function ServicesPage({
  data,
  onAddService,
  formRoute,
  navigate,
  focusRequest: requestedFocus,
  onFocusHandled: handledFocus,
}: Props) {
  const { services, groupRows, statuses, sortedIn, blockedIds, refresh, pages } = data;
  const { activePageId, pageIdOf } = data;
  // Group view shows one page at a time; Host and Map views show every page.
  const paged = pages.length > 1;
  const cardWidgets = useCardWidgets();
  const resourceLinks = useResourceLinks();
  const [resourceReview, setResourceReview] = useState<number | null>(null);
  const [topBar] = useTopBar();
  const mobile = useIsMobile();
  const {
    view,
    setView,
    arrange,
    setArrange,
    showDescriptions,
    setShowDescriptions,
    uptimeRange,
    setUptimeRange,
    collapseHealthy,
    problemsFirst,
    widgetRail,
    setWidgetRail,
  } = useViewPreferences();
  const wide = useMinWidth(1280);
  const wider = useMinWidth(1440);
  const uptime = useUptime(uptimeRange);
  const probeList = useProbeList();
  const [overviewVersion, setOverviewVersion] = useState(0);
  const overview = useStatusOverview(overviewVersion);
  const maintenance = useMaintenance();
  const clock = useNow();
  const attention = useAcknowledgements();
  const inMaintenance = activeWindows(maintenance.windows, clock);
  const { tags: tagMap, reload: reloadTags } = useTags();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  useEffect(() => {
    const show = () => {
      if (takeProblemsRequest()) setStatusFilter('down');
    };
    show();
    return onProblemsRequest(show);
  }, []);
  const list = view === 'list';
  // The top bar filters the Home.
  const query = useHomeSearch();
  const [selected, setSelected] = useState<string | null>(null);
  const deps = useDependencies();
  // "Open card on Home" from the map reuses the command palette's scroll-and-highlight.
  const [localFocus, setLocalFocus] = useState<FocusRequest | null>(null);
  const focusRequest = localFocus ?? requestedFocus;
  const onFocusHandled = () => {
    setLocalFocus(null);
    handledFocus?.();
  };
  const [organizing, setOrganizing] = useState(false);
  const { addButton, srNote, setSrNote, focusService, focusNonce, announce, focusEditTrigger } =
    useServicePageFocus({
      services,
      focusRequest,
      onFocusHandled,
      setSelected,
      organizing,
      formRoute,
      loaded: data.loaded,
    });
  const mapView = arrange === 'map';
  const hostList = arrange === 'host';
  const hostView = hostList || mapView;
  const editor = useServiceEditor({
    formRoute,
    hostView,
    data,
    deps,
    navigate,
    announce,
    onOpenForm: () => setConfirming(null),
    onSaved: () => setSelected(null),
    monitorSettings: overview?.settings,
    tagMap,
    onMonitoringSaved: () => setOverviewVersion((version) => version + 1),
    onTagsSaved: reloadTags,
  });
  const { openForm, hostData } = editor;
  const groupActions = useServiceGroups({
    data,
    activePageId,
    announce,
    onSaved: () => setSelected(null),
  });
  const {
    editingGroup,
    beginRename,
    cancelRename,
    groupDraft,
    setGroupDraft,
    groupError,
    removingGroup,
    setRemovingGroup,
    saveGroup,
    deleteGroup,
  } = groupActions;
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [nodeFilter, setNodeFilter] = useState<{ connectionId: number; node: string } | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const detailsService = services.find((item) => item.id === detailsId) ?? null;
  // Dense tiles are the Home default; management and organize mode always show rows.
  const compact = view === 'tiles' && !organizing;
  const pageModel = useServicePageModel({
    data,
    hostData,
    dependencies: deps.dependencies,
    hostView,
    paged,
    query,
    selected,
    organizing,
    statusFilter,
    tagFilter,
    tags: tagMap,
    monitorSettings: overview?.settings,
  });
  const {
    allCategories,
    categories,
    pageName,
    onPage,
    isDown,
    groups,
    statusCounts,
    allTags,
    impacts,
    dependencyNotes,
    offline,
  } = pageModel;
  // Wide Home: views and groups on the left, page widgets on the right.
  const railed = wide && !mobile && !organizing && !hostView && services.length > 0;
  const widgetsInRail = railed && widgetRail && wider;
  // 'Problems first' only reorders what is shown; it never changes the saved order of groups.
  const ordered =
    problemsFirst && !organizing
      ? groups
          .map((group, index) => ({ group, index, down: group.items.filter(isDown).length }))
          .sort((a, b) => (b.down > 0 ? 1 : 0) - (a.down > 0 ? 1 : 0) || a.index - b.index)
          .map(({ group }) => group)
      : groups;
  const activePage = pages.find((page) => page.id === activePageId);
  const pinnedServices = services.filter((service) => service.pinned);
  // The Favorites view keeps only pinned services, and drops groups left empty by that.
  const shownGroups =
    favoritesOnly && !organizing
      ? ordered
          .map((group) => ({ ...group, items: group.items.filter((item) => item.pinned) }))
          .filter((group) => group.items.length > 0)
      : ordered;
  async function togglePinned(service: Service) {
    const next = !service.pinned;
    if (!(await data.pin(service.id, next))) {
      toast.error(t('pinned.failed'));
      return;
    }
    toast(t(next ? 'pinned.added' : 'pinned.removed', { name: service.name }), {
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void data.pin(service.id, !next).then((ok) => {
            if (!ok) toast.error(t('pinned.failed'));
          }),
      },
    });
  }
  const downNow = services.filter(isDown);
  const quietNow = (id: number) => isQuiet(attention.marks[id], overview?.open[id]?.id, clock);
  async function acknowledge(members: Service[], minutes?: number) {
    const ids = members.map((member) => member.id);
    const incidents = Object.fromEntries(ids.map((id) => [id, overview?.open[id]?.id]));
    if (!(await attention.acknowledge(ids, incidents, minutes))) {
      toast.error(t('attention.failed'));
      return;
    }
    toast(t(minutes ? 'attention.muted' : 'attention.done', { count: ids.length }), {
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void attention.clear(ids).then((ok) => {
            if (!ok) toast.error(t('attention.clearFailed'));
          }),
      },
    });
  }
  const actions = useServicePageActions({
    data,
    sortedIn,
    announce,
    setSelected,
    setSrNote,
  });
  const { message, confirming, setConfirming, remove, moveToGroup, reorder } = actions;
  const toolbar = {
    arrange,
    onArrangeChange: setArrange,
    view,
    onViewChange: setView,
    showDescriptions,
    onShowDescriptionsChange: setShowDescriptions,
    uptimeRange,
    onUptimeRangeChange: setUptimeRange,
    organizing,
    onToggleOrganizing: () => {
      setOrganizing(!organizing);
      setConfirming(null);
    },
    showHostSuggestions:
      hostData.connections.length > 0 && services.some((service) => !service.host),
    onHostSuggestions: () => setSuggestOpen(true),
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelRename();
      setConfirming(null);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [cancelRename, setConfirming]);

  const categoryFilter =
    !organizing && !hostView && !railed && services.length > 0 && categories.length > 2 ? (
      <CategoryFilter
        categories={categories}
        selected={selected}
        onSelect={setSelected}
        counts={(category) =>
          category === null
            ? services.filter(onPage).length
            : services.filter((s) => s.category === category).length
        }
      />
    ) : null;

  const body = (
    <section
      aria-label={t('nav.services')}
      className={cn('flex flex-col gap-4 md:gap-6', organizing && 'pb-20 md:pb-0')}
    >
      <ServiceDashboardHeader
        organizing={organizing}
        topBar={topBar}
        compact={mobile}
        banner={
          <StatusBanner
            services={services}
            statuses={statuses}
            blockedIds={blockedIds}
            overview={overview}
            maintenance={maintenance.windows}
            uptime={uptime}
            range={uptimeRange}
            onOpenService={(id) => setDetailsId(id)}
          />
        }
        stateFilter={
          !organizing && !hostView && !railed && services.length > 0 ? (
            <StatusFilter
              selected={statusFilter}
              counts={statusCounts}
              onSelect={setStatusFilter}
            />
          ) : undefined
        }
        serviceCount={services.length}
        toolbar={toolbar}
        showImpact
        impact={{
          nodes: offline,
          pageCount: (node) =>
            new Set(node.affected.map((service) => pageIdOf(service.category))).size,
          indirect: (node) => {
            const direct = new Set(node.affected.map((service) => service.id));
            return dependentsOf([...direct], deps.dependencies).filter((id) => !direct.has(id))
              .length;
          },
          onSeeImpact: (node) => {
            setNodeFilter({ connectionId: node.connectionId, node: node.node });
            setArrange('host');
          },
        }}
        groupEditor={{
          renaming: editingGroup !== null,
          draft: groupDraft,
          onDraftChange: setGroupDraft,
          onSubmit: (event) => void saveGroup(event),
          onCancelRename: cancelRename,
          onAddService: () => openForm(),
          addButton,
        }}
      />
      {data.statusError && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('status.stale')}
        </p>
      )}
      {!organizing && !hostView && (
        <ProbableCauses
          down={downNow.filter((service) => !quietNow(service.id))}
          quiet={downNow.filter((service) => quietNow(service.id))}
          incidents={overview?.open}
          impacts={impacts}
          onOpen={(service) => setDetailsId(service.id)}
          onAcknowledge={(members, minutes) => void acknowledge(members, minutes)}
          onShowAgain={(members) => void attention.clear(members.map((m) => m.id))}
        />
      )}
      <FormError>{groupError}</FormError>
      {typeof formRoute === 'number' &&
        data.loaded &&
        !services.some((item) => item.id === formRoute) && (
          <Alert>
            <AlertDescription>
              {t('route.serviceNotFound')}{' '}
              <Button type="button" variant="link" onClick={() => navigate('/', true)}>
                {t('route.services')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      <ServicePageEditor
        editor={editor}
        categories={allCategories}
        services={services}
        dependencies={deps.dependencies}
        onFocusEditTrigger={focusEditTrigger}
      />
      <div role="status" id="message" className="empty:hidden">
        {(message || data.loadError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {message || data.loadError}
              {data.loadError && (
                <Button type="button" variant="link" onClick={() => void data.refresh()}>
                  {t('catalog.retry')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <p role="status" className="sr-only">
        {srNote}
      </p>
      {paged && !hostView && (
        <PageTabs
          menu={
            activePage ? (
              <PageTabMenu page={activePage} onChanged={() => data.refresh()} />
            ) : undefined
          }
          pages={pages}
          activeId={activePageId}
          onSelect={(id) => {
            data.selectPage(id);
            setSelected(null);
          }}
          counts={(pageId) => {
            const onThis = services.filter((s) => pageIdOf(s.category) === pageId);
            return { total: onThis.length, down: onThis.filter(isDown).length };
          }}
        />
      )}
      {!hostView && !widgetsInRail && <PageWidgets pageId={activePageId} pages={pages} />}
      {!organizing && !hostView && allTags.length > 0 && (
        <div
          role="group"
          aria-label={t('filter.byTag')}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {t('form.tags')}
          </span>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tagFilter === tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-9',
                tagFilter === tag
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      {!organizing && mobile && services.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{categoryFilter}</div>
          <ServiceOptionsSheet
            toolbar={toolbar}
            status={
              hostView
                ? undefined
                : { selected: statusFilter, counts: statusCounts, onSelect: setStatusFilter }
            }
          />
        </div>
      )}
      {!organizing && mobile && services.length === 0 && (
        <OrganizeToggle organizing={organizing} onToggle={toolbar.onToggleOrganizing} />
      )}
      {!(mobile && !organizing) && categoryFilter}
      {mapView && services.length > 0 && (
        <Suspense fallback={<ServicesSkeleton label={t('common.loading')} list={list} />}>
          <HostMap
            services={services}
            cardDetails={(service) => ({
              widgets: cardWidgets[service.id],
              uptime: uptime[service.id],
              monitor: overview?.settings?.[service.id],
              tags: tagMap[service.id],
              uptimeRange,
              onUptimeRangeChange: setUptimeRange,
            })}
            connections={hostData.connections}
            inventories={hostData.inventories}
            statuses={statuses}
            blockedIds={blockedIds}
            onRefresh={() => hostData.connections.forEach((c) => void hostData.reload(c.id, true))}
            onListView={() => setArrange('host')}
            onHome={() => setArrange('group')}
            onOpenCard={(service) => {
              setArrange('group');
              setLocalFocus({ id: service.id, nonce: Date.now() });
            }}
            pageName={pageName}
            onChangeHost={(service) => navigate(`/manage/services/${service.id}/edit`)}
            dependencies={deps.dependencies}
            notes={dependencyNotes}
            edit={{
              // The same endpoint the form and the suggestions use, so a link made on the map is
              // identical to one made anywhere else.
              onLinkHost: async (service, next) => {
                const linked = await data.linkHost(service.id, next);
                if (!linked) return false;
                await refresh();
                return true;
              },
              onAddDependency: deps.add,
              onRemoveDependency: deps.remove,
              connectionsLoaded: hostData.connectionsLoaded,
              onReload: (id, force) => void hostData.reload(id, force),
            }}
          />
        </Suspense>
      )}
      {hostList && services.length > 0 && (
        <Suspense fallback={<ServicesSkeleton label={t('common.loading')} list={list} />}>
          <HostView
            services={services}
            connections={hostData.connections}
            inventories={hostData.inventories}
            statuses={statuses}
            blockedIds={blockedIds}
            onEdit={(service) => navigate(`/manage/services/${service.id}/edit`)}
            notes={dependencyNotes}
            pageName={pageName}
            nodeFilter={nodeFilter}
            onClearFilter={() => setNodeFilter(null)}
          />
        </Suspense>
      )}
      {!organizing && !hostView && !favoritesOnly && (
        <PinnedRow
          services={pinnedServices}
          statuses={statuses}
          blockedIds={blockedIds}
          onDetails={(service) => setDetailsId(service.id)}
        />
      )}
      {!hostView && (
        <ServiceGroups
          data={{
            groups: shownGroups,
            services,
            groupRows,
            pages,
            allCategories,
            pageIdOf,
            sortedIn,
            statuses,
            blockedIds,
            widgets: cardWidgets,
            resourceLink: resourceLinks.byService,
            uptime,
            uptimeRange,
            monitorSettings: overview?.settings,
            incidents: overview?.open,
            maintenanceUntil: Object.fromEntries(
              Object.entries(inMaintenance).map(([id, window]) => [id, window.endsAt]),
            ),
            tags: tagMap,
            impacts,
            dependencyNotes,
          }}
          presentation={{
            organizing,
            list,
            compact,
            collapseHealthy,
            isDown,
            showDescriptions,
            revealServiceId: focusService?.id,
            revealNonce: focusNonce,
            confirming,
          }}
          actions={{
            onUptimeRangeChange: setUptimeRange,
            onTag: setTagFilter,
            hostOf: (service) => hostLabel(service, hostData.connections, hostData.inventories),
            onEditService: openForm,
            onDetails: (service) => setDetailsId(service.id),
            onRemoveService: (service) => void remove(service),
            onCancelRemoval: (id) => setConfirming((current) => (current === id ? null : current)),
            onResource: setResourceReview,
            onPlaceService: (service, position, total) =>
              void reorder(data.placeService(service, position), position, service, total),
            onMoveServiceToGroup: (service, group) => void moveToGroup(service, group),
            onMoveGroup: (category, direction) => void reorder(data.moveGroup(category, direction)),
            onMoveGroupToPage: (group, pageId) =>
              void reorder(data.moveGroupToPage(group.id, pageId)),
            onSetGroupColumns: (group, columns) =>
              void reorder(data.setGroupColumns(group.id, columns)),
            onRenameGroup: (group) => {
              beginRename(group.id, group.name);
            },
            onRemoveGroup: (group) => setRemovingGroup({ id: group.id, name: group.name }),
          }}
        />
      )}
      <ServiceDrawer
        service={detailsService}
        status={detailsService ? statuses[detailsService.id] : undefined}
        blocked={detailsService ? blockedIds.has(detailsService.id) : false}
        uptime={detailsService ? uptime[detailsService.id] : undefined}
        monitor={detailsService ? overview?.settings[detailsService.id] : undefined}
        incident={detailsService ? overview?.open[detailsService.id] : undefined}
        maintenanceUntil={detailsService ? inMaintenance[detailsService.id]?.endsAt : undefined}
        range={uptimeRange}
        onRangeChange={setUptimeRange}
        onTogglePinned={(item) => void togglePinned(item)}
        onClose={() => setDetailsId(null)}
      />
      <ServicePageOverlays
        services={services}
        suggestionsOpen={suggestOpen}
        onSuggestionsOpenChange={setSuggestOpen}
        onRefresh={refresh}
        onChooseHostManually={(service) => {
          setSuggestOpen(false);
          navigate(`/manage/services/${service.id}/edit`);
        }}
        resourceReviewId={resourceReview}
        resourceByService={resourceLinks.byService}
        onCloseResource={() => setResourceReview(null)}
        onReloadResource={resourceLinks.reload}
        removingGroup={removingGroup}
        onRemovingGroupChange={setRemovingGroup}
        onDeleteGroup={deleteGroup}
      />
      {organizing && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 border-t bg-card px-4 py-3 md:hidden">
          <span className="font-mono text-xs text-muted-foreground">{t('organize.bar')}</span>
          <Button
            type="button"
            aria-label={t('organize.finish')}
            onClick={() => {
              setOrganizing(false);
              setConfirming(null);
            }}
          >
            {t('page.done')}
          </Button>
        </div>
      )}
      {!data.loaded && !data.loadError && (
        <ServicesSkeleton label={t('common.loading')} list={list} />
      )}
      {data.loaded && !data.loadError && paged && !hostView && categories.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('pages.empty')}</p>
      )}
      {data.loaded &&
        !data.loadError &&
        !groups.length &&
        !hostView &&
        !(paged && categories.length === 0) && (
          <ServicesEmpty
            hasServices={services.length > 0}
            onAdd={onAddService}
            calm={statusFilter === 'down' && !query && !tagFilter && !selected}
            onClearFilters={
              statusFilter !== 'all' || tagFilter || selected || favoritesOnly
                ? () => {
                    setStatusFilter('all');
                    setHomeSearch('');
                    setTagFilter(null);
                    setSelected(null);
                    setFavoritesOnly(false);
                  }
                : undefined
            }
          />
        )}
    </section>
  );
  if (!railed) return body;
  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-6 min-[1440px]:grid-cols-[13rem_minmax(0,1fr)_19rem]">
      <aside className="sticky top-4 self-start">
        <HomeRail
          statusFilter={statusFilter}
          counts={statusCounts}
          onStatusFilter={setStatusFilter}
          groups={categories
            .filter((name): name is string => typeof name === 'string')
            .map((name) => {
              const members = services.filter((s) => s.category === name);
              return { name, total: members.length, down: members.filter(isDown).length };
            })}
          selectedGroup={selected}
          onSelectGroup={setSelected}
          favorites={{
            count: pinnedServices.length,
            active: favoritesOnly,
            onToggle: () => setFavoritesOnly(!favoritesOnly),
          }}
          probes={{
            items: (probeList.probes ?? []).map((probe) => {
              const view = describeStatus(statuses[probe.id], false, {
                checkType: probe.checkType,
              });
              return { id: probe.id, name: probe.name, state: view.state, label: view.label };
            }),
            onOpen: () => navigate('/manage/probes'),
          }}
          widgetRail={widgetRail}
          onToggleWidgetRail={() => setWidgetRail(!widgetRail)}
        />
      </aside>
      {body}
      {widgetsInRail && (
        <aside className="min-w-0">
          <PageWidgets pageId={activePageId} pages={pages} layout="rail" />
        </aside>
      )}
    </div>
  );
}
