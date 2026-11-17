import { PROBE_DOT } from '@/lib/probe-dot';
import { PanelRight, Star } from 'lucide-react';
import type { HostRailItem } from '@/features/hosts/hosts';
import type { LightState } from '@/lib/services';
import { Button } from '@homora/ui/button';
import { STATUS_FILTERS, type StatusFilter } from '@/features/dashboard/status-filter-model';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

type Group = { name: string; total: number; down: number };
/** A monitor without a card: shown by name and state, and opens the probes screen. */
export type RailProbe = { id: number; name: string; state: LightState; label: string };

type Props = {
  statusFilter: StatusFilter;
  counts: Record<StatusFilter, number>;
  onStatusFilter: (filter: StatusFilter) => void;
  groups: Group[];
  selectedGroup: string | null;
  onSelectGroup: (name: string | null) => void;
  /** Favorites: shown only when something is pinned, or while the view is on. */
  favorites: { count: number; active: boolean; onToggle: () => void };
  /** Proxmox nodes that run cards, under the groups; hidden when there are none. */
  hosts?: { items: HostRailItem[]; onSelect: (item: HostRailItem) => void };
  /** Probes to list under the groups; hidden when there are none. */
  probes?: { items: RailProbe[]; onOpen: () => void };
  widgetRail: boolean;
  onToggleWidgetRail: () => void;
};

const DOT: Record<StatusFilter, string | null> = {
  all: null,
  down: 'bg-destructive',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
};

const ITEM =
  'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground';

/**
 * Left rail of the wide Home: the views (the same four status filters, with the same counts) and
 * the groups with their health. Narrow screens keep the chips and the options sheet instead.
 */
export function HomeRail({
  statusFilter,
  counts,
  onStatusFilter,
  groups,
  selectedGroup,
  onSelectGroup,
  favorites,
  hosts,
  probes,
  widgetRail,
  onToggleWidgetRail,
}: Props) {
  return (
    <nav aria-label={t('rail.label')} className="flex flex-col gap-5 text-sm">
      <section aria-label={t('filter.byStatus')} className="flex flex-col gap-0.5">
        <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{t('rail.views')}</h2>
        {STATUS_FILTERS.map((filter) => {
          const on = statusFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={on}
              onClick={() => onStatusFilter(filter)}
              className={cn(
                ITEM,
                on ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                counts[filter] === 0 && filter !== 'all' && !on && 'opacity-60',
              )}
            >
              <span className="flex items-center gap-2">
                {DOT[filter] && (
                  <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[filter])} />
                )}
                {t(`filter.status.${filter}`)}
              </span>
              <span className="font-mono text-xs tabular-nums">{counts[filter]}</span>
            </button>
          );
        })}
        {(favorites.count > 0 || favorites.active) && (
          <button
            type="button"
            aria-pressed={favorites.active}
            onClick={favorites.onToggle}
            className={cn(
              ITEM,
              favorites.active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="flex items-center gap-2">
              <Star aria-hidden="true" className="size-3.5" />
              {t('rail.favorites')}
            </span>
            <span className="font-mono text-xs tabular-nums">{favorites.count}</span>
          </button>
        )}
      </section>
      {groups.length > 1 && (
        <section aria-label={t('filter.byCategory')} className="flex flex-col gap-0.5">
          <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {t('rail.groups')}
          </h2>
          {[null, ...groups].map((group) => {
            const name = group?.name ?? null;
            const on = selectedGroup === name;
            return (
              <button
                key={name ?? '__all__'}
                type="button"
                aria-pressed={on}
                onClick={() => onSelectGroup(name)}
                className={cn(
                  ITEM,
                  on ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                <span className="truncate">{name ?? t('filter.all')}</span>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
                  {group && group.down > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <span aria-hidden="true" className="size-2 rounded-full bg-destructive" />
                      <span className="sr-only">{t('filter.status.down')}</span>
                      {group.down}
                    </span>
                  )}
                  {group ? group.total : groups.reduce((sum, item) => sum + item.total, 0)}
                </span>
              </button>
            );
          })}
        </section>
      )}
      {hosts && hosts.items.length > 0 && (
        <section aria-label={t('rail.hosts')} className="flex flex-col gap-0.5">
          <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {t('rail.hosts')}
          </h2>
          {hosts.items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => hosts.onSelect(item)}
              className={cn(ITEM, 'text-muted-foreground')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    item.state === 'online' && 'bg-success',
                    item.state === 'offline' && 'bg-destructive',
                    item.state === 'unknown' && 'border border-muted-foreground',
                  )}
                />
                <span className="truncate">{item.node}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums">
                {item.state === 'offline' && (
                  <span className="text-destructive">{t('filter.status.down')}</span>
                )}
                {item.down > 0 && item.state !== 'offline' && (
                  <span className="text-destructive">{item.down}</span>
                )}
                {item.total}
              </span>
            </button>
          ))}
        </section>
      )}
      {probes && probes.items.length > 0 && (
        <section aria-label={t('rail.probes')} className="flex flex-col gap-0.5">
          <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {t('rail.probes')}
          </h2>
          {probes.items.map((probe) => (
            <button
              key={probe.id}
              type="button"
              onClick={probes.onOpen}
              className={cn(ITEM, 'text-muted-foreground')}
            >
              <span className="truncate">{probe.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', PROBE_DOT[probe.state])}
                />
                <span className="sr-only">{probe.label}</span>
              </span>
            </button>
          ))}
        </section>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={widgetRail}
        onClick={onToggleWidgetRail}
        className="justify-start text-muted-foreground"
      >
        <PanelRight />
        {widgetRail ? t('rail.hideWidgets') : t('rail.showWidgets')}
      </Button>
    </nav>
  );
}
