import { forwardRef } from 'react';
import { Link2, Search } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@homora/ui/input-group';
import { Kbd } from '@homora/ui/kbd';
import { Label } from '@homora/ui/label';
import { Switch } from '@homora/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import type { MapFilter } from '@/features/hosts/host-map-filter';
import { t } from '@/i18n';

export type MapGroupBy = 'host' | 'group';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  filter: MapFilter;
  onFilterChange: (filter: MapFilter) => void;
  counts: { all: number; problems: number; unlinked: number };
  groupBy: MapGroupBy;
  onGroupByChange: (groupBy: MapGroupBy) => void;
  connections: boolean;
  onConnectionsChange: (on: boolean) => void;
  collapseHealthy: boolean;
  onCollapseHealthyChange: (on: boolean) => void;
  /** Whether any service depends on another; with none, the toggle has nothing to show. */
  hasDependencies: boolean;
};

const item =
  'h-8 gap-1.5 px-3 text-xs font-medium data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-accent-text pointer-coarse:h-11';

/** Search, filters, grouping and the two display switches of the full-screen map. */
export const HostMapToolbar = forwardRef<HTMLInputElement, Props>(function HostMapToolbar(
  {
    query,
    onQueryChange,
    filter,
    onFilterChange,
    counts,
    groupBy,
    onGroupByChange,
    connections,
    onConnectionsChange,
    collapseHealthy,
    onCollapseHealthyChange,
    hasDependencies,
  },
  searchRef,
) {
  const count = (value: number) => (
    <span className="font-mono text-[0.6875rem] font-normal text-muted-foreground tabular-nums">
      {value}
    </span>
  );
  return (
    <div
      role="toolbar"
      aria-label={t('map.toolbar')}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2"
    >
      <InputGroup className="h-8 w-full sm:w-64">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          type="search"
          value={query}
          aria-label={t('map.search')}
          aria-keyshortcuts="/"
          placeholder={t('map.search')}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.stopPropagation();
              onQueryChange('');
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Kbd aria-hidden="true">/</Kbd>
        </InputGroupAddon>
      </InputGroup>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={filter}
        aria-label={t('map.filter.label')}
        onValueChange={(value) => {
          if (value === 'all' || value === 'problems' || value === 'unlinked')
            onFilterChange(value);
        }}
      >
        <ToggleGroupItem value="all" className={item}>
          {t('map.filter.all')}
          {count(counts.all)}
        </ToggleGroupItem>
        <ToggleGroupItem value="problems" className={item}>
          {t('map.filter.problems')}
          {count(counts.problems)}
        </ToggleGroupItem>
        <ToggleGroupItem value="unlinked" className={item}>
          {t('map.filter.unlinked')}
          {count(counts.unlinked)}
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={groupBy}
        aria-label={t('map.groupBy')}
        onValueChange={(value) => {
          if (value === 'host' || value === 'group') onGroupByChange(value);
        }}
      >
        <ToggleGroupItem value="host" className={item}>
          {t('map.groupBy.host')}
        </ToggleGroupItem>
        <ToggleGroupItem value="group" className={item}>
          {t('map.groupBy.group')}
        </ToggleGroupItem>
      </ToggleGroup>
      <span className="flex items-center gap-2 text-xs">
        <Switch
          id="map-connections"
          checked={connections}
          onCheckedChange={onConnectionsChange}
          disabled={!hasDependencies}
        />
        <Label htmlFor="map-connections" className="gap-1.5 text-xs font-medium">
          <Link2 aria-hidden="true" className="size-3.5" />
          {t('map.connections')}
        </Label>
      </span>
      <span className="flex items-center gap-2 text-xs">
        <Switch
          id="map-collapse-healthy"
          checked={collapseHealthy}
          onCheckedChange={onCollapseHealthyChange}
          disabled={groupBy === 'group'}
        />
        <Label htmlFor="map-collapse-healthy" className="text-xs font-medium">
          {t('map.collapseHealthy')}
        </Label>
      </span>
      {hasDependencies && connections && (
        <span className="ml-auto text-xs text-muted-foreground">{t('map.legend.dependsOn')}</span>
      )}
    </div>
  );
});
