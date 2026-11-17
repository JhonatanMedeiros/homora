import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { CHECK_INTERVAL_DEFAULT } from '@homora/shared';
import {
  availabilityRanges,
  isHomePrivateHost,
  monitoringState,
  monitoringSources,
  monitoringIncidentReasons,
  orderMonitoringProblems,
  type MonitoringAvailability,
  type MonitoringCounts,
  type MonitoringSummary,
  type MonitoringProblems,
  type MonitoringIncidents,
} from '@homora/widgets';
import {
  UPTIME_MIN_CHECKS,
  uptimeSummarizerOf,
  type createDegradedSince,
  type createMonitoringSource,
  type createServiceMonitor,
  type createIncidentStore,
  type createMeasurementGuard,
  type createObservationStore,
} from '../monitoring/index.js';
import { errorBody } from '../api-error.js';

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    days: z.coerce.number().int().min(1).max(30).default(7),
    groups: z.string().max(12000).optional(),
    pages: z.string().max(12000).optional(),
    minimumMinutes: z.coerce.number().int().min(0).max(43200).default(0),
    includeDegraded: z.enum(['true', 'false']).default('true'),
    target: z.string().trim().min(1).max(200).optional(),
    range: z.enum(availabilityRanges).default('24h'),
  })
  .strict();
