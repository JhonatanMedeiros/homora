import type { DatabaseSync } from 'node:sqlite';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { validateProxmoxConfig, type createVault } from './vault.js';

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;

/**
 * Moves the encrypted legacy Proxmox file into the integration tables exactly once.
 * The legacy file remains untouched as a backup; the marker also prevents re-import after deletion.
 */
export function migrateLegacyProxmox(db: Db, vault?: Vault): number | null {
  if (!vault) return null;
  const sqlite = getSqliteHandle(db);
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const marker = sqlite
      .prepare("SELECT name FROM integration_migrations WHERE name LIKE 'legacy-proxmox:%'")
      .get() as { name: string } | undefined;
    if (marker) {
      sqlite.exec('COMMIT');
      const id = Number(marker.name.slice('legacy-proxmox:'.length));
      return Number.isSafeInteger(id) && id > 0 ? id : null;
    }
    const legacy = vault.load();
    if (!legacy) {
      sqlite.exec('COMMIT');
      return null;
    }
    const config = validateProxmoxConfig(legacy);
    const bridge = sqlite
      .prepare(
        "SELECT id FROM integration_instances WHERE type = 'proxmox' AND public_config = '{}' AND secret_ref IS NULL ORDER BY id LIMIT 1",
      )
      .get() as { id: number } | undefined;
    const data = JSON.stringify({ url: config.url, allowPrivate: true });
    const secret = vault.seal(
      JSON.stringify({
        secret: config.secret,
        tokenId: config.tokenId,
        ...(config.ca ? { ca: config.ca } : {}),
      }),
      false,
    );
    let id: number;
    if (bridge) {
      id = bridge.id;
      sqlite
        .prepare(
          'UPDATE integration_instances SET public_config = ?, secret_ref = ?, certificate_ref = ? WHERE id = ?',
        )
        .run(data, secret, config.ca ? 'both' : 'secret', id);
    } else {
      const result = sqlite
        .prepare(
          "INSERT INTO integration_instances(type, name, public_config, secret_ref, certificate_ref) VALUES ('proxmox', 'Proxmox VE', ?, ?, ?)",
        )
        .run(data, secret, config.ca ? 'both' : 'secret');
      id = Number(result.lastInsertRowid);
    }
    sqlite
      .prepare('INSERT INTO integration_migrations(name) VALUES (?)')
      .run(`legacy-proxmox:${id}`);
    sqlite.exec('COMMIT');
    return id;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Runs the idempotent legacy Proxmox migration once, before the server accepts requests.
 * It never throws: a missing key or unreadable file leaves the legacy file untouched and is
 * retried on the next start. Only a fixed message is logged, never the file or error contents.
 */
export function migrateLegacyProxmoxAtStartup(
  db: Db,
  vault: Vault,
  log: (message: string) => void = console.warn,
) {
  try {
    migrateLegacyProxmox(db, vault);
  } catch {
    log(
      'Could not migrate the legacy Proxmox configuration (missing key or unreadable file). The legacy file was left untouched; it will be retried on the next start.',
    );
  }
}

/** Resolves only a registered migrated Proxmox connection; tombstones and stale markers return null. */
export function legacyProxmoxConnectionId(sqlite: DatabaseSync): number | null {
  const marker = sqlite
    .prepare("SELECT name FROM integration_migrations WHERE name LIKE 'legacy-proxmox:%'")
    .get() as { name: string } | undefined;
  const id = Number(marker?.name.slice('legacy-proxmox:'.length));
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return sqlite
    .prepare("SELECT id FROM integration_instances WHERE id=? AND type='proxmox'")
    .get(id)
    ? id
    : null;
}
