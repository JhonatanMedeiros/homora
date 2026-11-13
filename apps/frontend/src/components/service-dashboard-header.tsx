import type { RefObject } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HostImpactBanner } from '@/components/host-impact-banner';
import { HealthSummary } from '@/components/health-summary';
import { OrganizePanel } from '@/components/organize-panel';
import { PageHeader } from '@/components/page-header';
import { TopBar } from '@/components/top-bar';
import { ServiceViewToolbar } from '@/components/service-view-toolbar';
import type { ComponentProps } from 'react';
import { t } from '@/i18n';

type ToolbarProps = ComponentProps<typeof ServiceViewToolbar> & {
  showHostSuggestions: boolean;
  onHostSuggestions: () => void;
};

type Props = {
  managing: boolean;
  organizing: boolean;
  topBar: boolean;
  summary: ComponentProps<typeof HealthSummary>;
  serviceCount: number;
  groupCount: number;
  toolbar: ToolbarProps;
  addButton: RefObject<HTMLButtonElement | null>;
  onToggleOrganizing: () => void;
  onAddService: () => void;
  showImpact: boolean;
  impact: ComponentProps<typeof HostImpactBanner>;
  groupEditor: ComponentProps<typeof OrganizePanel>;
};

/** Dashboard summary and its view/organize controls. */
export function ServiceDashboardHeader({
  managing,
  organizing,
  topBar,
  summary,
  serviceCount,
  groupCount,
  toolbar,
  addButton,
  onToggleOrganizing,
  onAddService,
  showImpact,
  impact,
  groupEditor,
}: Props) {
  return (
    <>
      {managing && (
        <PageHeader
          title={t('manage.services')}
          description={
            serviceCount
              ? `${t('page.summary', { services: t('page.servicesCount', { count: serviceCount }), groups: t('page.groupsCount', { count: groupCount }) })} ${t('manage.serviceDescription')}`
              : t('page.emptyDescription')
          }
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                aria-pressed={organizing}
                onClick={onToggleOrganizing}
              >
                <SlidersHorizontal />
                {organizing ? t('page.done') : t('page.organize')}
              </Button>
              <Button ref={addButton} type="button" onClick={onAddService}>
                <Plus />
                {t('page.add')}
              </Button>
            </>
          }
        />
      )}
      {!managing && !organizing && topBar && <TopBar />}
      {!managing && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {!organizing ? <HealthSummary {...summary} /> : <span />}
          {serviceCount > 0 && <ServiceViewToolbar {...toolbar} />}
        </div>
      )}
      {showImpact && <HostImpactBanner {...impact} />}
      {organizing && <OrganizePanel {...groupEditor} />}
    </>
  );
}
