/** Shared evidence vocabulary. Producers register and validate their own source attributes. */
export type EvidenceFreshness = 'fresh' | 'stale' | 'unknown' | 'historical';
export type EvidenceSubject = { type: string; id: string };

type EvidenceBase = {
  id: string;
  version: 1;
  source: string;
  subject: EvidenceSubject;
  evaluatedAt: string;
  summary: string;
  link: string | null;
  attributes: Record<string, string | number | boolean | null>;
};

export type EvidenceFact = EvidenceBase & {
  kind: 'fact';
  confidence: 'confirmed';
  observedAt: string;
  freshness: 'fresh' | 'stale' | 'historical';
  window?: { from: string; to: string };
};

export type EvidenceHypothesis = EvidenceBase & {
  kind: 'hypothesis';
  confidence: 'inferred';
  observedAt: string | null;
  freshness: EvidenceFreshness;
  evidenceIds: string[];
};

export type EvidenceUnknown = EvidenceBase & {
  kind: 'unknown';
  confidence: 'unknown';
  observedAt: null;
  freshness: 'unknown';
  missing: string[];
};

export type EvidenceItem = EvidenceFact | EvidenceHypothesis | EvidenceUnknown;
export type EvidenceBundle = { version: 1; evaluatedAt: string; items: EvidenceItem[] };

/** Classifies an observation for the current settings without inventing a current state. */
export function periodicEvidenceFreshness(input: {
  observedAt: number | null;
  evaluatedAt: number;
  intervalSeconds: number;
  usable: boolean;
}): 'fresh' | 'stale' | 'unknown' {
  const { observedAt, evaluatedAt, intervalSeconds, usable } = input;
  if (
    !usable ||
    observedAt === null ||
    !Number.isFinite(observedAt) ||
    !Number.isFinite(evaluatedAt) ||
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds <= 0 ||
    observedAt > evaluatedAt
  )
    return 'unknown';
  return evaluatedAt - observedAt <= intervalSeconds * 2_000 ? 'fresh' : 'stale';
}

/** Validate graph references after a source-specific schema has validated each item. */
export function evidenceReferencesValid(bundle: EvidenceBundle): boolean {
  const byId = new Map<string, EvidenceItem>();
  for (const item of bundle.items) {
    if (!item.id || byId.has(item.id)) return false;
    byId.set(item.id, item);
  }
  return bundle.items.every((item) => {
    if (item.kind === 'unknown') return item.missing.length > 0 && item.missing.every(Boolean);
    if (item.kind !== 'hypothesis') return true;
    return (
      item.evidenceIds.length > 0 &&
      item.evidenceIds.every((id) => id !== item.id && byId.get(id)?.kind === 'fact')
    );
  });
}
