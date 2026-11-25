import { useEffect, useMemo, useRef, useState } from 'react';
import type { Service } from '@homora/shared';
import { HostPicker } from '@/features/hosts/host-picker';
import { dependsOn, upstreamChain, usedBy, type Dependency } from '@/features/hosts/dependencies';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { EmptyNote } from '@/components/empty-note';
import {
  HostMapDiagram,
  type HostMapSelection,
  type TileNote,
} from '@/features/hosts/host-map-diagram';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  buildHostView,
  serviceImpact,
  type HostConnection,
  type HostInventories,
  type Impact,
} from '@/features/hosts/hosts';
import { layoutGroups, layoutMap, type MapContainer } from '@/features/hosts/map-layout';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { HostMapSelectionPanel, PANEL_WIDTH } from '@/features/hosts/host-map-selection-panel';
import { HostMapHeader } from '@/features/hosts/host-map-header';
import { HostMapToolbar, type MapGroupBy } from '@/features/hosts/host-map-toolbar';
import { HostMapControls } from '@/features/hosts/host-map-controls';
import { useHostMapViewport } from '@/features/hosts/use-host-map-viewport';
import { useHostMapEditing, type MapEdit } from '@/features/hosts/use-host-map-editing';
import { useHostMapSuggestions } from '@/features/hosts/use-host-map-suggestions';
import { useMapConnections } from '@/features/hosts/use-host-map-prefs';
import { useViewPreferences } from '@/features/dashboard/use-view-preferences';
import {
  groupTileView,
  mapView,
  type MapFilter,
  type MapView,
} from '@/features/hosts/host-map-filter';
import { healthCompare, isProblem, nodeSummary, serviceHealth } from '@/features/hosts/host-health';
import type { HostMapServicePanelProps } from '@/features/hosts/host-map-service-panel';
import { t } from '@/i18n';

export type { MapEdit } from '@/features/hosts/use-host-map-editing';

type Props = {
  edit?: MapEdit;
  cardDetails?: (
    service: Service,
  ) => Pick<
    HostMapServicePanelProps,
    'widgets' | 'uptime' | 'monitor' | 'tags' | 'uptimeRange' | 'onUptimeRangeChange'
  >;
  /** Manual dependencies, shown as "Depends on" and "Used by". */
  dependencies?: Dependency[];
  /** "May be affected through ..." hints by service id, from manual dependencies. */
  notes?: Record<number, string>;
  /** Name of the page a service is on; undefined with a single page. */
  pageName?: (service: Service) => string | undefined;
  /** When the open incident of a service began, if it has one. */
  downSince?: (service: Service) => number | undefined;
  services: Service[];
  connections: HostConnection[];
  inventories: HostInventories;
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onRefresh: () => void;
  onListView: () => void;
  /** Leaves the map for the Home cards. */
  onHome?: () => void;
  onOpenCard: (service: Service) => void;
  onChangeHost: (service: Service) => void;
};

const IMPACT_TEXT = {
  'host-offline': 'hosts.impact.hostOffline',
  'guest-stopped': 'hosts.impact.guestStopped',
  'service-down': 'hosts.impact.serviceDown',
  unknown: 'hosts.impact.unknown',
} as const;
const impactText = (impact: Impact) =>
  impact in IMPACT_TEXT ? t(IMPACT_TEXT[impact as keyof typeof IMPACT_TEXT]) : null;

const EMPTY_VIEW = (services: Service[]): MapView => ({
  collapsed: new Set(),
  dimmedNodes: new Set(),
  dimmedContainers: new Set(),
  dimmedGuests: new Set(),
  dimmedServices: new Set(),
  matches: null,
  counts: { all: services.length, problems: 0, unlinked: 0 },
});

/**
 * Map of services by host. Nodes are containers, guests sit inside them, services are tiles. The
 * layout is automatic and deterministic, and the DOM (so keyboard focus) order equals the Host view
 * order, which stays the complete equivalent. Everything here is read-only toward the infrastructure:
 * the only writes are Homora's own host links and the "external" mark.
 */
