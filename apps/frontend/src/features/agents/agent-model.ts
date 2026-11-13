import type { CheckType, Service } from '@homora/shared';
import { integrationScopeOptions } from '@homora/integrations';
import { formatDateTime, t, tOr, type MessageKey } from '@/i18n';

export type Agent = {
  id: string;
  name: string;
  scopes: string;
  revokedAt: number | null;
  /** Epoch ms; older API responses may omit it. */
  createdAt?: number;
};
export type Proposal = {
  id: string;
  diff: string;
  expiresAt: number;
  state: string;
  author: string;
  batchId?: string | null;
};
export type ServiceFields = {
  name?: string;
  url?: string;
  category?: string;
  description?: string;
  icon?: string;
  position?: number;
  allowPrivate?: boolean;
  checkType?: CheckType;
  checkInterval?: number | null;
  expectedStatus?: string | null;
  checkPath?: string | null;
  checkMatch?: string | null;
};
export type Diff = {
  op?: string;
  id?: number;
  service?: ServiceFields;
  /** Page a new service's group is created on (create proposals only). */
  page?: string;
  kind?: string;
  change?: { kind?: string; change?: unknown };
  before?: unknown;
};

export const SCOPES = [
  { id: 'services:read', label: 'scope.services:read', hint: 'scope.services:read.hint' },
  { id: 'agents:read', label: 'scope.agents:read', hint: 'scope.agents:read.hint' },
  { id: 'agents:propose', label: 'scope.agents:propose', hint: 'scope.agents:propose.hint' },
  { id: 'audit:read', label: 'scope.audit:read', hint: 'scope.audit:read.hint' },
  ...integrationScopeOptions,
  {
    id: 'proposals:create',
    label: 'scope.proposals:create',
    hint: 'scope.proposals:create.hint',
  },
  { id: 'groups:propose', label: 'scope.groups:propose', hint: 'scope.groups:propose.hint' },
  { id: 'hosts:read', label: 'scope.hosts:read', hint: 'scope.hosts:read.hint' },
  { id: 'hosts:propose', label: 'scope.hosts:propose', hint: 'scope.hosts:propose.hint' },
  { id: 'widgets:read', label: 'scope.widgets:read', hint: 'scope.widgets:read.hint' },
  { id: 'widgets:propose', label: 'scope.widgets:propose', hint: 'scope.widgets:propose.hint' },
  {
    id: 'integrations:read',
    label: 'scope.integrations:read',
    hint: 'scope.integrations:read.hint',
  },
  {
    id: 'connections:propose',
    label: 'scope.connections:propose',
    hint: 'scope.connections:propose.hint',
  },
  { id: 'discovery:read', label: 'scope.discovery:read', hint: 'scope.discovery:read.hint' },
] as const;
/** Scopes that let an agent suggest changes (everything else only reads). */
export const isWriteScope = (id: string) => id === 'proposals:create' || id.endsWith(':propose');

/** Ready-made permission sets offered when creating an agent; "custom" lets the user choose. */
export const PROFILES = {
  read: SCOPES.filter(
    (scope) => !isWriteScope(scope.id) && scope.id !== 'agents:read' && scope.id !== 'audit:read',
  ).map((scope) => scope.id),
  suggest: ['services:read', 'proposals:create', 'groups:propose'],
} as const;
export type Profile = keyof typeof PROFILES | 'custom';

export const scopeLabel = (id: string) => {
  const scope = SCOPES.find((item) => item.id === id);
  return scope ? tOr(scope.label, 'labelFallback' in scope ? scope.labelFallback : id) : id;
};

export const scopeHint = (scope: (typeof SCOPES)[number]) =>
  tOr(scope.hint, 'hintFallback' in scope ? scope.hintFallback : '');

export const STATES: Record<string, MessageKey> = {
  pending: 'proposal.state.pending',
  stale: 'proposal.state.stale',
  approved: 'proposal.state.approved',
  rejected: 'proposal.state.rejected',
  expired: 'proposal.state.expired',
  withdrawn: 'proposal.state.withdrawn',
};

export function parseScopes(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function parseDiff(raw: string): Diff | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Diff) : null;
  } catch {
    return null;
  }
}

export const FIELDS: [keyof ServiceFields, MessageKey][] = [
  ['name', 'field.name'],
  ['url', 'field.url'],
  ['category', 'field.category'],
  ['description', 'field.description'],
  ['icon', 'field.icon'],
  ['position', 'field.position'],
  ['allowPrivate', 'field.allowPrivate'],
  ['checkType', 'field.checkType'],
  ['checkInterval', 'field.checkInterval'],
  ['expectedStatus', 'form.expectedStatus'],
  ['checkPath', 'form.checkPath'],
  ['checkMatch', 'check.match.keyword'],
];

/** One-line description of what a proposal changes, used by the compact rows. */
export function proposalSummary(diff: Diff | null, current?: Service): string {
  if (!diff) return t('proposal.unknown');
  if (diff.kind === 'agent') return t('proposal.agentChange');
  if (diff.kind === 'managed' && diff.change) {
    const kind = diff.change.kind;
    return t(
      kind === 'group'
        ? 'proposal.managed.group'
        : kind === 'card-order'
          ? 'proposal.managed.card-order'
          : kind === 'widget'
            ? 'proposal.managed.widget'
            : kind === 'host-link'
              ? 'proposal.managed.host-link'
              : 'proposal.managed.connection-setup',
    );
  }
  const name = diff.service?.name ?? current?.name;
  if (diff.op === 'create') return t('proposal.add', { name: name ?? t('proposal.newService') });
  const label = current?.name ?? name ?? t('proposal.serviceNumber', { id: diff.id ?? '' });
  if (diff.op === 'update') return t('proposal.update', { name: label });
  if (diff.op === 'delete') return t('proposal.remove', { name: label });
  return t('proposal.unknown');
}

export const formatDate = formatDateTime;

export type { Service };

/** Counts of what an agent can read and suggest, from its scopes. */
export function permissionCounts(agent: Agent) {
  const scopes = parseScopes(agent.scopes);
  const write = scopes.filter(isWriteScope).length;
  return { read: scopes.length - write, write };
}
