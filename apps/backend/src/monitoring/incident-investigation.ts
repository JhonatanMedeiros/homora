import type { DatabaseSync } from 'node:sqlite';
import type {
  EvidenceBundle,
  EvidenceFact,
  EvidenceHypothesis,
  EvidenceUnknown,
} from '@homora/shared';
import { z } from 'zod';

const DAY = 86_400_000;
const LOOKBACK = 30 * DAY;
const CHECK_LIMIT = 100;
const RELATED_LIMIT = 20;
const HYPOTHESIS_LIMIT = 5;
const id = z.number().int().positive().safe();
const time = z.number().int().nonnegative().safe();
const incidentRow = z
  .object({
    id,
    monitorId: id,
    startedAt: time,
    endedAt: time.nullable(),
    hasService: z.union([z.literal(0), z.literal(1)]),
  })
  .strict();
const checkRow = z.object({ id, observedAt: time, observation: z.string().max(32_768) }).strict();
const statusSchema = z
  .object({ status: z.enum(['available', 'unavailable', 'unknown']) })
  .passthrough();

/** A bounded historical read. It never sends a network request or claims a root cause. */
export function investigateIncident(db: DatabaseSync, incidentId: number, now = Date.now()) {
  const raw = db
    .prepare(`SELECT i.id, i.service_id AS monitorId, i.started_at AS startedAt,
    i.ended_at AS endedAt, s.id IS NOT NULL AS hasService FROM service_incidents i
    JOIN monitors m ON m.id=i.service_id LEFT JOIN services s ON s.id=m.id WHERE i.id=?`)
    .get(incidentId);
  if (!raw) return null;
  const incident = incidentRow.parse(raw);
  if (
    incident.startedAt > now ||
    (incident.endedAt !== null && (incident.endedAt < incident.startedAt || incident.endedAt > now))
  )
    throw new Error('invalid incident time');
  const from = Math.max(now - LOOKBACK, incident.startedAt - 5 * 60_000);
  const to = Math.min(now, (incident.endedAt ?? now) + 5 * 60_000);
  const evaluatedAt = new Date(now).toISOString();
  const subject = { type: 'monitor', id: String(incident.monitorId) };
  const link = incident.hasService ? `/services/${incident.monitorId}` : null;
  const makeFact = (
    factId: string,
    source: string,
    observedAt: number,
    summary: string,
    attributes: EvidenceFact['attributes'],
  ): EvidenceFact => ({
    id: factId,
    version: 1,
    kind: 'fact',
    source,
    subject,
    observedAt: new Date(observedAt).toISOString(),
    evaluatedAt,
    freshness: 'historical',
    confidence: 'confirmed',
    summary,
    link,
    attributes,
  });
  const facts: EvidenceFact[] = [
    makeFact(
      `incident:${incident.id}:opened`,
      'monitor-incident',
      incident.startedAt,
      'Incident recorded as started.',
      { event: 'opened' },
    ),
  ];
  if (incident.endedAt !== null)
    facts.push(
      makeFact(
        `incident:${incident.id}:recovered`,
        'monitor-incident',
        incident.endedAt,
        'Incident recorded as recovered.',
        { event: 'recovered' },
      ),
    );
  const rawChecks =
    from <= to
      ? db
          .prepare(`SELECT id, observed_at AS observedAt, observation FROM service_observation_history
    WHERE service_id=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at DESC,id DESC LIMIT ?`)
          .all(incident.monitorId, from, to, CHECK_LIMIT + 1)
      : [];
  let invalidChecks = false;
  for (const rawCheck of rawChecks.slice(0, CHECK_LIMIT)) {
    const parsed = checkRow.safeParse(rawCheck);
    if (!parsed.success) {
      invalidChecks = true;
      continue;
    }
    let status: z.infer<typeof statusSchema>;
    try {
      status = statusSchema.parse(JSON.parse(parsed.data.observation) as unknown);
    } catch {
      invalidChecks = true;
      continue;
    }
    facts.push(
      makeFact(
        `check:${parsed.data.id}`,
        'monitor-check',
        parsed.data.observedAt,
        'A monitoring check was recorded.',
        { status: status.status },
      ),
    );
  }
  const rawRelated = db
    .prepare(`SELECT i.id, i.service_id AS monitorId, i.started_at AS startedAt,
    i.ended_at AS endedAt, s.id IS NOT NULL AS hasService FROM service_incidents i
    JOIN monitors m ON m.id=i.service_id LEFT JOIN services s ON s.id=i.service_id
    WHERE i.id<>? AND i.service_id<>? AND i.started_at<=? AND (i.ended_at IS NULL OR i.ended_at>=?)
    ORDER BY i.started_at DESC,i.id DESC LIMIT ?`)
    .all(
      incident.id,
      incident.monitorId,
      incident.endedAt ?? now,
      incident.startedAt,
      RELATED_LIMIT + 1,
    );
  let invalidRelated = false;
  for (const rawItem of rawRelated.slice(0, RELATED_LIMIT)) {
    const parsed = incidentRow.safeParse(rawItem);
    if (
      !parsed.success ||
      parsed.data.startedAt > now ||
      (parsed.data.endedAt !== null &&
        (parsed.data.endedAt < parsed.data.startedAt || parsed.data.endedAt > now))
    ) {
      invalidRelated = true;
      continue;
    }
    const related = parsed.data;
    facts.push({
      ...makeFact(
        `incident:${related.id}:overlap`,
        'monitor-incident',
        related.startedAt,
        'Another recorded incident overlaps this incident.',
        {
          event: 'overlap',
          endedAt: related.endedAt === null ? null : new Date(related.endedAt).toISOString(),
        },
      ),
      subject: { type: 'monitor', id: String(related.monitorId) },
      link: related.hasService ? `/services/${related.monitorId}` : null,
    });
  }
  facts.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
  const missing = [
    'root-cause',
    'complete-history',
    'historical-dependencies',
    'historical-configuration',
  ];
  if (incident.startedAt - 5 * 60_000 < now - LOOKBACK) missing.push('history-outside-retention');
  if (rawChecks.length > CHECK_LIMIT) missing.push('checks-truncated');
  if (invalidChecks) missing.push('invalid-checks');
  if (rawRelated.length > RELATED_LIMIT) missing.push('related-incidents-truncated');
  if (invalidRelated) missing.push('invalid-related-incidents');
  // Only group incidents with exactly the same related monitor and recorded window.
  const groups = new Map<string, EvidenceFact[]>();
  for (const fact of facts.filter((item) => item.attributes.event === 'overlap')) {
    const key = JSON.stringify([fact.subject.id, fact.observedAt, fact.attributes.endedAt]);
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  // Most recent windows first, with a stable id tie-break inherited from the sorted facts.
  const overlapGroups = [...groups.values()].reverse();
  if (overlapGroups.length > HYPOTHESIS_LIMIT) missing.push('hypotheses-truncated');
  const unknown: EvidenceUnknown = {
    id: `gap:incident:${incident.id}`,
    version: 1,
    kind: 'unknown',
    source: 'coverage-assessment',
    subject,
    observedAt: null,
    evaluatedAt,
    freshness: 'unknown',
    confidence: 'unknown',
    summary: 'Cause and complete historical coverage are unknown.',
    link: null,
    missing,
    attributes: {},
  };
  const hypotheses: EvidenceHypothesis[] = overlapGroups.slice(0, HYPOTHESIS_LIMIT).map((group) => {
    const fact = group[0]!;
    return {
      id: `hypothesis:${incident.id}:${fact.id}`,
      version: 1,
      kind: 'hypothesis',
      source: 'temporal-correlation',
      subject,
      observedAt: null,
      evaluatedAt,
      freshness: 'historical',
      confidence: 'inferred',
      summary: 'The incidents may be related; temporal overlap does not establish causation.',
      link: null,
      evidenceIds: [`incident:${incident.id}:opened`, ...group.map((item) => item.id)],
      attributes: {
        relatedIncidentId: Number(fact.id.split(':')[1]),
        relatedMonitorId: Number(fact.subject.id),
        overlapCount: group.length,
      },
    };
  });
  const evidence: EvidenceBundle = {
    version: 1,
    evaluatedAt,
    items: [...facts, ...hypotheses, unknown],
  };
  return {
    incidentId: incident.id,
    monitorId: incident.monitorId,
    hasService: Boolean(incident.hasService),
    from: from <= to ? new Date(from).toISOString() : null,
    to: from <= to ? new Date(to).toISOString() : null,
    truncated:
      rawChecks.length > CHECK_LIMIT ||
      rawRelated.length > RELATED_LIMIT ||
      overlapGroups.length > HYPOTHESIS_LIMIT,
    evidence,
  };
}
