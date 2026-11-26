import type { EvidenceBundle } from '@homora/shared';

export type Investigation = {
  incidentId: number;
  monitorId: number;
  from: string | null;
  to: string | null;
  truncated: boolean;
  evidence: EvidenceBundle;
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const factId = /^(?:incident:\d+:(?:opened|recovered|overlap)|check:\d+)$/;

/** Accept only the fields and source vocabulary consumed by the investigation view. */
export function parseInvestigation(value: unknown, expectedId: number): Investigation | null {
  if (
    !record(value) ||
    value.incidentId !== expectedId ||
    !positive(value.monitorId) ||
    !(value.from === null || timestamp(value.from)) ||
    !(value.to === null || timestamp(value.to)) ||
    typeof value.truncated !== 'boolean' ||
    !record(value.evidence) ||
    value.evidence.version !== 1 ||
    !timestamp(value.evidence.evaluatedAt) ||
    !Array.isArray(value.evidence.items) ||
    value.evidence.items.length > 143
  )
    return null;
  const ids = new Set<string>();
  const facts = new Set<string>();
  const references: string[][] = [];
  for (const item of value.evidence.items) {
    if (
      !record(item) ||
      item.version !== 1 ||
      typeof item.id !== 'string' ||
      item.id.length > 120 ||
      ids.has(item.id) ||
      !record(item.subject) ||
      item.subject.type !== 'monitor' ||
      typeof item.subject.id !== 'string' ||
      !/^\d+$/.test(item.subject.id) ||
      !record(item.attributes) ||
      !timestamp(item.evaluatedAt) ||
      typeof item.summary !== 'string' ||
      item.summary.length > 512 ||
      !(
        item.link === null ||
        (typeof item.link === 'string' && /^\/services\/\d+$/.test(item.link))
      )
    )
      return null;
    ids.add(item.id);
    if (item.kind === 'fact') {
      if (
        !factId.test(item.id) ||
        item.confidence !== 'confirmed' ||
        item.freshness !== 'historical' ||
        !timestamp(item.observedAt)
      )
        return null;
      if (item.source === 'monitor-check') {
        if (!['available', 'unavailable', 'unknown'].includes(String(item.attributes.status)))
          return null;
      } else if (item.source === 'monitor-incident') {
        if (!['opened', 'recovered', 'overlap'].includes(String(item.attributes.event)))
          return null;
      } else return null;
      facts.add(item.id);
    } else if (item.kind === 'hypothesis') {
      if (
        item.source !== 'temporal-correlation' ||
        item.confidence !== 'inferred' ||
        item.observedAt !== null ||
        item.freshness !== 'historical' ||
        !Array.isArray(item.evidenceIds) ||
        item.evidenceIds.length === 0 ||
        !item.evidenceIds.every((id: unknown) => typeof id === 'string' && factId.test(id))
      )
        return null;
      references.push(item.evidenceIds);
    } else if (item.kind === 'unknown') {
      if (
        item.source !== 'coverage-assessment' ||
        item.confidence !== 'unknown' ||
        item.freshness !== 'unknown' ||
        item.observedAt !== null ||
        !Array.isArray(item.missing) ||
        item.missing.length === 0 ||
        !item.missing.every(
          (entry: unknown) => typeof entry === 'string' && entry.length > 0 && entry.length <= 120,
        )
      )
        return null;
    } else return null;
  }
  if (!references.every((refs) => refs.every((id) => facts.has(id)))) return null;
  return value as Investigation;
}
