import { useState, type DragEvent } from 'react';
import type { Incident, MonitorSettings, Service, UptimeRange } from '@homora/shared';
import { GroupSection } from '@/components/group-section';
import { OrganizeRow } from '@/components/organize-row';
import { ServiceCard } from '@/components/service-card';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import type { CardResource } from '@/hooks/use-resource-links';
import type { useServices } from '@/hooks/use-services';
import type { HostLabel, Impact } from '@/lib/hosts';
import type { ServiceStatus } from '@/lib/services';
import type { UptimeSummary } from '@homora/shared';

type Group = { category: string; items: Service[] };
type ServicesData = ReturnType<typeof useServices>;

type GroupData = {
  groups: Group[];
  services: Service[];
  groupRows: ServicesData['groupRows'];
  pages: ServicesData['pages'];
  allCategories: string[];
  pageIdOf: (category: string) => number;
  sortedIn: ServicesData['sortedIn'];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  widgets: Record<number, CardWidgetState[]>;
  resourceLink: Record<number, CardResource>;
  uptime: Record<number, UptimeSummary>;
  uptimeRange: UptimeRange;
  /** Alert settings, the incident each service is in, maintenance windows and tags (all optional). */
  monitorSettings?: Record<number, MonitorSettings>;
  incidents?: Record<number, Incident>;
  maintenanceUntil?: Record<number, number>;
  tags?: Record<number, string[]>;
  impacts: Map<number, Impact>;
  dependencyNotes: Record<number, string>;
};

type GroupPresentation = {
  organizing: boolean;
  list: boolean;
  compact?: boolean;
  /** Groups with nothing wrong start collapsed ('Collapse healthy groups'). */
  collapseHealthy?: boolean;
  /** Services of a group that are down; healthy groups have none. */
  isDown?: (service: Service) => boolean;
  showDescriptions: boolean;
  revealServiceId?: number;
  revealNonce?: number;
  confirming: number | null;
};

type GroupActions = {
  onUptimeRangeChange: (range: UptimeRange) => void;
  onTag?: (tag: string) => void;
  hostOf: (service: Service) => HostLabel | null;
  onEditService: (service: Service) => void;
  /** Opens the details drawer; absent in management. */
  onDetails?: (service: Service) => void;
  onRemoveService: (service: Service) => void;
  onCancelRemoval: (serviceId: number) => void;
  onResource: (serviceId: number) => void;
  onPlaceService: (service: Service, position: number, total: number) => void;
  onMoveServiceToGroup: (service: Service, group: string) => void;
  onMoveGroup: (category: string, direction: -1 | 1) => void;
  onMoveGroupToPage: (group: ServicesData['groupRows'][number], pageId: number) => void;
  onSetGroupColumns: (group: ServicesData['groupRows'][number], columns: number | null) => void;
  onRenameGroup: (group: ServicesData['groupRows'][number]) => void;
  onRemoveGroup: (group: ServicesData['groupRows'][number]) => void;
};

type Props = { data: GroupData; presentation: GroupPresentation; actions: GroupActions };

