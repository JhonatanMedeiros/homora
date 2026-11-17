import type { ReactNode } from 'react';
import type { Service } from '@homora/shared';
import { X } from 'lucide-react';
import {
  HostMapServicePanel,
  type HostMapServicePanelProps,
} from '@/features/hosts/host-map-service-panel';
import { Button } from '@homora/ui/button';
import type { ServiceStatus } from '@/lib/services';
import { t } from '@/i18n';
import type { layoutMap } from '@/features/hosts/map-layout';

type Guest = ReturnType<typeof layoutMap>['containers'][number]['guests'][number];
type RelatedService = { id: number; name: string };

type SelectedService = {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  runsOn: string;
  page?: string;
  impact: string;
  dependsOnList: RelatedService[];
  usedByList: RelatedService[];
};

/** Side panel for details and actions on a selected map service or guest. */
export function HostMapSelectionPanel({
  service,
  cardDetails,
  guest,
  hostEditor,
  onClose,
  onSelectService,
  onAddDependency,
  onRemoveDependency,
  onOpenCard,
  onChangeHost,
}: {
  service?: SelectedService;
  cardDetails?: Pick<
    HostMapServicePanelProps,
    'widgets' | 'uptime' | 'monitor' | 'tags' | 'uptimeRange' | 'onUptimeRangeChange'
  >;
  guest?: Guest;
  hostEditor?: ReactNode;
  onClose: () => void;
  onSelectService: (id: number) => void;
  onAddDependency: () => void;
  onRemoveDependency: (id: number) => void;
  onOpenCard: () => void;
  onChangeHost: () => void;
}) {
  return (
    <aside
      aria-label={t('map.panel.title')}
      className="absolute inset-x-3 bottom-20 z-10 flex max-h-[45%] flex-col gap-3 overflow-auto rounded-xl border bg-card p-4 text-sm shadow-lg lg:inset-x-auto lg:top-4 lg:right-4 lg:bottom-auto lg:max-h-[calc(100%-6.5rem)] lg:w-96"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('map.panel.title')}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('map.panel.close')}
          className="pointer-coarse:size-11"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {service && (
        <HostMapServicePanel
          {...cardDetails}
          service={service.service}
          status={service.status}
          blocked={service.blocked}
          runsOn={service.runsOn}
          page={service.page}
          impact={service.impact}
          dependsOnList={service.dependsOnList}
          usedByList={service.usedByList}
          canEdit={Boolean(hostEditor)}
          onSelect={onSelectService}
          onAddDependency={onAddDependency}
          onRemoveDependency={onRemoveDependency}
          onOpenCard={onOpenCard}
          onChangeHost={onChangeHost}
          hostEditor={hostEditor ?? null}
        />
      )}
      {guest && (
        <dl className="flex flex-col gap-2">
          <Row label={t('map.panel.guest')}>{guest.group.guest.name || guest.group.guest.vmid}</Row>
          <Row label={t('map.panel.node')}>{guest.group.guest.node}</Row>
          <Row label={t('map.panel.status')}>
            {t(`hosts.type.${guest.group.guest.type}`)} · {guestState(guest.group.guest.status)}
          </Row>
          <Row label={t('map.panel.services')}>
            <ul className="flex flex-col gap-1">
              {guest.group.services.map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 pointer-coarse:min-h-11"
                    onClick={() => onSelectService(item.id)}
                  >
                    {item.name}
                  </Button>
                </li>
              ))}
            </ul>
          </Row>
        </dl>
      )}
    </aside>
  );
}

const guestState = (status: string) =>
  status === 'running'
    ? t('hosts.state.running')
    : status === 'stopped'
      ? t('hosts.state.stopped')
      : t('hosts.state.other');

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
