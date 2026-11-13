import { createVault as createIntegrationVault } from '@homora/integrations/backend/vault';
import { InputError } from './api-error.js';
/** Host-owned input errors; storage and compatibility codecs are supplied by the SDK. */
export const createVault = (base: string) =>
  createIntegrationVault(base, (code) => new InputError(code));