/** Renders service groups and their cards or organization rows. State for drag/drop stays local. */
export function ServiceGroups({ data, presentation, actions }: Props) {
  const {
    groups,
    services,
    groupRows,
    pages,
    allCategories,
    pageIdOf,
    sortedIn,
    statuses,
    blockedIds,
    widgets,
    resourceLink,
    uptime,
    uptimeRange,
    monitorSettings,
    incidents,
    maintenanceUntil,
    tags,
    impacts,
    dependencyNotes,
  } = data;
  const {
    organizing,
    list,
    compact = false,
    collapseHealthy = false,
    isDown,
    showDescriptions,
    revealServiceId,
    revealNonce,
    confirming,
  } = presentation;
  const {
    onUptimeRangeChange,
    onTag,
    hostOf,
    onEditService,
    onDetails,
    onRemoveService,
    onCancelRemoval,
    onResource,
    onPlaceService,
    onMoveServiceToGroup,
    onMoveGroup,
    onMoveGroupToPage,
    onSetGroupColumns,
    onRenameGroup,
    onRemoveGroup,
  } = actions;
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);

  return groups.map(({ category, items }) => {
    const row = groupRows.find((group) => group.name === category);
    return (
      <GroupSection
        key={category}
        category={category}
        count={items.length}
        organizing={organizing}
        list={list}
        compact={compact}
        autoCollapse={collapseHealthy && !!isDown && !items.some(isDown)}
        revealSignal={
          revealServiceId !== undefined && items.some((item) => item.id === revealServiceId)
            ? revealNonce
            : undefined
        }
        pages={pages}
        pageId={row?.pageId}
        onPage={(pageId) => row && onMoveGroupToPage(row, pageId)}
        canEdit={Boolean(row)}
        canRemove={!services.some((service) => service.category === category)}
        groupId={row?.id}
        columns={row?.columns}
        onColumns={(columns) => row && onSetGroupColumns(row, columns)}
        onRename={() => row && onRenameGroup(row)}
        onRemove={() => row && onRemoveGroup(row)}
        emptyDrop={{
          active: dragging !== null,
          over: dropGroup === category,
          onOver: () => setDropGroup(category),
          onLeave: () => setDropGroup((current) => (current === category ? null : current)),
          onDrop: () => {
            const dragged = services.find((item) => item.id === dragging);
            setDragging(null);
            setDropGroup(null);
            if (dragged && dragged.category !== category) onMoveServiceToGroup(dragged, category);
          },
        }}
        onMove={(direction) => onMoveGroup(category, direction)}
      >
        {items.map((service, index) => {
          if (organizing) {
            const dragProps = {
              onDragStart: (event: DragEvent) => {
                setDragging(service.id);
                event.dataTransfer.effectAllowed = 'move';
              },
              onDragEnd: () => {
                setDragging(null);
                setDropOver(null);
                setDropGroup(null);
              },
              onDragOver: (event: DragEvent) => {
                if (dragging !== null && dragging !== service.id) {
                  event.preventDefault();
                  setDropOver(service.id);
                }
              },
              onDrop: (event: DragEvent) => {
                event.preventDefault();
                const dragged = services.find((item) => item.id === dragging);
                setDragging(null);
                setDropOver(null);
                if (!dragged) return;
                if (dragged.category !== service.category) {
                  onMoveServiceToGroup(dragged, service.category);
                  return;
                }
                onPlaceService(
                  dragged,
                  sortedIn(service.category).findIndex((item) => item.id === service.id),
                  items.length,
                );
              },
            };
            return (
              <OrganizeRow
                key={service.id}
                service={service}
                otherGroups={allCategories.filter((name) => name !== service.category)}
                pageLabel={(name) =>
                  pages.length > 1
                    ? pages.find((page) => page.id === pageIdOf(name))?.name
                    : undefined
                }
                first={index === 0}
                last={index === items.length - 1}
                dragging={dragging === service.id}
                dropTarget={dropOver === service.id}
                onMove={(direction) => onPlaceService(service, index + direction, items.length)}
                onMoveToTop={() => onPlaceService(service, 0, items.length)}
                onMoveToGroup={(group) => onMoveServiceToGroup(service, group)}
                onEdit={() => onEditService(service)}
                confirmingRemoval={confirming === service.id}
                onRemove={() => onRemoveService(service)}
                onCancelRemoval={() => onCancelRemoval(service.id)}
                dragProps={dragProps}
              />
            );
          }
          return (
            <ServiceCard
              key={service.id}
              service={service}
              status={statuses[service.id]}
              widgets={widgets[service.id]}
              resourceLink={resourceLink[service.id]}
              onResource={() => onResource(service.id)}
              uptime={uptime[service.id]}
              monitor={monitorSettings?.[service.id]}
              incident={incidents?.[service.id]}
              maintenanceUntil={maintenanceUntil?.[service.id]}
              tags={tags?.[service.id]}
              onTag={onTag}
              uptimeRange={uptimeRange}
              onUptimeRangeChange={onUptimeRangeChange}
              host={hostOf(service)}
              impact={impacts.get(service.id)}
              dependencyNote={dependencyNotes[service.id]}
              blocked={blockedIds.has(service.id)}
              list={list}
              compact={compact}
              showDescription={showDescriptions}
              onDetails={onDetails ? () => onDetails(service) : undefined}
              onEdit={() => onEditService(service)}
            />
          );
        })}
      </GroupSection>
    );
  });
}
