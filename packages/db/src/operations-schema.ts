import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { integrationInstances, monitors, services } from './core-schema.js';

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
      .references(() => monitors.id, { onDelete: 'cascade' }),
    dependsOnId: integer('depends_on_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.dependsOnId] }),
    index('service_dependencies_target_idx').on(table.dependsOnId),
    check('service_dependencies_no_self', sql`${table.serviceId} <> ${table.dependsOnId}`),
  ],
);
