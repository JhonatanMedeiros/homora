import type { Service } from '@homora/shared';
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
import type { ServiceStatus } from '@/lib/services';
import type { Dependency } from '@/features/hosts/dependencies';
import { describeStatus } from '@/lib/status-text';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

export type HostMapSelection =
  | { kind: 'service'; id: number }
  | { kind: 'guest'; key: string }
  | null;

type Props = {
  layout: MapLayout;
  zoom: number;
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  dependencies: Dependency[];
  selection: HostMapSelection;
  picking: number | null;
  dragging: number | null;
  dropOver: string | null;
  canEdit: boolean;
  impactLabel: (service: Service) => string | null;
  onSelect: (selection: HostMapSelection) => void;
  onPick: (service: Service, dependsOnId: number) => void;
  onLink: (service: Service, host: NonNullable<Service['host']>, guestName: string) => void;
  onDragChange: (id: number | null) => void;
  onDropOver: (key: string) => void;
  onDropLeave: (key: string) => void;
  onDropClear: () => void;
};

type Edge = { key: string; d: string; active: boolean };

export function HostMapDiagram({
  layout,
  zoom,
  services,
  statuses,
  blockedIds,
  dependencies,
  selection,
  picking,
  dragging,
  dropOver,
  canEdit,
  impactLabel,
  onSelect,
  onPick,
  onLink,
  onDragChange,
  onDropOver,
  onDropLeave,
  onDropClear,
}: Props) {
  const guestState = (status: string) =>
    status === 'running'
      ? t('hosts.state.running')
      : status === 'stopped'
        ? t('hosts.state.stopped')
        : t('hosts.state.other');
  const placed = new Map(
    layout.containers
      .flatMap((container) => [
        ...container.guests.flatMap((guest) => guest.services),
        ...container.services,
      ])
      .map((item) => [item.service.id, item]),
  );
  const edges: Edge[] = dependencies.flatMap((dependency) => {
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
      },
    ];
  });

  const renderService = (item: MapService, parentX = 0, parentY = 0) => {
    const status = describeStatus(statuses[item.service.id], blockedIds.has(item.service.id));
    const selected = selection?.kind === 'service' && selection.id === item.service.id;
    const impact = impactLabel(item.service);
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
          onDragChange(item.service.id);
        }}
        onDragEnd={() => {
          onDragChange(null);
          onDropClear();
        }}
        onClick={() => {
          const target =
            picking === null ? undefined : services.find((service) => service.id === picking);
          if (target && target.id !== item.service.id) onPick(target, item.service.id);
          else onSelect({ kind: 'service', id: item.service.id });
        }}
        style={{ left: item.x - parentX, top: item.y - parentY, width: item.w, height: item.h }}
        className={cn(
          'absolute flex items-center justify-between gap-2 px-2 text-left text-xs',
          selected && 'border-primary ring-2 ring-primary',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-sm font-semibold"
          >
            <ServiceIcon icon={item.service.icon} name={item.service.name} />
          </span>
          <span className="truncate font-medium">{item.service.name}</span>
        </span>
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
          onDropOver(guest.group.key);
        }}
        onDragLeave={() => onDropLeave(guest.group.key)}
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
              node: guest.group.guest.node,
              vmid: guest.group.guest.vmid,
              type: guest.group.guest.type,
            },
            guest.group.guest.name,
          );
        }}
        className={cn(
          'absolute rounded-lg border bg-muted/40 shadow-sm',
          selected && 'ring-2 ring-primary',
          dropOver === guest.group.key && 'border-2 border-dashed border-primary bg-accent',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          aria-pressed={selected}
          onClick={() => onSelect({ kind: 'guest', key: guest.group.key })}
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
          'absolute rounded-xl border bg-card shadow-sm',
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
  );
}
