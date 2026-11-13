import type { GuestType, HostLink } from '@homora/shared';

export type SuggestionEvidence = {
  kind: 'config-address' | 'guest-agent' | 'docker-source';
  address?: string;
};

export type SuggestionCandidate = {
  host: HostLink;
  name: string;
  status: string;
  strength: 'strong' | 'medium';
  evidence: SuggestionEvidence[];
  ambiguous: boolean;
};

export type CardSuggestion = { serviceId: number; candidates: SuggestionCandidate[] };
export type SuggestionDecision =
  | { kind: 'accepted'; candidate: SuggestionCandidate }
  | { kind: 'dismissed'; candidate: SuggestionCandidate };

export type { GuestType };
