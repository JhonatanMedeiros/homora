import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const id = z.number().int().safe().positive();
const name = z.string().trim().min(1).max(40);
const widgetName = z.string().trim().min(1).max(80);
export const groupChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), name }).strict(),
  z.object({ op: z.literal('rename'), id, name }).strict(),
  z.object({ op: z.literal('delete'), id }).strict(),
  z.object({ op: z.literal('reorder'), names: z.array(name).max(200) }).strict(),
]);
export const cardOrderSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reorder'), category: name, ids: z.array(id).max(1000) }).strict(),
  z
    .object({
      op: z.literal('move'),
      id,
      targetCategory: name,
      sourceIds: z.array(id).max(1000),
      targetIds: z.array(id).max(1000),
    })
    .strict(),
]);
export const widgetChangeSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('create'),
      integrationId: id.optional(),
      source: z.literal('proxmox').optional(),
      name: widgetName,
      serviceId: id.nullable().optional(),
    })
    .strict()
    .refine((value) => (value.integrationId === undefined) !== (value.source === undefined)),
  z.object({ op: z.literal('link'), id, serviceId: id.nullable() }).strict(),
  z.object({ op: z.literal('delete'), id }).strict(),
]);
export const connectionSetupSchema = z
  .object({
    type: z.enum(['jellyfin', 'home-assistant', 'uptime-kuma', 'adguard-home', 'proxmox']),
    name: widgetName,
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      }),
    entityId: z.string().trim().max(255).optional(),
    username: z.string().trim().max(255).optional(),
    slug: z.string().trim().max(255).optional(),
  })
  .strict()
  .refine((value) => value.type !== 'proxmox' || value.url.startsWith('https://'));
export const managedChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('group'), change: groupChangeSchema }).strict(),
  z.object({ kind: z.literal('card-order'), change: cardOrderSchema }).strict(),
  z.object({ kind: z.literal('widget'), change: widgetChangeSchema }).strict(),
  z.object({ kind: z.literal('connection-setup'), change: connectionSetupSchema }).strict(),
]);
export type ManagedChange = z.infer<typeof managedChangeSchema>;

