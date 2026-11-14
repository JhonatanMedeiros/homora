import type { MessageKey } from '@/i18n';

export type ActivityKind = 'access' | 'account' | 'proposal' | 'agent';
export type ActivityOutcome = 'success' | 'failure' | 'refused';

export type ActivityEvent = {
  id: number;
  createdAt: number;
  kind: ActivityKind;
  action: string;
  outcome: ActivityOutcome;
  /** `id` is set for agents, so their events can be matched without relying on the name. */
  actor: { type: 'user' | 'agent' | 'anonymous'; name: string | null; id?: string };
  detail: string | null;
  ipAddress: string | null;
  proposalId: string | null;
};

export type ActivityPage = { events: ActivityEvent[]; nextBefore: number | null };

const TITLES = new Set<string>([
  'login.success',
  'login.failure',
  'logout',
  'password-change.success',
  'password-change.failure',
  'email-change.success',
  'email-change.failure',
  'two-factor-enable.success',
  'two-factor-enable.failure',
  'two-factor-disable.success',
  'two-factor-disable.failure',
  'two-factor-codes-regenerate.success',
  'two-factor-codes-regenerate.failure',
  'two-factor-recovery-used',
  'passkey-add.success',
  'passkey-add.failure',
  'passkey-rename.success',
  'passkey-remove.success',
  'passkey-remove.failure',
  'session-revoke',
  'sessions-revoke-others',
  'profile-update',
  'public-status-update',
  'service-public',
  'appearance-update',
  'appearance-reset',
  'custom-css-update',
  'custom-css-reset',
  'page-update',
  'proposal',
  'review.success',
  'review.refused',
  'review.failure',
  'review-undo',
  'expiry',
  'proposal-recreate',
  'proposal-refresh',
  'proposal-ttl-update',
  'withdraw',
  'docker-source-create',
  'docker-source-rotate',
  'docker-source-revoke',
  'docker-source-remove',
  'agent-issue',
  'agent-create',
  'agent-update-scopes',
  'agent-revoke',
  'agent-rotate',
]);

/** Translation key for the event title; unknown actions fall back to a generic label. */
export function eventTitleKey(event: Pick<ActivityEvent, 'action' | 'outcome'>): MessageKey {
  const specific = `${event.action}.${event.outcome}`;
  const key = TITLES.has(specific) ? specific : TITLES.has(event.action) ? event.action : 'other';
  return `activity.event.${key}` as MessageKey;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Groups newest-first events by local calendar day. */
export function groupByDay(events: ActivityEvent[], now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const groups: { key: string; label: 'today' | 'yesterday' | Date; events: ActivityEvent[] }[] =
    [];
  for (const event of events) {
    const date = new Date(event.createdAt);
    const key = dayKey(date);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = {
        key,
        label: key === dayKey(now) ? 'today' : key === dayKey(yesterday) ? 'yesterday' : date,
        events: [],
      };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}
