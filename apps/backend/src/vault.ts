import type { DatabaseSync } from 'node:sqlite';
import { createVault as createIntegrationVault } from '@homora/integrations/backend/vault';
import { InputError } from './api-error.js';
/** Host-owned input errors; storage and compatibility codecs are supplied by the SDK. */
export const createVault = (base: string) =>
  createIntegrationVault(base, (code) => new InputError(code));

/**
 * Whether anything in the database is encrypted with the key. While something is, a missing key
 * must never be replaced: the old one could still be restored.
 */
export function hasSealedValues(sqlite: DatabaseSync) {
  return Boolean(
    sqlite
      .prepare(
        `SELECT 1 FROM integration_instances WHERE secret_ref IS NOT NULL
         UNION ALL SELECT 1 FROM notification_channels
         UNION ALL SELECT 1 FROM weather_providers WHERE secret_ref IS NOT NULL
         UNION ALL SELECT 1 FROM oidc_settings WHERE provider IS NOT NULL OR draft IS NOT NULL
         LIMIT 1`,
      )
      .get(),
  );
}
