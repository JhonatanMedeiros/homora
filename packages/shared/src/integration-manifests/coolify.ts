import type { CodeDefinition } from '../integration-manifest-shared.js';
import { urlField, printable } from '../integration-manifest-shared.js';

/**
 * Coolify stays code: it reads several endpoints, normalizes a composite status
 * (`running:healthy`) and has a link/review workflow beyond the manifest vocabulary.
 * Only the `read` token permission is needed; `read:sensitive`, `write`, `deploy` are never used.
 */
export const coolifyDefinition: CodeDefinition = {
  kind: 'code',
  type: 'coolify',
  label: 'Coolify',
  mark: 'CL',
  brandIcon: 'coolify',
  capabilities: ['inventory', 'resource-links'],
  fields: [
    urlField({
      httpsOnly: true,
      allowPath: true,
      help: 'The address of your Coolify instance, or https://app.coolify.io for Coolify Cloud.',
      errorCode: 'https-url-required',
    }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'API token',
      labelKey: 'connections.apiToken',
      required: true,
      maxLength: 512,
      pattern: printable,
      help: 'Create it in Keys & Tokens, API Tokens, with only the read permission. Limit it to the resources you want to show.',
      errorCode: 'invalid-token',
    },
  ],
  display: 'custom',
};
