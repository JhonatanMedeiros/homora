import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  HostMapServicePanel,
  type HostMapServicePanelProps,
} from '@/features/hosts/host-map-service-panel';
import { Button } from '@homora/ui/button';
import { StatusLight } from '@/components/status-light';
import { describeStatus } from '@/lib/status-text';
import type { ServiceStatus } from '@/lib/services';
import { LoadMeters } from '@/features/hosts/host-map-parts';
import { guestSummary, type HealthOf } from '@/features/hosts/host-health';
import type { MapGuest } from '@/features/hosts/map-layout';
import { t } from '@/i18n';

/** Width of the docked panel; the map uses it to bring a selected tile out from under it. */
export const PANEL_WIDTH = 384;

type ServiceProps = Omit<
  HostMapServicePanelProps,
  | 'widgets'
  | 'uptime'
  | 'monitor'
  | 'tags'
  | 'uptimeRange'
  | 'onUptimeRangeChange'
  | 'hostEditor'
  | 'canEdit'
>;

const guestState = (status: string) =>
  status === 'running'
    ? t('hosts.state.running')
    : status === 'stopped'
      ? t('hosts.state.stopped')
      : t('hosts.state.other');

/**
 * Details and actions for the selected service or guest. Docked on the right from 1280 px (the
 * map keeps its size and the selected tile is moved into the free area) and a bottom sheet on
 * narrower windows.
 */
export function HostMapSelectionPanel({
  service,
  cardDetails,
  canEdit,
  guest,
  nodeName,
  statuses,
  blockedIds,
  healthOf,
  hostEditor,
  onClose,
  onSelectService,
}: {
  service?: ServiceProps;
  cardDetails?: Pick<
    HostMapServicePanelProps,
    'widgets' | 'uptime' | 'monitor' | 'tags' | 'uptimeRange' | 'onUptimeRangeChange'
  >;
  canEdit: boolean;
  guest?: MapGuest;
  nodeName?: string;
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  healthOf: HealthOf;
  hostEditor?: ReactNode;
  onClose: () => void;
  onSelectService: (id: number) => void;
}) {
  const summary = guest ? guestSummary(guest.group, healthOf) : null;
  return (
    <aside
      aria-label={t('map.panel.title')}
      style={{ ['--panel-width' as string]: `${PANEL_WIDTH}px` }}
      className="absolute inset-x-3 bottom-20 z-20 flex max-h-[55%] flex-col gap-3 overflow-auto rounded-xl border bg-card p-4 text-sm shadow-lg xl:inset-x-auto xl:top-0 xl:right-0 xl:bottom-0 xl:max-h-none xl:w-(--panel-width) xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none"
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
          {...service}
          {...cardDetails}
          canEdit={canEdit}
          hostEditor={hostEditor ?? null}
        />
      )}
      {guest && summary && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <h4 className="text-base font-semibold break-words">
                {guest.group.guest.name || guest.group.guest.vmid}
              </h4>
              <p className="font-mono text-xs text-muted-foreground">
                {guest.group.guest.vmid} · {t(`hosts.type.${guest.group.guest.type}`)} ·{' '}
                {guestState(guest.group.guest.status)}
              </p>
            </div>
            {nodeName && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('hosts.on', { node: nodeName })}
              </span>
            )}
          </div>
          {guest.group.guest.metrics && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t('map.panel.load')}
              </span>
              <LoadMeters metrics={guest.group.guest.metrics} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t('map.panel.guestServices', {
                count: guest.group.services.length,
              })}
            </span>
            <ul className="flex flex-col gap-1">
              {guest.group.services.map((item) => {
                const view = describeStatus(statuses[item.id], blockedIds.has(item.id));
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 pointer-coarse:min-h-11"
                      onClick={() => onSelectService(item.id)}
                    >
                      {item.name}
                    </Button>
                    <StatusLight
                      state={view.state}
                      blocked={view.blocked}
                      label={view.label}
                      className="text-xs"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
}
