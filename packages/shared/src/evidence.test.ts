import { describe, expect, it } from 'vitest';
import {
  evidenceReferencesValid,
  periodicEvidenceFreshness,
  type EvidenceBundle,
} from './evidence.js';

describe('periodic evidence freshness', () => {
  const input = { evaluatedAt: 300_000, observedAt: 180_000, intervalSeconds: 60, usable: true };
  it('uses a strict boundary at twice the effective interval', () => {
    expect(periodicEvidenceFreshness(input)).toBe('fresh');
    expect(periodicEvidenceFreshness({ ...input, observedAt: 179_999 })).toBe('stale');
  });
  it('does not present unusable, missing, future or invalid observations as current', () => {
    for (const change of [
      { usable: false },
      { observedAt: null },
      { observedAt: 300_001 },
      { observedAt: NaN },
      { evaluatedAt: NaN },
      { intervalSeconds: 0 },
    ])
      expect(periodicEvidenceFreshness({ ...input, ...change })).toBe('unknown');
  });
});

describe('evidence references', () => {
  const base = {
    version: 1 as const,
    source: 'test',
    subject: { type: 'monitor', id: '1' },
    evaluatedAt: '2026-01-01T12:00:00Z',
    summary: 'Synthetic',
    link: null,
    attributes: {},
  };
  const fact = {
    ...base,
    id: 'f1',
    kind: 'fact' as const,
    confidence: 'confirmed' as const,
    observedAt: base.evaluatedAt,
    freshness: 'fresh' as const,
  };
  const hypothesis = {
    ...base,
    id: 'h1',
    kind: 'hypothesis' as const,
    confidence: 'inferred' as const,
    observedAt: null,
    freshness: 'unknown' as const,
    evidenceIds: ['f1'],
  };
  const bundle = (items: EvidenceBundle['items']): EvidenceBundle => ({
    version: 1,
    evaluatedAt: base.evaluatedAt,
    items,
  });
  it('accepts a hypothesis supported by a fact', () => {
    expect(evidenceReferencesValid(bundle([fact, hypothesis]))).toBe(true);
  });
  it('rejects missing, self, hypothesis and duplicate references', () => {
    for (const ids of [[], ['missing'], ['h1']])
      expect(evidenceReferencesValid(bundle([fact, { ...hypothesis, evidenceIds: ids }]))).toBe(
        false,
      );
    expect(evidenceReferencesValid(bundle([fact, fact]))).toBe(false);
    expect(
      evidenceReferencesValid(
        bundle([fact, hypothesis, { ...hypothesis, id: 'h2', evidenceIds: ['h1'] }]),
      ),
    ).toBe(false);
  });
  it('requires an unknown to state what is missing', () => {
    const gap = {
      ...base,
      id: 'u1',
      kind: 'unknown' as const,
      confidence: 'unknown' as const,
      observedAt: null,
      freshness: 'unknown' as const,
      missing: [],
    };
    expect(evidenceReferencesValid(bundle([gap]))).toBe(false);
    expect(evidenceReferencesValid(bundle([{ ...gap, missing: ['history'] }]))).toBe(true);
  });
});
