import { HomeRail } from '@/features/dashboard/home-rail';
import type { BrowseState } from '@/features/dashboard/use-browse-state';
import type { Health } from '@/features/home/health';
import { hostRailItems } from '@/features/hosts/hosts';
import type { useHostInventory } from '@/features/hosts/use-host-inventory';
import type { useServices } from '@/hooks/use-services';
import { t } from '@/i18n';

type Props = {
  data: ReturnType<typeof useServices>;
  hostData: ReturnType<typeof useHostInventory>;
  health: Health;
  browse: BrowseState;
  /** The groups of the current page. */
  categories: string[];
  /** Hosts are shown by the Services view, arranged by host. */
  onShowHosts: () => void;
  onProbes: () => void;
  /** Runs after a view, group or favorites choice: the other views then open Services. */
  onChosen?: () => void;
  widgets?: { shown: boolean; onToggle: () => void };
  organizing?: boolean;
};

/** The left column shared by the Home views on wide screens. */
export function HomeSidebar({
  data,
  hostData,
  health,
  browse,
  categories,
  onShowHosts,
  onProbes,
  onChosen,
  widgets,
  organizing,
}: Props) {
  const { services } = data;
  const pinned = services.filter((service) => service.pinned).length;
  return (
    <aside aria-label={t('rail.label')} className="sticky top-4 self-start">
      <HomeRail
        organizing={organizing}
        statusFilter={browse.statusFilter}
        counts={health.countsWithProbes}
        onStatusFilter={(filter) => {
          browse.setStatusFilter(filter);
          onChosen?.();
        }}
        groups={categories.map((name) => {
          const members = services.filter((service) => service.category === name);
          return { name, total: members.length, down: members.filter(health.isDown).length };
        })}
        selectedGroup={browse.selected}
        onSelectGroup={(name) => {
          browse.setSelected(name);
          onChosen?.();
        }}
        favorites={{
          count: pinned,
          active: browse.favoritesOnly,
          onToggle: () => {
            browse.setFavoritesOnly(!browse.favoritesOnly);
            onChosen?.();
          },
        }}
        hosts={{
          items: hostRailItems(services, hostData.connections, hostData.inventories, health.isDown),
          onSelect: (item) => {
            browse.setNodeFilter({ connectionId: item.connectionId, node: item.node });
            onShowHosts();
          },
        }}
        probes={{ items: health.allProbes, onOpen: onProbes }}
        widgets={widgets}
      />
    </aside>
  );
}