export function HostMap({
  edit,
  cardDetails,
  dependencies = [],
  notes = {},
  services,
  connections,
  inventories,
  statuses,
  blockedIds,
  onRefresh,
  onListView,
  onHome,
  onOpenCard,
  onChangeHost,
  pageName,
  downSince,
}: Props) {
  const mobile = useIsMobile();
  const preferences = useViewPreferences();
  const [openAnyway, setOpenAnyway] = useState(false);
  const [selection, setSelection] = useState<HostMapSelection>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [groupBy, setGroupBy] = useState<MapGroupBy>('host');
  const [connectionsOn, setConnectionsOn] = useMapConnections();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const search = useRef<HTMLInputElement>(null);

  const healthOf = (service: Service) =>
    serviceHealth(statuses[service.id], blockedIds.has(service.id));
  const problemsFirst = filter === 'problems' || preferences.problemsFirst;
  const compare = problemsFirst ? healthCompare(healthOf) : undefined;
  const model = useMemo(
    () => buildHostView(services, connections, inventories, compare),
    // healthOf and compare derive from these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, connections, inventories, statuses, blockedIds, problemsFirst],
  );
  const editing = useHostMapEditing({ edit, services, model });
  const suggestions = useHostMapSuggestions(services);
  const byGroup = groupBy === 'group';

  const baseView = mapView({
    model,
    services,
    healthOf,
    filter,
    query,
    collapseHealthy: preferences.collapseHealthy,
    overrides,
  });
  const view: MapView = byGroup
    ? (() => {
        const tiles = groupTileView(services, healthOf, filter, query);
        return {
          ...EMPTY_VIEW(services),
          counts: baseView.counts,
          matches: tiles.matches,
          dimmedServices: tiles.dimmed,
        };
      })()
    : baseView;
  const layout = useMemo(() => {
    if (byGroup) {
      const ordered = compare ? [...services].sort(compare) : services;
      return layoutGroups(ordered, [...new Set(services.map((service) => service.category))]);
    }
    return layoutMap(model, { collapsed: baseView.collapsed });
    // The collapsed set is rebuilt each render; its contents are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byGroup, model, services, [...baseView.collapsed].join('|'), problemsFirst, statuses]);

  const { viewport, content, moved, zoom, setZoom, visible, fit, reset, panTo, reveal, ...pan } =
    useHostMapViewport(layout);
  const impactOf = (service: Service) =>
    serviceImpact(
      service,
      statuses[service.id]?.status,
      blockedIds.has(service.id),
      connections,
      inventories,
    );

  const fullscreen = (!mobile || openAnyway) && services.some((service) => service.host);
  // The map takes the whole window, so the page behind it must not scroll.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const selectedService =
    selection?.kind === 'service' ? services.find((item) => item.id === selection.id) : undefined;
  const selectedGuest =
    selection?.kind === 'guest'
      ? layout.containers.flatMap((c) => c.guests).find((g) => g.group.key === selection.key)
      : undefined;
  const selectedNode = selectedGuest
    ? layout.containers.find((c) => c.guests.includes(selectedGuest))?.node
    : undefined;

  // Bring the selected tile out from under the docked panel.
  useEffect(() => {
    if (!selection) return;
    const rect =
      selection.kind === 'service'
        ? layout.containers
            .flatMap((c) => [...c.guests.flatMap((g) => g.services), ...c.services])
            .find((item) => item.service.id === selection.id)
        : layout.containers.flatMap((c) => c.guests).find((g) => g.group.key === selection.key);
    if (rect) reveal(rect, window.innerWidth >= 1280 ? PANEL_WIDTH : 0);
    // Only a new selection moves the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // "/" jumps to the search, like the rest of the app, unless a field already has the keys.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // On phones the map is read-only even when opened anyway.
  const canEdit = Boolean(edit) && !mobile;
  if (mobile && !openAnyway)
    return (
      <Alert>
        <AlertDescription className="flex flex-col gap-3">
          <p>{t('map.phoneNotice')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="pointer-coarse:h-11" onClick={onListView}>
              {t('map.useList')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={() => setOpenAnyway(true)}
            >
              {t('map.openAnyway')}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );

  if (!services.some((service) => service.host))
    return (
      <section aria-label={t('map.title')} className="flex flex-col gap-3">
        <EmptyNote>{t('map.empty')}</EmptyNote>
      </section>
    );

  const problemIds = new Set(
    layout.containers
      .filter((container) =>
        container.node
          ? nodeSummary(container.node, healthOf).problem
          : container.services.some((item) => isProblem(healthOf(item.service))),
      )
      .map((container) => container.id),
  );

  const noteOf = (service: Service): TileNote | null => {
    const candidate = suggestions.candidateOf(service.id);
    if (candidate)
      return {
        text: t('map.suggest.note', { guest: candidate.name }),
        tone: 'suggestion',
      };
    return { text: hostOf(service.url) };
  };

  const unlinkedActions = (container: MapContainer) => {
    if (container.kind !== 'unlinked' || !canEdit) return null;
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          disabled={suggestions.status === 'loading'}
          onClick={() => void suggestions.load()}
        >
          {t(suggestions.status === 'loading' ? 'map.unlinked.finding' : 'map.unlinked.find')}
        </Button>
        {suggestions.bulk.length > 0 && (
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:h-11"
            onClick={() =>
              void editing.linkMany(
                suggestions.bulk.flatMap(({ serviceId, candidate }) => {
                  const service = services.find((item) => item.id === serviceId);
                  return service ? [{ service, host: candidate.host }] : [];
                }),
              )
            }
          >
            {t('map.unlinked.linkSuggested', {
              count: suggestions.bulk.length,
            })}
          </Button>
        )}
      </span>
    );
  };

  const panelService = selectedService && {
    service: selectedService,
    status: statuses[selectedService.id],
    blocked: blockedIds.has(selectedService.id),
    runsOn: editing.panelRunsOn(selectedService),
    page: pageName?.(selectedService),
    impact: [impactText(impactOf(selectedService)), notes[selectedService.id]]
      .filter(Boolean)
      .join(' · '),
    downSince: downSince?.(selectedService),
    chain: upstreamChain(selectedService.id, dependencies).map((id) => ({
      id,
      name: editing.nameOf(id),
    })),
    external: Boolean(selectedService.hostExternal),
    suggestion: (() => {
      const candidate = suggestions.candidateOf(selectedService.id);
      return candidate
        ? {
            guest: candidate.name,
            strong: candidate.strength === 'strong',
            ambiguous: candidate.ambiguous,
            evidence: candidate.evidence.map((item) =>
              t(`hosts.evidence.${item.kind}`, { address: item.address ?? '' }),
            ),
          }
        : undefined;
    })(),
    dependsOnList: dependsOn(selectedService.id, dependencies).map((id) => ({
      id,
      name: editing.nameOf(id),
    })),
    usedByList: usedBy(selectedService.id, dependencies).map((id) => ({
      id,
      name: editing.nameOf(id),
    })),
    onSelect: (id: number) => setSelection({ kind: 'service', id }),
    onAddDependency: () => editing.setPicking(selectedService.id),
    onRemoveDependency: (id: number) => void editing.unpick(selectedService.id, id),
    onOpenCard: () => onOpenCard(selectedService),
    onChangeHost: () => onChangeHost(selectedService),
    onLinkSuggestion: () => {
      const candidate = suggestions.candidateOf(selectedService.id);
      if (candidate) void editing.link(selectedService, candidate.host, candidate.name);
    },
    onDismissSuggestion: () => void suggestions.dismissFor(selectedService),
    onMarkExternal: (external: boolean) => void editing.markExternal(selectedService, external),
  };

  const searching = query.trim() !== '';
  const nothingFound =
    searching &&
    (byGroup
      ? (view.matches?.size ?? 0) === 0
      : baseView.dimmedNodes.size === model.nodes.length &&
        [model.notFound, model.unavailable, model.external, model.unlinked].every((list) =>
          list.every((item) => !baseView.matches?.has(item.id)),
        ));
  const nothingToShow = (filter === 'problems' && view.counts.problems === 0) || nothingFound;
  const hasDependencies = dependencies.length > 0;

  return (
    <section
      aria-label={t('map.title')}
      data-homora="host-map"
      className="fixed inset-0 z-40 flex flex-col bg-background"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (editing.picking === null) {
          setSelection(null);
        } else {
          editing.setPicking(null);
        }
      }}
    >
      <HostMapHeader
        connections={connections}
        onHome={onHome}
        onRefresh={onRefresh}
        onListView={onListView}
      />
      <HostMapToolbar
        ref={search}
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        counts={view.counts}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        connections={connectionsOn}
        onConnectionsChange={setConnectionsOn}
        collapseHealthy={preferences.collapseHealthy}
        onCollapseHealthyChange={(on) => {
          setOverrides(new Map());
          preferences.setCollapseHealthy(on);
        }}
        hasDependencies={hasDependencies}
      />
      {(editing.picking !== null ||
        model.unavailable.length > 0 ||
        suggestions.status === 'error') && (
        <div className="flex flex-col gap-2 border-b bg-card px-3 py-2">
          {editing.picking !== null && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {t('dependencies.picking', {
                  name: editing.nameOf(editing.picking),
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-11"
                  onClick={() => editing.setPicking(null)}
                >
                  {t('dependencies.cancel')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {model.unavailable.length > 0 && (
            <Alert>
              <AlertDescription>{t('map.partial')}</AlertDescription>
            </Alert>
          )}
          {suggestions.status === 'error' && (
            <Alert variant="destructive">
              <AlertDescription>{t('map.unlinked.findFailed')}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
      <p role="status" className="px-3 text-xs empty:hidden">
        {editing.message}
      </p>
      <div className="relative min-h-0 flex-1">
        <div
          ref={viewport}
          role="region"
          aria-label={t('map.canvas')}
          tabIndex={0}
          onPointerDown={pan.onPointerDown}
          onPointerMove={pan.onPointerMove}
          onPointerUp={pan.endDrag}
          onPointerCancel={pan.endDrag}
          onClick={(event) => {
            // A click on the empty canvas closes the details; a pan or a click on a tile does not.
            if (moved.current) return;
            if ((event.target as HTMLElement).closest('button, a')) return;
            setSelection(null);
          }}
          className="absolute inset-0 cursor-grab overflow-auto bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:22px_22px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-max min-w-full p-6 pb-28">
            {nothingToShow && (
              <p
                role="status"
                className="mb-4 rounded-lg border bg-card p-3 text-sm text-muted-foreground"
              >
                {filter === 'problems' && view.counts.problems === 0
                  ? t('map.noProblems')
                  : t('map.noMatches', { query: query.trim() })}
              </p>
            )}
            <div ref={content} className="w-fit">
              <HostMapDiagram
                layout={layout}
                zoom={zoom}
                services={services}
                statuses={statuses}
                blockedIds={blockedIds}
                dependencies={dependencies}
                healthOf={healthOf}
                view={view}
                showConnections={connectionsOn && hasDependencies}
                selection={selection}
                picking={editing.picking}
                dragging={dragging}
                dropOver={dropOver}
                canEdit={canEdit}
                noteOf={noteOf}
                containerActions={unlinkedActions}
                impactLabel={(service) => impactText(impactOf(service))}
                onSelect={setSelection}
                onPick={(service, dependsOnId) => void editing.pick(service, dependsOnId)}
                onLink={(service, host, guestName) => void editing.link(service, host, guestName)}
                onMarkExternal={(service) => void editing.markExternal(service, true)}
                onToggleGuest={(key, collapsed) =>
                  setOverrides((current) => new Map(current).set(key, collapsed))
                }
                onDragChange={setDragging}
                onDropOver={setDropOver}
                onDropLeave={(key) => setDropOver((current) => (current === key ? null : current))}
                onDropClear={() => setDropOver(null)}
              />
            </div>
          </div>
        </div>
        <HostMapControls
          zoom={zoom}
          setZoom={setZoom}
          fit={fit}
          reset={reset}
          layout={layout}
          visible={visible}
          problemIds={problemIds}
          onPan={panTo}
        />
        {selection && (selectedService || selectedGuest) && (
          <HostMapSelectionPanel
            service={panelService}
            cardDetails={selectedService ? cardDetails?.(selectedService) : undefined}
            canEdit={canEdit}
            guest={selectedGuest}
            nodeName={selectedNode?.node.name}
            statuses={statuses}
            blockedIds={blockedIds}
            healthOf={healthOf}
            onClose={() => setSelection(null)}
            onSelectService={(id) => setSelection({ kind: 'service', id })}
            hostEditor={
              selectedService && canEdit && edit ? (
                <HostPicker
                  value={selectedService.host ?? null}
                  onChange={(host) => {
                    void editing.link(selectedService, host, editing.guestName(host));
                  }}
                  connections={connections}
                  connectionsLoaded={edit.connectionsLoaded}
                  inventories={inventories}
                  onReload={edit.onReload}
                />
              ) : null
            }
          />
        )}
      </div>
    </section>
  );
}
