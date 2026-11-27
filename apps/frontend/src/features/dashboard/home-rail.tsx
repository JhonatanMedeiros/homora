import { PROBE_DOT } from '@/lib/probe-dot';
import { PanelRight, Star } from 'lucide-react';
import type { HostRailItem } from '@/features/hosts/hosts';
import type { LightState } from '@/lib/services';
import type { CheckType } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { STATUS_FILTERS, type StatusFilter } from '@/features/dashboard/status-filter-model';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

type Group = { name: string; total: number; down: number };
/** A monitor without a card: shown by name and state, and opens the probes screen. */
export type RailProbe = {
  id: number;
  name: string;
  address: string;
  checkType: CheckType;
  state: LightState;
  /** The state in words, so the light never carries the meaning alone. */
  label: string;
  /** Latency or a short fallback. */
  meta: string | null;
};

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
  /** The widget column of the Services view; absent where there is no such column. */
  widgets?: { shown: boolean; onToggle: () => void };
  /** Organize mode keeps the frame; the rail then only jumps to a group. */
  organizing?: boolean;
};

const DOT: Record<StatusFilter, string | null> = {
  all: null,
  down: 'bg-destructive',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
  ok: 'bg-success',
  unmeasured: 'bg-muted-foreground',
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
  widgets,
  organizing = false,
}: Props) {
  if (organizing)
    return (
      <nav aria-label={t('rail.label')} className="flex flex-col gap-0.5 text-sm">
        <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
          {t('rail.groups')}
        </h2>
        {groups.map((group) => (
          <button
            key={group.name}
            type="button"
            onClick={() =>
              [...document.querySelectorAll<HTMLElement>('[data-group]')]
                .find((section) => section.dataset.group === group.name)
                ?.scrollIntoView?.({ block: 'start' })
            }
            className={cn(ITEM, 'text-muted-foreground')}
          >
            <span className="truncate">{group.name}</span>
            <span className="font-mono text-xs tabular-nums">{group.total}</span>
          </button>
        ))}
      </nav>
    );
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
              )}
            >
              <span className="flex items-center gap-2">
                {DOT[filter] && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      DOT[filter],
                      counts[filter] === 0 && !on && 'opacity-40',
                    )}
                  />
                )}
                {t(`filter.status.${filter}`)}
              </span>
              <span className="font-mono text-xs tabular-nums">{counts[filter]}</span>
            </button>
          );
        })}
        {probes && probes.items.length > 0 && (
          <p className="px-2.5 py-0.5 text-xs text-muted-foreground">
            {t(probes.items.length === 1 ? 'rail.includes.one' : 'rail.includes.other', {
              count: probes.items.length,
            })}
          </p>
        )}
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
      {hosts && hosts.items.length > 0 && <HostsBlock {...hosts} />}
      {probes && probes.items.length > 0 && <ProbesBlock {...probes} />}
      {widgets && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={widgets.shown}
          onClick={widgets.onToggle}
          className="justify-start text-muted-foreground"
        >
          <PanelRight />
          {widgets.shown ? t('rail.hideWidgets') : t('rail.showWidgets')}
        </Button>
      )}
    </nav>
  );
}

const PROBE_ORDER: Record<LightState, number> = {
  unavailable: 0,
  degraded: 1,
  unknown: 2,
  maintenance: 3,
  available: 4,
};

const PROBE_BAR: Record<LightState, string> = {
  available: 'bg-success/75',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
  unavailable: 'bg-destructive',
  unknown: 'bg-muted-foreground/40',
};

/** Short protocol names are the same in every language. */
const CHECK_BADGE: Record<CheckType, string> = {
  http: 'HTTP',
  keyword: 'HTTP',
  json: 'HTTP',
  tcp: 'TCP',
  ping: 'ICMP',
  dns: 'DNS',
  tls: 'TLS',
};

/** One button per Proxmox node that runs cards, with its state and how many are down. */
export function HostsBlock({
  items,
  onSelect,
}: {
  items: HostRailItem[];
  onSelect: (item: HostRailItem) => void;
}) {
  return (
    <section aria-label={t('rail.hosts')} className="flex flex-col gap-0.5">
      <h2 className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{t('rail.hosts')}</h2>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item)}
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
            {item.state === 'unknown' && <span>{t('summarygrid.hosts.state.unknown')}</span>}
            {item.state === 'online' && (
              <span className="sr-only">{t('summarygrid.hosts.state.online')}</span>
            )}
            {item.down > 0 && item.state !== 'offline' && (
              <span className="text-destructive">{item.down}</span>
            )}
            {item.total}
          </span>
        </button>
      ))}
    </section>
  );
}

/** "Rental Manager — origem" reads as a name and a detail; without a dash the detail is the host. */
function splitProbeName(probe: RailProbe) {
  const [head, ...rest] = probe.name.split(' — ');
  if (rest.length > 0) return { title: head, detail: rest.join(' — ') };
  let host = probe.address;
  try {
    host = new URL(probe.address).host;
  } catch {
    // keep the address as written
  }
  return { title: probe.name, detail: host };
}

export function ProbesBlock({ items, onOpen }: { items: RailProbe[]; onOpen: () => void }) {
  const sorted = [...items].sort((a, b) => PROBE_ORDER[a.state] - PROBE_ORDER[b.state]);
  const ok = items.filter((probe) => probe.state === 'available').length;
  return (
    <section aria-label={t('rail.probes')} className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2.5 pb-1">
        <h2 className="text-xs font-medium text-muted-foreground">{t('rail.probes')}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {t('rail.probes.summary', { ok, total: items.length })}
        </span>
      </div>
      <div aria-hidden="true" className="flex gap-0.5 px-2.5 pb-2">
        {sorted.map((probe) => (
          <span key={probe.id} className={cn('h-1 flex-1 rounded-full', PROBE_BAR[probe.state])} />
        ))}
      </div>
      {sorted.map((probe) => {
        const { title, detail } = splitProbeName(probe);
        const bad = probe.state === 'unavailable';
        return (
          <button
            key={probe.id}
            type="button"
            onClick={onOpen}
            className={cn(
              ITEM,
              'justify-start gap-2.5 py-2',
              bad ? 'bg-destructive/10 ring-1 ring-destructive/30' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('size-2 shrink-0 rounded-full', PROBE_DOT[probe.state])}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{title}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0 rounded border px-1 font-mono text-[10px] leading-4">
                  {CHECK_BADGE[probe.checkType]}
                </span>
                <span className="truncate">{detail}</span>
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 font-mono text-xs tabular-nums',
                bad && 'font-medium text-destructive',
                probe.state === 'degraded' && 'text-warning',
              )}
            >
              {probe.meta ?? probe.label}
              {probe.meta && <span className="sr-only"> {probe.label}</span>}
            </span>
          </button>
        );
      })}
    </section>
  );
}
