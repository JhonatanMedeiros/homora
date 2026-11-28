import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { CHECK_TYPES, MAINTENANCE_NOTE_MAX } from '@homora/shared';
import { resolveWidget } from '@homora/integrations';
import { createMaintenanceStore } from '../monitoring/index.js';
import { createPageWidgetStore } from '../page-widget-store.js';
import { checkPageWidget } from '../page-widget-validation.js';
import {
  hasInventoryDomain,
  LEGACY_WIDGET_SOURCES,
  legacyUnavailableMessage,
} from '@homora/integrations';
import { renumberGroups } from '../group-order.js';
import {
  definitionOf,
  integrationTypeSchema,
  publicFieldShape,
} from '../integrations/integration-fields.js';
import { resolveLegacyConnection } from '../integrations/legacy-integrations.js';
import { createPages } from '../pages.js';
import { createProbeStore } from '../probes.js';
import { setMonitorPublic } from '../public-status.js';
import { normalizeTags } from '../service-tags.js';
import { createServiceAttention } from '../service-attention.js';
import { createResourceLinks } from '../resource-links.js';
import { isNodeName, isVmid, RESOURCE_ID_PATTERN } from '@homora/integrations';
import { deleteConnectionRow } from '../integrations/delete-connection.js';

const id = z.number().int().safe().positive();
const name = z.string().trim().min(1).max(40);
const widgetName = z.string().trim().min(1).max(80);
const probeInput = z
  .object({
    name: z.string().max(200),
    address: z.string().max(2100),
    checkType: z.enum(CHECK_TYPES).optional(),
    checkInterval: z.number().int().safe().nullable().optional(),
    expectedStatus: z.string().max(10).nullable().optional(),
    checkMatch: z.string().max(400).nullable().optional(),
    allowPrivate: z.boolean().optional(),
  })
  .strict();
export const probeChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), probe: probeInput }).strict(),
  z.object({ op: z.literal('update'), id, probe: probeInput }).strict(),
  z.object({ op: z.literal('delete'), id }).strict(),
]);
/**
 * Public visibility lives in its own proposal on purpose: `isPublic` stays out of ServiceInput and
 * ProbeInput so that creating or editing a monitor can never expose it as a side effect.
 */
export const publicVisibilityChangeSchema = z
  .object({ serviceId: id, isPublic: z.boolean() })
  .strict();
export const serviceTagsChangeSchema = z
  .object({ serviceId: id, tags: z.array(z.string().max(80)).max(12) })
  .strict();
export const acknowledgementChangeSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('ack'),
      serviceId: id,
      incidentId: id.nullable().optional(),
      muteMinutes: z.number().int().min(1).max(10080).optional(),
    })
    .strict(),
  z.object({ op: z.literal('clear'), serviceId: id }).strict(),
]);
const safeResourceUrl = z
  .string()
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
      // Schema refinement: an unparseable URL is simply invalid input.
      return false;
    }
  });
