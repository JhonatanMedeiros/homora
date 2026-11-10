import type { Service } from '@homora/shared';

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
  { id: 'services:read', label: 'Ler serviços', hint: 'Vê os cards e grupos cadastrados.' },
  {
    id: 'proxmox:read',
    label: 'Ler recursos do Proxmox',
    hint: 'Vê nós, VMs e containers, sem poder alterá-los.',
  },
  {
    id: 'proposals:create',
    label: 'Criar propostas',
    hint: 'Sugere mudanças nos cards. Nada muda sem a sua aprovação.',
  },
];
export const scopeLabel = (id: string) => SCOPES.find((scope) => scope.id === id)?.label ?? id;

export const STATES: Record<string, string> = {
  pending: 'Aguardando você',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  expired: 'Expirada',
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

export const FIELDS: [keyof ServiceFields, string][] = [
  ['name', 'Nome'],
  ['url', 'Endereço'],
  ['category', 'Grupo'],
  ['description', 'Descrição'],
  ['icon', 'Ícone'],
];

export function formatDate(ms: number) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(ms),
  );
}

export type { Service };
