import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, ListChecks, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@homora/ui/alert-dialog';
import { Button } from '@homora/ui/button';
import { Kbd, KbdGroup } from '@homora/ui/kbd';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';
import { parseDiff, proposalSummary, type Proposal, type Service } from './agent-model';
import { ApproveButton } from './approve-button';
import {
  confirmCopy,
  DETAIL_FOOTER_CLASS,
  reviewEntries,
  validity,
  type ReviewEntry,
} from './review-model';
import { needsHold } from './proposal-risk';
import { RiskLabel } from './risk-label';
import { shortcutAllowed } from './review-shortcuts';

type Filter = 'all' | 'low' | 'attention';
const matches = (entry: ReviewEntry, filter: Filter) =>
  filter === 'all' || (filter === 'low' ? entry.risk === 'low' : entry.risk !== 'low');

type Props = {
  pending: Proposal[];
  /** The id being decided, if any: every decision waits for it. */
  reviewing?: string | null;
  now?: number;
  agentName: (id: string) => string;
  serviceFor: (proposal: Proposal) => Service | undefined;
  onReview: (id: string, approve: boolean, batch?: boolean) => void;
  /** Approves routine proposals one after the other. */
  onApproveMany: (ids: string[]) => void;
  renderProposal: (proposal: Proposal) => ReactNode;
  renderBatchItem: (proposal: Proposal, open: boolean) => ReactNode;
};

/**
 * The review queue: every waiting proposal on one side and the selected one in full on the other.
 * On a phone the queue moves into a sheet and the proposals are paged one at a time.
 */
