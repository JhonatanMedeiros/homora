import type { ReactNode } from 'react';
import type { Service, SummaryBlock } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Card, CardContent } from '@homora/ui/card';
import { HostsBlock, ProbesBlock } from '@/features/dashboard/home-rail';
import { PinnedRow } from '@/features/dashboard/pinned-row';
import type { Health, HealthSources } from '@/features/home/health';
import { ProposalsCard } from '@/features/home/proposals-card';
import { ServiceWindows } from '@/features/home/service-windows';
import {
  AvailabilityCard,
  LatencyCard,
  NothingToDo,
  SlowList,
  StateStrip,
  SummaryCard,
  UpcomingMaintenance,
} from '@/features/home/summary-cards';
import type { useHomeArea } from '@/features/home/use-home-area';
import { hostRailItems } from '@/features/hosts/hosts';
import { averageUptime, HealthFigures } from '@/features/uptime/health-figures';
import { ProbableCauses } from '@/features/uptime/probable-causes';
import type { StatusFilter } from '@/features/dashboard/status-filter-model';
import type { useServices } from '@/hooks/use-services';
import { t } from '@/i18n';

export type BlockView = {
  title: string;
  node: ReactNode;
  /** Nothing to show and nothing to set up: left out of the page unless it is being arranged. */
  absent?: boolean;
  /** The most rows the block needs right now, so that having little to say leaves no void. */
  rows?: number;
  /** Grows to show all of its content instead of scrolling: what must be seen at a glance. */
  fit?: boolean;
};

type Context = {
  data: ReturnType<typeof useServices>;
  sources: HealthSources;
  health: Health;
  area: ReturnType<typeof useHomeArea>;
  range: Parameters<typeof HealthFigures>[0]['range'];
  pending: number;
  openService: (id: number) => void;
  openEntry: (id: number) => void;
  navigate: (path: string) => void;
  showState: (filter: StatusFilter) => void;
  showHost: (item: { connectionId: number; node: string }) => void;
};

/** A framed block with a short message and, at most, one way forward. */
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <SummaryCard title={title}>
      <div className="flex flex-col items-start gap-1 text-sm">
        <p className="text-muted-foreground">{text}</p>
        {action && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 pointer-coarse:min-h-11"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </div>
    </SummaryCard>
  );
}

