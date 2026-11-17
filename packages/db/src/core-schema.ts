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

/** Widgets placed on a Home page; legacy integration widgets remain separate. */
export const pageWidgets = sqliteTable('page_widgets', {
  id: integer('id').primaryKey(),
  pageId: integer('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  name: text('name').notNull().default(''),
  config: text('config').notNull(),
  version: integer('version').notNull().default(1),
  size: text('size').notNull().default('normal'),
  connectionId: integer('connection_id').references(() => integrationInstances.id, {
    onDelete: 'restrict',
  }),
  position: integer('position').notNull().default(0),
});

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

/**
 * What Homora monitors: the unit that owns checks, observations, incidents, uptime, maintenance,
 * notifications and public status. A monitor is either the check of a service card (it then shares
 * the card's id) or a probe, which has no card: `check_url` is its address and is required in the
 * application. A card's check address is its own `check_url`, else the card URL.
 */
export const monitors = sqliteTable('monitors', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  // 'http' (GET) or 'ping' (ICMP); interval in seconds is null for monitor default.
  checkType: text('check_type').notNull().default('http'),
  checkInterval: integer('check_interval'),
  expectedStatus: text('expected_status'),
  checkPath: text('check_path'),
  checkUrl: text('check_url'),
  checkMatch: text('check_match'),
  allowPrivate: integer('allow_private', { mode: 'boolean' }).notNull().default(false),
  checkInsecure: integer('check_insecure', { mode: 'boolean' }).notNull().default(false),
  // Opt-in to the read-only public status page. Never set by imports or agent proposals.
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
});

/**
 * The dashboard card of a monitor: how it is shown and opened. It shares its monitor's id and goes
 * with it. Monitors without a row here are probes and never appear on the Home.
 */
export const services = sqliteTable('services', {
  id: integer('id')
    .primaryKey()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  alias: text('alias').unique(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull().default(''),
  position: integer('position').notNull().default(0),
  openTarget: text('open_target').notNull().default('new-tab'),
  // Optional "runs on" link to a Proxmox guest. Ids only: names are resolved from the live
  // inventory so renames follow. All four columns are set together or all are null.
  hostConnectionId: integer('host_connection_id').references(() => integrationInstances.id, {
    onDelete: 'set null',
  }),
  hostNode: text('host_node'),
  hostVmid: integer('host_vmid'),
  hostType: text('host_type'),
});

/**
 * Types of extra address ("Public", "LAN", ...): a name and a color, shared by every service.
 * Names are unique ignoring case; at most 20; created and edited from the service form.
 */
export const linkTypes = sqliteTable(
  'link_types',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    position: integer('position').notNull().default(0),
  },
  (table) => [uniqueIndex('link_types_name_nocase_idx').on(sql`${table.name} COLLATE NOCASE`)],
);

/**
 * Extra addresses of a service, in `position` order. They are never monitored. They disappear with
 * the service; deleting a type only clears `type_id`. `open_target` null follows the service.
 */
export const serviceLinks = sqliteTable(
  'service_links',
  {
    id: integer('id').primaryKey(),
    serviceId: integer('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    typeId: integer('type_id').references(() => linkTypes.id, { onDelete: 'set null' }),
    name: text('name').notNull().default(''),
    url: text('url').notNull(),
    openTarget: text('open_target'),
    position: integer('position').notNull().default(0),
  },
  (table) => [index('service_links_service_idx').on(table.serviceId, table.position)],
);

/** Favorite services, shown in the Pinned row of the Home. One row per service; it goes with the service. */
export const servicePins = sqliteTable('service_pins', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => services.id, { onDelete: 'cascade' }),
  pinnedAt: integer('pinned_at').notNull(),
});

/**
 * "I saw this" for an offline service. It holds either an acknowledged incident (it stops counting
 * once that incident ends or a new one begins) or a mute that lapses at `muted_until`. Neither
 * changes monitoring or notifications; they only quiet what the Home highlights.
 */
export const serviceAcknowledgements = sqliteTable('service_acknowledgements', {
  serviceId: integer('service_id')
    .primaryKey()
    .references(() => monitors.id, { onDelete: 'cascade' }),
  incidentId: integer('incident_id'),
  acknowledgedAt: integer('acknowledged_at').notNull(),
  mutedUntil: integer('muted_until'),
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
  /** When the last explicit test ran (epoch ms); cleared when the connection is edited. */
  lastTestAt: integer('last_test_at'),
  /** `ok` or a short reason code for the last explicit test. Never the service's own message. */
  lastTestResult: text('last_test_result'),
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
