import { getSqliteHandle, type createDatabase } from '@homora/db';
import { createLegacyCatalog } from '@homora/integrations/backend/legacy';
import { InputError } from './api-error.js';
import type { createVault } from './vault.js';
import type { DatabaseSync } from 'node:sqlite';
import type { LegacyWidgetSource } from '@homora/integrations';

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;
const catalog = createLegacyCatalog((code) => new InputError(code));

export const migrateLegacyConnections = (db: Db, vault?: Vault) =>
  catalog.migrateAll(getSqliteHandle(db), vault);
export const migrateLegacyConnectionsAtStartup = (
  db: Db,
  vault: Vault,
  log?: (message: string) => void,
) => catalog.startup(getSqliteHandle(db), vault, log);
export const resolveLegacyConnection = (db: DatabaseSync, source: LegacyWidgetSource) =>
  catalog.resolve(db, source);
export const markLegacyConnectionDeleted = (db: DatabaseSync, id: number) =>
  catalog.markDeleted(db, id);
export const isHiddenLegacyConnection = (row: { type: string; publicConfig: string }) =>
  catalog.isHidden(row);
