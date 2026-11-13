import type { CodeDefinition } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

export const piHoleDefinition: CodeDefinition = {
  kind: 'code',
  type: 'pi-hole',
  label: 'Pi-hole',
  mark: 'PH',
  brandIcon: 'pi-hole',
  capabilities: ['dns-status'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'secret',
      kind: 'secret',
      label: 'Application password',
      labelKey: 'pihole.password',
      required: true,
      maxLength: 256,
      errorCode: 'invalid-token',
    },
  ],
  display: 'custom',
};
