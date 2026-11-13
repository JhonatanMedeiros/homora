import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
/** Tabs of the Home. Names are unique ignoring case; at most 12; never zero. */
export const pages = sqliteTable(
  'pages',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [uniqueIndex('pages_name_nocase_idx').on(sql`${table.name} COLLATE NOCASE`)],
);
export const serviceGroups = sqliteTable('service_groups', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  position: integer('position').notNull().default(0),
  // Grid columns on wide viewports (1 to 6); null retains automatic responsive layout.
  columns: integer('columns'),
  // The page (tab) the group appears on. Nullable only because SQLite cannot add a NOT NULL
  // reference to an existing table; the migration assigns every group and the code always sets it.
  pageId: integer('page_id').references(() => pages.id, { onDelete: 'restrict' }),
});
export const services = sqliteTable('services', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull().default(''),
  position: integer('position').notNull().default(0),
  allowPrivate: integer('allow_private', { mode: 'boolean' }).notNull().default(false),
  // 'http' (GET) or 'ping' (ICMP); interval in seconds is null for monitor default.
  checkType: text('check_type').notNull().default('http'),
  checkInterval: integer('check_interval'),
  expectedStatus: text('expected_status'),
  checkPath: text('check_path'),
  // Opt-in to the read-only public status page. Never set by imports or agent proposals.
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  // Optional "runs on" link to a Proxmox guest. Ids only: names are resolved from the live
  // inventory so renames follow. All four columns are set together or all are null.
  hostConnectionId: integer('host_connection_id').references(() => integrationInstances.id, {
    onDelete: 'set null',
  }),
  hostNode: text('host_node'),
  hostVmid: integer('host_vmid'),
  hostType: text('host_type'),
});

/** Small instance-wide settings (key/value). Values are plain text and never hold secrets. */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

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

/**
 * How a service's health is interpreted, kept apart from the probe configuration: changing it
 * never invalidates history (it is not part of the service signature) and, like `is_public`, it
 * is never written by imports or agent proposals. No row means the defaults.
 */
export const serviceMonitorSettings = sqliteTable('service_monitor_settings', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => services.id, { onDelete: 'cascade' }),
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
      .references(() => services.id, { onDelete: 'cascade' }),
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
 * Hourly counts of checks per service. Raw checks are kept for 30 days; this keeps the numbers
 * for about 100 so the 90-day heatmap and the "versus the previous period" comparison work.
 * Not tied to the check configuration: it is a long-term availability record, not a signature.
 */
export const serviceUptimeRollup = sqliteTable(
  'service_uptime_rollup',
  {
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    hour: integer('hour').notNull(),
    up: integer('up').notNull().default(0),
    down: integer('down').notNull().default(0),
    unknown: integer('unknown').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.serviceId, table.hour] })],
);

// Configuration stored here must never contain credentials; secretRef points to a
// future credential store. Existing Proxmox credentials remain in their vault.
export const integrationInstances = sqliteTable('integration_instances', {
  id: integer('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  publicConfig: text('public_config').notNull().default('{}'),
  secretRef: text('secret_ref'),
  certificateRef: text('certificate_ref'),
});

/** Records application-level migrations that require decrypting legacy files. */
export const integrationMigrations = sqliteTable('integration_migrations', {
  name: text('name').primaryKey(),
});

export const integrationWidgets = sqliteTable('integration_widgets', {
  id: integer('id').primaryKey(),
  integrationId: integer('integration_id')
    .notNull()
    .references(() => integrationInstances.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  publicConfig: text('public_config').notNull().default('{}'),
  // Card displaying the widget; null keeps the widget only on the Integrations page.
  serviceId: integer('service_id').references(() => services.id, { onDelete: 'set null' }),
});

export const agentIdentities = sqliteTable('agent_identities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: text('scopes').notNull(),
  revokedAt: integer('revoked_at'),
  createdAt: integer('created_at').notNull(),
});
export const serviceProposals = sqliteTable('service_proposals', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  diff: text('diff').notNull(),
  baseHash: text('base_hash').notNull(),
  baseVersion: integer('base_version').notNull(),
  expiresAt: integer('expires_at').notNull(),
  state: text('state').notNull(),
  createdAt: integer('created_at').notNull(),
  reviewedAt: integer('reviewed_at'),
  reviewer: text('reviewer'),
  batchId: text('batch_id'),
});
export const configVersion = sqliteTable('config_version', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    proposalId: text('proposal_id'),
    result: text('result').notNull(),
    createdAt: integer('created_at').notNull(),
    // Short, non-sensitive context (for example the browser or the agent name).
    detail: text('detail'),
    ipAddress: text('ip_address'),
  },
  (table) => [index('audit_events_created_idx').on(table.createdAt)],
);

// Better Auth tables. Names and columns must match what the library expects (camelCase, dates
// as ISO-8601 text); a backend test compares this schema with the library's own requirements.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: text('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: text('accessTokenExpiresAt'),
    refreshTokenExpiresAt: text('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: text('expiresAt').notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// Remote Docker discovery identities and their last accepted inventory. Tokens are
// stored only as hashes; the inventory contains the restricted discovery fields.
export const dockerPushSources = sqliteTable('docker_push_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  tokenHash: text('token_hash').notNull().unique(),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  receivedAt: integer('received_at'),
  inventoryVersion: integer('inventory_version').notNull().default(0),
  inventory: text('inventory'),
});

/**
 * Link between a card and one resource (application or service) of an integration connection.
 * Keyed by the connection and the resource UUID, never by name. `seen_name` and `seen_url` are
 * the values the user last reviewed; a later difference is flagged for review, never applied.
 * One resource per card; the link disappears with the card or the connection.
 */
export const integrationResourceLinks = sqliteTable(
  'integration_resource_links',
  {
    id: integer('id').primaryKey(),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    integrationId: integer('integration_id')
      .notNull()
      .references(() => integrationInstances.id, { onDelete: 'cascade' }),
    resourceUuid: text('resource_uuid').notNull(),
    resourceType: text('resource_type').notNull(),
    seenName: text('seen_name').notNull(),
    seenUrl: text('seen_url'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('integration_resource_links_service_idx').on(table.serviceId),
    index('integration_resource_links_resource_idx').on(table.integrationId, table.resourceUuid),
  ],
);

/** Suggested hosts the user dismissed, so they do not return on every refresh (per card and guest). */
export const hostSuggestionDismissals = sqliteTable(
  'host_suggestion_dismissals',
  {
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => integrationInstances.id, { onDelete: 'cascade' }),
    node: text('node').notNull(),
    vmid: integer('vmid').notNull(),
    type: text('type').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.connectionId, table.vmid, table.type] }),
  ],
);

/**
 * Manual service-to-service dependencies: `service_id` depends on `depends_on_id`. Homora's own
 * data (never written to Proxmox). Self links are rejected by the database; cycles are rejected
 * by the application, and every traversal also guards against them.
 */
export const serviceDependencies = sqliteTable(
  'service_dependencies',
  {
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    dependsOnId: integer('depends_on_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.dependsOnId] }),
    index('service_dependencies_target_idx').on(table.dependsOnId),
    check('service_dependencies_no_self', sql`${table.serviceId} <> ${table.dependsOnId}`),
  ],
);
