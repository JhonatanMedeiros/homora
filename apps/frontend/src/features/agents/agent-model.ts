import type { Service } from '@homora/shared';
import { formatDateTime, t, type MessageKey } from '@/i18n';

export type Agent = { id: string; name: string; scopes: string; revokedAt: number | null };
export type Proposal = {
  id: string;
  diff: string;
  expiresAt: number;
  state: string;
  author: string;
};
export type ServiceFields = {
  name?: string;
  url?: string;
  category?: string;
  description?: string;
  icon?: string;
};
export type Diff = { op?: string; id?: number; service?: ServiceFields };

export const SCOPES = [
  { id: 'services:read', label: 'scope.services:read', hint: 'scope.services:read.hint' },
  { id: 'proxmox:read', label: 'scope.proxmox:read', hint: 'scope.proxmox:read.hint' },
  {
    id: 'proposals:create',
    label: 'scope.proposals:create',
    hint: 'scope.proposals:create.hint',
  },
] as const;
export const scopeLabel = (id: string) => {
  const scope = SCOPES.find((item) => item.id === id);
  return scope ? t(scope.label) : id;
};

export const STATES: Record<string, MessageKey> = {
  pending: 'proposal.state.pending',
  approved: 'proposal.state.approved',
  rejected: 'proposal.state.rejected',
  expired: 'proposal.state.expired',
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
];

export const formatDate = formatDateTime;

export type { Service };
