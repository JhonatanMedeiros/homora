import { integrationDefinitions } from '@homora/shared';
import { createCodeRegistrations } from '@homora/integrations/backend/catalog';
import { createIntegrationRegistry } from './integrations.js';
import { createManifestRegistration } from './manifest-adapter.js';
import { assertValidDefinition } from './integration-manifest.js';
import { InputError } from './api-error.js';

const codeRegistrations = createCodeRegistrations((code) => new InputError(code));

/** One definition per integration; manifests are interpreted, code adapters are registered by hand. */
export const integrationRegistry = createIntegrationRegistry(
  integrationDefinitions.map((definition) => {
    assertValidDefinition(definition);
    if (definition.kind === 'manifest') return createManifestRegistration(definition);
    const registration = codeRegistrations.get(definition.type);
    if (!registration || registration.definition !== definition)
      throw new Error(`Missing or mismatched integration registration: ${definition.type}`);
    return registration;
  }),
);
