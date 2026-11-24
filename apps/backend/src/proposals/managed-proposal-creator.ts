import { randomBytes } from 'node:crypto';
import { validateProbe } from '@homora/shared';
import { normalizeTags } from '../service-tags.js';
import { createProbeStore } from '../probes.js';
import type { DatabaseSync } from 'node:sqlite';
import { createServiceConfiguration } from '../service-configuration.js';
import {
  applyManagedChange,
  isIndependentChange,
  managedChangeSchema,
  managedSnapshot,
} from './managed-proposals.js';

export function createManagedProposalCreator({
  sqlite,
  configuration,
  transaction,
  checkPending,
  managedBaseHash,
  proposalTtlMinutes,
  getBatchId,
  findDuplicate,
}: {
  sqlite: DatabaseSync;
  configuration: ReturnType<typeof createServiceConfiguration>;
  transaction: <T>(work: () => T) => T;
  checkPending: (authorId: string) => void;
  managedBaseHash: (change?: import('./managed-proposals.js').ManagedChange) => string;
  proposalTtlMinutes: () => number;
  getBatchId: () => string | null;
  findDuplicate: (
    diff: unknown,
    baseHash: string,
    baseVersion?: number,
  ) => { id: string; diff: unknown; expiresAt: number; state: 'pending' } | null;
}) {
  return function proposeManaged(authorId: string, input: unknown) {
    let parsedChange = managedChangeSchema.parse(input);
    return transaction(() => {
      if (parsedChange.kind === 'probe' && parsedChange.change.op !== 'delete') {
        const probe = parsedChange.change.probe;
        const current =
          parsedChange.change.op === 'update'
            ? createProbeStore(sqlite).get(parsedChange.change.id)
            : null;
        parsedChange = {
          kind: 'probe',
          change: {
            ...parsedChange.change,
            probe: validateProbe({
              ...probe,
              checkMatch:
                probe.checkMatch === undefined && current ? current.checkMatch : probe.checkMatch,
            }),
          },
        };
      }
      if (parsedChange.kind === 'tag')
        parsedChange = {
          kind: 'tag',
          change: { ...parsedChange.change, tags: normalizeTags(parsedChange.change.tags) },
        };
      const change = parsedChange;
      checkPending(authorId);
      const snapshot = managedSnapshot(sqlite);
      const baseHash = managedBaseHash(change);
      const baseVersion = configuration.version();
      // Validate the exact operation without retaining the simulated changes.
      sqlite.exec('SAVEPOINT validate_proposal');
      try {
        applyManagedChange(sqlite, change);
      } finally {
        sqlite.exec('ROLLBACK TO validate_proposal; RELEASE validate_proposal');
      }
      const targetId = 'id' in change.change ? change.change.id : undefined;
      const integrationId =
        'integrationId' in change.change ? change.change.integrationId : undefined;
      const widgetRows =
        change.kind === 'widget' &&
        change.change.op !== 'create' &&
        change.change.op !== 'move' &&
        change.change.op !== 'page-create' &&
        change.change.op !== 'page-delete'
          ? snapshot.widgets.filter((row) => row.id === targetId)
          : [];
      const widgetConnectionId = integrationId ?? widgetRows[0]?.integration_id;
      const widgetServiceIds = new Set([
        widgetRows[0]?.service_id,
        'serviceId' in change.change ? change.change.serviceId : undefined,
      ]);
      const placedConnectionId =
        change.kind === 'widget' && change.change.op === 'page-create'
          ? change.change.connectionId
          : undefined;
      const relevantGroups =
        change.kind === 'group'
          ? change.change.op === 'create'
            ? []
            : change.change.op === 'reorder'
              ? snapshot.groups
              : snapshot.groups.filter((row) => row.id === targetId)
          : [];
      const relevantCategories =
        change.kind === 'card-order'
          ? change.change.op === 'reorder'
            ? [change.change.category]
            : [
                change.change.targetCategory,
                snapshot.services.find((row) => row.id === targetId)?.category,
              ]
          : relevantGroups.map((row) => row.name);
      const before =
        change.kind === 'pin'
          ? {
              pinned: sqlite
                .prepare(
                  'SELECT s.service_id AS id,m.name FROM service_pins s JOIN monitors m ON m.id=s.service_id ORDER BY s.service_id',
                )
                .all(),
              order:
                sqlite
                  .prepare("SELECT value FROM app_settings WHERE key='service_pin_order'")
                  .get() ?? null,
              services: snapshot.services
                .filter(
                  (row) => change.change.op !== 'reorder' && row.id === change.change.serviceId,
                )
                .map(({ id, name }) => ({ id, name })),
            }
          : change.kind === 'link'
            ? {
                link:
                  sqlite
                    .prepare(
                      'SELECT service_id AS serviceId,integration_id AS integrationId,resource_uuid AS resourceUuid,resource_type AS resourceType,seen_name AS name FROM integration_resource_links WHERE service_id=?',
                    )
                    .get(change.change.serviceId) ?? null,
                services: snapshot.services
                  .filter((row) => row.id === change.change.serviceId)
                  .map(({ id, name }) => ({ id, name })),
              }
            : change.kind === 'public-visibility'
              ? {
                  monitor:
                    sqlite
                      .prepare('SELECT id,name,is_public AS isPublic FROM monitors WHERE id=?')
                      .get(change.change.serviceId) ?? null,
                }
              : change.kind === 'acknowledgement'
                ? {
                    monitor:
                      sqlite
                        .prepare('SELECT id,name FROM monitors WHERE id=?')
                        .get(change.change.serviceId) ?? null,
                    acknowledgement:
                      sqlite
                        .prepare(
                          'SELECT incident_id AS incidentId,acknowledged_at AS acknowledgedAt,muted_until AS mutedUntil FROM service_acknowledgements WHERE service_id=?',
                        )
                        .get(change.change.serviceId) ?? null,
                  }
                : change.kind === 'tag'
                  ? {
                      tags: sqlite
                        .prepare('SELECT tag FROM service_tags WHERE service_id=? ORDER BY tag')
                        .all(change.change.serviceId)
                        .map((row) => row.tag),
                      services: snapshot.services
                        .filter((row) => row.id === change.change.serviceId)
                        .map(({ id, name }) => ({ id, name })),
                    }
                  : change.kind === 'probe'
                    ? {
                        probe:
                          change.change.op === 'create'
                            ? null
                            : (sqlite
                                .prepare(
                                  'SELECT id,name,check_url AS address,check_type AS checkType,check_interval AS checkInterval,expected_status AS expectedStatus,check_match AS checkMatch,allow_private AS allowPrivate FROM monitors WHERE id=? AND NOT EXISTS (SELECT 1 FROM services WHERE services.id=monitors.id)',
                                )
                                .get(change.change.id) ?? null),
                      }
                    : change.kind === 'page'
                      ? {
                          pages: sqlite
                            .prepare('SELECT id,name,position FROM pages ORDER BY position,id')
                            .all(),
                          groups: sqlite
                            .prepare(
                              'SELECT id,name,page_id AS pageId FROM service_groups ORDER BY id',
                            )
                            .all(),
                          widgets: sqlite
                            .prepare(
                              'SELECT id,name,page_id AS pageId,position FROM page_widgets ORDER BY id',
                            )
                            .all(),
                        }
                      : change.kind === 'maintenance'
                        ? {
                            services: snapshot.services
                              .filter((row) => row.id === change.change.serviceId)
                              .map(({ id, name }) => ({ id, name })),
                          }
                        : change.kind === 'host-link'
                          ? {
                              services: snapshot.services
                                .filter((row) => row.id === change.change.serviceId)
                                .map(
                                  ({
                                    id,
                                    name,
                                    host_connection_id,
                                    host_node,
                                    host_vmid,
                                    host_type,
                                  }) => ({
                                    id,
                                    name,
                                    host_connection_id,
                                    host_node,
                                    host_vmid,
                                    host_type,
                                  }),
                                ),
                            }
                          : change.kind === 'group' || change.kind === 'card-order'
                            ? {
                                groups: relevantGroups,
                                services: snapshot.services
                                  .filter((row) => relevantCategories.includes(row.category))
                                  .map(({ id, name, category, position }) => ({
                                    id,
                                    name,
                                    category,
                                    position,
                                  })),
                              }
                            : change.kind === 'widget' &&
                                (change.change.op === 'move' ||
                                  change.change.op === 'page-create' ||
                                  change.change.op === 'page-delete')
                              ? {
                                  widgets: sqlite
                                    .prepare(
                                      'SELECT id,name,type,connection_id AS connectionId,page_id AS pageId,position FROM page_widgets ORDER BY page_id,position,id',
                                    )
                                    .all(),
                                  pages: sqlite
                                    .prepare('SELECT id,name FROM pages ORDER BY position,id')
                                    .all(),
                                  connections:
                                    change.change.op === 'page-create'
                                      ? snapshot.connections
                                          .filter((row) => row.id === placedConnectionId)
                                          .map(({ id, type, name }) => ({ id, type, name }))
                                      : [],
                                }
                              : change.kind === 'widget'
                                ? {
                                    widgets: widgetRows.map(
                                      ({ id, integration_id, type, name, service_id }) => ({
                                        id,
                                        integration_id,
                                        type,
                                        name,
                                        service_id,
                                      }),
                                    ),
                                    connections: snapshot.connections
                                      .filter((row) => row.id === widgetConnectionId)
                                      .map(({ id, type, name }) => ({ id, type, name })),
                                    services: snapshot.services
                                      .filter((row) => widgetServiceIds.has(row.id))
                                      .map(({ id, name }) => ({ id, name })),
                                  }
                                : null;
      const diff = { kind: 'managed', change, before };
      const duplicate = findDuplicate(
        diff,
        baseHash,
        isIndependentChange(change) ? undefined : baseVersion,
      );
      if (duplicate) return duplicate;
      const id = randomBytes(16).toString('hex');
      const now = Date.now();
      const expiresAt = now + proposalTtlMinutes() * 60_000;
      sqlite
        .prepare(
          'INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at,batch_id) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          authorId,
          JSON.stringify(diff),
          baseHash,
          baseVersion,
          expiresAt,
          'pending',
          now,
          getBatchId(),
        );
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'proposal', id, 'created', now);
      return { id, diff, expiresAt, state: 'pending' };
    });
  };
}
