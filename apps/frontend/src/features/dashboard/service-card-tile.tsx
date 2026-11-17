import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@homora/ui/item';
import { t } from '@/i18n';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { CardWidgets } from '@/components/card-widgets';
import { ResourceLine } from '@/components/resource-line';
import { ServiceFailureDetails } from '@/features/uptime/service-failure-details';
import { ServiceUptime } from '@/features/uptime/service-uptime';
import { cn } from '@homora/ui/lib/utils';
import { hostOf } from '@/lib/services';
import { HostLine, StatusMeta } from '@/features/dashboard/service-card-common';
import { ServiceLinksMenu } from '@/components/service-links-menu';
import { repeatsName, SERVICE_CARD_LI } from '@/features/dashboard/service-card-utils';
import type { ServiceCardLayoutProps } from '@/features/dashboard/service-card.types';

export function ServiceCardTile({
  service,
  status,
  widgets = [],
  resourceLink,
  onResource = () => {},
  uptime,
  monitor,
  tags = [],
  onTag,
  uptimeRange = '24h',
  onUptimeRangeChange = () => {},
  host = null,
  impact = 'none',
  dependencyNote,
  showDescription,
  onDetails,
  onEdit,
  view,
}: ServiceCardLayoutProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const isBlocked = view.blocked;
  return (
    <li id={`service-${service.id}`} className={SERVICE_CARD_LI}>
      <Item
        data-homora="service-card"
        variant="outline"
        className={cn(
          'service-surface relative h-full w-full flex-col flex-nowrap items-stretch gap-3 bg-card hover:bg-accent/60 focus-within:bg-accent/60',
          view.state === 'available' &&
            !isBlocked &&
            'shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary)_16%,transparent)]',
          view.state === 'unavailable' &&
            !isBlocked &&
            'border-destructive bg-destructive/10 ring-1 ring-destructive',
          view.degraded && !isBlocked && 'border-warning/60 ring-1 ring-warning/40',
        )}
      >
        {service.checkInsecure && (
          <span className="text-xs text-muted-foreground">{t('form.insecureTlsBadge')}</span>
        )}
        <div className="flex w-full min-w-0 items-start gap-3">
          <ItemMedia
            variant="icon"
            aria-hidden="true"
            className={cn(
              'size-10 rounded-md bg-secondary text-lg font-semibold',
              view.state === 'available' && !isBlocked && 'bg-primary/15 text-accent-text',
            )}
          >
            <ServiceIcon icon={service.icon} name={service.name} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full text-base">
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
            <span className="truncate font-mono text-[0.8125rem] text-muted-foreground">
              {hostOf(service.url)}
            </span>
            {host && <HostLine host={host} impact={impact} />}
            {dependencyNote && (
              <span className="truncate text-xs text-muted-foreground">{dependencyNote}</span>
            )}
          </ItemContent>
        </div>
        {service.description &&
          showDescription &&
          !repeatsName(service.name, service.description) && (
            <ItemDescription className="line-clamp-2">{service.description}</ItemDescription>
          )}
        <CardWidgets widgets={widgets} />
        {resourceLink && <ResourceLine info={resourceLink} onOpen={onResource} />}
        {view.note && (
          <div className="relative z-10 -mb-1 flex items-center justify-between gap-2">
            <p
              className={cn(
                'min-w-0 text-sm',
                view.failing
                  ? 'text-destructive'
                  : view.degraded
                    ? 'text-warning'
                    : 'text-muted-foreground',
              )}
            >
              {view.note}
            </p>
            {view.failing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-my-1 -mr-2 shrink-0"
                aria-expanded={detailsOpen}
                aria-controls={detailsId}
                aria-label={t('card.detailsFor', { name: service.name })}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                {t('card.details')}
                <ChevronDown
                  aria-hidden="true"
                  className={cn('transition-transform', detailsOpen && 'rotate-180')}
                />
              </Button>
            )}
          </div>
        )}
        {view.failing && detailsOpen && status && (
          <ServiceFailureDetails id={detailsId} service={service} status={status} onEdit={onEdit} />
        )}
        <ServiceUptime
          service={service}
          summary={uptime}
          range={uptimeRange}
          onRangeChange={onUptimeRangeChange}
          monitor={monitor}
          onDetails={onDetails}
        />
        {tags.length > 0 && (
          <ul aria-label={t('form.tags')} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {tags.map((tag) => (
              <li key={tag}>
                {onTag ? (
                  <button
                    type="button"
                    onClick={() => onTag(tag)}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground pointer-coarse:py-1.5"
                  >
                    {tag}
                  </button>
                ) : (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {tag}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div
          className={cn(
            'mt-auto flex items-center justify-between gap-3 border-t pt-3',
            view.failing && !isBlocked && 'border-destructive/35',
          )}
        >
          <StatusLight state={view.state} blocked={isBlocked} label={view.label} />
          <div className="relative z-10 -my-1 flex min-w-0 items-center gap-2">
            <ServiceLinksMenu service={service} side="top" className="-mr-1" />
            <StatusMeta tag={view.tag} meta={view.meta} title={view.title} />
          </div>
        </div>
      </Item>
    </li>
  );
}
