import type { DatabaseSync } from 'node:sqlite';
import type { InputErrorFactory } from './backend.js';
import type { createVault } from './backend-vault.js';
import type { LegacyWidgetSource } from './legacy-contracts.js';
import {
  isLegacyProxmoxBridge,
  legacyProxmoxConnectionId,
  markLegacyProxmoxDeleted,
  migrateLegacyProxmox,
  migrateLegacyProxmoxAtStartup,
} from './integrations/proxmox/legacy.js';

type Vault = ReturnType<typeof createVault>;

/** Compatibility adapters are explicit and isolated from normal integration registration. */
export function createLegacyCatalog(inputError: InputErrorFactory) {
  const migrations = {
    proxmox: {
      migrate: (db: DatabaseSync, vault?: Vault) => migrateLegacyProxmox(db, inputError, vault),
      startup: (db: DatabaseSync, vault: Vault, log?: (message: string) => void) =>
        migrateLegacyProxmoxAtStartup(db, inputError, vault, log),
      resolve: legacyProxmoxConnectionId,
      markDeleted: markLegacyProxmoxDeleted,
      isHidden: isLegacyProxmoxBridge,
    },
  } satisfies Record<
    LegacyWidgetSource,
    {
      migrate: (db: DatabaseSync, vault?: Vault) => number | null;
      startup: (db: DatabaseSync, vault: Vault, log?: (message: string) => void) => void;
      resolve: (db: DatabaseSync) => number | null;
      markDeleted: (db: DatabaseSync, id: number) => void;
      isHidden: (row: { type: string; publicConfig: string }) => boolean;
    }
  >;
  return {
    migrateAll(db: DatabaseSync, vault?: Vault) {
      return new Map<LegacyWidgetSource, number | null>(
        Object.entries(migrations).map(([source, migration]) => [
          source as LegacyWidgetSource,
          migration.migrate(db, vault),
        ]),
      );
    },
    startup(db: DatabaseSync, vault: Vault, log?: (message: string) => void) {
      for (const migration of Object.values(migrations)) migration.startup(db, vault, log);
    },
    resolve(db: DatabaseSync, source: LegacyWidgetSource) {
      return migrations[source].resolve(db);
    },
    markDeleted(db: DatabaseSync, id: number) {
      for (const migration of Object.values(migrations)) migration.markDeleted(db, id);
    },
    isHidden(row: { type: string; publicConfig: string }) {
      return Object.values(migrations).some((migration) => migration.isHidden(row));
    },
  };
}
