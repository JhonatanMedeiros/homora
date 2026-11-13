import { useEffect } from 'react';
import type { Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { FormError } from '@/components/form-error';
import { EmptyNote } from '@/components/empty-note';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHostSuggestions } from '@/hooks/use-host-suggestions';
import { useHostSuggestionReview } from '@/hooks/use-host-suggestion-review';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { HostSuggestionCandidateRow, HostSuggestionManualRow } from './host-suggestion-rows';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  /** Called after a link or unlink so Home reloads the cards. */
  onChanged: () => void;
  /** Opens the service form, where the host can be chosen by hand. */
  onChooseManually: (service: Service) => void;
};

/**
 * Evidence-based suggestions. Nothing is applied without an explicit action, accepting only
 * writes Homora's link (never Proxmox), and every action can be undone. A suggestion that has no
 * independent evidence only offers manual linking.
 */
export function HostSuggestionsPanel({ open, onOpenChange, ...rest }: Props) {
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-homora="host-suggestions"
        side={mobile ? 'bottom' : 'right'}
        className={cn('gap-0', mobile ? 'h-dvh max-h-dvh rounded-none' : 'sm:max-w-lg')}
      >
        {/* Mounted only while open, so every opening starts with fresh state and a fresh read. */}
        <SuggestionsBody {...rest} />
      </SheetContent>
    </Sheet>
  );
}

function SuggestionsBody({
  services,
  onChanged,
  onChooseManually,
}: Omit<Props, 'open' | 'onOpenChange'>) {
  const { items, status, partial, load, link, dismiss } = useHostSuggestions();
  const review = useHostSuggestionReview({ items, link, dismiss, onChanged });
  const {
    selected,
    setSelected,
    decisions,
    busy,
    error,
    withCandidate,
    withoutCandidate,
    run,
    accept,
    acceptSelected,
    undo,
    dismissCandidate,
  } = review;

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('hosts.suggest.title')}</SheetTitle>
        <SheetDescription>{t('hosts.suggest.description')}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <div role="status" className="empty:hidden">
          {status === 'loading' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> {t('hosts.suggest.loading')}
            </p>
          )}
        </div>
        {status === 'error' && (
          <div className="flex flex-col items-start gap-2">
            <FormError>{t('hosts.suggest.error')}</FormError>
            <Button type="button" variant="outline" onClick={() => void load()}>
              {t('hosts.retry')}
            </Button>
          </div>
        )}
        {partial && (
          <Alert>
            <AlertDescription>{t('hosts.suggest.partial')}</AlertDescription>
          </Alert>
        )}
        <FormError>{error}</FormError>
        {status === 'ready' && items.length === 0 && (
          <EmptyNote>{t('hosts.suggest.empty')}</EmptyNote>
        )}
        <ul className="flex flex-col gap-3">
          {withCandidate.map((item) => (
            <HostSuggestionCandidateRow
              key={item.serviceId}
              item={item}
              service={services.find((service) => service.id === item.serviceId)}
              selected={selected.has(item.serviceId)}
              decision={decisions[item.serviceId]}
              busy={busy}
              onSelect={(checked) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(item.serviceId);
                  else next.delete(item.serviceId);
                  return next;
                })
              }
              onAccept={(candidate) => void run(() => accept(item.serviceId, candidate))}
              onDismiss={(candidate) => void dismissCandidate(item.serviceId, candidate)}
              onUndo={() => void undo(item.serviceId)}
              onChooseManually={onChooseManually}
            />
          ))}
          {withoutCandidate.map((item) => {
            const service = services.find((entry) => entry.id === item.serviceId);
            return service ? (
              <HostSuggestionManualRow
                key={item.serviceId}
                service={service}
                onChooseManually={onChooseManually}
              />
            ) : null;
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
        <Button
          type="button"
          variant="ghost"
          className="pointer-coarse:h-11"
          disabled={busy || status === 'loading'}
          onClick={() => void load()}
        >
          {t('hosts.suggest.refresh')}
        </Button>
        <Button
          type="button"
          className="pointer-coarse:h-11"
          disabled={busy || selected.size === 0}
          onClick={() => void acceptSelected()}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {t('hosts.suggest.acceptSelected', { count: selected.size })}
        </Button>
      </div>
    </>
  );
}
