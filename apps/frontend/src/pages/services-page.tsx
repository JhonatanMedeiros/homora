import { lazy, Suspense, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDependencies } from '@/hooks/use-dependencies';
import { dependentsOf } from '@/lib/dependencies';
import { hostLabel } from '@/lib/hosts';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { useUptime } from '@/hooks/use-uptime';
import { PageTabs } from '@/components/page-tabs';
import { CategoryFilter } from '@/components/category-filter';
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
  managing: boolean;
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
  managing,
  onAddService,
  formRoute,
  navigate,
  focusRequest: requestedFocus,
  onFocusHandled: handledFocus,
}: Props) {
  const { services, groupRows, statuses, sortedIn, blockedIds, refresh, pages } = data;
  const { activePageId, pageIdOf } = data;
  // Group view shows one page at a time; Host and Map views show every page.
  const paged = pages.length > 1 && !managing;
  const cardWidgets = useCardWidgets();
  const resourceLinks = useResourceLinks();
  const [coolifyReview, setCoolifyReview] = useState<number | null>(null);
  const [topBar] = useTopBar();
  const {
    view,
    setView,
    arrange,
    setArrange,
    showDescriptions,
    setShowDescriptions,
    uptimeRange,
    setUptimeRange,
  } = useViewPreferences();
  const uptime = useUptime(uptimeRange);
  const list = view === 'list' || managing;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const deps = useDependencies();
  // "Open card on Home" from the map reuses the command palette's scroll-and-highlight.
  const [localFocus, setLocalFocus] = useState<FocusRequest | null>(null);
  const focusRequest = localFocus ?? requestedFocus;
  const onFocusHandled = () => {
    setLocalFocus(null);
    handledFocus?.();
  };
  const {
    addButton,
    flash,
    srNote,
    setSrNote,
    focusService,
    focusNonce,
    announce,
    focusEditTrigger,
  } = useServicePageFocus({
    services,
    focusRequest,
    onFocusHandled,
    setSelected,
    managing,
    formRoute,
    loaded: data.loaded,
  });
  const mapView = arrange === 'map' && !managing;
  const hostList = arrange === 'host' && !managing;
  const hostView = hostList || mapView;
  const editor = useServiceEditor({
    managing,
    formRoute,
    hostView,
    data,
    deps,
    navigate,
    announce,
    onOpenForm: () => setConfirming(null),
    onSaved: () => setSelected(null),
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
  const [organizing, setOrganizing] = useState(false);
  const pageModel = useServicePageModel({
    data,
    hostData,
    dependencies: deps.dependencies,
    managing,
    hostView,
    paged,
    query,
    selected,
    organizing,
  });
  const {
    allCategories,
    categories,
    pageName,
    onPage,
    isDown,
    groups,
    impacts,
    dependencyNotes,
    offline,
    summary: { total, online, down, blocked, unknown },
  } = pageModel;
  const actions = useServicePageActions({
    data,
    sortedIn,
    announce,
    setSelected,
    setSrNote,
  });
  const { message, confirming, setConfirming, remove, moveToGroup, reorder } = actions;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelRename();
      setConfirming(null);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [cancelRename, setConfirming]);

  return (
    <section
      aria-label={t('nav.services')}
      className={cn('flex flex-col gap-6', organizing && 'pb-20 md:pb-0')}
    >
      <ServiceDashboardHeader
        managing={managing}
        organizing={organizing}
        topBar={topBar}
        summary={{ total, online, down, blocked, unknown }}
        serviceCount={total}
        groupCount={allCategories.length}
        toolbar={{
          arrange,
          onArrangeChange: setArrange,
          view,
          onViewChange: setView,
          showDescriptions,
          onShowDescriptionsChange: setShowDescriptions,
          showHostSuggestions:
            hostData.connections.length > 0 && services.some((service) => !service.host),
          onHostSuggestions: () => setSuggestOpen(true),
        }}
        addButton={addButton}
        onToggleOrganizing={() => {
          setOrganizing(!organizing);
          setConfirming(null);
        }}
        onAddService={() => openForm()}
        showImpact={!managing}
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
        }}
      />
      {!managing && data.statusError && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('status.stale')}
        </p>
      )}
      <FormError>{groupError}</FormError>
      {typeof formRoute === 'number' &&
        data.loaded &&
        !services.some((item) => item.id === formRoute) && (
          <Alert>
            <AlertDescription>
              {t('route.serviceNotFound')}{' '}
              <Button
                type="button"
                variant="link"
                onClick={() => navigate('/manage/services', true)}
              >
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
      {flash && (
        <p
          role="status"
          className="motion-feedback flex w-fit items-center gap-2 rounded-md bg-success px-3 py-2 text-sm font-semibold text-success-foreground"
        >
          <Check className="size-4" aria-hidden="true" />
          {flash}
        </p>
      )}
      {paged && !hostView && (
        <PageTabs
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
      {managing && !organizing && services.length > 0 && (
        <Input
          type="search"
          aria-label={t('manage.filter')}
          placeholder={t('manage.filter')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
      )}
      {!organizing && !hostView && services.length > 0 && categories.length > 2 && (
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
      )}
      {mapView && services.length > 0 && (
        <Suspense fallback={<ServicesSkeleton label={t('common.loading')} list={list} />}>
          <HostMap
            services={services}
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
      {!hostView && (
        <ServiceGroups
          data={{
            groups,
            services,
            groupRows,
            pages,
            allCategories,
            pageIdOf,
            sortedIn,
            statuses,
            blockedIds,
            widgets: cardWidgets,
            coolify: resourceLinks.byService,
            uptime,
            uptimeRange,
            impacts,
            dependencyNotes,
          }}
          presentation={{
            managing,
            organizing,
            list,
            showDescriptions,
            revealServiceId: focusService?.id,
            revealNonce: focusNonce,
            confirming,
          }}
          actions={{
            onUptimeRangeChange: setUptimeRange,
            hostOf: (service) => hostLabel(service, hostData.connections, hostData.inventories),
            onEditService: openForm,
            onRemoveService: (service) => void remove(service),
            onCancelRemoval: (id) => setConfirming((current) => (current === id ? null : current)),
            onCoolify: setCoolifyReview,
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
      <ServicePageOverlays
        services={services}
        suggestionsOpen={suggestOpen}
        onSuggestionsOpenChange={setSuggestOpen}
        onRefresh={refresh}
        onChooseHostManually={(service) => {
          setSuggestOpen(false);
          navigate(`/manage/services/${service.id}/edit`);
        }}
        coolifyReviewId={coolifyReview}
        coolifyByService={resourceLinks.byService}
        onCloseCoolify={() => setCoolifyReview(null)}
        onReloadCoolify={resourceLinks.reload}
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
            onAdd={() => (managing ? openForm() : onAddService())}
          />
        )}
    </section>
  );
}
