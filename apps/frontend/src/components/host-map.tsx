import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { HostLink, Service } from '@homora/shared';
import { ArrowLeft, ChevronRight, Minus, Plus, RefreshCw, RotateCcw, Scan, X } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { HostPicker } from '@/components/host-picker';
import { dependsOn, usedBy, type Dependency } from '@/lib/dependencies';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyNote } from '@/components/empty-note';
import { StatusLight } from '@/components/status-light';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  buildHostView,
  serviceImpact,
  type HostConnection,
  type HostInventories,
  type Impact,
} from '@/lib/hosts';
import {
  MAP,
  ZOOM,
  clampZoom,
  fitZoom,
  layoutMap,
  type MapContainer,
  type MapGuest,
  type MapService,
} from '@/lib/map-layout';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** Write access. Absent means read-only (also forced on phones, where the map is read-only). */
export type MapEdit = {
  onLinkHost: (service: Service, host: HostLink | null) => Promise<boolean>;
  onAddDependency: (serviceId: number, dependsOnId: number) => Promise<string | null>;
  onRemoveDependency: (serviceId: number, dependsOnId: number) => Promise<string | null>;
  connectionsLoaded: boolean;
  onReload: (connectionId: number, refresh?: boolean) => void;
};

type Props = {
  edit?: MapEdit;
  /** Manual dependencies, shown as "Depends on" and "Used by". */
  dependencies?: Dependency[];
  /** "May be affected through ..." hints by service id, from manual dependencies. */
  notes?: Record<number, string>;
  /** Name of the page a service is on; undefined with a single page. */
  pageName?: (service: Service) => string | undefined;
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

type Selection = { kind: 'service'; id: number } | { kind: 'guest'; key: string } | null;

const IMPACT_TEXT = {
  'host-offline': 'hosts.impact.hostOffline',
  'guest-stopped': 'hosts.impact.guestStopped',
  'service-down': 'hosts.impact.serviceDown',
  unknown: 'hosts.impact.unknown',
} as const;
const impactText = (impact: Impact) =>
  impact in IMPACT_TEXT ? t(IMPACT_TEXT[impact as keyof typeof IMPACT_TEXT]) : null;
const guestState = (status: string) =>
  status === 'running'
    ? t('hosts.state.running')
    : status === 'stopped'
      ? t('hosts.state.stopped')
      : t('hosts.state.other');

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Read-only map: nodes are containers, guests sit inside them, services are labels on guests.
 * The layout is automatic and deterministic. The DOM (and so the keyboard focus) order equals the
 * Host view order, which stays the complete equivalent of the map. Panning is the native scroll of
 * the viewport (touch, wheel, scrollbars and keyboard focus), plus mouse drag; nothing animates.
 */
export function HostMap({
  edit,
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
}: Props) {
  const mobile = useIsMobile();
  const [openAnyway, setOpenAnyway] = useState(false);
  const [zoom, setZoom] = useState<number>(ZOOM.default);
  const [selection, setSelection] = useState<Selection>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const moved = useRef(false);
  const model = useMemo(
    () => buildHostView(services, connections, inventories),
    [services, connections, inventories],
  );
  const layout = useMemo(() => layoutMap(model), [model]);
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

  // On phones the map is read-only even when opened anyway.
  const canEdit = Boolean(edit) && !mobile;
  const nameOf = (id: number) => services.find((item) => item.id === id)?.name ?? `#${id}`;
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

  const scrollTo = (left: number, top: number) =>
    viewport.current?.scrollTo({ left, top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const fit = () => {
    const box = viewport.current;
    const next = box ? fitZoom(layout, box.clientWidth, box.clientHeight) : ZOOM.default;
    setZoom(next);
    scrollTo(0, 0);
  };
  const reset = () => {
    setZoom(ZOOM.default);
    scrollTo(0, 0);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = viewport.current;
    if (!box || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button'))
      return;
    moved.current = false;
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const box = viewport.current;
    if (!start || !box) return;
    if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4)
      moved.current = true;
    box.scrollLeft = start.left - (event.clientX - start.x);
    box.scrollTop = start.top - (event.clientY - start.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const selectedService =
    selection?.kind === 'service' ? services.find((item) => item.id === selection.id) : undefined;
  const selectedGuest =
    selection?.kind === 'guest'
      ? layout.containers.flatMap((c) => c.guests).find((g) => g.group.key === selection.key)
      : undefined;

  async function link(service: Service, host: HostLink | null, guestName = '') {
    if (!edit) return;
    const ok = await edit.onLinkHost(service, host);
    setMessage(
      !ok
        ? t('map.linkFailed')
        : host
          ? t('map.linked', { name: service.name, guest: guestName || String(host.vmid) })
          : t('map.unlinked', { name: service.name }),
    );
  }
  async function pick(service: Service, dependsOnId: number) {
    if (!edit) return;
    setPicking(null);
    const failure = await edit.onAddDependency(service.id, dependsOnId);
    setMessage(
      failure ?? t('dependencies.added', { name: service.name, other: nameOf(dependsOnId) }),
    );
  }
  async function unpick(serviceId: number, dependsOnId: number) {
    if (!edit) return;
    const failure = await edit.onRemoveDependency(serviceId, dependsOnId);
    setMessage(
      failure ?? t('dependencies.removed', { name: nameOf(serviceId), other: nameOf(dependsOnId) }),
    );
  }
  const renderService = (item: MapService, parentX = 0, parentY = 0) => {
    const status = describeStatus(statuses[item.service.id], blockedIds.has(item.service.id));
    const selected = selection?.kind === 'service' && selection.id === item.service.id;
    const impact = impactText(impactOf(item.service));
    return (
      <Button
        key={item.service.id}
        type="button"
        variant="outline"
        aria-pressed={selected}
        aria-label={t('map.tile', {
          name: item.service.name,
          status: [status.label, impact].filter(Boolean).join(', '),
        })}
        draggable={canEdit && !item.service.host}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'link';
          event.dataTransfer.setData('text/plain', String(item.service.id));
          setDragging(item.service.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropOver(null);
        }}
        onClick={() => {
          const target = picking !== null ? services.find((s) => s.id === picking) : undefined;
          if (target && target.id !== item.service.id) void pick(target, item.service.id);
          else setSelection({ kind: 'service', id: item.service.id });
        }}
        style={{ left: item.x - parentX, top: item.y - parentY, width: item.w, height: item.h }}
        className={cn(
          'absolute flex items-center justify-between gap-2 px-2 text-left text-xs',
          selected && 'border-primary ring-2 ring-primary',
        )}
      >
        <span className="truncate font-medium">{item.service.name}</span>
        <StatusLight
          state={status.state}
          blocked={status.blocked}
          label={status.label}
          className="shrink-0 text-[0.6875rem]"
        />
      </Button>
    );
  };
  const renderGuest = (guest: MapGuest, guestContainerX: number, guestContainerY: number) => {
    const selected = selection?.kind === 'guest' && selection.key === guest.group.key;
    return (
      <div
        key={guest.group.key}
        role="group"
        aria-label={guest.group.guest.name || String(guest.group.guest.vmid)}
        style={{
          left: guest.x - guestContainerX,
          top: guest.y - guestContainerY,
          width: guest.w,
          height: guest.h,
        }}
        onDragOver={(event) => {
          if (dragging === null || !canEdit) return;
          event.preventDefault();
          setDropOver(guest.group.key);
        }}
        onDragLeave={() => setDropOver((current) => (current === guest.group.key ? null : current))}
        onDrop={(event) => {
          event.preventDefault();
          const service = services.find((item) => item.id === dragging);
          const node = layout.containers.find((c) => c.guests.includes(guest))?.node;
          setDragging(null);
          setDropOver(null);
          if (!service || !node) return;
          void link(
            service,
            {
              connectionId: node.connectionId,
              node: guest.group.guest.node,
              vmid: guest.group.guest.vmid,
              type: guest.group.guest.type,
            },
            guest.group.guest.name,
          );
        }}
        className={cn(
          'absolute rounded-md border bg-muted/40',
          selected && 'ring-2 ring-primary',
          dropOver === guest.group.key && 'border-2 border-dashed border-primary bg-accent',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          aria-pressed={selected}
          onClick={() => setSelection({ kind: 'guest', key: guest.group.key })}
          style={{ height: MAP.guestHeader - 6, width: guest.w - 8 }}
          className="absolute top-1 left-1 flex h-auto flex-col items-start justify-center gap-0.5 rounded-sm px-2 py-0 text-left text-xs pointer-coarse:h-auto"
        >
          <span className="w-full truncate font-semibold">
            {guest.group.guest.name || t(`hosts.type.${guest.group.guest.type}`)}
          </span>
          <span className="w-full truncate font-mono text-[0.6875rem] text-muted-foreground">
            {guest.group.guest.vmid} · {t(`hosts.type.${guest.group.guest.type}`)} ·{' '}
            {guestState(guest.group.guest.status)}
          </span>
        </Button>
        {guest.services.map((item) => renderService(item, guest.x, guest.y))}
      </div>
    );
  };
  const renderContainer = (container: MapContainer) => {
    const offline = container.node?.node.status === 'offline';
    const title = container.node
      ? container.node.node.name
      : container.kind === 'notFound'
        ? t('hosts.view.notFound')
        : container.kind === 'unavailable'
          ? t('hosts.view.unavailable')
          : t('hosts.view.unlinked');
    const count = container.node ? container.node.count : container.services.length;
    return (
      <section
        key={container.id}
        aria-label={title}
        style={{ left: container.x, top: container.y, width: container.w, height: container.h }}
        className={cn(
          'absolute rounded-lg border bg-card',
          offline && 'border-2 border-dashed border-destructive',
          !container.node && 'border-dashed',
        )}
      >
        <h3 className="absolute top-2 left-3 flex w-[calc(100%-1.5rem)] flex-col text-sm font-semibold">
          <span className="truncate">{title}</span>
          <small className="truncate font-normal text-muted-foreground">
            {container.node
              ? `${t(`hosts.node.${container.node.node.status}`)} · ${t('hosts.view.services', { count })}${offline ? ` · ${t('hosts.view.affected', { count })}` : ''}`
              : t('hosts.view.services', { count })}
          </small>
        </h3>
        {container.guests.map((guest) => renderGuest(guest, container.x, container.y))}
        {container.services.map((item) => renderService(item, container.x, container.y))}
      </section>
    );
  };

  const placed = new Map(
    layout.containers
      .flatMap((c) => [...c.guests.flatMap((g) => g.services), ...c.services])
      .map((i) => [i.service.id, i]),
  );
  const edges = dependencies.flatMap((dep) => {
    const from = placed.get(dep.serviceId);
    const to = placed.get(dep.dependsOnId);
    if (!from || !to) return [];
    const right = to.x >= from.x + from.w;
    const x1 = right ? from.x + from.w : from.x;
    const x2 = right ? to.x - 2 : to.x + to.w + 2;
    const y1 = from.y + from.h / 2;
    const y2 = to.y + to.h / 2;
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    const dir = right ? 1 : -1;
    return [
      {
        key: `${dep.serviceId}-${dep.dependsOnId}`,
        d: `M${x1} ${y1} C ${x1 + dir * bend} ${y1}, ${x2 - dir * bend} ${y2}, ${x2} ${y2}`,
        active:
          selection?.kind === 'service' &&
          (selection.id === dep.serviceId || selection.id === dep.dependsOnId),
      },
    ];
  });
  const linked = services.some((service) => service.host);
  const panelRunsOn = (service: Service) => {
    const found = model.nodes
      .flatMap((node) => node.guests.map((group) => ({ node, group })))
      .find((entry) => entry.group.services.some((item) => item.id === service.id));
    return found
      ? `${found.group.guest.name || found.group.guest.vmid} · ${t('hosts.on', { node: found.node.node.name })}`
      : service.host
        ? t('hosts.notFound')
        : t('hosts.none');
  };

  if (!linked)
    return (
      <section aria-label={t('map.title')} className="flex flex-col gap-3">
        <EmptyNote>{t('map.empty')}</EmptyNote>
      </section>
    );

  return (
    <section
      aria-label={t('map.title')}
      data-homora="host-map"
      className="fixed inset-0 z-40 flex flex-col bg-background"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (picking !== null) setPicking(null);
        else setSelection(null);
      }}
    >
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
            {t('map.cluster', { name: connections.map((c) => c.name).join(', ') })}
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
      <p className="border-b bg-card px-4 py-1.5 text-xs text-muted-foreground">
        {canEdit ? t('map.dragHint') : t('map.hint')}
      </p>
      {(picking !== null || message) && (
        <div className="flex flex-col gap-2 border-b bg-card px-3 py-2">
          {picking !== null && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {t('dependencies.picking', { name: nameOf(picking) })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-11"
                  onClick={() => setPicking(null)}
                >
                  {t('dependencies.cancel')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
      <p role="status" className="px-3 text-xs empty:hidden">
        {message}
      </p>
      <div className="relative min-h-0 flex-1">
        <div
          ref={viewport}
          role="region"
          aria-label={t('map.canvas')}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={(event) => {
            // A click on the empty canvas closes the details; a pan or a click on a tile does not.
            if (moved.current) return;
            if ((event.target as HTMLElement).closest('button, a')) return;
            setSelection(null);
          }}
          className="absolute inset-0 cursor-grab overflow-auto bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:22px_22px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex min-h-full w-max min-w-full items-center justify-center p-6 pb-24">
            <div
              style={{ width: layout.width * zoom, height: layout.height * zoom }}
              className="shrink-0"
            >
              <div
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
                className="relative"
              >
                {edges.length > 0 && (
                  <svg
                    aria-hidden="true"
                    width={layout.width}
                    height={layout.height}
                    className="pointer-events-none absolute top-0 left-0 overflow-visible text-primary"
                  >
                    <defs>
                      <marker
                        id="map-arrow"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M1 1 9 5 1 9z" fill="currentColor" />
                      </marker>
                    </defs>
                    {edges.map((edge) => (
                      <path
                        key={edge.key}
                        d={edge.d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={edge.active ? 2.5 : 1.5}
                        strokeOpacity={edge.active ? 1 : 0.55}
                        strokeDasharray="6 5"
                        markerEnd="url(#map-arrow)"
                      />
                    ))}
                  </svg>
                )}
                {layout.containers.map(renderContainer)}
              </div>
            </div>
          </div>
        </div>
        <div
          role="group"
          aria-label={t('map.controls')}
          className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5 shadow-md"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('map.zoomOut')}
            disabled={zoom <= ZOOM.min}
            onClick={() => setZoom((z) => clampZoom(z - ZOOM.step))}
          >
            <Minus />
          </Button>
          <span
            role="status"
            className="min-w-14 px-1 text-center font-mono text-xs tabular-nums text-muted-foreground"
          >
            {t('map.zoomLevel', { percent: Math.round(zoom * 100) })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('map.zoomIn')}
            disabled={zoom >= ZOOM.max}
            onClick={() => setZoom((z) => clampZoom(z + ZOOM.step))}
          >
            <Plus />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={fit}>
            <Scan data-icon="inline-start" />
            {t('map.fit')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw data-icon="inline-start" />
            {t('map.reset')}
          </Button>
        </div>
        {selection && (
          <aside
            aria-label={t('map.panel.title')}
            className="absolute inset-x-3 bottom-20 z-10 flex max-h-[45%] flex-col gap-3 overflow-auto rounded-xl border bg-card p-4 text-sm shadow-lg lg:inset-x-auto lg:top-4 lg:right-4 lg:bottom-auto lg:max-h-[calc(100%-6.5rem)] lg:w-72"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('map.panel.title')}
              </h3>
              {selection && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('map.panel.close')}
                  className="pointer-coarse:size-11"
                  onClick={() => setSelection(null)}
                >
                  <X />
                </Button>
              )}
            </div>
            {selectedService && (
              <ServicePanel
                service={selectedService}
                status={statuses[selectedService.id]}
                blocked={blockedIds.has(selectedService.id)}
                runsOn={panelRunsOn(selectedService)}
                page={pageName?.(selectedService)}
                impact={[impactText(impactOf(selectedService)), notes[selectedService.id]]
                  .filter(Boolean)
                  .join(' · ')}
                dependsOnList={dependsOn(selectedService.id, dependencies).map((id) => ({
                  id,
                  name: nameOf(id),
                }))}
                usedByList={usedBy(selectedService.id, dependencies).map((id) => ({
                  id,
                  name: nameOf(id),
                }))}
                canEdit={canEdit}
                onSelect={(id) => setSelection({ kind: 'service', id })}
                onAddDependency={() => setPicking(selectedService.id)}
                onRemoveDependency={(id) => void unpick(selectedService.id, id)}
                onOpenCard={() => onOpenCard(selectedService)}
                onChangeHost={() => onChangeHost(selectedService)}
                hostEditor={
                  canEdit && edit ? (
                    <HostPicker
                      value={selectedService.host ?? null}
                      onChange={(host) => {
                        const guest = host
                          ? model.nodes
                              .flatMap((node) => node.guests)
                              .find(
                                (group) =>
                                  group.guest.vmid === host.vmid && group.guest.type === host.type,
                              )?.guest.name
                          : '';
                        void link(selectedService, host, guest);
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
            {selectedGuest && (
              <dl className="flex flex-col gap-2">
                <Row label={t('map.panel.guest')}>
                  {selectedGuest.group.guest.name || selectedGuest.group.guest.vmid}
                </Row>
                <Row label={t('map.panel.node')}>{selectedGuest.group.guest.node}</Row>
                <Row label={t('map.panel.status')}>
                  {t(`hosts.type.${selectedGuest.group.guest.type}`)} ·{' '}
                  {guestState(selectedGuest.group.guest.status)}
                </Row>
                <Row label={t('map.panel.services')}>
                  <ul className="flex flex-col gap-1">
                    {selectedGuest.group.services.map((service) => (
                      <li key={service.id}>
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 pointer-coarse:min-h-11"
                          onClick={() => setSelection({ kind: 'service', id: service.id })}
                        >
                          {service.name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Row>
              </dl>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function ServicePanel({
  service,
  status,
  blocked,
  runsOn,
  page,
  impact,
  dependsOnList,
  usedByList,
  canEdit,
  onSelect,
  onAddDependency,
  onRemoveDependency,
  onOpenCard,
  onChangeHost,
  hostEditor,
}: {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  runsOn: string;
  page?: string;
  impact: string;
  dependsOnList: { id: number; name: string }[];
  usedByList: { id: number; name: string }[];
  canEdit: boolean;
  onSelect: (id: number) => void;
  onAddDependency: () => void;
  onRemoveDependency: (id: number) => void;
  onOpenCard: () => void;
  onChangeHost: () => void;
  hostEditor: React.ReactNode;
}) {
  const view = describeStatus(status, blocked);
  const [editingHost, setEditingHost] = useState(false);
  const label = 'text-xs font-medium text-muted-foreground';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-base font-semibold break-words">{service.name}</h4>
          <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
        </div>
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit rounded-sm font-mono text-xs break-all text-muted-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {hostOf(service.url)}
          <span className="sr-only">{t('card.opensNewTab')}</span>
        </a>
      </div>
      {page && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('pages.title')}</span>
          <p className="text-sm break-words">{page}</p>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={label}>{t('map.panel.runsOn')}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs pointer-coarse:min-h-11"
            onClick={() => (hostEditor ? setEditingHost((open) => !open) : onChangeHost())}
          >
            {editingHost ? t('dependencies.cancel') : t('map.panel.changeHost')}
          </Button>
        </div>
        <p className="text-sm break-words">{runsOn}</p>
        {editingHost && hostEditor}
      </div>
      {impact && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('map.panel.affectedBy')}</span>
          <p className="text-sm">{impact}</p>
        </div>
      )}
      {(dependsOnList.length > 0 || canEdit) && (
        <div className="flex flex-col gap-1">
          <span
            className={label}
          >{`${t('dependencies.title')} (${t('dependencies.manual')})`}</span>
          {dependsOnList.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {dependsOnList.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 pointer-coarse:min-h-11"
                    onClick={() => onSelect(item.id)}
                  >
                    {item.name}
                  </Button>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 pointer-coarse:size-11"
                      aria-label={t('dependencies.remove', { name: item.name })}
                      onClick={() => onRemoveDependency(item.id)}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit border-dashed"
              onClick={onAddDependency}
            >
              <Plus data-icon="inline-start" />
              {t('dependencies.add')}
            </Button>
          )}
        </div>
      )}
      {usedByList.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('dependencies.usedBy')}</span>
          <ul className="flex flex-wrap gap-x-3">
            {usedByList.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 pointer-coarse:min-h-11"
                  onClick={() => onSelect(item.id)}
                >
                  {item.name}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onOpenCard}>
        {t('map.panel.openCard')}
      </Button>
    </div>
  );
}
