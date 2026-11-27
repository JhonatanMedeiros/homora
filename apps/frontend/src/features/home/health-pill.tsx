import type { Service, UptimeRange } from '@homora/shared';
import { HeaderStatusPortal } from '@/components/header-status-slot';
import { HomeStatusPill } from '@/components/home-status-pill';
import { StatusBanner } from '@/components/status-banner';
import { ProbableCauses } from '@/features/uptime/probable-causes';
import type { Health, HealthSources } from '@/features/home/health';
import type { Impact } from '@/features/hosts/hosts';
import type { useServices } from '@/hooks/use-services';

type Props = {
  data: ReturnType<typeof useServices>;
  sources: HealthSources;
  health: Health;
  impacts: Map<number, Impact>;
  range: UptimeRange;
  onService: (id: number) => void;
  onProbes: () => void;
  onConnections: () => void;
  onAcknowledge: (services: Service[], minutes?: number) => void;
};

/** The health pill in the top bar, with the numbers and the probable causes behind it. */
export function HealthPill({
  data,
  sources,
  health,
  impacts,
  range,
  onService,
  onProbes,
  onConnections,
  onAcknowledge,
}: Props) {
  const { downNow, entries, probeIds, quietNow, summary } = health;
  if (entries.length === 0) return null;
  return (
    <HeaderStatusPortal>
      <HomeStatusPill summary={summary}>
        {(close) => (
          <StatusBanner
            services={entries}
            statuses={data.statuses}
            blockedIds={data.blockedIds}
            overview={sources.overview}
            maintenance={sources.maintenance.windows}
            uptime={sources.uptime}
            range={range}
            probeIds={probeIds}
            stale={data.statusError}
            attention={
              downNow.length > 0 && (
                <ProbableCauses
                  alwaysOpen
                  down={downNow.filter((service) => !quietNow(service.id))}
                  quiet={downNow.filter((service) => quietNow(service.id))}
                  incidents={sources.overview?.open}
                  impacts={impacts}
                  onOpen={(service) => {
                    close();
                    if (probeIds.has(service.id)) onProbes();
                    else onService(service.id);
                  }}
                  onAcknowledge={onAcknowledge}
                  onShowAgain={(members) => void sources.attention.clear(members.map((m) => m.id))}
                />
              )
            }
            onOpenConnections={() => {
              close();
              onConnections();
            }}
            onOpenService={(id) => {
              close();
              if (probeIds.has(id)) onProbes();
              else onService(id);
            }}
          />
        )}
      </HomeStatusPill>
    </HeaderStatusPortal>
  );
}
