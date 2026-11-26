import { HostAddress } from '@/components/host-address';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@homora/ui/item';
import { t } from '@/i18n';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { CardWidgets } from '@/components/card-widgets';
import { ResourceLine } from '@/components/resource-line';
import { UptimePercent } from '@/features/uptime/service-uptime';
import { cn } from '@homora/ui/lib/utils';
import { HostLine, StatusMeta } from '@/features/dashboard/service-card-common';
import { ServiceLinksMenu } from '@/components/service-links-menu';
import { SERVICE_CARD_LI } from '@/features/dashboard/service-card-utils';
import type { ServiceCardLayoutProps } from '@/features/dashboard/service-card.types';

export function ServiceCardList({
  service,
  widgets = [],
  resourceLink,
  onResource = () => {},
  uptime,
  host = null,
  impact = 'none',
  dependencyNote,
  view,
}: ServiceCardLayoutProps) {
  const isBlocked = view.blocked;
  return (
    <li id={`service-${service.id}`} className={SERVICE_CARD_LI}>
      <Item
        data-homora="service-card"
        variant="outline"
        size="sm"
        className={cn(
          'service-surface relative h-full w-full flex-row flex-wrap items-center gap-x-3 gap-y-2 bg-card px-3 py-2 hover:bg-accent/60 focus-within:bg-accent/60',
          view.state === 'available' &&
            !isBlocked &&
            'shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary)_16%,transparent)]',
          view.state === 'unavailable' && !isBlocked && 'border-destructive bg-destructive/10',
          view.degraded && !isBlocked && 'border-warning/60',
        )}
      >
        <ItemMedia
          variant="icon"
          aria-hidden="true"
          className={cn(
            'size-8 rounded-md bg-secondary text-sm font-semibold',
            view.state === 'available' && !isBlocked && 'bg-primary/15 text-accent-text',
          )}
        >
          <ServiceIcon icon={service.icon} name={service.name} />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0">
          <ItemTitle className="w-full text-sm">
            <a
              href={service.url}
              target={service.openTarget === 'same-tab' ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="truncate rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
            >
              {service.name}
              {service.openTarget !== 'same-tab' && (
                <span className="sr-only">{t('card.opensNewTab')}</span>
              )}
            </a>
          </ItemTitle>
          <HostAddress url={service.url} />
          {host && <HostLine host={host} impact={impact} />}
          {dependencyNote && (
            <span className="truncate text-xs text-muted-foreground">{dependencyNote}</span>
          )}
          <CardWidgets widgets={widgets} layout="list" />
          {service.checkInsecure && (
            <span className="text-xs text-muted-foreground">{t('form.insecureTlsBadge')}</span>
          )}
        </ItemContent>
        <StatusLight
          state={view.state}
          blocked={isBlocked}
          label={view.label}
          className="shrink-0 max-sm:[&>span:last-child]:sr-only"
        />
        <StatusMeta tag={view.tag} meta={view.meta} title={view.title} />
        <UptimePercent summary={uptime} />
        <span className="relative z-10 shrink-0 empty:hidden">
          <ServiceLinksMenu service={service} variant="icon" />
        </span>
        {view.note && (
          <p
            className={cn(
              'basis-full pl-11 text-xs',
              view.failing
                ? 'text-destructive'
                : view.degraded
                  ? 'text-warning'
                  : 'text-muted-foreground',
            )}
          >
            {view.note}
          </p>
        )}
        {resourceLink && (
          <div className="basis-full pl-11">
            <ResourceLine info={resourceLink} onOpen={onResource} />
          </div>
        )}
      </Item>
    </li>
  );
}
