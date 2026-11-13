import { useId, useState } from 'react';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { t } from '@/i18n';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { CardWidgets } from '@/components/card-widgets';
import { ResourceLine } from '@/components/resource-line';
import { ServiceFailureDetails } from '@/components/service-failure-details';
import { ServiceUptime } from '@/components/service-uptime';
import { cn } from '@/lib/utils';
import { hostOf } from '@/lib/services';
import { HostLine, StatusMeta } from '@/components/service-card-common';
import { repeatsName, SERVICE_CARD_LI } from '@/components/service-card-utils';
import type { ServiceCardLayoutProps } from '@/components/service-card.types';

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
  managing,
  showDescription,
  confirmingRemoval,
  onEdit,
  onRemove,
  onCancelRemoval,
  view,
}: ServiceCardLayoutProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const isBlocked = view.blocked;
  const inline = confirmingRemoval;
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
        <div
          className={cn(
            'flex w-full min-w-0 items-start gap-3',
            managing && 'pr-20 pointer-coarse:pr-24',
          )}
        >
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
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
              >
                {service.name}
                <span className="sr-only">{t('card.opensNewTab')}</span>
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
          <StatusMeta tag={view.tag} meta={view.meta} title={view.title} />
        </div>
        {managing && (
          <ItemActions
            className={cn(
              'z-10 gap-0.5',
              inline
                ? 'relative -mb-1 justify-end gap-1'
                : 'absolute top-2 right-2 pointer-fine:opacity-50 pointer-fine:transition-opacity pointer-fine:group-hover/service:opacity-100 pointer-fine:group-focus-within/service:opacity-100',
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size={inline ? 'sm' : 'icon-sm'}
              data-service-edit={service.id}
              aria-label={t('card.edit', { name: service.name })}
              onClick={onEdit}
            >
              <Pencil />
              {inline && t('common.edit')}
            </Button>
            <Button
              type="button"
              variant={confirmingRemoval ? 'destructive' : 'ghost'}
              size={inline ? 'sm' : 'icon-sm'}
              aria-label={t(confirmingRemoval ? 'card.confirmRemove' : 'card.remove', {
                name: service.name,
              })}
              onClick={onRemove}
              onBlur={onCancelRemoval}
            >
              <Trash2 />
              {inline && t(confirmingRemoval ? 'card.confirmRemoveShort' : 'common.remove')}
            </Button>
          </ItemActions>
        )}
      </Item>
    </li>
  );
}
