import type { Service } from '@homora/shared';
import { Pencil, Trash2 } from 'lucide-react';
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
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import { cn } from '@/lib/utils';
import { formatAttempt, hostOf, type ServiceStatus } from '@/lib/services';

type Props = {
  service: Service;
  status?: ServiceStatus;
  widgets?: CardWidgetState[];
  blocked: boolean;
  managing: boolean;
  list?: boolean;
  showDescription: boolean;
  confirmingRemoval: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onCancelRemoval: () => void;
};

const REASON_LABEL = {
  responding: 'status.available',
  redirect: 'status.redirect',
  'login-required': 'status.loginRequired',
  'not-found': 'status.notFound',
  'error-status': 'status.errorStatus',
  reachable: 'status.reachable',
  'no-response': 'status.noResponse',
  unchecked: 'status.unchecked',
} as const;

/** A service: opens in a new tab, displays its status light, and has edit actions. */
export function ServiceCard({
  service: s,
  status,
  widgets = [],
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
  const reason = status?.reason;
  const detail =
    reason === 'reachable' && typeof status?.latencyMs === 'number'
      ? `Ping · ${status.latencyMs} ms`
      : reason && reason !== 'responding' && typeof status?.httpStatus === 'number'
        ? [
            `HTTP ${status.httpStatus}`,
            typeof status.latencyMs === 'number' && `${status.latencyMs} ms`,
          ]
            .filter(Boolean)
            .join(' · ')
        : null;
  const isBlocked = blocked && state !== 'available';
  const inline = confirmingRemoval;
  if (list) {
    return (
      <li className="group/service flex min-w-0">
        <Item
          variant="outline"
          size="sm"
          className={cn(
            'relative w-full flex-row flex-wrap items-center gap-x-3 gap-y-2 bg-card px-3 py-2 transition-colors hover:bg-accent/60 focus-within:bg-accent/60',
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
            state={state}
            blocked={isBlocked}
            label={
              !isBlocked && reason && reason !== 'responding' ? t(REASON_LABEL[reason]) : undefined
            }
            className="shrink-0 max-sm:[&>span:last-child]:sr-only"
          />
          {!isBlocked && status?.lastAttempt && state !== 'available' && (
            <time dateTime={status.lastAttempt} className="shrink-0 text-xs text-muted-foreground">
              {t('card.lastAttempt', { time: formatAttempt(status.lastAttempt) })}
            </time>
          )}
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
    <li className="group/service flex min-w-0">
      <Item
        variant="outline"
        className={cn(
          'relative w-full flex-col items-stretch gap-3 bg-card transition-colors hover:bg-accent/60 focus-within:bg-accent/60',
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
        {s.description && showDescription && (
          <ItemDescription className="line-clamp-2">{s.description}</ItemDescription>
        )}
        <CardWidgets widgets={widgets} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusLight
            state={state}
            blocked={isBlocked}
            label={
              !isBlocked && reason && reason !== 'responding' ? t(REASON_LABEL[reason]) : undefined
            }
          />
          {!isBlocked && detail && (
            <span className="font-mono text-xs text-muted-foreground">{detail}</span>
          )}
          {!isBlocked && status?.lastAttempt && state !== 'available' && (
            <time dateTime={status.lastAttempt} className="text-xs text-muted-foreground">
              {t('card.lastAttempt', { time: formatAttempt(status.lastAttempt) })}
            </time>
          )}
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
