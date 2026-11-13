import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { services } from './core-schema.js';

/** Notification destinations and Telegram credentials are encrypted with the integration key. */
export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  secret: text('secret').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  allowPrivate: integer('allow_private', { mode: 'boolean' }).notNull().default(false),
  includeUrl: integer('include_url', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  lastSentAt: text('last_sent_at'),
  lastError: text('last_error'),
  failures: integer('failures').notNull().default(0),
});

export const notificationStates = sqliteTable('notification_states', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => services.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
});

// Last observations are shared with the separate local MCP process. The service
// signature prevents an old result from being attributed to edited settings.
export const serviceObservations = sqliteTable('service_observations', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => services.id, { onDelete: 'cascade' }),
  signature: text('signature').notNull(),
  observation: text('observation').notNull(),
});

export const serviceObservationHistory = sqliteTable(
  'service_observation_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
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
