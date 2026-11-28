import { createElement, useMemo, useState } from 'react';
import {
  Activity,
  CalendarClock,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  Plug,
  Rss,
  Search,
  Shapes,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { cn } from '@homora/ui/lib/utils';
import { integrationDefinition, resolveWidget } from '@homora/integrations';
import type { WidgetCategory, WidgetUI } from '@homora/widgets/ui';
import { listWidgetUI } from '@/components/widget-ui-registry';
import type { Connection } from '@/features/connections/connection-model';
import { t, tOr } from '@/i18n';

type CategoryKey = WidgetCategory | 'other';
type FilterTab = 'all' | 'recent' | 'connections' | CategoryKey;

type RecentEntry = { kind: 'local'; type: string } | { kind: 'connection'; id: number };

const RECENT_STORAGE_KEY = 'homora.recentWidgets';
const MAX_RECENT = 4;

const CATEGORY_ORDER: readonly CategoryKey[] = [
  'overview',
  'time',
  'monitoring',
  'feeds',
  'utilities',
  'other',
];

const CATEGORY_LABEL_KEYS = {
  overview: 'pageWidgets.categoryOverview',
  time: 'pageWidgets.categoryTime',
  monitoring: 'pageWidgets.categoryMonitoring',
  feeds: 'pageWidgets.categoryFeeds',
  utilities: 'pageWidgets.categoryUtilities',
  other: 'pageWidgets.categoryOther',
} as const satisfies Record<CategoryKey, Parameters<typeof t>[0]>;

const CATEGORY_ICONS: Record<FilterTab, LucideIcon> = {
  all: LayoutGrid,
  overview: LayoutDashboard,
  recent: Clock,
  connections: Plug,
  time: CalendarClock,
  monitoring: Activity,
  feeds: Rss,
  utilities: Wrench,
  other: Shapes,
};

function readRecentWidgets(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentEntry =>
        typeof item === 'object' &&
        item !== null &&
        ((item.kind === 'local' && typeof item.type === 'string') ||
          (item.kind === 'connection' && typeof item.id === 'number')),
    );
  } catch {
    return [];
  }
}

export function recordRecentWidget(entry: RecentEntry): void {
  try {
    const current = readRecentWidgets().filter((item) =>
      entry.kind === 'local'
        ? !(item.kind === 'local' && item.type === entry.type)
        : !(item.kind === 'connection' && item.id === entry.id),
    );
    window.localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify([entry, ...current].slice(0, MAX_RECENT)),
    );
  } catch {
    // Ignore storage errors (private mode / restricted environments).
  }
}

function widgetMatchesQuery(entry: WidgetUI, needle: string): boolean {
  if (!needle) return true;
  if (tOr(entry.name, entry.name).toLowerCase().includes(needle)) return true;
  if (tOr(entry.description, entry.description).toLowerCase().includes(needle)) return true;
  return entry.keywords?.some((kw) => kw.toLowerCase().includes(needle)) ?? false;
}