export function ReviewInbox({
  pending,
  reviewing,
  now,
  agentName,
  serviceFor,
  onReview,
  onApproveMany,
  renderProposal,
  renderBatchItem,
}: Props) {
  const all = reviewEntries(pending);
  const counts = {
    all: all.length,
    low: all.filter((entry) => entry.risk === 'low').length,
    attention: all.filter((entry) => entry.risk !== 'low').length,
  };
  const [chosen, setFilter] = useState<Filter>('all');
  // A filter that runs out of entries falls back to everything instead of an empty queue.
  const filter = chosen !== 'all' && counts[chosen] === 0 ? 'all' : chosen;
  const entries = all.filter((entry) => matches(entry, filter));

  // The selection remembers its place, so deciding the selected entry moves on to its neighbour.
  const [chosenEntry, setChosenEntry] = useState({ key: entries[0]?.key, index: 0 });
  const found = entries.findIndex((entry) => entry.key === chosenEntry.key);
  const index = found >= 0 ? found : Math.min(chosenEntry.index, entries.length - 1);
  const selected = entries[index];
  if (selected && (selected.key !== chosenEntry.key || index !== chosenEntry.index))
    setChosenEntry({ key: selected.key, index });

  const [queueOpen, setQueueOpen] = useState(false);
  const select = (entry: ReviewEntry | undefined) =>
    entry && setChosenEntry({ key: entry.key, index: entries.indexOf(entry) });

  const busy = Boolean(reviewing);
  const reject = (entry: ReviewEntry) =>
    onReview(entry.batchId ?? entry.proposals[0].id, false, Boolean(entry.batchId));
  // Always read the latest selection from the key handler without re-subscribing on each render.
  const latest = useRef({ entries, index, busy, reject });
  useEffect(() => {
    latest.current = { entries, index, busy, reject };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutAllowed(event) || event.repeat) return;
      const { entries: list, index: at, busy: waiting, reject: decline } = latest.current;
      const key = event.key.toLowerCase();
      if (key === 'j' || key === 'k') {
        const next = list[at + (key === 'j' ? 1 : -1)];
        if (next) setChosenEntry({ key: next.key, index: at + (key === 'j' ? 1 : -1) });
      } else if (key === 'r' && list[at] && !waiting) decline(list[at]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const routine = all
    .filter(
      (entry) => entry.risk === 'low' && !entry.batchId && entry.proposals[0].state === 'pending',
    )
    .map((entry) => entry.proposals[0].id);

  const queue = (onPick?: () => void) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b p-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={filter}
          aria-label={t('proposal.filterLabel')}
          className="flex-wrap"
          onValueChange={(value) => value && setFilter(value as Filter)}
        >
          {(['all', 'low', 'attention'] as const).map((id) => (
            <ToggleGroupItem key={id} value={id} className="rounded-full px-3 text-xs">
              {t(`proposal.filter.${id}`, { count: counts[id] })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {routine.length > 1 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={busy} className="w-full">
                <ListChecks data-icon="inline-start" />
                {t('proposal.approveLow', { count: routine.length })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('proposal.approveLowTitle', { count: routine.length })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t('proposal.approveLowBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => onApproveMany(routine)}>
                  {t('proposal.approveLow', { count: routine.length })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <ul
        aria-label={t('proposal.queueLabel')}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {entries.map((entry) => {
          const first = entry.proposals[0];
          const title = entry.batchId
            ? t('proposal.batchTitle', { count: entry.proposals.length })
            : proposalSummary(parseDiff(first.diff), serviceFor(first));
          const current = entry.key === selected?.key;
          return (
            <li key={entry.key} className="border-b last:border-b-0">
              <button
                type="button"
                aria-current={current || undefined}
                onClick={() => {
                  select(entry);
                  onPick?.();
                }}
                className={cn(
                  'flex w-full flex-col gap-1 border-l-2 border-transparent px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                  current && 'border-primary bg-primary/10 hover:bg-primary/10',
                )}
              >
                <span className="font-label text-sm font-medium">{title}</span>
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <RiskLabel risk={entry.risk} />
                  <span className="font-mono tabular-nums">{validity(first, now, true)}</span>
                </span>
                <span className="text-xs text-muted-foreground">{agentName(first.author)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const detail = !selected ? null : selected.batchId ? (
    <BatchDetail
      key={selected.key}
      entry={selected}
      busy={busy}
      now={now}
      agentName={agentName}
      onReview={(approve) => onReview(selected.batchId!, approve, true)}
      renderBatchItem={renderBatchItem}
    />
  ) : (
    renderProposal(selected.proposals[0])
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid min-w-0 rounded-xl border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="hidden min-h-0 flex-col rounded-l-xl border-r lg:flex">{queue()}</div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2 border-b px-2 py-2 lg:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('proposal.previous')}
              disabled={index <= 0}
              onClick={() => select(entries[index - 1])}
            >
              <ChevronLeft />
            </Button>
            <p className="flex-1 text-center text-sm text-muted-foreground" aria-live="polite">
              {t('proposal.position', { current: index + 1, total: entries.length })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('proposal.next')}
              disabled={index >= entries.length - 1}
              onClick={() => select(entries[index + 1])}
            >
              <ChevronRight />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setQueueOpen(true)}>
              {t('proposal.queue')}
            </Button>
          </div>
          {detail}
        </div>
      </div>
      <KbdGroup className="max-lg:hidden flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          {t('proposal.shortcut.navigate')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>A</Kbd>
          {t('proposal.shortcut.approve')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>R</Kbd>
          {t('proposal.shortcut.reject')}
        </span>
      </KbdGroup>
      <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-xl">
          <SheetHeader>
            <SheetTitle>{t('proposal.queue')}</SheetTitle>
            <SheetDescription>{t('proposal.queueLabel')}</SheetDescription>
          </SheetHeader>
          {queueOpen && queue(() => setQueueOpen(false))}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** A batch in full: every change it holds, decided together. */
function BatchDetail({
  entry,
  busy,
  now,
  agentName,
  onReview,
  renderBatchItem,
}: {
  entry: ReviewEntry;
  busy: boolean;
  now?: number;
  agentName: (id: string) => string;
  onReview: (approve: boolean) => void;
  renderBatchItem: (proposal: Proposal, open: boolean) => ReactNode;
}) {
  const first = entry.proposals[0];
  const hold = needsHold(entry.risk);
  const title = t('proposal.batchTitle', { count: entry.proposals.length });
  // With a short batch every change is on screen, so nothing is approved without being seen.
  const open = entry.proposals.length <= 3;
  const copy =
    entry.risk === 'destructive'
      ? { title: t('proposal.confirmTitle'), description: t('proposal.confirmBatchBody') }
      : confirmCopy(entry.risk, title);
  return (
    <article aria-label={title} className="flex min-w-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-4 lg:px-6">
        <RiskLabel risk={entry.risk} />
        <h3 className="font-label text-xl font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {agentName(first.author)} · {validity(first, now, true)}
        </p>
        <p className="text-sm text-muted-foreground">{t('proposal.batchHint')}</p>
      </header>
      <ul className="flex flex-col divide-y px-4 py-4 lg:px-6">
        {entry.proposals.map((item) => renderBatchItem(item, open))}
      </ul>
      <footer className={DETAIL_FOOTER_CLASS}>
        {hold && (
          <p className="mr-auto text-xs text-muted-foreground max-sm:basis-full">
            {t('proposal.holdHint')}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="max-sm:flex-1"
          disabled={busy}
          onClick={() => onReview(false)}
        >
          <X data-icon="inline-start" />
          {t('proposal.batchReject')}
          <Kbd aria-hidden="true" className="max-lg:hidden">
            R
          </Kbd>
        </Button>
        <ApproveButton
          confirm={hold}
          {...copy}
          variant={entry.risk === 'destructive' ? 'destructive' : 'default'}
          disabled={busy || !entry.proposals.every((item) => item.state === 'pending')}
          shortcut="a"
          onApprove={() => onReview(true)}
        >
          <Check data-icon="inline-start" />
          {hold
            ? t('proposal.holdApprove')
            : `${t('proposal.batchApprove')} (${entry.proposals.length})`}
        </ApproveButton>
      </footer>
    </article>
  );
}
