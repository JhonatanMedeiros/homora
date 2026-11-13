import type { CodeDefinition } from '../integration-manifest-shared.js';
import { urlField } from '../integration-manifest-shared.js';

export const proxmoxDefinition: CodeDefinition = {
  kind: 'code',
  type: 'proxmox',
  label: 'Proxmox VE',
  mark: 'PVE',
  brandIcon: 'proxmox',
  capabilities: ['inventory'],
  fields: [
    urlField({ httpsOnly: true, errorCode: 'https-url-required' }),
    {
      key: 'tokenId',
      kind: 'token-id',
      label: 'API token ID',
      labelKey: 'proxmox.tokenId',
      placeholderKey: 'proxmox.tokenIdPlaceholder',
      required: true,
      maxLength: 255,
      identity: true,
      errorCode: 'invalid-token',
    },
    {
      key: 'node',
      kind: 'text',
      label: 'Node',
      labelKey: 'proxmox.node',
      help: 'Show only this node in widgets and the top bar. Leave empty for the whole cluster.',
      required: false,
      maxLength: 63,
      pattern: '[A-Za-z0-9][A-Za-z0-9-]{0,62}',
      picker: 'proxmox-node',
      errorCode: 'invalid-config',
    },
    {
      key: 'secret',
      kind: 'secret',
      label: 'API token secret',
      labelKey: 'proxmox.secret',
      required: true,
      maxLength: 512,
      errorCode: 'invalid-token',
    },
  ],
  display: 'custom',
};
