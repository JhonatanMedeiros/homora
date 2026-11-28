import type { ReactNode } from 'react';
import type { Service } from '@homora/shared';
import {
  isSummaryWidgetType,
  summaryWidgets,
  type SummaryConfig,
  type SummaryWidgetType,
} from '@homora/widgets/summary';
import { Button } from '@homora/ui/button';
import { Card, CardContent } from '@homora/ui/card';
import { HostsBlock, ProbesBlock } from '@/features/dashboard/home-rail';
import { PinnedRow } from '@/features/dashboard/pinned-row';
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
import { hostRailItems } from '@/features/hosts/hosts';
import { averageUptime, HealthFigures } from '@/features/uptime/health-figures';
import { ProbableCauses } from '@/features/uptime/probable-causes';
import type { StatusFilter } from '@/features/dashboard/status-filter-model';
import { scopedHealth, type Scoped, type ScopeSources } from '@/features/summary/scope';
import { t, type MessageKey } from '@/i18n';

/** What one of the Summary's own widgets shows. */
export type SummaryView = {
  title: string;
  node: ReactNode;
  /** Nothing to show and nothing to set up: left out of the page unless it is being arranged. */
  absent?: boolean;
  /** The most rows the widget needs right now, so that having little to say leaves no void. */
  rows?: number;
  /** Grows to show all of its content instead of scrolling: what must be seen at a glance. */
  fit?: boolean;
};

type Context = ScopeSources & {
  range: Parameters<typeof HealthFigures>[0]['range'];
  pending: number;
  openService: (id: number) => void;
  openEntry: (id: number) => void;
  navigate: (path: string) => void;
  showState: (filter: StatusFilter) => void;
  showHost: (item: { connectionId: number; node: string }) => void;
};

/** A framed card with a short message and, at most, one way forward. */
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

type Drawing = Context & Scoped & { config: SummaryConfig };

