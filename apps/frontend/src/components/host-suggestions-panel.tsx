import { useEffect, useState } from 'react';
import type { Service } from '@homora/shared';
import { CircleCheck, CircleHelp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  useHostSuggestions,
  type SuggestionCandidate,
  type SuggestionEvidence,
} from '@/hooks/use-host-suggestions';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  /** Called after a link or unlink so Home reloads the cards. */
  onChanged: () => void;
  /** Opens the service form, where the host can be chosen by hand. */
  onChooseManually: (service: Service) => void;
};

type Decision =
  | { kind: 'accepted'; candidate: SuggestionCandidate }
  | { kind: 'dismissed'; candidate: SuggestionCandidate };

const evidenceText = (item: SuggestionEvidence) =>
  t(`hosts.evidence.${item.kind}`, { address: item.address ?? '' });

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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (id: number) => services.find((service) => service.id === id)?.name ?? '';
  const withCandidate = items.filter((item) => item.candidates.length > 0);
  const withoutCandidate = items.filter((item) => item.candidates.length === 0);

  async function accept(serviceId: number, candidate: SuggestionCandidate) {
    if (!(await link(serviceId, candidate.host))) return false;
    setDecisions((current) => ({ ...current, [serviceId]: { kind: 'accepted', candidate } }));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(serviceId);
      return next;
    });
    return true;
  }
  async function run(task: () => Promise<boolean>) {
    setBusy(true);
    setError('');
    const ok = await task();
    if (!ok) setError(t('hosts.suggest.failed'));
    setBusy(false);
    onChanged();
  }
  async function acceptSelected() {
    await run(async () => {
      let ok = true;
      for (const item of withCandidate) {
        if (!selected.has(item.serviceId) || decisions[item.serviceId]) continue;
        ok = (await accept(item.serviceId, item.candidates[0])) && ok;
      }
      return ok;
    });
  }
  async function undo(serviceId: number) {
    const decision = decisions[serviceId];
    if (!decision) return;
    await run(async () => {
      const ok =
        decision.kind === 'accepted'
          ? await link(serviceId, null)
          : await dismiss(serviceId, decision.candidate.host, false);
      if (ok)
        setDecisions((current) => {
          const next = { ...current };
          delete next[serviceId];
          return next;
        });
      return ok;
    });
  }
  async function dismissCandidate(serviceId: number, candidate: SuggestionCandidate) {
    await run(async () => {
      const ok = await dismiss(serviceId, candidate.host, true);
      if (ok)
        setDecisions((current) => ({ ...current, [serviceId]: { kind: 'dismissed', candidate } }));
      return ok;
    });
  }

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
          {withCandidate.map((item) => {
            const best = item.candidates[0];
            const decision = decisions[item.serviceId];
            const service = services.find((entry) => entry.id === item.serviceId);
            const guest = best.name || String(best.host.vmid);
            return (
              <li
                key={item.serviceId}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  {!decision && (
                    <Checkbox
                      aria-label={t('hosts.suggest.select', { name: nameOf(item.serviceId) })}
                      checked={selected.has(item.serviceId)}
                      className="mt-1 pointer-coarse:size-6"
                      onCheckedChange={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked === true) next.add(item.serviceId);
                          else next.delete(item.serviceId);
                          return next;
                        })
                      }
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {nameOf(item.serviceId)}
                      <span className="text-muted-foreground">→</span>
                      <span>{guest}</span>
                      <small className="font-mono font-normal text-muted-foreground">
                        {best.host.vmid} · {best.host.node}
                      </small>
                      <Badge variant={best.strength === 'strong' ? 'default' : 'secondary'}>
                        <CircleCheck aria-hidden="true" />
                        {t(`hosts.strength.${best.strength}`)}
                      </Badge>
                    </p>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {best.evidence.map((evidence) => (
                        <li key={evidence.kind}>{evidenceText(evidence)}</li>
                      ))}
                    </ul>
                    {best.ambiguous && (
                      <p className="text-xs font-medium">{t('hosts.suggest.ambiguous')}</p>
                    )}
                  </div>
                </div>
                {decision ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span role="status">
                      {decision.kind === 'accepted'
                        ? t('hosts.suggest.accepted', { guest })
                        : t('hosts.suggest.dismissed', { guest })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="pointer-coarse:h-11"
                      disabled={busy}
                      onClick={() => void undo(item.serviceId)}
                    >
                      {t('hosts.suggest.undo')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="pointer-coarse:h-11"
                      disabled={busy}
                      onClick={() => void run(() => accept(item.serviceId, best))}
                    >
                      {t('hosts.suggest.accept')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="pointer-coarse:h-11"
                      disabled={busy}
                      onClick={() => void dismissCandidate(item.serviceId, best)}
                    >
                      {t('hosts.suggest.dismiss')}
                    </Button>
                    {service && item.candidates.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="pointer-coarse:h-11"
                        onClick={() => onChooseManually(service)}
                      >
                        {t('hosts.suggest.manual')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {withoutCandidate.map((item) => {
            const service = services.find((entry) => entry.id === item.serviceId);
            if (!service) return null;
            return (
              <li
                key={item.serviceId}
                className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
              >
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {service.name}
                  <Badge variant="outline">
                    <CircleHelp aria-hidden="true" />
                    {t('hosts.suggest.noEvidence')}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">{t('hosts.suggest.noEvidenceHint')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit pointer-coarse:h-11"
                  onClick={() => onChooseManually(service)}
                >
                  {t('hosts.suggest.manual')}
                </Button>
              </li>
            );
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
