import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const services = sqliteTable('services', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
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
});
