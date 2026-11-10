import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const serviceGroups = sqliteTable('service_groups', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  position: integer('position').notNull().default(0),
  // Colunas da grade em telas largas (1 a 6); nulo mantém o ajuste automático.
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
  // Card que exibe o widget; nulo mantém o widget só na página Integrações.
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
