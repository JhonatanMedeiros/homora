import { useEffect, useMemo, useState } from 'react';
import type { Service } from '@homora/shared';
import { Minus, Plus, RotateCcw, Scan } from 'lucide-react';
import { HostPicker } from '@/components/host-picker';
import { dependsOn, usedBy, type Dependency } from '@/lib/dependencies';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyNote } from '@/components/empty-note';
import { HostMapDiagram } from '@/components/host-map-diagram';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  buildHostView,
  serviceImpact,
  type HostConnection,
  type HostInventories,
  type Impact,
} from '@/lib/hosts';
import { ZOOM, clampZoom, layoutMap } from '@/lib/map-layout';
import type { ServiceStatus } from '@/lib/services';
import { HostMapSelectionPanel } from '@/components/host-map-selection-panel';
import { HostMapHeader } from '@/components/host-map-header';
import { useHostMapViewport } from '@/hooks/use-host-map-viewport';
import { useHostMapEditing, type MapEdit } from '@/hooks/use-host-map-editing';
import { t } from '@/i18n';

export type { MapEdit } from '@/hooks/use-host-map-editing';

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
  const [selection, setSelection] = useState<Selection>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const model = useMemo(
    () => buildHostView(services, connections, inventories),
    [services, connections, inventories],
  );
  const editing = useHostMapEditing({ edit, services, model });
  const layout = useMemo(() => layoutMap(model), [model]);
  const { viewport, moved, zoom, setZoom, fit, reset, onPointerDown, onPointerMove, endDrag } =
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

  const selectedService =
    selection?.kind === 'service' ? services.find((item) => item.id === selection.id) : undefined;
  const selectedGuest =
    selection?.kind === 'guest'
      ? layout.containers.flatMap((c) => c.guests).find((g) => g.group.key === selection.key)
      : undefined;

  const linked = services.some((service) => service.host);

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
        if (editing.picking !== null) editing.setPicking(null);
        else setSelection(null);
      }}
    >
      <HostMapHeader
        connections={connections}
        onHome={onHome}
        onRefresh={onRefresh}
        onListView={onListView}
      />
      <p className="border-b bg-card px-4 py-1.5 text-xs text-muted-foreground">
        {canEdit ? t('map.dragHint') : t('map.hint')}
      </p>
      {(editing.picking !== null || editing.message) && (
        <div className="flex flex-col gap-2 border-b bg-card px-3 py-2">
          {editing.picking !== null && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {t('dependencies.picking', { name: editing.nameOf(editing.picking) })}
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
            <HostMapDiagram
              layout={layout}
              zoom={zoom}
              services={services}
              statuses={statuses}
              blockedIds={blockedIds}
              dependencies={dependencies}
              selection={selection}
              picking={editing.picking}
              dragging={dragging}
              dropOver={dropOver}
              canEdit={canEdit}
              impactLabel={(service) => impactText(impactOf(service))}
              onSelect={setSelection}
              onPick={(service, dependsOnId) => void editing.pick(service, dependsOnId)}
              onLink={(service, host, guestName) => void editing.link(service, host, guestName)}
              onDragChange={setDragging}
              onDropOver={setDropOver}
              onDropLeave={(key) => setDropOver((current) => (current === key ? null : current))}
              onDropClear={() => setDropOver(null)}
            />
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
          <HostMapSelectionPanel
            service={
              selectedService
                ? {
                    service: selectedService,
                    status: statuses[selectedService.id],
                    blocked: blockedIds.has(selectedService.id),
                    runsOn: editing.panelRunsOn(selectedService),
                    page: pageName?.(selectedService),
                    impact: [impactText(impactOf(selectedService)), notes[selectedService.id]]
                      .filter(Boolean)
                      .join(' · '),
                    dependsOnList: dependsOn(selectedService.id, dependencies).map((id) => ({
                      id,
                      name: editing.nameOf(id),
                    })),
                    usedByList: usedBy(selectedService.id, dependencies).map((id) => ({
                      id,
                      name: editing.nameOf(id),
                    })),
                  }
                : undefined
            }
            guest={selectedGuest}
            onClose={() => setSelection(null)}
            onSelectService={(id) => setSelection({ kind: 'service', id })}
            onAddDependency={() => selectedService && editing.setPicking(selectedService.id)}
            onRemoveDependency={(id) =>
              selectedService && void editing.unpick(selectedService.id, id)
            }
            onOpenCard={() => selectedService && onOpenCard(selectedService)}
            onChangeHost={() => selectedService && onChangeHost(selectedService)}
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