/** How each of the Summary's own widgets is drawn from the health in its scope. */
export const summaryRenderers: Record<SummaryWidgetType, (drawing: Drawing) => SummaryView> = {
  'summary-pinned': ({ data, services, scoped, openService, navigate }) => {
    const pinned = services
      .filter((service: Service) => service.pinned)
      .sort((a, b) => (a.pinnedPosition ?? Infinity) - (b.pinnedPosition ?? Infinity));
    return {
      fit: true,
      title: t('pinned.title'),
      node:
        pinned.length > 0 ? (
          <PinnedRow
            services={pinned}
            statuses={data.statuses}
            blockedIds={data.blockedIds}
            onDetails={(service) => openService(service.id)}
          />
        ) : (
          <Empty
            title={t('pinned.title')}
            text={t(scoped ? 'summarygrid.pinned.noneHere' : 'summarygrid.pinned.empty')}
            action={{ label: t('summarygrid.pinned.go'), onClick: () => navigate('/services') }}
          />
        ),
    };
  },
  'summary-attention': ({ data, sources, health, area, openEntry, navigate }) => {
    const { downNow, summary, quietNow } = health;
    const calm = !summary.measurement && downNow.length === 0 && summary.slow.length === 0;
    const title = t('homeview.attention');
    return {
      fit: true,
      title,
      // About a row per thing to say; the widget grows if that is not enough.
      rows: calm ? 2 : downNow.length + (summary.slow.length > 0 ? 2 : 0) + 2,
      node: summary.measurement ? (
        <Empty
          title={title}
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
            incidents={sources.overview?.open}
            impacts={area.model.impacts}
            onOpen={(service) => openEntry(service.id)}
            onAcknowledge={(members, minutes) => void area.actions.acknowledge(members, minutes)}
            onShowAgain={(members) => void sources.attention.clear(members.map((item) => item.id))}
          />
          {summary.slow.length > 0 && (
            <SummaryCard title={t('homeview.attention.slow')}>
              <SlowList lines={summary.slow} />
            </SummaryCard>
          )}
        </>
      ) : (
        <SummaryCard title={title}>
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
    };
  },
  'summary-services': ({ health, openEntry }) => ({
    title: t('summaryWidgets.services'),
    node: <ServiceWindows windows={health.summary.windows} onSelect={openEntry} />,
  }),
  'summary-hosts': ({ services, health, area, showHost }) => {
    const { connections, inventories } = area.hostData;
    const hosts = hostRailItems(services, connections, inventories, health.isDown);
    return {
      title: t('summaryWidgets.hosts'),
      absent: hosts.length === 0,
      node:
        hosts.length > 0 ? (
          <Card className="py-3">
            <CardContent className="px-2">
              <HostsBlock items={hosts} onSelect={showHost} />
            </CardContent>
          </Card>
        ) : (
          <Empty title={t('summaryWidgets.hosts')} text={t('summarygrid.hosts.empty')} />
        ),
    };
  },
  'summary-probes': ({ health, config, navigate }) => {
    const title = t('summaryWidgets.probes');
    const chosen = config.probes ?? [];
    const probes = health.allProbes.filter(
      (probe) => chosen.length === 0 || chosen.includes(probe.name),
    );
    const open = () => navigate('/manage/probes');
    return {
      title,
      node:
        probes.length > 0 ? (
          <Card className="py-3">
            <CardContent className="px-2">
              <ProbesBlock items={probes} onOpen={open} />
            </CardContent>
          </Card>
        ) : chosen.length > 0 ? (
          <Empty title={title} text={t('summarygrid.probes.noneChosen')} />
        ) : (
          <Empty
            title={title}
            text={t('summarygrid.probes.empty')}
            action={{ label: t('summarygrid.probes.add'), onClick: open }}
          />
        ),
    };
  },
  'summary-figures': ({ sources, health, range }) => ({
    fit: true,
    title: t('summaryWidgets.figures'),
    node: (
      <section aria-label={t('homeview.figures')}>
        <HealthFigures
          average={averageUptime(health.entries, sources.uptime)}
          monitored={health.entries.length - health.summary.blocked}
          range={range}
          overview={sources.overview}
          certs={health.summary.certs}
        />
      </section>
    ),
  }),
  'summary-proposals': ({ pending, navigate }) => ({
    title: t('summaryWidgets.proposals'),
    absent: pending === 0,
    node: <ProposalsCard pending={pending} onReview={() => navigate('/manage/agents')} />,
  }),
  'summary-status': ({ health, showState }) => ({
    fit: true,
    title: t('summaryWidgets.status'),
    node: <StateStrip counts={health.countsWithProbes} onSelect={showState} />,
  }),
  'summary-availability': ({ sources }) => ({
    title: t('homeview.availability'),
    node: <AvailabilityCard sla={sources.overview?.sla} />,
  }),
  'summary-latency': ({ data, sources, health, openEntry }) => ({
    title: t('homeview.latency'),
    node: (
      <LatencyCard
        entries={health.entries}
        statuses={data.statuses}
        settings={sources.overview?.settings}
        onSelect={openEntry}
      />
    ),
  }),
  'summary-maintenance': ({ sources, health, scoped, navigate }) => {
    const known = new Set(health.entries.map((entry) => entry.id));
    const { windows } = sources.maintenance;
    return {
      title: t('homeview.maintenance'),
      node: (
        <UpcomingMaintenance
          windows={scoped ? windows?.filter((window) => known.has(window.serviceId)) : windows}
          now={sources.clock}
          nameOf={(id) =>
            health.entries.find((entry) => entry.id === id)?.name ?? t('maintview.unknownService')
          }
          onAll={() => navigate('/maintenance')}
        />
      ),
    };
  },
};

/** The widget's own name and what it was narrowed to, above what it shows. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <p className="text-xs font-medium break-words text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export type SummaryWidget = { type: string; name: string; config: unknown };
export type SummaryContent = (widget: SummaryWidget) => SummaryView;

/**
 * What the Summary's own widgets show. Each is made only when asked for, so a widget that is not on
 * the page costs nothing, and widgets with the same scope share one reading of health.
 */
export function summaryContent(context: Context): SummaryContent {
  const scopes = new Map<string, Scoped>();
  const scopeOf = (config: SummaryConfig) => {
    const key = JSON.stringify([config.groups ?? [], config.pages ?? []]);
    const found = scopes.get(key) ?? scopedHealth(context, config);
    scopes.set(key, found);
    return found;
  };
  return ({ type, name, config: stored }) => {
    // A newer widget, or settings this version cannot read: say so instead of leaving it out.
    if (!isSummaryWidgetType(type))
      return {
        title: name || type,
        node: <Empty title={name || type} text={t('summarygrid.unsupported')} />,
      };
    const config = summaryWidgets[type].parseConfig(stored);
    const title = t(`summaryWidgets.${type.slice('summary-'.length)}` as MessageKey);
    if (!config)
      return {
        title: name || title,
        node: <Empty title={name || title} text={t('summarygrid.unreadableSettings')} />,
      };
    const scope = scopeOf(config);
    const names = [...(config.groups ?? []), ...(config.pages ?? []), ...(config.probes ?? [])];
    const label = [name, names.join(', ')].filter(Boolean).join(' · ');
    const view =
      scope.scoped && scope.services.length === 0
        ? {
            title,
            rows: 2,
            node: <Empty title={title} text={t('summarygrid.emptyScope')} />,
          }
        : summaryRenderers[type]({ ...context, ...scope, config });
    return {
      ...view,
      title: name || view.title,
      node: label ? <Labelled label={label}>{view.node}</Labelled> : view.node,
    };
  };
}
