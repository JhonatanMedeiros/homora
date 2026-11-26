import { HostAddress } from '@/components/host-address';
import type { ReactNode } from 'react';
import type { Service } from '@homora/shared';
import { ChevronDown, ChevronRight, Container, Server } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import {
  MAP,
  type MapContainer,
  type MapGuest,
  type MapLayout,
  type MapService,
} from '@/features/hosts/map-layout';
import type { MapView } from '@/features/hosts/host-map-filter';
import {
  guestSummary,
  nodeSummary,
  countHealth,
  type Health,
  type HealthOf,
} from '@/features/hosts/host-health';
import { HealthSummary, LoadMeters, NodeStateBadge } from '@/features/hosts/host-map-parts';
import type { Dependency } from '@/features/hosts/dependencies';
import type { ServiceStatus } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

export type HostMapSelection =
  | { kind: 'service'; id: number }
  | { kind: 'guest'; key: string }
  | null;

/** What a loose tile shows under its name: the suggested guest, else the guest it runs on. */
export type TileNote = { text: string; tone?: 'suggestion' };

type Props = {
  layout: MapLayout;
  zoom: number;
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  dependencies: Dependency[];
  healthOf: HealthOf;
  view: MapView;
  showConnections: boolean;
  selection: HostMapSelection;
  picking: number | null;
  dragging: number | null;
  dropOver: string | null;
  canEdit: boolean;
  /** Second line of a tile outside a guest. */
  noteOf: (service: Service) => TileNote | null;
  /** Controls drawn in the header of a container (for example "Find matches"). */
  containerActions: (container: MapContainer) => ReactNode;
  impactLabel: (service: Service) => string | null;
  onSelect: (selection: HostMapSelection) => void;
  onPick: (service: Service, dependsOnId: number) => void;
  onLink: (service: Service, host: NonNullable<Service['host']>, guestName: string) => void;
  onMarkExternal: (service: Service) => void;
  onToggleGuest: (key: string, collapsed: boolean) => void;
  onDragChange: (id: number | null) => void;
  onDropOver: (key: string) => void;
  onDropLeave: (key: string) => void;
  onDropClear: () => void;
};

type Edge = { key: string; d: string; active: boolean; broken: boolean };

const guestState = (status: string) =>
  status === 'running'
    ? t('hosts.state.running')
    : status === 'stopped'
      ? t('hosts.state.stopped')
      : t('hosts.state.other');

