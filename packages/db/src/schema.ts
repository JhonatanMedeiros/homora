import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const serviceGroups = sqliteTable('service_groups', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  position: integer('position').notNull().default(0),
  // Grid columns on wide viewports (1 to 6); null retains automatic responsive layout.
  columns: integer('columns'),
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
});
export const configVersion = sqliteTable('config_version', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});
export const auditEvents = sqliteTable('audit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  proposalId: text('proposal_id'),
  result: text('result').notNull(),
  createdAt: integer('created_at').notNull(),
});

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