const countsSchema = z
  .object({
    down: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    ok: z.number().int().nonnegative(),
    maintenance: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();
const timestamp = z.number().int().nonnegative();
const latencySchema = z
  .object({
    generatedAt: timestamp,
    range: z.enum(availabilityRanges),
    target: z
      .object({
        id: z.number().int().positive(),
        name: z.string().max(200),
        state: z.enum(['down', 'degraded', 'ok', 'maintenance', 'blocked', 'unknown']),
        stale: z.boolean(),
        lastAttempt: timestamp.nullable(),
        lastValid: z
          .object({ observedAt: timestamp, latencyMs: z.number().finite().nonnegative() })
          .strict()
          .nullable(),
        points: z
          .array(
            z
              .object({ start: timestamp, p50: z.number().finite().nonnegative().nullable() })
              .strict(),
          )
          .max(120),
      })
      .strict()
      .nullable(),
  })
  .strict();
const serviceTargetsSchema = z.array(
  z.object({ target: z.string().regex(/^[0-9a-f]{32}$/), name: z.string().max(200) }).strict(),
);
const summarySchema: z.ZodType<MonitoringSummary> = z
  .object({
    generatedAt: timestamp,
    counts: countsSchema,
    stale: z.number().int().nonnegative(),
    measurementFailure: z.boolean(),
  })
  .strict();
const problemsSchema: z.ZodType<MonitoringProblems> = z
  .object({
    generatedAt: timestamp,
    items: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            name: z.string().max(200),
            state: z.enum(['down', 'degraded']),
            lastAttempt: timestamp.nullable(),
            stale: z.boolean(),
            latencyMs: z.number().nonnegative().finite().nullable(),
            since: timestamp.nullable(),
            reason: z.string().max(40).nullable(),
            httpStatus: z.number().int().min(100).max(599).nullable(),
            isService: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    truncated: z.boolean(),
    total: z.number().int().nonnegative(),
    unmeasured: z.number().int().nonnegative(),
  })
  .strict();
const incidentsSchema: z.ZodType<MonitoringIncidents> = z
  .object({
    generatedAt: timestamp,
    periodDays: z.number().int().min(1).max(30),
    items: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            monitorId: z.number().int().positive(),
            name: z.string().max(200),
            startedAt: timestamp,
            endedAt: timestamp.nullable(),
            reason: z.enum(monitoringIncidentReasons),
            httpStatus: z.number().int().min(100).max(599).nullable(),
            hasService: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    truncated: z.boolean(),
  })
  .strict();
const availabilitySchema: z.ZodType<MonitoringAvailability> = z
  .object({
    generatedAt: timestamp,
    range: z.enum(availabilityRanges),
    target: z
      .object({
        id: z.number().int().positive(),
        name: z.string().max(200),
        isService: z.boolean(),
        state: z.enum(['down', 'degraded', 'ok', 'maintenance', 'blocked', 'unknown']),
        lastAttempt: timestamp.nullable(),
        stale: z.boolean(),
        uptimePct: z.number().min(0).max(100).nullable(),
        checks: z.number().int().nonnegative(),
        upChecks: z.number().int().nonnegative(),
        downChecks: z.number().int().nonnegative(),
        unknownChecks: z.number().int().nonnegative(),
        minChecks: z.number().int().positive(),
        reconfigured: z.boolean(),
        buckets: z
          .array(
            z
              .object({
                start: z.string(),
                status: z.enum(['up', 'down', 'partial', 'unknown']),
                checks: z.number().int().nonnegative(),
              })
              .strict(),
          )
          .max(120),
      })
      .strict()
      .nullable(),
  })
  .strict();

const safeReasons = new Set([
  'no-response',
  'not-found',
  'error-status',
  'unexpected-status',
  'content-mismatch',
  'cert-expired',
  'cert-invalid',
  'cert-expiring',
]);

/** Each reader owns its cache and validates its complete response before returning it. */
export function registerWidgetMonitoringRoutes(
  app: FastifyInstance,
  db: DatabaseSync,
  source: ReturnType<typeof createMonitoringSource>,
  monitor: ReturnType<typeof createServiceMonitor>,
  incidents: ReturnType<typeof createIncidentStore>,
  measurement: Pick<ReturnType<typeof createMeasurementGuard>, 'current'>,
  degradedSince?: Pick<ReturnType<typeof createDegradedSince>, 'since'>,
  caHash?: () => string | undefined,
  observations?: Pick<ReturnType<typeof createObservationStore>, 'latency' | 'lastValidLatency'>,
) {
  const cache = new Map<string, { at: number; value: unknown }>();
  app.get<{ Params: { kind: string }; Querystring: Record<string, string> }>(
    '/api/widget-sources/monitoring/:kind',
    async (request, reply) => {
      const { kind } = request.params;
      if (!Object.hasOwn(monitoringSources, kind))
        return reply.code(404).send(errorBody('not-found'));
      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
      const { limit, days, groups, pages, minimumMinutes, includeDegraded, target, range } =
        query.data;
      const parseNames = (value: string | undefined): string[] | null => {
        if (!value) return [];
        try {
          const parsed: unknown = JSON.parse(value);
          if (
            !Array.isArray(parsed) ||
            parsed.length > 100 ||
            parsed.some(
              (name) =>
                typeof name !== 'string' ||
                !name.trim() ||
                name.trim() !== name ||
                name.length > 100,
            ) ||
            new Set(parsed).size !== parsed.length
          )
            return null;
          return parsed as string[];
        } catch {
          return null;
        }
      };
      const groupNames = kind === 'incidents' ? parseNames(groups) : [];
      const pageNames = kind === 'incidents' ? parseNames(pages) : [];
      if (!groupNames || !pageNames) return reply.code(400).send(errorBody('invalid-query'));
      if (
        (kind === 'summary' || kind === 'problems') &&
        ([groups, pages].some(
          (value) => value !== undefined && (!/^\d+(,\d+)*$/.test(value) || value.length > 1000),
        ) ||
          minimumMinutes)
      )
        return reply.code(400).send(errorBody('invalid-query'));
      switch (kind) {
        case 'availability':
        case 'latency':
          if (!target || groups || pages || minimumMinutes)
            return reply.code(400).send(errorBody('invalid-query'));
          break;
        default:
          if (target !== undefined) return reply.code(400).send(errorBody('invalid-query'));
      }
      const now = Date.now();
      const key = JSON.stringify([
        kind,
        limit,
        days,
        groups,
        pages,
        minimumMinutes,
        includeDegraded,
        target,
        range,
      ]);
      const cached = cache.get(key);
      if (cached && kind !== 'latency' && kind !== 'serviceTargets' && now - cached.at < 10_000)
        return cached.value;
      let value: unknown;
      switch (kind) {
        case 'serviceTargets': {
          value = serviceTargetsSchema.parse(
            db
              .prepare(
                `SELECT i.identity AS target,m.name FROM service_identities i JOIN services s ON s.id=i.service_id JOIN monitors m ON m.id=s.id ORDER BY m.name, i.identity`,
              )
              .all(),
          );
          break;
        }
        case 'latency': {
          if (!target || !/^[0-9a-f]{32}$/.test(target))
            return reply.code(400).send(errorBody('invalid-query'));
          if (!observations) return reply.code(503).send(errorBody('internal-error'));
          const identity = db
            .prepare('SELECT service_id AS id FROM service_identities WHERE identity=?')
            .get(target) as { id: number } | undefined;
          const match = identity && source.list().find((item) => item.id === identity.id);
          if (!match) {
            value = latencySchema.parse({ generatedAt: now, range, target: null });
            break;
          }
          const status = monitor.snapshot()[match.id];
          const threshold = db
            .prepare(
              'SELECT degraded_latency_ms AS threshold FROM service_monitor_settings WHERE service_id=?',
            )
            .get(match.id) as { threshold: number | null } | undefined;
          const state = monitoringState({
            status: status?.status,
            reason: status?.reason,
            latencyMs: status?.latencyMs,
            degradedLatencyMs: threshold?.threshold,
            blocked: match.url !== null && !match.allowPrivate && isHomePrivateHost(match.url),
            measurementReason: measurement.current()?.reason,
          });
          const parsed = status?.lastAttempt ? Date.parse(status.lastAttempt) : NaN;
          const lastAttempt = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
          const stale =
            lastAttempt !== null &&
            (now < lastAttempt ||
              now - lastAttempt > (match.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 2_000);
          const series = observations.latency(match.id, range, now);
          value = latencySchema.parse({
            generatedAt: now,
            range,
            target: {
              id: match.id,
              name: match.name,
              state,
              stale,
              lastAttempt,
              lastValid: observations.lastValidLatency(match.id, now),
              points: series.points.map(({ start, p50 }) => ({ start, p50 })),
            },
          });
          break;
        }
        case 'availability': {
          const match = source.list().find((item) => item.name === target);
          if (match) {
            const status = monitor.snapshot()[match.id];
            const thresholdRow = db
              .prepare(
                'SELECT degraded_latency_ms AS threshold FROM service_monitor_settings WHERE service_id=?',
              )
              .get(match.id) as { threshold: number | null } | undefined;
            const measuring = measurement.current();
            const state = monitoringState({
              status: status?.status,
              reason: status?.reason,
              latencyMs: status?.latencyMs,
              degradedLatencyMs: thresholdRow?.threshold,
              blocked: match.url !== null && !match.allowPrivate && isHomePrivateHost(match.url),
              measurementReason: measuring?.reason,
            });
            const parsed = status?.lastAttempt ? Date.parse(status.lastAttempt) : NaN;
            const lastAttempt = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
            const isStale =
              lastAttempt !== null &&
              now - lastAttempt >
                Math.max(120_000, (match.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 2_000);
            const isService =
              db.prepare('SELECT 1 FROM services WHERE id=?').get(match.id) !== undefined;
            const summary = uptimeSummarizerOf(db, range, now, false, {}, caHash?.())(match);
            const upChecks = Math.max(
              0,
              summary.checks - summary.downChecks - summary.unknownChecks,
            );
            value = availabilitySchema.parse({
              generatedAt: now,
              range,
              target: {
                id: match.id,
                name: match.name,
                isService,
                state,
                lastAttempt,
                stale: isStale,
                uptimePct: summary.uptimePct,
                checks: summary.checks,
                upChecks,
                downChecks: summary.downChecks,
                unknownChecks: summary.unknownChecks,
                minChecks: UPTIME_MIN_CHECKS,
                reconfigured: summary.reconfigured,
                buckets: summary.buckets.map((bucket) => ({
                  start: bucket.start,
                  status: bucket.status,
                  checks: bucket.checks ?? 0,
                })),
              },
            });
          } else {
            value = availabilitySchema.parse({ generatedAt: now, range, target: null });
          }
          break;
        }
        case 'incidents': {
          const groupFilter =
            groupNames.length > 0 ? `AND g.name IN (${groupNames.map(() => '?').join(',')})` : '';
          const pageFilter =
            pageNames.length > 0 ? `AND p.name IN (${pageNames.map(() => '?').join(',')})` : '';
          const rows = db
            .prepare(
              `SELECT i.id, i.service_id AS monitorId, m.name, i.started_at AS startedAt, i.ended_at AS endedAt, i.reason, i.http_status AS httpStatus, s.id IS NOT NULL AS hasService FROM service_incidents i JOIN monitors m ON m.id=i.service_id LEFT JOIN services s ON s.id=m.id LEFT JOIN service_groups g ON g.name=s.category LEFT JOIN pages p ON p.id=g.page_id WHERE (i.ended_at IS NULL OR i.ended_at>=?) AND i.started_at<=? AND COALESCE(i.ended_at, ?)-i.started_at>=? ${groupFilter} ${pageFilter} ORDER BY i.ended_at IS NOT NULL, i.started_at DESC,i.id DESC LIMIT ?`,
            )
            .all(
              now - days * 86_400_000,
              now,
              now,
              minimumMinutes * 60_000,
              ...groupNames,
              ...pageNames,
              limit + 1,
            ) as Array<
            { reason: string; httpStatus: number | null; hasService: number } & Record<
              string,
              unknown
            >
          >;
          value = incidentsSchema.parse({
            generatedAt: now,
            periodDays: days,
            items: rows.slice(0, limit).map((row) => ({
              ...row,
              reason: monitoringIncidentReasons.includes(
                row.reason as (typeof monitoringIncidentReasons)[number],
              )
                ? row.reason
                : 'other',
              httpStatus:
                row.httpStatus !== null &&
                Number.isInteger(row.httpStatus) &&
                row.httpStatus >= 100 &&
                row.httpStatus <= 599
                  ? row.httpStatus
                  : null,
              hasService: Boolean(row.hasService),
            })),
            truncated: rows.length > limit,
          });
          break;
        }
        default: {
          let targets = source.list();
          if (groups || pages) {
            const groupIds = new Set(groups?.split(',').map(Number));
            const pageIds = new Set(pages?.split(',').map(Number));
            const rows = db
              .prepare(`SELECT s.id, g.id AS groupId,
            COALESCE(g.page_id, (SELECT id FROM pages ORDER BY position, id LIMIT 1)) AS pageId
            FROM services s LEFT JOIN service_groups g ON g.name = s.category`)
              .all() as { id: number; groupId: number | null; pageId: number | null }[];
            const selected = new Set(
              rows
                .filter(
                  (row) =>
                    (!groups || (row.groupId !== null && groupIds.has(row.groupId))) &&
                    (!pages || (row.pageId !== null && pageIds.has(row.pageId))),
                )
                .map((row) => row.id),
            );
            targets = targets.filter((target) => selected.has(target.id));
          }
          const states = monitor.snapshot();
          const open = incidents.open();
          const settings = db
            .prepare(
              'SELECT service_id AS id,degraded_latency_ms AS threshold FROM service_monitor_settings',
            )
            .all() as { id: number; threshold: number | null }[];
          const thresholds = new Map(settings.map((item) => [item.id, item.threshold]));
          const measuring = measurement.current();
          const counts: MonitoringCounts = {
            down: 0,
            degraded: 0,
            ok: 0,
            maintenance: 0,
            blocked: 0,
            unknown: 0,
          };
          let stale = 0;
          let unmeasured = 0;
          const cards =
            kind === 'problems'
              ? (db.prepare('SELECT id FROM services').all() as { id: number }[])
              : [];
          const cardsById = new Set(cards.map((card) => card.id));
          const problems = [];
          for (const target of targets) {
            const status = states[target.id];
            const state = monitoringState({
              status: status?.status,
              reason: status?.reason,
              latencyMs: status?.latencyMs,
              degradedLatencyMs: thresholds.get(target.id),
              blocked: target.url !== null && !target.allowPrivate && isHomePrivateHost(target.url),
              measurementReason: measuring?.reason,
            });
            counts[state]++;
            const parsed = status?.lastAttempt ? Date.parse(status.lastAttempt) : NaN;
            const lastAttempt = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
            const isStale =
              lastAttempt !== null &&
              now - lastAttempt >
                Math.max(120_000, (target.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 2_000);
            if (isStale) stale++;
            if (kind !== 'problems') continue;
            if (state === 'unknown' || state === 'blocked') unmeasured++;
            if (state === 'down' || (state === 'degraded' && includeDegraded === 'true')) {
              const incident = open[target.id];
              const reason = incident?.reason ?? status?.reason;
              const code = incident?.httpStatus ?? status?.httpStatus;
              problems.push({
                id: target.id,
                name: target.name,
                state,
                lastAttempt,
                stale: isStale,
                latencyMs: status?.latencyMs ?? null,
                since:
                  state === 'degraded'
                    ? (degradedSince?.since(target.id, thresholds.get(target.id), lastAttempt) ??
                      null)
                    : (incident?.startedAt ?? null),
                reason: reason && safeReasons.has(reason) ? reason : null,
                httpStatus:
                  typeof code === 'number' && Number.isInteger(code) && code >= 100 && code <= 599
                    ? code
                    : null,
                isService: cardsById.has(target.id),
              });
            }
          }
          const orderedProblems = orderMonitoringProblems(problems);
          value =
            kind === 'summary'
              ? summarySchema.parse({
                  generatedAt: now,
                  counts,
                  stale,
                  measurementFailure: measuring !== null,
                })
              : problemsSchema.parse({
                  generatedAt: now,
                  items: orderedProblems.slice(0, limit),
                  truncated: problems.length > limit,
                  total: problems.length,
                  unmeasured,
                });
        }
      }
      // Bound cache cardinality even when clients use many parameter combinations.
      if (cache.size >= 32) cache.clear();
      cache.set(key, { at: now, value });
      return value;
    },
  );
}
