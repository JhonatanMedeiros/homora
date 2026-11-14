import type { Plan } from '@/features/transfer/transfer-model';

/** A card offered by discovery, with the values the labels suggest. */
export type ReviewItem = {
  id: string;
  name: string;
  group: string;
  url: string;
  container: string | undefined;
  note: AddressNote | undefined;
};
export type AddressNote = 'loopback' | 'internal-name';
export type ReviewField = 'name' | 'group' | 'url';
export type ReviewEdits = Record<string, Partial<Record<ReviewField, string>>>;

export type ReviewResult = {
  id: string;
  container: string;
  status: 'created' | 'duplicate' | 'rejected' | 'missing';
  code?: string;
};

/** What a confirmation would apply right now, as evaluated by the server without persisting. */
export type Evaluation = {
  version: number;
  fingerprint: string;
  plan: Plan;
  results: ReviewResult[];
};

/** Only the fields that differ from the suggestion are sent, keyed by container ID. */
export function overridesOf(items: ReviewItem[], edits: ReviewEdits) {
  const overrides: Record<string, Partial<Record<ReviewField, string>>> = {};
  for (const item of items) {
    const changed: Partial<Record<ReviewField, string>> = {};
    for (const field of ['name', 'group', 'url'] as const) {
      const value = edits[item.id]?.[field];
      if (value !== undefined && value !== item[field]) changed[field] = value;
    }
    if (Object.keys(changed).length > 0) overrides[item.id] = changed;
  }
  return overrides;
}
