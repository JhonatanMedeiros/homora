import { WidgetErrorBoundary } from '@/components/widget-error-boundary';
import type { ReactNode } from 'react';
import { HostImpactBanner } from '@/features/hosts/host-impact-banner';
import { OrganizePanel } from '@/features/dashboard/organize-panel';
import { TopBar } from '@/components/top-bar';
import { OrganizeToggle, ServiceViewToolbar } from '@/features/dashboard/service-view-toolbar';
import type { ComponentProps } from 'react';

type ToolbarProps = ComponentProps<typeof ServiceViewToolbar> & {
  showHostSuggestions: boolean;
  onHostSuggestions: () => void;
};

type Props = {
  organizing: boolean;
  topBar: boolean;
  /** Phones: the state filter and the view toolbar live in the options sheet instead. */
  compact?: boolean;
  /** Health banner: the first thing the Home says. */
  banner?: ReactNode;
  /** State filter, on the left of the view toolbar. */
  stateFilter?: ReactNode;
  serviceCount: number;
  toolbar: ToolbarProps;
  showImpact: boolean;
  impact: ComponentProps<typeof HostImpactBanner>;
  groupEditor: ComponentProps<typeof OrganizePanel>;
};

/** Dashboard summary and its view/organize controls. */
export function ServiceDashboardHeader({
  organizing,
  topBar,
  compact = false,
  banner,
  stateFilter,
  serviceCount,
  toolbar,
  showImpact,
  impact,
  groupEditor,
}: Props) {
  return (
    <>
      {!organizing && topBar && (
        <WidgetErrorBoundary>
          <TopBar />
        </WidgetErrorBoundary>
      )}
      {!organizing && banner}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {stateFilter ?? <span />}
          {serviceCount > 0 ? (
            <ServiceViewToolbar {...toolbar} />
          ) : (
            // Nothing to arrange yet, but groups and the first services are made in Organize.
            toolbar.onToggleOrganizing && (
              <OrganizeToggle
                organizing={toolbar.organizing}
                onToggle={toolbar.onToggleOrganizing}
              />
            )
          )}
        </div>
      )}
      {showImpact && <HostImpactBanner {...impact} />}
      {organizing && <OrganizePanel {...groupEditor} />}
    </>
  );
}