export const resourceLinkChangeSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('link'),
      serviceId: id,
      integrationId: id,
      resourceUuid: z.string().regex(RESOURCE_ID_PATTERN),
      resourceType: z.enum(['application', 'service']),
      name: z.string().trim().min(1).max(200),
      url: safeResourceUrl.nullable(),
    })
    .strict(),
  z.object({ op: z.literal('unlink'), serviceId: id }).strict(),
]);
export const pinChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('pin'), serviceId: id }).strict(),
  z.object({ op: z.literal('unpin'), serviceId: id }).strict(),
  z.object({ op: z.literal('reorder'), ids: z.array(id).max(1000) }).strict(),
]);
export const pageChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), name }).strict(),
  z.object({ op: z.literal('rename'), id, name }).strict(),
  z.object({ op: z.literal('delete'), id, moveTo: id.optional() }).strict(),
  z.object({ op: z.literal('reorder'), ids: z.array(id).max(50) }).strict(),
  z.object({ op: z.literal('assign-group'), id, pageId: id }).strict(),
]);
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
      source: z.enum(LEGACY_WIDGET_SOURCES).optional(),
      name: widgetName,
      serviceId: id.nullable().optional(),
    })
    .strict()
    .refine((value) => (value.integrationId === undefined) !== (value.source === undefined)),
  z.object({ op: z.literal('link'), id, serviceId: id.nullable() }).strict(),
  z
    .object({
      op: z.literal('move'),
      id,
      pageId: id,
      position: z.number().int().nonnegative().max(199),
    })
    .strict(),
  z.object({ op: z.literal('delete'), id }).strict(),
  /** Places a gallery tile on a page: same validation as the widget gallery, default configuration. */
  z
    .object({
      op: z.literal('page-create'),
      pageId: id,
      type: z.string().min(1).max(80),
      connectionId: id.nullable(),
      name: widgetName,
      position: z.number().int().nonnegative().max(199),
    })
    .strict(),
  z.object({ op: z.literal('page-delete'), id }).strict(),
]);
export const connectionSetupSchema = z
  .object({
    type: integrationTypeSchema,
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
          // Schema refinement: an unparseable URL is simply invalid input.
          return false;
        }
      }),
    /** Whether the suggested form starts with "Allow private network" checked; the person still decides. */
    allowPrivate: z.boolean().optional(),
    ...publicFieldShape(255, true),
  })
  .strict()
  .refine((value) => {
    const url = definitionOf(value.type)?.fields.find(({ kind }) => kind === 'url');
    return !url?.httpsOnly || value.url.startsWith('https://');
  });
/**
 * Links a card to an infrastructure guest. The strength and evidence are computed by the server when the
 * proposal is created (an agent cannot supply them) and shown to the reviewer next to the diff.
 */
export const hostLinkChangeSchema = z
  .object({
    op: z.literal('link'),
    serviceId: id,
    host: z
      .object({
        connectionId: id,
        node: z.string().refine(isNodeName),
        vmid: z.number().int().safe().refine(isVmid),
        type: z.enum(['qemu', 'lxc']),
      })
      .strict(),
    strength: z.enum(['strong', 'medium']),
    evidence: z.array(z.string().max(200)).min(1).max(5),
  })
  .strict();
const maintenanceWindow = {
  serviceId: id,
  startsAt: z.number().int().safe(),
  endsAt: z.number().int().safe(),
  note: z.string().max(MAINTENANCE_NOTE_MAX),
};
export const maintenanceChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), ...maintenanceWindow }).strict(),
  z.object({ op: z.literal('cancel'), id, ...maintenanceWindow }).strict(),
]);
export const managedChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('probe'), change: probeChangeSchema }).strict(),
  z.object({ kind: z.literal('tag'), change: serviceTagsChangeSchema }).strict(),
  z.object({ kind: z.literal('acknowledgement'), change: acknowledgementChangeSchema }).strict(),
  z.object({ kind: z.literal('link'), change: resourceLinkChangeSchema }).strict(),
  z.object({ kind: z.literal('pin'), change: pinChangeSchema }).strict(),
  z.object({ kind: z.literal('page'), change: pageChangeSchema }).strict(),
  z.object({ kind: z.literal('group'), change: groupChangeSchema }).strict(),
  z.object({ kind: z.literal('card-order'), change: cardOrderSchema }).strict(),
  z.object({ kind: z.literal('widget'), change: widgetChangeSchema }).strict(),
  z.object({ kind: z.literal('connection-setup'), change: connectionSetupSchema }).strict(),
  z
    .object({
      kind: z.literal('connection-delete'),
      change: z.object({ op: z.literal('delete'), id }).strict(),
    })
    .strict(),
  z.object({ kind: z.literal('host-link'), change: hostLinkChangeSchema }).strict(),
  z.object({ kind: z.literal('maintenance'), change: maintenanceChangeSchema }).strict(),
  z.object({ kind: z.literal('public-visibility'), change: publicVisibilityChangeSchema }).strict(),
]);
export type ManagedChange = z.infer<typeof managedChangeSchema>;

/**
 * Changes that touch one row on their own: their base hash covers only that row, so approving one
 * does not invalidate the others waiting in the queue (a global configuration version would).
 */
export function isIndependentChange(change?: ManagedChange) {
  if (!change) return false;
  return (
    change.kind === 'probe' ||
    change.kind === 'tag' ||
    change.kind === 'link' ||
    change.kind === 'acknowledgement' ||
    change.kind === 'public-visibility' ||
    (change.kind === 'pin' && change.change.op !== 'reorder')
  );
}

