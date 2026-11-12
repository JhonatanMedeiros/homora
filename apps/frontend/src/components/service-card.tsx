import type { Service, UptimeRange, UptimeSummary } from '@homora/shared';
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
import { ServiceUptime, UptimePercent } from '@/components/service-uptime';
import { ServiceFailureDetails } from '@/components/service-failure-details';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import { cn } from '@/lib/utils';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';

type Props = {
  service: Service;
  status?: ServiceStatus;
  widgets?: CardWidgetState[];
  uptime?: UptimeSummary;
  uptimeRange?: UptimeRange;
  onUptimeRangeChange?: (range: UptimeRange) => void;
  blocked: boolean;
  managing: boolean;
  list?: boolean;
  showDescription: boolean;
  confirmingRemoval: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onCancelRemoval: () => void;
};

/** A description that only repeats the name ("Proxmox" / "Proxmox Phobos") adds nothing. */
function repeatsName(name: string, description: string) {
  const n = name.trim().toLowerCase();
  const d = description.trim().toLowerCase();
  return d === n || (d.startsWith(`${n} `) && d.split(/\s+/).length <= 2);
}

/** Latency or fallback next to the status, with the type of check as a small tag. */
function StatusMeta({
  tag,
  meta,
  title,
}: {
  tag: string | null;
  meta: string | null;
  title: string | null;
}) {
  if (!tag && !meta) return null;
  return (
    <span
      title={title ?? undefined}
      className="inline-flex shrink-0 items-center gap-2 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
    >
      {tag && (
        <span className="rounded-sm border px-1 py-0.5 text-[0.625rem] leading-none tracking-wider uppercase">
          {tag}
        </span>
      )}
      {meta}
    </span>
  );
}

/** A service: opens in a new tab, displays its status light, and has edit actions. */
/** Stable id for "go to card"; `data-highlight` is set for a moment by the command palette. */
const SERVICE_LI =
  'group/service flex min-w-0 scroll-mt-24 rounded-lg data-[highlight=true]:ring-2 data-[highlight=true]:ring-primary data-[highlight=true]:ring-offset-2 data-[highlight=true]:ring-offset-background';

export function ServiceCard({
  service: s,
  status,
  widgets = [],
  uptime,
  uptimeRange = '24h',
  onUptimeRangeChange = () => {},
  blocked,
  managing,
  list = false,
  showDescription,
  confirmingRemoval,
  onEdit,
  onRemove,
  onCancelRemoval,
}: Props) {
  const state = status?.status ?? 'unknown';
  const view = describeStatus(status, blocked);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const isBlocked = view.blocked;
  const inline = confirmingRemoval;
  if (list) {
    return (
      <li id={`service-${s.id}`} className={SERVICE_LI}>
        <Item
          variant="outline"
          size="sm"
          className={cn(
            'service-surface relative w-full flex-row flex-wrap items-center gap-x-3 gap-y-2 bg-card px-3 py-2 hover:bg-accent/60 focus-within:bg-accent/60',
            state === 'available' &&
              !isBlocked &&
              'shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary)_16%,transparent)]',
            state === 'unavailable' && !isBlocked && 'border-destructive bg-destructive/10',
          )}
        >
          <ItemMedia
            variant="icon"
            aria-hidden="true"
            className={cn(
              'size-8 rounded-md bg-secondary text-sm font-semibold',
              state === 'available' && !isBlocked && 'bg-primary/15 text-accent-text',
            )}
          >
            <ServiceIcon icon={s.icon} name={s.name} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0">
            <ItemTitle className="w-full text-sm">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.name}
                <span className="sr-only">{t('card.opensNewTab')}</span>
              </a>
            </ItemTitle>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {hostOf(s.url)}
            </span>
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
                data-service-edit={s.id}
                aria-label={t('card.edit', { name: s.name })}
                onClick={onEdit}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant={confirmingRemoval ? 'destructive' : 'ghost'}
                size={confirmingRemoval ? 'sm' : 'icon-sm'}
                aria-label={t(confirmingRemoval ? 'card.confirmRemove' : 'card.remove', {
                  name: s.name,
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
          {widgets.length > 0 && (
            <div className="basis-full">
              <CardWidgets widgets={widgets} />
            </div>
          )}
        </Item>
      </li>
    );
  }
  return (
    <li id={`service-${s.id}`} className={SERVICE_LI}>
      <Item
        variant="outline"
        className={cn(
          'service-surface relative w-full flex-col items-stretch gap-3 bg-card hover:bg-accent/60 focus-within:bg-accent/60',
          state === 'available' &&
            !isBlocked &&
            'shadow-[inset_0_1px_0_color-mix(in_oklch,var(--primary)_16%,transparent)]',
          state === 'unavailable' &&
            !isBlocked &&
            'border-destructive bg-destructive/10 ring-1 ring-destructive',
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
              state === 'available' && !isBlocked && 'bg-primary/15 text-accent-text',
            )}
          >
            <ServiceIcon icon={s.icon} name={s.name} />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full text-base">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.name}
                <span className="sr-only">{t('card.opensNewTab')}</span>
              </a>
            </ItemTitle>
            <span className="truncate font-mono text-[0.8125rem] text-muted-foreground">
              {hostOf(s.url)}
            </span>
          </ItemContent>
        </div>
        {s.description && showDescription && !repeatsName(s.name, s.description) && (
          <ItemDescription className="line-clamp-2">{s.description}</ItemDescription>
        )}
        <CardWidgets widgets={widgets} />
        {view.note && (
          <div className="relative z-10 -mb-1 flex items-center justify-between gap-2">
            <p
              className={cn(
                'min-w-0 text-sm',
                view.failing ? 'text-destructive' : 'text-muted-foreground',
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
                aria-label={t('card.detailsFor', { name: s.name })}
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
          <ServiceFailureDetails id={detailsId} service={s} status={status} onEdit={onEdit} />
        )}
        <ServiceUptime
          service={s}
          summary={uptime}
          range={uptimeRange}
          onRangeChange={onUptimeRangeChange}
        />
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-t pt-3',
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
            <>
              <Button
                type="button"
                variant="ghost"
                size={inline ? 'sm' : 'icon-sm'}
                data-service-edit={s.id}
                aria-label={t('card.edit', { name: s.name })}
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
                  name: s.name,
                })}
                onClick={onRemove}
                onBlur={onCancelRemoval}
              >
                <Trash2 />
                {inline && t(confirmingRemoval ? 'card.confirmRemoveShort' : 'common.remove')}
              </Button>
            </>
          </ItemActions>
        )}
      </Item>
    </li>
  );
}
