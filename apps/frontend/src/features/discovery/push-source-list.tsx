import { EllipsisVertical } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homora/ui/dropdown-menu';
import { formatDateTime, t } from '@/i18n';

import type { PushSource, SourceChange } from './push-source-model';
export type { PushSource, SourceChange } from './push-source-model';

function sourceStatus(source: PushSource) {
  if (source.revoked) return { label: t('push.status.revoked'), variant: 'secondary' } as const;
  if (!source.receivedAt) return { label: t('push.status.waiting'), variant: 'outline' } as const;
  if (source.stale) return { label: t('push.status.stale'), variant: 'destructive' } as const;
  return { label: t('push.status.online'), variant: 'success' } as const;
}

export function PushSourceList({
  sources,
  busy,
  onReview,
  onChange,
}: {
  sources: PushSource[];
  busy: boolean;
  onReview: (source: PushSource) => void;
  onChange: (source: PushSource, change: SourceChange) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
      {sources.map((source) => {
        const status = sourceStatus(source);
        return (
          <li
            key={source.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-words">{source.name}</strong>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {source.revoked
                  ? t('push.revoked')
                  : source.receivedAt
                    ? t('push.last', { time: formatDateTime(source.receivedAt) })
                    : t('push.never')}
              </p>
              {!source.revoked && source.receivedAt && source.stale ? (
                <p className="text-sm">{t('push.expired')}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || Boolean(source.revoked) || !source.receivedAt}
                onClick={() => onReview(source)}
              >
                {t('push.review')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('push.actions', { name: source.name })}
                  >
                    <EllipsisVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={busy || Boolean(source.revoked)}
                    onSelect={() => onChange(source, 'rotate')}
                  >
                    {t('push.rotate')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={busy || Boolean(source.revoked)}
                    onSelect={() => onChange(source, 'revoke')}
                  >
                    {t('push.revoke')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={busy}
                    onSelect={() => onChange(source, 'remove')}
                  >
                    {t('push.remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
