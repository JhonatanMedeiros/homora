import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createServiceConfiguration } from './service-configuration.js';
import { applyManagedChange, managedChangeSchema, managedSnapshot } from './managed-proposals.js';

export function createManagedProposalCreator({
  sqlite,
  configuration,
  transaction,
  checkPending,
  managedBaseHash,
  proposalTtlMinutes,
  getBatchId,
}: {
  sqlite: DatabaseSync;
  configuration: ReturnType<typeof createServiceConfiguration>;
  transaction: <T>(work: () => T) => T;
  checkPending: (authorId: string) => void;
  managedBaseHash: () => string;
  proposalTtlMinutes: () => number;
  getBatchId: () => string | null;
}) {
  return function proposeManaged(authorId: string, input: unknown) {
    const change = managedChangeSchema.parse(input);
    return transaction(() => {
      checkPending(authorId);
      const snapshot = managedSnapshot(sqlite);
      const baseHash = managedBaseHash();
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
        change.kind === 'widget' && change.change.op !== 'create'
          ? snapshot.widgets.filter((row) => row.id === targetId)
          : [];
      const widgetConnectionId = integrationId ?? widgetRows[0]?.integration_id;
      const widgetServiceIds = [
        widgetRows[0]?.service_id,
        'serviceId' in change.change ? change.change.serviceId : undefined,
      ];
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
        change.kind === 'maintenance'
          ? {
              services: snapshot.services
                .filter((row) => row.id === change.change.serviceId)
                .map(({ id, name }) => ({ id, name })),
            }
          : change.kind === 'host-link'
            ? {
                services: snapshot.services
                  .filter((row) => row.id === change.change.serviceId)
                  .map(({ id, name, host_connection_id, host_node, host_vmid, host_type }) => ({
                    id,
                    name,
                    host_connection_id,
                    host_node,
                    host_vmid,
                    host_type,
                  })),
              }
            : change.kind === 'group' || change.kind === 'card-order'
              ? {
                  groups: relevantGroups,
                  services: snapshot.services
                    .filter((row) => relevantCategories.includes(row.category))
                    .map(({ id, name, category, position }) => ({ id, name, category, position })),
                }
              : change.kind === 'widget'
                ? {
                    widgets: widgetRows.map(({ id, integration_id, type, name, service_id }) => ({
                      id,
                      integration_id,
                      type,
                      name,
                      service_id,
                    })),
                    connections: snapshot.connections
                      .filter((row) => row.id === widgetConnectionId)
                      .map(({ id, type, name }) => ({ id, type, name })),
                    services: snapshot.services
                      .filter((row) => widgetServiceIds.includes(row.id))
                      .map(({ id, name }) => ({ id, name })),
                  }
                : null;
      const diff = { kind: 'managed', change, before };
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