export function HostMapDiagram({
  layout,
  zoom,
  services,
  statuses,
  blockedIds,
  dependencies,
  healthOf,
  view,
  showConnections,
  selection,
  picking,
  dragging,
  dropOver,
  canEdit,
  noteOf,
  containerActions,
  impactLabel,
  onSelect,
  onPick,
  onLink,
  onMarkExternal,
  onToggleGuest,
  onDragChange,
  onDropOver,
  onDropLeave,
  onDropClear,
}: Props) {
  const placed = new Map(
    layout.containers
      .flatMap((container) => [
        ...container.guests.flatMap((guest) => guest.services),
        ...container.services,
      ])
      .map((item) => [item.service.id, item]),
  );
  const edges: Edge[] = showConnections
    ? dependencies.flatMap((dependency) => {
        const from = placed.get(dependency.serviceId);
        const to = placed.get(dependency.dependsOnId);
        if (!from || !to) return [];
        const right = to.x >= from.x + from.w;
        const x1 = right ? from.x + from.w : from.x;
        const x2 = right ? to.x - 2 : to.x + to.w + 2;
        const y1 = from.y + from.h / 2;
        const y2 = to.y + to.h / 2;
        const bend = Math.max(40, Math.abs(x2 - x1) / 2);
        const direction = right ? 1 : -1;
        return [
          {
            key: `${dependency.serviceId}-${dependency.dependsOnId}`,
            d: `M${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`,
            active:
              selection?.kind === 'service' &&
              (selection.id === dependency.serviceId || selection.id === dependency.dependsOnId),
            // The arrow points at what the service needs: red when that is down.
            broken: healthOf(to.service) === 'down',
          },
        ];
      })
    : [];

  const renderService = (item: MapService, parentX = 0, parentY = 0, loose = false) => {
    const { service } = item;
    const status = describeStatus(statuses[service.id], blockedIds.has(service.id));
    const selected = selection?.kind === 'service' && selection.id === service.id;
    const impact = impactLabel(service);
    const health: Health = healthOf(service);
    const dimmed = view.dimmedServices.has(service.id);
    const found = view.matches?.has(service.id) ?? false;
    const note = loose ? noteOf(service) : null;
    const latency = statuses[service.id]?.latencyMs;
    const healthy = health === 'ok' && status.state !== 'maintenance';
    return (
      <Button
        key={service.id}
        type="button"
        variant="outline"
        aria-pressed={selected}
        aria-label={t('map.tile', {
          name: service.name,
          status: [status.label, impact].filter(Boolean).join(', '),
        })}
        draggable={canEdit && !service.host}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'link';
          event.dataTransfer.setData('text/plain', String(service.id));
          onDragChange(service.id);
        }}
        onDragEnd={() => {
          onDragChange(null);
          onDropClear();
        }}
        onClick={() => {
          const target = picking === null ? undefined : services.find((s) => s.id === picking);
          if (target && target.id !== service.id) onPick(target, service.id);
          else onSelect({ kind: 'service', id: service.id });
        }}
        style={{
          left: item.x - parentX,
          top: item.y - parentY,
          width: item.w,
          height: item.h,
        }}
        className={cn(
          'absolute z-20 flex items-center justify-between gap-2 px-2 text-left text-xs',
          selected && 'border-primary ring-2 ring-primary',
          found && !selected && 'border-primary',
          dimmed && 'border-dashed bg-transparent text-muted-foreground',
          !healthy && !dimmed && health === 'down' && 'border-destructive/60',
          !healthy && !dimmed && health === 'degraded' && 'border-warning/60',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-sm font-semibold"
          >
            <ServiceIcon icon={service.icon} name={service.name} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium" title={service.name}>
              {service.name}
            </span>
            {note &&
              (note.tone === 'suggestion' ? (
                <span
                  className="truncate text-[0.6875rem] font-normal text-accent-text"
                  title={note.text}
                >
                  {note.text}
                </span>
              ) : (
                <HostAddress url={service.url} className="text-[0.6875rem] font-normal" />
              ))}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {healthy && !loose && typeof latency === 'number' && (
            <span className="font-mono text-[0.6875rem] font-normal text-muted-foreground tabular-nums">
              {Math.round(latency)} ms
            </span>
          )}
          <StatusLight
            state={status.state}
            blocked={status.blocked}
            label={status.label}
            className="shrink-0 text-[0.6875rem]"
          />
        </span>
      </Button>
    );
  };

  const renderGuest = (guest: MapGuest, containerX: number, containerY: number) => {
    const { group } = guest;
    const selected = selection?.kind === 'guest' && selection.key === group.key;
    const summary = guestSummary(group, healthOf);
    const dimmed = view.dimmedGuests.has(group.key);
    const name = group.guest.name || t(`hosts.type.${group.guest.type}`);
    const TypeIcon = group.guest.type === 'qemu' ? Server : Container;
    return (
      <div
        key={group.key}
        role="group"
        aria-label={group.guest.name || String(group.guest.vmid)}
        style={{
          left: guest.x - containerX,
          top: guest.y - containerY,
          width: guest.w,
          height: guest.h,
        }}
        onDragOver={(event) => {
          if (dragging === null || !canEdit) return;
          event.preventDefault();
          onDropOver(group.key);
        }}
        onDragLeave={() => onDropLeave(group.key)}
        onDrop={(event) => {
          event.preventDefault();
          const service = services.find((item) => item.id === dragging);
          const node = layout.containers.find((container) =>
            container.guests.includes(guest),
          )?.node;
          onDragChange(null);
          onDropClear();
          if (!service || !node) return;
          onLink(
            service,
            {
              connectionId: node.connectionId,
              node: group.guest.node,
              vmid: group.guest.vmid,
              type: group.guest.type,
            },
            group.guest.name,
          );
        }}
        className={cn(
          'absolute rounded-lg border bg-muted/40',
          summary.problem && !dimmed && 'border-warning/70',
          dimmed && 'border-dashed bg-transparent',
          selected && 'ring-2 ring-primary',
          dropOver === group.key && 'border-2 border-dashed border-primary bg-accent',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          aria-pressed={selected}
          onClick={() => onSelect({ kind: 'guest', key: group.key })}
          style={{ height: MAP.guestHeader - 6, width: guest.w - 40 }}
          className="absolute top-1 left-1 z-20 flex h-auto flex-col items-start justify-center gap-1 rounded-sm px-2 py-0 text-left text-xs pointer-coarse:h-auto"
        >
          <span
            className={cn(
              'flex w-full items-center gap-1.5 font-semibold',
              dimmed && 'text-muted-foreground',
            )}
          >
            <TypeIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
            {summary.counts.total > 0 && summary.problem && (
              <span className="shrink-0 rounded-full bg-warning px-1.5 py-px text-[0.625rem] font-semibold text-warning-foreground">
                {t('map.guest.online', {
                  online: summary.counts.ok,
                  total: summary.counts.total,
                })}
              </span>
            )}
          </span>
          <span className="w-full truncate font-mono text-[0.6875rem] font-normal text-muted-foreground">
            {group.guest.vmid} · {t(`hosts.type.${group.guest.type}`)} ·{' '}
            {guestState(group.guest.status)}
          </span>
          {guest.collapsed ? (
            <HealthSummary
              counts={summary.counts}
              className="w-full text-[0.6875rem] font-normal text-muted-foreground"
            />
          ) : (
            <LoadMeters metrics={group.guest.metrics} className="w-full font-normal" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={!guest.collapsed}
          aria-label={t(guest.collapsed ? 'map.guest.expand' : 'map.guest.collapse', { name })}
          className="absolute top-1.5 right-1 z-20 size-7 pointer-coarse:size-11"
          onClick={() => onToggleGuest(group.key, !guest.collapsed)}
        >
          {guest.collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        {guest.services.map((item) => renderService(item, guest.x, guest.y))}
      </div>
    );
  };

  const renderContainer = (container: MapContainer) => {
    const { node } = container;
    const offline = node?.node.status === 'offline';
    const title = node
      ? node.node.name
      : container.kind === 'group'
        ? (container.title ?? '')
        : t(
            container.kind === 'notFound'
              ? 'hosts.view.notFound'
              : container.kind === 'unavailable'
                ? 'hosts.view.unavailable'
                : container.kind === 'external'
                  ? 'hosts.view.external'
                  : 'hosts.view.unlinked',
          );
    const counts = node
      ? nodeSummary(node, healthOf).counts
      : countHealth(
          container.services.map((item) => item.service),
          healthOf,
        );
    const dimmed = node
      ? view.dimmedNodes.has(node.key)
      : view.dimmedContainers.has(container.id) ||
        (container.kind === 'group' &&
          container.services.every((item) => view.dimmedServices.has(item.service.id)) &&
          container.services.length > 0);
    const droppable = container.kind === 'external' && canEdit && dragging !== null;
    const actions = containerActions(container);
    return (
      <section
        key={container.id}
        aria-label={title}
        style={{
          left: container.x,
          top: container.y,
          width: container.w,
          height: container.h,
        }}
        onDragOver={(event) => {
          if (!droppable) return;
          event.preventDefault();
          onDropOver(container.id);
        }}
        onDragLeave={() => onDropLeave(container.id)}
        onDrop={(event) => {
          if (!droppable) return;
          event.preventDefault();
          const service = services.find((item) => item.id === dragging);
          onDragChange(null);
          onDropClear();
          if (service) onMarkExternal(service);
        }}
        className={cn(
          'absolute rounded-xl border bg-card',
          offline && 'border-2 border-dashed border-destructive',
          !node && 'border-dashed',
          dimmed && 'bg-transparent text-muted-foreground',
          dropOver === container.id && 'border-2 border-primary bg-accent',
        )}
      >
        <div
          style={{ height: MAP.nodeHeader }}
          className="absolute inset-x-3 top-0 flex items-center justify-between gap-3"
        >
          <h3 className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <span className="truncate">{title}</span>
              {node && <NodeStateBadge state={nodeSummary(node, healthOf).state} />}
            </span>
            <small className="flex items-center gap-1 truncate text-xs font-normal text-muted-foreground">
              <span className="shrink-0">
                {node
                  ? `${t('map.node.guests', { count: node.guests.length })} · ${t('hosts.view.services', { count: node.count })}`
                  : t('hosts.view.services', {
                      count: container.services.length,
                    })}
              </span>
              {offline ? (
                <span className="truncate text-destructive">
                  {' · '}
                  {t('hosts.view.affected', { count: node.count })}
                </span>
              ) : (
                counts.total > 0 &&
                (node || container.kind === 'group') && (
                  <>
                    {' · '}
                    <HealthSummary counts={counts} />
                  </>
                )
              )}
            </small>
          </h3>
          {node ? <LoadMeters metrics={node.node.metrics} disk className="justify-end" /> : actions}
        </div>
        {container.guests.map((guest) => renderGuest(guest, container.x, container.y))}
        {container.services.map((item) => renderService(item, container.x, container.y, true))}
      </section>
    );
  };

  return (
    <div style={{ width: layout.width * zoom, height: layout.height * zoom }} className="shrink-0">
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
            className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible text-accent-text"
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
                className={edge.broken ? 'text-destructive' : undefined}
              />
            ))}
          </svg>
        )}
        {layout.containers.map(renderContainer)}
      </div>
    </div>
  );
}
