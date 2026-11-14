import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { t } from '@/i18n';
import { CardWidgets } from '@/components/card-widgets';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { UptimeMiniBar } from '@/features/uptime/service-uptime';
import { cn } from '@/lib/utils';
import { hostOf } from '@/lib/services';
import { HostLine, StatusMeta } from '@/features/dashboard/service-card-common';
import { ServiceLinksMenu } from '@/components/service-links-menu';
import { SERVICE_CARD_LI } from '@/features/dashboard/service-card-utils';
import type { ServiceCardLayoutProps } from '@/features/dashboard/service-card.types';

/**
 * The dense default tile: icon, name, host, the state in words, a quiet bar of the period and the
 * latency. Everything else (history, incidents, tags, integration readouts) lives in the card
 * layout and on the detail page, so a lab of fifty services still fits on one screen.
 */
export function ServiceCardCompact({
  service,
  widgets = [],
  uptime,
  monitor,
  host = null,
  impact = 'none',
  dependencyNote,
  onDetails,
  view,
}: ServiceCardLayoutProps) {
  const isBlocked = view.blocked;
  return (
    <li id={`service-${service.id}`} className={SERVICE_CARD_LI}>
      <Item
        data-homora="service-card"
        data-layout="compact"
        variant="outline"
        size="sm"
        className={cn(
          'service-surface relative h-full w-full flex-col flex-nowrap items-stretch gap-2.5 bg-card hover:bg-accent/60 focus-within:bg-accent/60',
          view.state === 'available' &&
            !isBlocked &&
            'shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary)_16%,transparent)]',
          view.state === 'unavailable' && !isBlocked && 'border-destructive bg-destructive/10',
          view.degraded && !isBlocked && 'border-warning/60',
        )}
      >
        <div className="flex w-full min-w-0 items-center gap-2.5">
          <ItemMedia
            variant="icon"
            aria-hidden="true"
            className={cn(
              'size-9 rounded-md bg-secondary text-base font-semibold',
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
            <span className="truncate font-mono text-xs text-muted-foreground">
              {hostOf(service.url)}
            </span>
          </ItemContent>
          <span className="relative z-10 flex shrink-0 items-center">
            <ServiceLinksMenu service={service} variant="icon" />
            {onDetails && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('card.detailsFor', { name: service.name })}
                onClick={onDetails}
              >
                <Info />
              </Button>
            )}
          </span>
        </div>
        {host && impact !== 'none' && <HostLine host={host} impact={impact} />}
        {dependencyNote && (
          <span className="truncate text-xs text-muted-foreground">{dependencyNote}</span>
        )}
        <CardWidgets widgets={widgets} layout="list" />
        {service.checkInsecure && (
          <span className="text-xs text-muted-foreground">{t('form.insecureTlsBadge')}</span>
        )}
        {view.note && (
          <p
            className={cn(
              'line-clamp-2 text-xs',
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
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusLight
            state={view.state}
            blocked={isBlocked}
            label={view.label}
            className="shrink-0 text-xs"
          />
          <UptimeMiniBar summary={uptime} monitor={monitor} />
          <StatusMeta tag={view.tag} meta={view.meta} title={view.title} />
        </div>
      </Item>
    </li>
  );
}
