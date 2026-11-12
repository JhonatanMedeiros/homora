import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const labels = z
  .object({
    'homora.url': z.string().max(2048).optional(),
    'homora.name': z.string().max(256).optional(),
    'homora.group': z.string().max(256).optional(),
    'homora.description': z.string().max(2048).optional(),
    'homora.icon': z.string().max(512).optional(),
    'homepage.href': z.string().max(2048).optional(),
    'homepage.name': z.string().max(256).optional(),
    'homepage.group': z.string().max(256).optional(),
    'homepage.description': z.string().max(2048).optional(),
    'homepage.icon': z.string().max(512).optional(),
  })
  .strict();
export const pushInventorySchema = z
  .object({
    containers: z
      .array(
        z
          .object({
            Id: z.string().regex(/^[a-f0-9]{64}$/),
            Names: z.array(z.string().max(256)).max(1),
            Labels: labels,
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export const PUSH_FRESHNESS_MS = 5 * 60_000;
type Actor = { id: string; ipAddress: string };
const record = (
  sqlite: DatabaseSync,
  actor: Actor | undefined,
  action: string,
  sourceId: string,
) => {
  if (actor)
    sqlite
      .prepare(
        'INSERT INTO audit_events(actor,action,result,created_at,detail,ip_address) VALUES(?,?,?,?,?,?)',
      )
      .run(actor.id, action, 'ok', Date.now(), sourceId, actor.ipAddress.slice(0, 64));
};
const transaction = <T>(sqlite: DatabaseSync, run: () => T): T => {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    sqlite.exec('COMMIT');
    return result;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
};
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

/** Storage for machine identities, independent of MCP and web sessions. */
export function createDockerPush(sqlite: DatabaseSync) {
  return {
    create(name: string, actor?: Actor) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const count = sqlite.prepare('SELECT count(*) AS n FROM docker_push_sources').get() as {
          n: number;
        };
        if (count.n >= 10) {
          sqlite.exec('COMMIT');
          return null;
        }
        const id = randomBytes(16).toString('hex');
        const token = randomBytes(32).toString('hex');
        sqlite
          .prepare('INSERT INTO docker_push_sources(id,name,token_hash,created_at) VALUES(?,?,?,?)')
          .run(id, name, digest(token), Date.now());
        record(sqlite, actor, 'docker-source-create', id);
        sqlite.exec('COMMIT');
        return { id, token };
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    countActive() {
      return (
        sqlite.prepare('SELECT count(*) AS n FROM docker_push_sources WHERE revoked=0').get() as {
          n: number;
        }
      ).n;
    },
    list() {
      const rows = sqlite
        .prepare(
          'SELECT id,name,revoked,created_at AS createdAt,received_at AS receivedAt,inventory_version AS inventoryVersion FROM docker_push_sources ORDER BY name',
        )
        .all() as {
        id: string;
        name: string;
        revoked: number;
        createdAt: number;
        receivedAt: number | null;
        inventoryVersion: number;
      }[];
      return rows.map((row) => ({
        ...row,
        stale: row.receivedAt !== null && Date.now() - row.receivedAt > PUSH_FRESHNESS_MS,
      }));
    },
    revoke(id: string, actor?: Actor) {
      return transaction(sqlite, () => {
        const changed =
          sqlite
            .prepare('UPDATE docker_push_sources SET revoked=1 WHERE id=? AND revoked=0')
            .run(id).changes === 1;
        if (changed) record(sqlite, actor, 'docker-source-revoke', id);
        return changed;
      });
    },
    snapshot(id: string) {
      const row = sqlite
        .prepare(
          'SELECT id,name,revoked,received_at AS receivedAt,inventory_version AS version,inventory FROM docker_push_sources WHERE id=?',
        )
        .get(id) as
        | {
            id: string;
            name: string;
            revoked: number;
            receivedAt: number | null;
            version: number;
            inventory: string | null;
          }
        | undefined;
      if (
        !row ||
        row.revoked ||
        !row.receivedAt ||
        !row.inventory ||
        Date.now() - row.receivedAt > PUSH_FRESHNESS_MS
      )
        return null;
      try {
        const parsed = pushInventorySchema.safeParse(JSON.parse(row.inventory));
        return parsed.success ? { ...row, containers: parsed.data.containers } : null;
      } catch {
        return null;
      }
    },
    isCurrent(id: string, version: number) {
      const row = sqlite
        .prepare(
          'SELECT inventory_version AS version,received_at AS receivedAt,revoked FROM docker_push_sources WHERE id=?',
        )
        .get(id) as { version: number; receivedAt: number | null; revoked: number } | undefined;
      return Boolean(
        row &&
        !row.revoked &&
        row.version === version &&
        row.receivedAt &&
        Date.now() - row.receivedAt <= PUSH_FRESHNESS_MS,
      );
    },
    rotate(id: string, actor?: Actor) {
      return transaction(sqlite, () => {
        const token = randomBytes(32).toString('hex');
        const result = sqlite
          .prepare(
            'UPDATE docker_push_sources SET token_hash=?,inventory=NULL,received_at=NULL,inventory_version=inventory_version+1 WHERE id=? AND revoked=0',
          )
          .run(digest(token), id);
        if (result.changes !== 1) return null;
        record(sqlite, actor, 'docker-source-rotate', id);
        return token;
      });
    },
    remove(id: string, actor?: Actor) {
      return transaction(sqlite, () => {
        const changed =
          sqlite.prepare('DELETE FROM docker_push_sources WHERE id=?').run(id).changes === 1;
        if (changed) record(sqlite, actor, 'docker-source-remove', id);
        return changed;
      });
    },
    ingest(token: string, input: unknown) {
      if (!/^[a-f0-9]{64}$/.test(token)) return 'unauthorized' as const;
      const found = sqlite
        .prepare('SELECT id FROM docker_push_sources WHERE token_hash=? AND revoked=0')
        .get(digest(token));
      if (!found) return 'unauthorized' as const;
      const parsed = pushInventorySchema.safeParse(input);
      if (
        !parsed.success ||
        new Set(parsed.data.containers.map((c) => c.Id.slice(0, 12))).size !==
          parsed.data.containers.length
      )
        return 'invalid' as const;
      const inventory = JSON.stringify({
        containers: [...parsed.data.containers].sort((a, b) =>
          a.Id < b.Id ? -1 : a.Id > b.Id ? 1 : 0,
        ),
      });
      const result = sqlite
        .prepare(
          'UPDATE docker_push_sources SET inventory_version=inventory_version+CASE WHEN inventory IS ? THEN 0 ELSE 1 END,inventory=?,received_at=? WHERE token_hash=? AND revoked=0',
        )
        .run(inventory, inventory, Date.now(), digest(token));
      return result.changes === 1 ? ('ok' as const) : ('unauthorized' as const);
    },
  };
}
