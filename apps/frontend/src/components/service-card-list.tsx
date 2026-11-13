import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item';
import { t } from '@/i18n';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { CardWidgets } from '@/components/card-widgets';
import { ResourceLine } from '@/components/resource-line';
import { UptimePercent } from '@/components/service-uptime';
import { cn } from '@/lib/utils';
import { hostOf } from '@/lib/services';
import { HostLine, StatusMeta } from '@/components/service-card-common';
import { SERVICE_LI } from '@/components/service-card-utils';
import type { ServiceCardLayoutProps } from '@/components/service-card.types';

export function ServiceCardList({
  service,
  widgets = [],
  resourceLink,
  onResource = () => {},
  uptime,
  host = null,
  impact = 'none',
  dependencyNote,
  managing,
  confirmingRemoval,
  onEdit,
  onRemove,
  onCancelRemoval,
  view,
}: ServiceCardLayoutProps) {
  const isBlocked = view.blocked;
  return (
    <li id={`service-${service.id}`} className={SERVICE_LI}>
      <Item
        data-homora="service-card"
        variant="outline"
        size="sm"
        className={cn(
          'service-surface relative w-full flex-row flex-wrap items-center gap-x-3 gap-y-2 bg-card px-3 py-2 hover:bg-accent/60 focus-within:bg-accent/60',
          view.state === 'available' &&
            !isBlocked &&
            'shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary)_16%,transparent)]',
          view.state === 'unavailable' && !isBlocked && 'border-destructive bg-destructive/10',
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
        <ItemContent
          className={cn('min-w-0 gap-0', managing && 'max-sm:basis-[calc(100%_-_2.75rem)]')}
        >
          <ItemTitle className="w-full text-sm">
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
          <span className="truncate font-mono text-xs text-muted-foreground">
            {hostOf(service.url)}
          </span>
          {host && <HostLine host={host} impact={impact} />}
          {dependencyNote && (
            <span className="truncate text-xs text-muted-foreground">{dependencyNote}</span>
          )}
          <CardWidgets widgets={widgets} layout="list" />
        </ItemContent>
        <StatusLight
          state={view.state}
          blocked={isBlocked}
          label={view.label}
          className="shrink-0 max-sm:[&>span:last-child]:sr-only"
        />
        <StatusMeta tag={view.tag} meta={view.meta} title={view.title} />
        <UptimePercent summary={uptime} />
        {managing && (
          <ItemActions className="z-10 ml-auto shrink-0 gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              data-service-edit={service.id}
              aria-label={t('card.edit', { name: service.name })}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              variant={confirmingRemoval ? 'destructive' : 'ghost'}
              size={confirmingRemoval ? 'sm' : 'icon-sm'}
              aria-label={t(confirmingRemoval ? 'card.confirmRemove' : 'card.remove', {
                name: service.name,
              })}
              onClick={onRemove}
              onBlur={onCancelRemoval}
            >
              <Trash2 />
              {confirmingRemoval && t('card.confirmRemoveShort')}
            </Button>
          </ItemActions>
        )}
        {view.note && (
          <p
            className={cn(
              'basis-full pl-11 text-xs',
              view.failing ? 'text-destructive' : 'text-muted-foreground',
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
