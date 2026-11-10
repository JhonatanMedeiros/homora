import type { DragEvent } from 'react';
import type { Service } from '@homora/shared';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { StatusTag } from '@/components/status-tag';
import { cn } from '@/lib/utils';
import { formatAttempt, hostOf, type ServiceStatus } from '@/lib/services';
import { getLocale, t } from '@/i18n';

type Props = {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  organizing: boolean;
  confirmingRemoval: boolean;
  dragging: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onCancelRemoval: () => void;
  onMove: (direction: -1 | 1) => void;
  dragProps: {
    onDragStart: (event: DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
};

/** Um serviço: abre em nova aba, mostra o estado em fita e tem ações de edição. */
export function ServiceCard({
  service: s,
  status,
  blocked,
  organizing,
  confirmingRemoval,
  dragging,
  onEdit,
  onRemove,
  onCancelRemoval,
  onMove,
  dragProps,
}: Props) {
  const state = status?.status ?? 'unknown';
  const isBlocked = blocked && state !== 'available';
  const inline = organizing || confirmingRemoval;
  return (
    <li draggable={organizing} className="group/service flex" {...dragProps}>
      <Item
        variant="outline"
        className={cn(
          'relative w-full flex-col items-stretch gap-3 bg-card transition-colors hover:bg-accent/40 focus-within:bg-accent/40',
          state === 'unavailable' &&
            !isBlocked &&
            'border-destructive bg-destructive/10 ring-1 ring-destructive',
          organizing && 'cursor-grab border-dashed',
          dragging && 'opacity-50',
        )}
      >
        <div className="flex items-start gap-3 pr-20 pointer-coarse:pr-24">
          <ItemMedia
            variant="icon"
            aria-hidden="true"
            className="size-10 rounded-md bg-secondary text-lg font-semibold"
          >
            {s.icon || s.name.slice(0, 1).toLocaleUpperCase(getLocale())}
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
        {s.description && (
          <ItemDescription className="line-clamp-2">{s.description}</ItemDescription>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusTag state={state} blocked={isBlocked} />
          {!isBlocked && status?.lastAttempt && state !== 'available' && (
            <time dateTime={status.lastAttempt} className="text-xs text-muted-foreground">
              {t('card.lastAttempt', { time: formatAttempt(status.lastAttempt) })}
            </time>
          )}
        </div>
        <ItemActions
          className={cn(
            'z-10 gap-0.5',
            inline
              ? 'relative -mb-1 justify-end gap-1'
              : 'absolute top-2 right-2 pointer-fine:opacity-50 pointer-fine:transition-opacity pointer-fine:group-hover/service:opacity-100 pointer-fine:group-focus-within/service:opacity-100',
          )}
        >
          {organizing ? (
            <>
              <GripVertical aria-hidden="true" className="mr-auto size-4 text-muted-foreground" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('card.moveUp', { name: s.name })}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('card.moveDown', { name: s.name })}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
              </Button>
            </>
          ) : (
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
                aria-label={
                  confirmingRemoval
                    ? t('card.confirmRemove', { name: s.name })
                    : t('card.remove', { name: s.name })
                }
                onClick={onRemove}
                onBlur={onCancelRemoval}
              >
                <Trash2 />
                {inline && (confirmingRemoval ? t('card.confirmRemoveShort') : t('common.remove'))}
              </Button>
            </>
          )}
        </ItemActions>
      </Item>
    </li>
  );
}