function connectionMatchesQuery(connection: Connection, needle: string): boolean {
  if (!needle) return true;
  return (
    connection.name.toLowerCase().includes(needle) || connection.type.toLowerCase().includes(needle)
  );
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  const index = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/25 text-inherit">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

type Props = {
  /** Offer the widgets only the Summary draws. */
  summary?: boolean;
  /** Types already on the page, which the gallery says. */
  present?: Set<string>;
  connections: Connection[];
  onPick: (connection: Connection | null, type: string) => void;
};

export function WidgetGallery({ summary = false, present, connections, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [recentRaw, setRecentRaw] = useState<RecentEntry[]>(() => readRecentWidgets());

  const allLocal = useMemo(
    () => listWidgetUI().filter(([type]) => summary || !resolveWidget(type)?.summaryOnly),
    [summary],
  );
  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;

  const localByType = useMemo(() => new Map(allLocal), [allLocal]);
  const connectionById = useMemo(
    () => new Map(connections.map((connection) => [connection.id, connection])),
    [connections],
  );

  const recentItems = useMemo(() => {
    const resolved: (
      | { kind: 'local'; type: string; entry: WidgetUI }
      | { kind: 'connection'; connection: Connection }
    )[] = [];
    for (const item of recentRaw) {
      if (item.kind === 'local') {
        const entry = localByType.get(item.type);
        if (entry) resolved.push({ kind: 'local', type: item.type, entry });
      } else {
        const connection = connectionById.get(item.id);
        if (connection) resolved.push({ kind: 'connection', connection });
      }
    }
    return resolved;
  }, [recentRaw, localByType, connectionById]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    for (const [, entry] of allLocal) {
      const category: CategoryKey = entry.category ?? 'other';
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [allLocal]);

  const categories = useMemo(() => {
    const items: { key: FilterTab; label: string; count: number }[] = [
      {
        key: 'all',
        label: t('pageWidgets.categoryAll'),
        count: allLocal.length + connections.length,
      },
    ];
    if (recentItems.length > 0) {
      items.push({
        key: 'recent',
        label: t('pageWidgets.categoryRecent'),
        count: recentItems.length,
      });
    }
    for (const category of CATEGORY_ORDER) {
      const count = categoryCounts.get(category) ?? 0;
      if (count > 0) {
        items.push({
          key: category,
          label: t(CATEGORY_LABEL_KEYS[category]),
          count,
        });
      }
    }
    if (connections.length > 0) {
      items.push({
        key: 'connections',
        label: t('pageWidgets.groupConnections'),
        count: connections.length,
      });
    }
    return items;
  }, [allLocal.length, connections.length, recentItems.length, categoryCounts]);

  const visibleLocal = useMemo(() => {
    return allLocal.filter(([, entry]) => {
      if (!widgetMatchesQuery(entry, needle)) return false;
      if (isSearching || activeTab === 'all') return true;
      if (activeTab === 'connections' || activeTab === 'recent') return false;
      return (entry.category ?? 'other') === activeTab;
    });
  }, [allLocal, needle, isSearching, activeTab]);

  const visibleConnections = useMemo(() => {
    return connections.filter((connection) => {
      if (!connectionMatchesQuery(connection, needle)) return false;
      if (isSearching || activeTab === 'all' || activeTab === 'connections') return true;
      return false;
    });
  }, [connections, needle, isSearching, activeTab]);

  const showRecentOnly = !isSearching && activeTab === 'recent';

  const handlePickLocal = (type: string) => {
    // The Summary's own are one tap away in their category already.
    if (!resolveWidget(type)?.summaryOnly) {
      recordRecentWidget({ kind: 'local', type });
      setRecentRaw(readRecentWidgets());
    }
    onPick(null, type);
  };

  const handlePickConnection = (connection: Connection) => {
    const next: RecentEntry = { kind: 'connection', id: connection.id };
    recordRecentWidget(next);
    setRecentRaw(readRecentWidgets());
    onPick(connection, connection.type);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const totalMatches = visibleLocal.length + visibleConnections.length;
    if (totalMatches !== 1) return;
    event.preventDefault();
    if (visibleLocal.length === 1) {
      handlePickLocal(visibleLocal[0][0]);
    } else if (visibleConnections.length === 1) {
      handlePickConnection(visibleConnections[0]);
    }
  };

  const renderLocalOption = (type: string, option: WidgetUI) => {
    const Gallery = option.Gallery;
    const supportsWide = resolveWidget(type)?.sizes?.includes('wide') ?? false;
    return (
      <GalleryOption
        key={type}
        title={tOr(option.name, option.name)}
        description={tOr(option.description, option.description)}
        needle={needle}
        meta={isSearching ? t(CATEGORY_LABEL_KEYS[option.category ?? 'other']) : undefined}
        badge={
          present?.has(type) && resolveWidget(type)?.summaryOnly
            ? t('pageWidgets.onPageBadge')
            : supportsWide
              ? t('pageWidgets.wideBadge')
              : undefined
        }
        onPick={() => handlePickLocal(type)}
      >
        <Gallery />
      </GalleryOption>
    );
  };

  const renderConnectionOption = (connection: Connection) => {
    const service = integrationDefinition(connection.type)?.label;
    return (
      <GalleryOption
        key={`conn-${connection.id}`}
        title={connection.name}
        description={
          service
            ? t('pageWidgets.connectionDescService', { service })
            : t('pageWidgets.connectionDesc')
        }
        needle={needle}
        meta={isSearching ? t('pageWidgets.groupConnections') : undefined}
        onPick={() => handlePickConnection(connection)}
      >
        <ConnectionLogo type={connection.type} />
      </GalleryOption>
    );
  };

  const hasResults = showRecentOnly
    ? recentItems.length > 0
    : visibleLocal.length > 0 || visibleConnections.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative shrink-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t('pageWidgets.search')}
          placeholder={t('pageWidgets.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          className={cn('pl-9', query && 'pr-9')}
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('pageWidgets.clearSearch')}
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Responsive category navigation (horizontal chips on mobile, sidebar on desktop) + scrollable grid */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-4">
        <nav
          aria-label={t('pageWidgets.categories')}
          className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 sm:w-48 sm:flex-col sm:gap-1 sm:overflow-visible sm:border-r sm:pr-3 sm:pb-0"
        >
          {categories.map((category) => {
            const active = !isSearching && activeTab === category.key;
            return (
              <Button
                key={category.key}
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                aria-pressed={active}
                onClick={() => {
                  if (isSearching) setQuery('');
                  setActiveTab(category.key);
                }}
                className="h-7 shrink-0 gap-1.5 rounded-full border px-3 text-xs font-normal sm:h-8 sm:w-full sm:justify-between sm:rounded-md sm:border-transparent sm:px-2.5 sm:text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {createElement(CATEGORY_ICONS[category.key], {
                    'aria-hidden': true,
                    className: 'size-3.5 shrink-0 text-muted-foreground max-sm:hidden',
                  })}
                  <span className={cn('truncate', active && 'font-medium')}>{category.label}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{category.count}</span>
              </Button>
            );
          })}
        </nav>

        <div className="flex min-h-0 max-h-[55svh] flex-1 flex-col gap-5 overflow-y-auto pr-1 sm:h-[26rem] sm:max-h-none">
          {showRecentOnly && (
            <section aria-labelledby="pw-group-recent" className="flex flex-col gap-2">
              <h3
                id="pw-group-recent"
                className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                <Clock className="size-3.5" aria-hidden="true" />
                {t('pageWidgets.categoryRecent')}
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {recentItems.map((item) =>
                  item.kind === 'local'
                    ? renderLocalOption(item.type, item.entry)
                    : renderConnectionOption(item.connection),
                )}
              </div>
            </section>
          )}

          {!showRecentOnly &&
            (
              [
                ['overview', 'pageWidgets.categoryOverview', true],
                ['homora', 'pageWidgets.groupHomora', false],
              ] as const
            ).map(([id, heading, overview]) => {
              const group = visibleLocal.filter(
                ([, entry]) => (entry.category === 'overview') === overview,
              );
              return group.length === 0 ? null : (
                <section
                  key={id}
                  aria-labelledby={`pw-group-${id}`}
                  className="flex flex-col gap-2"
                >
                  <h3
                    id={`pw-group-${id}`}
                    className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {t(heading)}
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.map(([type, option]) => renderLocalOption(type, option))}
                  </div>
                </section>
              );
            })}

          {!showRecentOnly && visibleConnections.length > 0 && (
            <section aria-labelledby="pw-group-connections" className="flex flex-col gap-2">
              <h3
                id="pw-group-connections"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {t('pageWidgets.groupConnections')}
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleConnections.map((connection) => renderConnectionOption(connection))}
              </div>
            </section>
          )}

          {!hasResults && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('pageWidgets.noMatch')}</p>
              {isSearching && (
                <Button type="button" variant="outline" size="sm" onClick={() => setQuery('')}>
                  {t('pageWidgets.clearSearch')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionLogo({ type }: { type: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="font-mono text-xs font-semibold">{type.slice(0, 2).toUpperCase()}</span>
    );
  }
  return (
    <img
      src={`/brand-icons/${integrationDefinition(type)?.brandIcon ?? type}.svg`}
      alt=""
      className="size-5 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function GalleryOption({
  title,
  description,
  badge,
  meta,
  needle,
  onPick,
  children,
}: {
  title: string;
  description: string;
  badge?: string;
  /** Extra context shown while searching, such as the category. */
  meta?: string;
  needle: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-w-0 flex-col items-start gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex h-8 w-full items-center justify-between gap-2">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-4"
        >
          {children}
        </span>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {meta && <span className="truncate text-[10px] text-muted-foreground">{meta}</span>}
          {badge && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
      </div>
      <div className="w-full min-w-0">
        <div className="truncate text-sm font-medium">
          <Highlight text={title} needle={needle} />
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          <Highlight text={description} needle={needle} />
        </p>
      </div>
    </button>
  );
}