/** This covers every row involved in these changes, including changes made by the web API. */
export function managedSnapshot(db: DatabaseSync) {
  return {
    groups: db.prepare('SELECT id,name,position,columns FROM service_groups ORDER BY id').all(),
    services: db
      .prepare(
        'SELECT id,name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path,host_connection_id,host_node,host_vmid,host_type FROM service_cards ORDER BY id',
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
export function applyManagedChange(db: DatabaseSync, input: ManagedChange) {
  const { kind, change } = managedChangeSchema.parse(input);
  let affectedId: number | undefined;
  if (kind === 'pin') {
    const attention = createServiceAttention(db);
    if (change.op === 'reorder') attention.setPinnedOrder(change.ids);
    else if (!attention.setPinned(change.serviceId, change.op === 'pin'))
      throw new Error('Service not found');
    if (change.op !== 'reorder') affectedId = change.serviceId;
  } else if (kind === 'link') {
    const links = createResourceLinks(db);
    if (change.op === 'link') links.set(change.serviceId, change);
    else if (!links.remove(change.serviceId)) throw new Error('Resource link not found');
    affectedId = change.serviceId;
  } else if (kind === 'acknowledgement') {
    const attention = createServiceAttention(db);
    if (change.op === 'ack') {
      if (
        change.incidentId != null &&
        !db
          .prepare('SELECT id FROM service_incidents WHERE id=? AND service_id=?')
          .get(change.incidentId, change.serviceId)
      )
        throw new Error('Incident not found');
      if (!attention.acknowledge(change.serviceId, change.incidentId ?? null, change.muteMinutes))
        throw new Error('Monitor not found');
    } else if (!attention.clear(change.serviceId)) throw new Error('Monitor not found');
    affectedId = change.serviceId;
  } else if (kind === 'public-visibility') {
    if (!setMonitorPublic(db, change.serviceId, change.isPublic))
      throw new Error('Service not found');
    affectedId = change.serviceId;
  } else if (kind === 'tag') {
    if (!db.prepare('SELECT id FROM services WHERE id=?').get(change.serviceId))
      throw new Error('Service not found');
    db.prepare('DELETE FROM service_tags WHERE service_id=?').run(change.serviceId);
    const insert = db.prepare('INSERT INTO service_tags(service_id,tag) VALUES(?,?)');
    for (const tag of normalizeTags(change.tags)) insert.run(change.serviceId, tag);
    affectedId = change.serviceId;
  } else if (kind === 'probe') {
    const probes = createProbeStore(db);
    if (change.op === 'create') affectedId = probes.create(change.probe).id;
    else if (change.op === 'update') {
      if (!probes.update(change.id, change.probe)) throw new Error('Probe not found');
      affectedId = change.id;
    } else {
      if (!probes.remove(change.id)) throw new Error('Probe not found');
      affectedId = change.id;
    }
  } else if (kind === 'page') {
    const pages = createPages(db, true);
    const outcome =
      change.op === 'create'
        ? pages.create(change.name)
        : change.op === 'rename'
          ? pages.rename(change.id, change.name)
          : change.op === 'delete'
            ? pages.remove(change.id, change.moveTo)
            : change.op === 'reorder'
              ? pages.reorder(change.ids)
              : pages.setGroupPage(change.id, change.pageId);
    if (!outcome.ok) throw new Error(outcome.code);
  } else if (kind === 'maintenance') {
    const store = createMaintenanceStore(db);
    if (change.op === 'create') {
      if (!change.note.trim()) throw new Error('invalid-window');
      store.create(change.serviceId, change);
    } else {
      const current = store
        .upcoming(Date.now(), change.serviceId)
        .find((row) => row.id === change.id);
      if (
        !current ||
        current.startsAt !== change.startsAt ||
        current.endsAt !== change.endsAt ||
        current.note !== change.note
      )
        throw new Error('maintenance-not-found');
      store.remove(change.id);
    }
  } else if (kind === 'group') {
    if (change.op === 'create') {
      db.prepare(
        'INSERT INTO service_groups(name,position,page_id) VALUES(?,(SELECT COALESCE(MAX(position),-1)+1 FROM service_groups),(SELECT id FROM pages ORDER BY position,id LIMIT 1))',
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
        | { name: string }
        | undefined;
      if (!row) throw new Error('Group not found');
      if (change.op === 'delete') {
        if (db.prepare('SELECT id FROM services WHERE category=? LIMIT 1').get(row.name))
          throw new Error('Group not empty');
        db.prepare('DELETE FROM service_groups WHERE id=?').run(change.id);
        renumberGroups(db);
      } else {
        db.prepare('UPDATE service_groups SET name=? WHERE id=?').run(change.name, change.id);
        db.prepare('UPDATE services SET category=? WHERE category=?').run(change.name, row.name);
      }
    }
  } else if (kind === 'card-order') {
    const update = db.prepare('UPDATE services SET position=? WHERE id=?');
    if (change.op === 'reorder') {
      const rows = db
        .prepare('SELECT id FROM service_cards WHERE category=? ORDER BY position,name')
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
        | { category: string }
        | undefined;
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
    if (change.op === 'move') {
      const store = createPageWidgetStore(db);
      const widget = store.find(change.id);
      if (!widget || !db.prepare('SELECT id FROM pages WHERE id=?').get(change.pageId))
        throw new Error('Widget or page not found');
      const staying = widget.pageId === change.pageId;
      const siblings = store.idsOf(change.pageId).length - (staying ? 1 : 0);
      if ((!staying && !store.pageHasRoom(change.pageId)) || change.position > siblings)
        throw new Error('Invalid widget position');
      store.move(widget, change.pageId, change.position);
    } else if (change.op === 'page-create') {
      const checked = checkPageWidget(db, {
        pageId: change.pageId,
        type: change.type,
        name: change.name,
        config: resolveWidget(change.type)?.defaultConfig,
        connectionId: change.connectionId,
        size: 'normal',
      });
      if (!checked.ok) throw new Error(checked.code);
      const store = createPageWidgetStore(db);
      if (!store.pageHasRoom(change.pageId)) throw new Error('widget-limit');
      if (change.position > store.idsOf(change.pageId).length) throw new Error('invalid-position');
      if (!store.hasRoom(change.pageId)) throw new Error('widget-limit');
      affectedId = store.insert(checked.value, change.position);
    } else if (change.op === 'page-delete') {
      if (!createPageWidgetStore(db).remove(change.id)) throw new Error('widget-not-found');
      affectedId = change.id;
    } else if (change.op === 'create') {
      let connectionId = change.integrationId;
      if (change.source) {
        const legacyId = resolveLegacyConnection(db, change.source);
        if (legacyId === null) throw new Error(legacyUnavailableMessage(change.source));
        connectionId = legacyId;
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
  } else if (kind === 'connection-delete') {
    if (
      db.prepare('SELECT id FROM services WHERE host_connection_id=? LIMIT 1').get(change.id) ||
      db
        .prepare('SELECT service_id FROM integration_resource_links WHERE integration_id=? LIMIT 1')
        .get(change.id)
    )
      throw new Error('connection-has-links');
    const outcome = deleteConnectionRow(db, change.id);
    if (outcome === 'missing') throw new Error('connection-not-found');
    if (outcome === 'has-widgets') throw new Error('connection-has-widgets');
    affectedId = change.id;
  } else if (kind === 'host-link') {
    if (!db.prepare('SELECT id FROM services WHERE id=?').get(change.serviceId))
      throw new Error('Service not found');
    const connection = db
      .prepare('SELECT type FROM integration_instances WHERE id=?')
      .get(change.host.connectionId) as { type: string } | undefined;
    if (!connection || !hasInventoryDomain(connection.type, 'hosts'))
      throw new Error('Connection not found');
    db.prepare(
      'UPDATE services SET host_connection_id=?,host_node=?,host_vmid=?,host_type=? WHERE id=?',
    ).run(
      change.host.connectionId,
      change.host.node,
      change.host.vmid,
      change.host.type,
      change.serviceId,
    );
  }
  // Connection setup is an approved request for the human to finish in the integration form.
  if (kind !== 'connection-setup' && kind !== 'page')
    db.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
  return affectedId;
}
