import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { HostLink, Service } from '@homora/shared';
import { Minus, Plus, RefreshCw, X } from 'lucide-react';
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
  services: Service[];
  connections: HostConnection[];
  inventories: HostInventories;
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onRefresh: () => void;
  onListView: () => void;
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
  onOpenCard,
  onChangeHost,
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
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const box = viewport.current;
    if (!start || !box) return;
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
  const renderService = (item: MapService) => {
    const status = describeStatus(statuses[item.service.id], blockedIds.has(item.service.id));
    const selected = selection?.kind === 'service' && selection.id === item.service.id;
    const impact = impactText(impactOf(item.service));
    return (
      <button
        key={item.service.id}
        type="button"
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
        style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
        className={cn(
          'absolute flex items-center justify-between gap-2 rounded-md border bg-card px-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
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
      </button>
    );
  };
  const renderGuest = (guest: MapGuest) => {
    const selected = selection?.kind === 'guest' && selection.key === guest.group.key;
    return (
      <div
        key={guest.group.key}
        role="group"
        aria-label={guest.group.guest.name || String(guest.group.guest.vmid)}
        style={{ left: guest.x, top: guest.y, width: guest.w, height: guest.h }}
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
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => setSelection({ kind: 'guest', key: guest.group.key })}
          style={{ height: MAP.guestHeader - 6, width: guest.w - 8 }}
          className="absolute top-1 left-1 flex flex-col items-start justify-center rounded-sm px-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="w-full truncate font-semibold">
            {guest.group.guest.name || t(`hosts.type.${guest.group.guest.type}`)}
          </span>
          <span className="w-full truncate font-mono text-[0.6875rem] text-muted-foreground">
            {guest.group.guest.vmid} · {t(`hosts.type.${guest.group.guest.type}`)} ·{' '}
            {guestState(guest.group.guest.status)}
          </span>
        </button>
        {guest.services.map(renderService)}
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
        {container.guests.map(renderGuest)}
        {container.services.map(renderService)}
      </section>
    );
  };

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

  return (
    <section
      aria-label={t('map.title')}
      className="flex flex-col gap-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setPicking(null);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('map.zoomOut')}
          disabled={zoom <= ZOOM.min}
          className="pointer-coarse:size-11"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM.step))}
        >
          <Minus />
        </Button>
        <span role="status" className="min-w-16 text-center font-mono text-sm tabular-nums">
          {t('map.zoomLevel', { percent: Math.round(zoom * 100) })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('map.zoomIn')}
          disabled={zoom >= ZOOM.max}
          className="pointer-coarse:size-11"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM.step))}
        >
          <Plus />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={fit}
        >
          {t('map.fit')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={reset}
        >
          {t('map.reset')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={onRefresh}
        >
          <RefreshCw />
          {t('map.refresh')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="ml-auto pointer-coarse:min-h-11"
          onClick={onListView}
        >
          {t('map.listView')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('map.hint')}</p>
      {canEdit && <p className="text-xs text-muted-foreground">{t('map.dragHint')}</p>}
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
      <p role="status" className="min-h-4 text-xs empty:hidden">
        {message}
      </p>
      {!linked ? (
        <EmptyNote>{t('map.empty')}</EmptyNote>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div
            ref={viewport}
            role="region"
            aria-label={t('map.canvas')}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="h-[70dvh] cursor-grab overflow-auto rounded-lg border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div style={{ width: layout.width * zoom + 24, height: layout.height * zoom + 24 }}>
              <div
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                  margin: 12,
                }}
                className="relative"
              >
                {layout.containers.map(renderContainer)}
              </div>
            </div>
          </div>
          <aside
            aria-label={t('map.panel.title')}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{t('map.panel.title')}</h3>
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
            {!selection && <p className="text-muted-foreground">{t('map.panel.none')}</p>}
            {selectedService && (
              <ServicePanel
                service={selectedService}
                status={statuses[selectedService.id]}
                blocked={blockedIds.has(selectedService.id)}
                runsOn={panelRunsOn(selectedService)}
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
        </div>
      )}
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
  return (
    <>
      <dl className="flex flex-col gap-2">
        <Row label={t('map.panel.service')}>{service.name}</Row>
        <Row label={t('map.panel.url')}>
          <a
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm font-mono text-xs underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {hostOf(service.url)}
            <span className="sr-only">{t('card.opensNewTab')}</span>
          </a>
        </Row>
        <Row label={t('map.panel.status')}>
          <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
        </Row>
        <Row label={t('map.panel.runsOn')}>{runsOn}</Row>
        <Row label={t('map.panel.affectedBy')}>{impact || t('map.panel.nothingAffects')}</Row>
        <Row label={`${t('dependencies.title')} (${t('dependencies.manual')})`}>
          {dependsOnList.length === 0 ? (
            t('dependencies.none')
          ) : (
            <ul className="flex flex-col gap-1">
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
                      className="pointer-coarse:size-11"
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
        </Row>
        <Row label={t('dependencies.usedBy')}>
          {usedByList.length === 0 ? (
            t('dependencies.usedByNone')
          ) : (
            <ul className="flex flex-col gap-1">
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
          )}
        </Row>
      </dl>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="pointer-coarse:h-11"
          onClick={onOpenCard}
        >
          {t('map.panel.openCard')}
        </Button>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:h-11"
            onClick={onAddDependency}
          >
            {t('dependencies.add')}
          </Button>
        )}
        {hostEditor ?? (
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:h-11"
            onClick={onChangeHost}
          >
            {t('map.panel.changeHost')}
          </Button>
        )}
      </div>
    </>
  );
}
