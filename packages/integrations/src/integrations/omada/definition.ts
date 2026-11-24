import type { CodeDefinition } from '../../integration-manifest.js';
import { urlField } from '../fields.js';

const identifier = '[A-Za-z0-9]{8,64}';

export const omadaDefinition: CodeDefinition = {
  kind: 'code',
  type: 'omada',
  label: 'TP-Link Omada',
  mark: 'OM',
  capabilities: ['network-summary'],
  fields: [
    urlField({
      httpsOnly: true,
      help: 'The HTTPS address of the Omada Controller web interface. Its DNS name must resolve from the Homora backend and match the certificate.',
      errorCode: 'https-url-required',
    }),
    {
      key: 'omadacId',
      kind: 'text',
      label: 'Omada ID',
      labelKey: 'omada.omadacId',
      help: 'The Controller ID shown in the Open API settings.',
      required: true,
      maxLength: 64,
      pattern: identifier,
      identity: true,
      errorCode: 'invalid-config',
    },
    {
      key: 'siteId',
      kind: 'text',
      label: 'Site ID',
      labelKey: 'omada.siteId',
      help: 'The ID of the one site to show. The Client credential should have a Viewer role limited to it.',
      required: true,
      maxLength: 64,
      pattern: identifier,
      errorCode: 'invalid-config',
    },
    {
      key: 'tokenId',
      kind: 'token-id',
      label: 'Client ID',
      labelKey: 'omada.clientId',
      required: true,
      maxLength: 256,
      identity: true,
      errorCode: 'invalid-token',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'Client secret',
      labelKey: 'omada.clientSecret',
      required: true,
      maxLength: 256,
      errorCode: 'invalid-token',
    },
  ],
  display: 'custom',
};
