import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const DAY = 86_400_000;
const LIMIT = 100;
const timestamp = z.iso.datetime();
const incidentEvent = z
  .object({
    id: z.string().regex(/^incident:\d+:(opened|recovered)$/),
    version: z.literal(1),
    kind: z.literal('fact'),
    source: z.literal('monitor-incident'),
    subject: z.object({ type: z.literal('monitor'), id: z.string().regex(/^\d+$/) }).strict(),
    observedAt: timestamp,
    evaluatedAt: timestamp,
    freshness: z.literal('historical'),
    confidence: z.literal('confirmed'),
    summary: z.enum(['Incident recorded as opened.', 'Incident recorded as recovered.']),
    link: z
      .string()
      .regex(/^\/services\/\d+$/)
      .nullable(),
    attributes: z.object({ event: z.enum(['opened', 'recovered']) }).strict(),
  })
  .strict();
const coverageGap = z
  .object({
    id: z.literal('coverage:incidents'),
    version: z.literal(1),
    kind: z.literal('unknown'),
    source: z.literal('coverage-assessment'),
    subject: z.object({ type: z.literal('inventory'), id: z.literal('all') }).strict(),
    observedAt: z.null(),
    evaluatedAt: timestamp,
    freshness: z.literal('unknown'),
    confidence: z.literal('unknown'),
    summary: z.literal('Complete incident coverage is not established.'),
    link: z.null(),
    missing: z.tuple([z.literal('complete-incident-coverage')]),
    attributes: z.object({}).strict(),
  })
  .strict();
const bundle = z
  .object({
    version: z.literal(1),
    evaluatedAt: timestamp,
    items: z.array(z.union([incidentEvent, coverageGap])).max(LIMIT + 1),
  })
  .strict();

type EventRow = {
  id: number;
  monitorId: number;
  event: 'opened' | 'recovered';
  at: number;
  hasService: number;
};

/** Read only events the incident store actually retains; never claim complete coverage. */
export function operationalSummary(db: DatabaseSync, range: '24h' | '7d', now = Date.now()) {
  const from = now - (range === '24h' ? DAY : 7 * DAY);
  const evaluatedAt = new Date(now).toISOString();
  const rows = db
    .prepare(`
    SELECT * FROM (
      SELECT i.id, i.service_id AS monitorId, 'opened' AS event, i.started_at AS at,
        s.id IS NOT NULL AS hasService FROM service_incidents i LEFT JOIN services s ON s.id=i.service_id
        WHERE i.started_at>=? AND i.started_at<=?
      UNION ALL
      SELECT i.id, i.service_id AS monitorId, 'recovered' AS event, i.ended_at AS at,
        s.id IS NOT NULL AS hasService FROM service_incidents i LEFT JOIN services s ON s.id=i.service_id
        WHERE i.ended_at>=? AND i.ended_at<=?
    ) ORDER BY at DESC, id DESC, event LIMIT ?
  `)
    .all(from, now, from, now, LIMIT + 1) as EventRow[];
  const truncated = rows.length > LIMIT;
  const items = rows.slice(0, LIMIT).map((row) => ({
    id: `incident:${row.id}:${row.event}`,
    version: 1 as const,
    kind: 'fact' as const,
    source: 'monitor-incident' as const,
    subject: { type: 'monitor' as const, id: String(row.monitorId) },
    observedAt: new Date(row.at).toISOString(),
    evaluatedAt,
    freshness: 'historical' as const,
    confidence: 'confirmed' as const,
    summary:
      row.event === 'opened'
        ? ('Incident recorded as opened.' as const)
        : ('Incident recorded as recovered.' as const),
    link: row.hasService ? `/services/${row.monitorId}` : null,
    attributes: { event: row.event },
  }));
  const evidence = bundle.parse({
    version: 1,
    evaluatedAt,
    items: [
      ...items,
      {
        id: 'coverage:incidents',
        version: 1,
        kind: 'unknown',
        source: 'coverage-assessment',
        subject: { type: 'inventory', id: 'all' },
        observedAt: null,
        evaluatedAt,
        freshness: 'unknown',
        confidence: 'unknown',
        summary: 'Complete incident coverage is not established.',
        link: null,
        missing: ['complete-incident-coverage'],
        attributes: {},
      },
    ],
  });
  return { range, from: new Date(from).toISOString(), to: evaluatedAt, truncated, evidence };
}
