import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { monitors, services } from './core-schema.js';

/** Notification destinations and Telegram credentials are encrypted with the integration key. */
export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  secret: text('secret').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  allowPrivate: integer('allow_private', { mode: 'boolean' }).notNull().default(false),
  includeUrl: integer('include_url', { mode: 'boolean' }).notNull().default(false),
  locale: text('locale').notNull().default('en'),
  createdAt: text('created_at').notNull(),
  lastSentAt: text('last_sent_at'),
  lastError: text('last_error'),
  failures: integer('failures').notNull().default(0),
});

export const notificationStates = sqliteTable('notification_states', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
});

// Last observations are shared with the separate local MCP process. The service
// signature prevents an old result from being attributed to edited settings.
export const serviceObservations = sqliteTable('service_observations', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  signature: text('signature').notNull(),
  observation: text('observation').notNull(),
});

export const serviceObservationHistory = sqliteTable(
  'service_observation_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serviceId: integer('service_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    signature: text('signature').notNull(),
    observedAt: integer('observed_at').notNull(),
    observation: text('observation').notNull(),
    // Virtual columns read from the JSON so uptime can aggregate on an index without parsing rows.
    status: text('status').generatedAlwaysAs(sql`json_extract(observation, '$.status')`, {
      mode: 'virtual',
    }),
    latencyMs: real('latency_ms').generatedAlwaysAs(sql`json_extract(observation, '$.latencyMs')`, {
      mode: 'virtual',
    }),
  },
  (table) => [
    index('observation_history_uptime_idx').on(
      table.serviceId,
      table.signature,
      table.observedAt,
      table.status,
      table.latencyMs,
    ),
    uniqueIndex('observation_history_service_time_idx').on(
      table.serviceId,
      table.observedAt,
      table.signature,
    ),
    index('observation_history_time_idx').on(table.observedAt),
  ],
);

/**
 * How a service's health is interpreted, kept apart from the probe configuration: changing it
 * never invalidates history (it is not part of the service signature) and, like `is_public`, it
 * is never written by imports or agent proposals. No row means the defaults.
 */
export const serviceMonitorSettings = sqliteTable('service_monitor_settings', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  // Consecutive failed checks before an incident opens and an alert is sent (anti-flapping).
  failureThreshold: integer('failure_threshold').notNull().default(1),
  // Consecutive successful checks before an open incident counts as recovered.
  recoveryThreshold: integer('recovery_threshold').notNull().default(1),
  // An online service slower than this (milliseconds) reads "Degraded"; null disables the state.
  degradedLatencyMs: integer('degraded_latency_ms'),
});

/**
 * Periods in which a service was considered down, derived from its checks. An incident is open
 * while `ended_at` is null. `started_at` is the first failed check of the streak, not the moment
 * the failure threshold was reached. Reasons come from the monitor's own vocabulary, never from
 * the response body.
 */
export const serviceIncidents = sqliteTable(
  'service_incidents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serviceId: integer('service_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    reason: text('reason').notNull(),
    httpStatus: integer('http_status'),
    failedChecks: integer('failed_checks').notNull().default(1),
  },
  (table) => [
    index('service_incidents_service_idx').on(table.serviceId, table.startedAt),
    index('service_incidents_started_idx').on(table.startedAt),
  ],
);

/**
 * Scheduled maintenance of one service. While a window is open the service is not probed and its
 * checks are recorded as unknown, so they count neither as downtime nor as uptime and raise no alert.
 */
export const serviceMaintenance = sqliteTable(
  'service_maintenance',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serviceId: integer('service_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at').notNull(),
    note: text('note').notNull().default(''),
  },
  (table) => [index('service_maintenance_service_idx').on(table.serviceId, table.startsAt)],
);

/**
 * Hourly counts of checks per service. Raw checks are kept for 30 days; this keeps the numbers
 * for about 100 so the 90-day heatmap and the "versus the previous period" comparison work.
 * Not tied to the check configuration: it is a long-term availability record, not a signature.
 */
export const serviceUptimeRollup = sqliteTable(
  'service_uptime_rollup',
  {
    serviceId: integer('service_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    hour: integer('hour').notNull(),
    up: integer('up').notNull().default(0),
    down: integer('down').notNull().default(0),
    unknown: integer('unknown').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.serviceId, table.hour] })],
);

/** Free-form labels on a service ("prod", "media"). Display and filtering only: they never affect checks. */
export const serviceTags = sqliteTable(
  'service_tags',
  {
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [primaryKey({ columns: [table.serviceId, table.tag] })],
);