/** The built-in blocks of the Summary, each drawn from the same reading of health. */
export function summaryBlocks({
  data,
  sources,
  health,
  area,
  range,
  pending,
  openService,
  openEntry,
  navigate,
  showState,
  showHost,
}: Context): Record<SummaryBlock, BlockView> {
  const { services, statuses, blockedIds } = data;
  const { overview, clock } = sources;
  const { downNow, entries, summary, quietNow } = health;
  const { model, actions, hostData } = area;
  const pinned = services
    .filter((service: Service) => service.pinned)
    .sort((a, b) => (a.pinnedPosition ?? Infinity) - (b.pinnedPosition ?? Infinity));
  const hosts = hostRailItems(services, hostData.connections, hostData.inventories, health.isDown);
  const calm = !summary.measurement && downNow.length === 0 && summary.slow.length === 0;
  const attentionTitle = t('homeview.attention');
  return {
    pinned: {
      fit: true,
      title: t('pinned.title'),
      node:
        pinned.length > 0 ? (
          <PinnedRow
            services={pinned}
            statuses={statuses}
            blockedIds={blockedIds}
            onDetails={(service) => openService(service.id)}
          />
        ) : (
          <Empty
            title={t('pinned.title')}
            text={t('summarygrid.pinned.empty')}
            action={{ label: t('summarygrid.pinned.go'), onClick: () => navigate('/services') }}
          />
        ),
    },
    attention: {
      fit: true,
      title: attentionTitle,
      // About a row per thing to say; the block grows if that is not enough.
      rows: calm ? 2 : downNow.length + (summary.slow.length > 0 ? 2 : 0) + 2,
      node: summary.measurement ? (
        <Empty
          title={attentionTitle}
          text={`${summary.title}. ${summary.subtitle}`}
          action={{
            label: t('banner.measurement.action'),
            onClick: () => navigate('/manage/integrations'),
          }}
        />
      ) : downNow.length > 0 ? (
        <>
          <ProbableCauses
            alwaysOpen
            down={downNow.filter((service) => !quietNow(service.id))}
            quiet={downNow.filter((service) => quietNow(service.id))}
            incidents={overview?.open}
            impacts={model.impacts}
            onOpen={(service) => openEntry(service.id)}
            onAcknowledge={(members, minutes) => void actions.acknowledge(members, minutes)}
            onShowAgain={(members) => void sources.attention.clear(members.map((item) => item.id))}
          />
          {summary.slow.length > 0 && (
            <SummaryCard title={t('homeview.attention.slow')}>
              <SlowList lines={summary.slow} />
            </SummaryCard>
          )}
        </>
      ) : (
        <SummaryCard title={attentionTitle}>
          {summary.slow.length === 0 ? (
            <NothingToDo certain={!data.statusError && summary.unknown === 0} />
          ) : (
            <>
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('homeview.attention.slow')}
              </h3>
              <SlowList lines={summary.slow} />
            </>
          )}
        </SummaryCard>
      ),
    },
    services: {
      title: t('summarygrid.block.services'),
      node: <ServiceWindows windows={summary.windows} onSelect={openEntry} />,
    },
    hosts: {
      title: t('summarygrid.block.hosts'),
      absent: hosts.length === 0,
      node:
        hosts.length > 0 ? (
          <Card className="py-3">
            <CardContent className="px-2">
              <HostsBlock items={hosts} onSelect={showHost} />
            </CardContent>
          </Card>
        ) : (
          <Empty title={t('summarygrid.block.hosts')} text={t('summarygrid.hosts.empty')} />
        ),
    },
    probes: {
      title: t('summarygrid.block.probes'),
      node:
        health.allProbes.length > 0 ? (
          <Card className="py-3">
            <CardContent className="px-2">
              <ProbesBlock items={health.allProbes} onOpen={() => navigate('/manage/probes')} />
            </CardContent>
          </Card>
        ) : (
          <Empty
            title={t('summarygrid.block.probes')}
            text={t('summarygrid.probes.empty')}
            action={{
              label: t('summarygrid.probes.add'),
              onClick: () => navigate('/manage/probes'),
            }}
          />
        ),
    },
    figures: {
      fit: true,
      title: t('summarygrid.block.figures'),
      node: (
        <section aria-label={t('homeview.figures')}>
          <HealthFigures
            average={averageUptime(entries, sources.uptime)}
            monitored={entries.length - summary.blocked}
            range={range}
            overview={overview}
            certs={summary.certs}
          />
        </section>
      ),
    },
    proposals: {
      title: t('summarygrid.block.proposals'),
      absent: pending === 0,
      node: <ProposalsCard pending={pending} onReview={() => navigate('/manage/agents')} />,
    },
    status: {
      fit: true,
      title: t('summarygrid.block.status'),
      node: <StateStrip counts={health.countsWithProbes} onSelect={showState} />,
    },
    availability: {
      title: t('homeview.availability'),
      node: <AvailabilityCard sla={overview?.sla} />,
    },
    latency: {
      title: t('homeview.latency'),
      node: (
        <LatencyCard
          entries={entries}
          statuses={statuses}
          settings={overview?.settings}
          onSelect={openEntry}
        />
      ),
    },
    maintenance: {
      title: t('homeview.maintenance'),
      node: (
        <UpcomingMaintenance
          windows={sources.maintenance.windows}
          now={clock}
          nameOf={(id) =>
            entries.find((entry) => entry.id === id)?.name ?? t('maintview.unknownService')
          }
          onAll={() => navigate('/maintenance')}
        />
      ),
    },
  };
}
