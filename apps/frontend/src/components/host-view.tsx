import type { Service } from '@homora/shared';
import { Server } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { EmptyNote } from '@/components/empty-note';
import { StatusLight } from '@/components/status-light';
import { ServiceIcon } from '@/components/service-icon';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  buildHostView,
  serviceImpact,
  type HostConnection,
  type HostInventories,
  type Impact,
} from '@/lib/hosts';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';
import { t } from '@/i18n';

type Props = {
  services: Service[];
  connections: HostConnection[];
  inventories: HostInventories;
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onEdit?: (service: Service) => void;
  /** Show only this node (from the "See impact" banner link). */
  nodeFilter?: { connectionId: number; node: string } | null;
  onClearFilter?: () => void;
};

const IMPACT_TEXT = {
  'host-offline': 'hosts.impact.hostOffline',
  'guest-stopped': 'hosts.impact.guestStopped',
  'service-down': 'hosts.impact.serviceDown',
  unknown: 'hosts.impact.unknown',
} as const;

function ServiceRow({
  service,
  status,
  blocked,
  impact,
  onEdit,
}: {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  impact: Impact;
  onEdit?: (service: Service) => void;
}) {
  const view = describeStatus(status, blocked);
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-sm font-semibold"
      >
        <ServiceIcon icon={service.icon} name={service.name} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate rounded-sm text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {service.name}
          <span className="sr-only">{t('card.opensNewTab')}</span>
        </a>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {hostOf(service.url)}
        </span>
        {impact in IMPACT_TEXT && (
          <span className="text-xs font-semibold text-destructive">
            {t(IMPACT_TEXT[impact as keyof typeof IMPACT_TEXT])}
          </span>
        )}
      </span>
      <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
      {onEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={() => onEdit(service)}
        >
          {t('hosts.view.edit', { name: service.name })}
        </Button>
      )}
    </li>
  );
}

/**
 * Services by Proxmox host. It is the complete, accessible equivalent of the future Map:
 * everything is reachable by keyboard, and state is always written out, never only colored.
 */
export function HostView({
  services,
  connections,
  inventories,
  statuses,
  blockedIds,
  onEdit,
  nodeFilter = null,
  onClearFilter,
}: Props) {
  const mobile = useIsMobile();
  const full = buildHostView(services, connections, inventories);
  const model = nodeFilter
    ? {
        ...full,
        nodes: full.nodes.filter(
          (node) =>
            node.connectionId === nodeFilter.connectionId && node.node.name === nodeFilter.node,
        ),
        notFound: [],
        unavailable: [],
        unlinked: [],
      }
    : full;
  const rows = (items: Service[]) => (
    <ul className="flex flex-col divide-y">
      {items.map((service) => (
        <ServiceRow
          key={service.id}
          service={service}
          status={statuses[service.id]}
          blocked={blockedIds.has(service.id)}
          impact={serviceImpact(
            service,
            statuses[service.id]?.status,
            blockedIds.has(service.id),
            connections,
            inventories,
          )}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
  const count = (n: number) => t('hosts.view.services', { count: n });
  const sections = [
    {
      key: 'notFound',
      title: t('hosts.view.notFound'),
      items: model.notFound,
      hint: t('hosts.notFoundHint'),
    },
    {
      key: 'unavailable',
      title: t('hosts.view.unavailable'),
      items: model.unavailable,
      hint: t('hosts.view.unavailableHint'),
    },
    { key: 'unlinked', title: t('hosts.view.unlinked'), items: model.unlinked, hint: '' },
  ].filter((section) => section.items.length > 0);
  const nodeKeys = model.nodes.map((node) => node.key);
  const linked = services.some((service) => service.host);
  return (
    <section aria-label={t('hosts.view.title')} className="flex flex-col gap-4">
      {nodeFilter && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {t('hosts.view.filter', { node: nodeFilter.node })}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 pointer-coarse:min-h-11"
            onClick={onClearFilter}
          >
            {t('hosts.view.clearFilter')}
          </Button>
        </p>
      )}
      {!linked && !nodeFilter && (
        <EmptyNote>{`${t('hosts.view.empty')} ${t('hosts.view.emptyHint')}`}</EmptyNote>
      )}
      <Accordion
        type="multiple"
        // Phones start collapsed except the first node; wide screens show everything.
        defaultValue={mobile ? nodeKeys.slice(0, 1) : nodeKeys}
        key={`${mobile}:${nodeKeys.join('|')}`}
        className="flex flex-col gap-3"
      >
        {model.nodes.map((node) => (
          <AccordionItem key={node.key} value={node.key} className="rounded-lg border bg-card px-4">
            <AccordionTrigger className="min-h-11 gap-3">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <Server className="size-4 shrink-0" aria-hidden="true" />
                <span className="font-medium">{node.node.name}</span>
                {connections.length > 1 && (
                  <small className="text-muted-foreground">{node.connectionName}</small>
                )}
                <small className="text-muted-foreground">
                  {t(`hosts.node.${node.node.status}`)} · {count(node.count)}
                  {node.node.status === 'offline' &&
                    ` · ${t('hosts.view.affected', { count: node.count })}`}
                </small>
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              {node.guests.map((group) => (
                <div key={group.key} className="flex flex-col">
                  <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                    {group.guest.name || t(`hosts.type.${group.guest.type}`)}
                    <small className="font-mono text-xs font-normal text-muted-foreground">
                      {group.guest.vmid} · {t(`hosts.type.${group.guest.type}`)} ·{' '}
                      {group.guest.status === 'running'
                        ? t('hosts.state.running')
                        : group.guest.status === 'stopped'
                          ? t('hosts.state.stopped')
                          : t('hosts.state.other')}
                    </small>
                  </h3>
                  {rows(group.services)}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">
          <h2 className="text-sm font-medium">
            {section.title}{' '}
            <small className="font-normal text-muted-foreground">
              {count(section.items.length)}
            </small>
          </h2>
          {section.hint && <p className="text-xs text-muted-foreground">{section.hint}</p>}
          {rows(section.items)}
        </div>
      ))}
    </section>
  );
}
