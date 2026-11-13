import { integrationDefinitions } from '@homora/shared';
import { createIntegrationRegistry, type IntegrationRegistration } from './integrations.js';
import { createManifestRegistration } from './manifest-adapter.js';
import { assertValidDefinition } from './integration-manifest.js';
import { proxmoxRegistration } from './proxmox-registration.js';
import { coolifyRegistration } from './coolify-registration.js';

const codeRegistrations: Record<string, IntegrationRegistration> = {
  proxmox: proxmoxRegistration,
  coolify: coolifyRegistration,
};

/** One definition per integration; manifests are interpreted, code adapters are registered by hand. */
export const integrationRegistry = createIntegrationRegistry(
  integrationDefinitions.map((definition) => {
    assertValidDefinition(definition);
    if (definition.kind === 'manifest') return createManifestRegistration(definition);
    const registration = Object.hasOwn(codeRegistrations, definition.type)
      ? codeRegistrations[definition.type]
      : undefined;
    if (!registration || registration.definition !== definition)
      throw new Error(`Missing or mismatched integration registration: ${definition.type}`);
    return registration;
  }),
);
