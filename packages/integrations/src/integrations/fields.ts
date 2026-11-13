import type { ManifestField } from '../integration-manifest.js';

/** Shared defaults for the address field of a built-in integration. */
export const urlField = (over: Partial<ManifestField> = {}): ManifestField => ({
  key: 'url',
  kind: 'url',
  label: 'Service URL',
  labelKey: 'connections.url',
  placeholderKey: 'connections.urlPlaceholder',
  required: true,
  maxLength: 2048,
  ...over,
});
