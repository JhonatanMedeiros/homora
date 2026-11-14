import type { Risk } from './proposal-risk';
import { highestRisk, proposalRisk } from './proposal-risk';
import { formatDate, type Proposal } from './agent-model';
import { t } from '@/i18n';

/** The remaining validity of a pending proposal, or its date once it is decided. */
export function validity(proposal: Proposal, now: number | undefined, pending: boolean) {
  if (!pending) return formatDate(proposal.expiresAt);
  if (now === undefined) return t('proposal.expiresAt', { date: formatDate(proposal.expiresAt) });
  const seconds = Math.max(0, Math.ceil((proposal.expiresAt - now) / 1000));
  return seconds < 60
    ? t('proposal.expiresSeconds', { count: seconds })
    : t('proposal.expiresMinutes', { count: Math.ceil(seconds / 60) });
}

/** The footer of a detail: sticks to the bottom of the screen so the decision is always in reach. */
export const DETAIL_FOOTER_CLASS =
  'sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t bg-card px-4 py-3 md:bottom-0 lg:px-6';

/** Confirmation texts for a risky approval: removing is not the same as widening access. */
export function confirmCopy(risk: Risk, name: string) {
  return risk === 'access'
    ? {
        title: t('proposal.confirmAccessTitle'),
        description: t('proposal.confirmAccessBody', { name }),
      }
    : { title: t('proposal.confirmTitle'), description: t('proposal.confirmBody', { name }) };
}

/** One thing to decide: a single proposal, or a batch decided together. */
export type ReviewEntry = {
  key: string;
  batchId?: string;
  proposals: Proposal[];
  risk: Risk;
};

/** Groups the waiting proposals into entries, keeping the order of their first appearance. */
export function reviewEntries(pending: Proposal[]): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  const batches = new Map<string, ReviewEntry>();
  for (const proposal of pending) {
    const risk = proposalRisk(proposal);
    if (!proposal.batchId) {
      entries.push({ key: proposal.id, proposals: [proposal], risk });
      continue;
    }
    const batch = batches.get(proposal.batchId);
    if (batch) {
      batch.proposals.push(proposal);
      batch.risk = highestRisk([batch.risk, risk]);
    } else {
      const entry = {
        key: `batch:${proposal.batchId}`,
        batchId: proposal.batchId,
        proposals: [proposal],
        risk,
      };
      batches.set(proposal.batchId, entry);
      entries.push(entry);
    }
  }
  return entries;
}
