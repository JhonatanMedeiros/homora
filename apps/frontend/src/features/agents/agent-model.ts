import type { Service } from '@homora/shared';
import { formatDateTime, t, type MessageKey } from '@/i18n';

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
  checkType?: 'http' | 'ping';
  checkInterval?: number | null;
};
export type Diff = {
  op?: string;
  id?: number;
  service?: ServiceFields;
  kind?: string;
  change?: { kind?: string; change?: unknown };
  before?: unknown;
};

export const SCOPES = [
  { id: 'services:read', label: 'scope.services:read', hint: 'scope.services:read.hint' },
  { id: 'agents:read', label: 'scope.agents:read', hint: 'scope.agents:read.hint' },
  { id: 'agents:propose', label: 'scope.agents:propose', hint: 'scope.agents:propose.hint' },
  { id: 'audit:read', label: 'scope.audit:read', hint: 'scope.audit:read.hint' },
  { id: 'proxmox:read', label: 'scope.proxmox:read', hint: 'scope.proxmox:read.hint' },
  {
    id: 'proposals:create',
    label: 'scope.proposals:create',
    hint: 'scope.proposals:create.hint',
  },
  { id: 'groups:propose', label: 'scope.groups:propose', hint: 'scope.groups:propose.hint' },
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
  return scope ? t(scope.label) : id;
};

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
];

export const formatDate = formatDateTime;

export type { Service };