/** This covers every row involved in these changes, including changes made by the web API. */
export function managedSnapshot(db: DatabaseSync) {
  return {
    groups: db.prepare('SELECT id,name,position,columns FROM service_groups ORDER BY id').all(),
    services: db
      .prepare(
        'SELECT id,name,url,category,description,icon,position,allow_private,check_type,check_interval FROM services ORDER BY id',
      )
      .all(),
    widgets: db
      .prepare(
        'SELECT id,integration_id,type,name,public_config,service_id FROM integration_widgets ORDER BY id',
      )
      .all(),
    connections: db
      .prepare(
        'SELECT id,type,name,public_config,secret_ref,certificate_ref FROM integration_instances ORDER BY id',
      )
      .all(),
  };
}
export function managedHash(db: DatabaseSync) {
  return createHash('sha256')
    .update(JSON.stringify(managedSnapshot(db)))
    .digest('hex');
}
function exactMembers(current: (string | number)[], requested: (string | number)[]) {
  return (
    current.length === requested.length &&
    new Set(requested).size === current.length &&
    requested.every((value) => current.includes(value))
  );
}
/** Called inside an existing write transaction. All validation is repeated at approval. */
export function applyManagedChange(
  db: DatabaseSync,
  input: ManagedChange,
  proxmoxConfigured: () => boolean = () => false,
) {
  const { kind, change } = managedChangeSchema.parse(input);
  if (kind === 'group') {
    if (change.op === 'create') {
      db.prepare(
        'INSERT INTO service_groups(name,position) VALUES(?,(SELECT COALESCE(MAX(position),-1)+1 FROM service_groups))',
      ).run(change.name);
    } else if (change.op === 'reorder') {
      const rows = db.prepare('SELECT name FROM service_groups ORDER BY position,name').all() as {
        name: string;
      }[];
      if (
        !exactMembers(
          rows.map((row) => row.name),
          change.names,
        )
      )
        throw new Error('Invalid order');
      const update = db.prepare('UPDATE service_groups SET position=? WHERE name=?');
      change.names.forEach((item, index) => update.run(index, item));
    } else {
      const row = db.prepare('SELECT name FROM service_groups WHERE id=?').get(change.id) as
        { name: string } | undefined;
      if (!row) throw new Error('Group not found');
      if (change.op === 'delete') {
        if (db.prepare('SELECT id FROM services WHERE category=? LIMIT 1').get(row.name))
          throw new Error('Group not empty');
        db.prepare('DELETE FROM service_groups WHERE id=?').run(change.id);
      } else {
        db.prepare('UPDATE service_groups SET name=? WHERE id=?').run(change.name, change.id);
        db.prepare('UPDATE services SET category=? WHERE category=?').run(change.name, row.name);
      }
    }
  } else if (kind === 'card-order') {
    const update = db.prepare('UPDATE services SET position=? WHERE id=?');
    if (change.op === 'reorder') {
      const rows = db
        .prepare('SELECT id FROM services WHERE category=? ORDER BY position,name')
        .all(change.category) as { id: number }[];
      if (
        !exactMembers(
          rows.map((row) => row.id),
          change.ids,
        )
      )
        throw new Error('Invalid order');
      change.ids.forEach((item, index) => update.run(index, item));
    } else {
      const service = db.prepare('SELECT category FROM services WHERE id=?').get(change.id) as
        { category: string } | undefined;
      if (
        !service ||
        service.category === change.targetCategory ||
        !db.prepare('SELECT id FROM service_groups WHERE name=?').get(change.targetCategory)
      )
        throw new Error('Invalid move');
      const source = db
        .prepare('SELECT id FROM services WHERE category=?')
        .all(service.category) as { id: number }[];
      const target = db
        .prepare('SELECT id FROM services WHERE category=?')
        .all(change.targetCategory) as { id: number }[];
      if (
        !exactMembers(
          source.map((row) => row.id).filter((item) => item !== change.id),
          change.sourceIds,
        ) ||
        !exactMembers([...target.map((row) => row.id), change.id], change.targetIds)
      )
        throw new Error('Invalid order');
      db.prepare('UPDATE services SET category=? WHERE id=?').run(change.targetCategory, change.id);
      change.sourceIds.forEach((item, index) => update.run(index, item));
      change.targetIds.forEach((item, index) => update.run(index, item));
    }
  } else if (kind === 'widget') {
    if (change.op === 'create') {
      let connectionId = change.integrationId;
      if (change.source === 'proxmox') {
        if (!proxmoxConfigured()) throw new Error('Proxmox not configured');
        const existing = db
          .prepare("SELECT id FROM integration_instances WHERE type='proxmox' LIMIT 1")
          .get() as { id: number } | undefined;
        connectionId = existing?.id;
        if (connectionId === undefined)
          connectionId = Number(
            db
              .prepare(
                "INSERT INTO integration_instances(type,name,public_config) VALUES('proxmox','Proxmox VE','{}')",
              )
              .run().lastInsertRowid,
          );
      }
      const connection = db
        .prepare('SELECT type FROM integration_instances WHERE id=?')
        .get(connectionId!) as { type: string } | undefined;
      if (!connection) throw new Error('Connection not found');
      if (
        change.serviceId != null &&
        !db.prepare('SELECT id FROM services WHERE id=?').get(change.serviceId)
      )
        throw new Error('Service not found');
      db.prepare(
        "INSERT INTO integration_widgets(integration_id,type,name,public_config,service_id) VALUES(?,?,?,'{}',?)",
      ).run(connectionId!, connection.type, change.name, change.serviceId ?? null);
    } else if (change.op === 'link') {
      if (
        change.serviceId !== null &&
        !db.prepare('SELECT id FROM services WHERE id=?').get(change.serviceId)
      )
        throw new Error('Service not found');
      if (
        !db
          .prepare('UPDATE integration_widgets SET service_id=? WHERE id=?')
          .run(change.serviceId, change.id).changes
      )
        throw new Error('Widget not found');
    } else {
      if (!db.prepare('DELETE FROM integration_widgets WHERE id=?').run(change.id).changes)
        throw new Error('Widget not found');
    }
  }
  // Connection setup is an approved request for the human to finish in the integration form.
  if (kind !== 'connection-setup')
    db.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
}
