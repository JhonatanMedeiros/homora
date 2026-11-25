import { createCodeRegistrations } from '@homora/integrations/backend/catalog';
import { createIntegrationRegistry } from './index.js';
import {
  createManifestRegistration,
  assertValidDefinition,
} from '@homora/integrations/backend/manifest';
import { BRAND_ICON_NAMES } from '@homora/icons';
import { ERROR_MESSAGES, InputError, type ErrorCode } from '../api-error.js';
import { integrationDefinitions } from '@homora/integrations';

const manifestHost = {
  isBrandIcon: (name: string) => (BRAND_ICON_NAMES as readonly string[]).includes(name),
  isErrorCode: (code: string) => Object.hasOwn(ERROR_MESSAGES, code),
  inputError: (code: string) => new InputError(code as ErrorCode),
};

const codeRegistrations = createCodeRegistrations((code) => new InputError(code));

/** One definition per integration; manifests are interpreted, code adapters are registered by hand. */
export const integrationRegistry = createIntegrationRegistry(
  integrationDefinitions.map((definition) => {
    assertValidDefinition(definition, manifestHost);
    const registration = codeRegistrations.get(definition.type);
    if (registration) {
      if (registration.definition !== definition)
        throw new Error(`Missing or mismatched integration registration: ${definition.type}`);
      return registration;
    }
    if (definition.kind === 'manifest') return createManifestRegistration(definition, manifestHost);
    throw new Error(`Missing integration registration: ${definition.type}`);
  }),
);
