import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
  openTarget: text('open_target').notNull().default('new-tab'),
  checkType: text('check_type').notNull().default('http'),
  checkInterval: integer('check_interval'),
  expectedStatus: text('expected_status'),
  checkPath: text('check_path'),
  checkMatch: text('check_match'),
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
