import type { Plan } from '@/features/transfer/transfer-model';

export type Entry = { id: string; container: string; group: string; url: string };
export type Found = {
  enabled: true;
  scanned: number;
  entries: Entry[];
  version: number;
  plan: Plan;
};
export type LocalDiscoveryState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; found: Found };

export type Suggestion = {
  /** Container id sent back on import. Missing when the container could not be matched. */
  id: string | undefined;
  name: string;
  group: string;
  url: string;
  container: string | undefined;
  isNew: boolean;
};

export function localDiscoverySuggestions(state: LocalDiscoveryState): Suggestion[] {
  return state.status === 'ready'
    ? state.found.plan.services.map((service, index) => {
        const entry = state.found.entries[index];
        return {
          id: entry?.id,
          name: service.name,
          group: service.group,
          url: service.url,
          container: entry?.container,
          isNew: service.status === 'new',
        };
      })
    : [];
}
