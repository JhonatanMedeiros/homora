/**
 * API errors: each error response has a stable `code` (translated by the frontend) and an
 * `error` with the default message in English, useful for clients that do not translate.
 * Internal details, paths and third-party texts never enter the response.
 */
export const ERROR_MESSAGES = {
  'auth-required': 'Authentication required.',
  'origin-not-allowed': 'Origin not allowed.',
  'not-found': 'Not found.',
  'internal-error': 'An unexpected server error occurred.',
  'invalid-data': 'Invalid data.',
  'invalid-query': 'Invalid query.',
  'image-too-large': 'The image is larger than 2 MB.',
  'image-unsupported': 'Use a JPG, PNG or WebP image.',
  'image-animated': 'Animated images are not supported.',
  'image-invalid': 'The image could not be read.',
  'image-storage-unavailable': 'Background images are not available on this server.',
  'custom-css-invalid': 'The CSS was not saved because it uses something that is not allowed.',
  'appearance-contrast': 'This appearance would make text or controls hard to read.',
  'invalid-decision': 'Invalid decision.',
  'invalid-card-order': 'Invalid card order.',
  'invalid-group-order': 'Invalid group order.',
  'invalid-columns': 'Choose between 1 and 6 columns, or automatic.',
  'invalid-group-name': 'Provide a group name with up to 40 characters.',
  'inventory-too-large': 'The inventory exceeds the 1 MiB limit.',
  'source-limit': 'Remove a source before adding another (maximum 10).',
  'discovery-stale': 'The inventory is unavailable or changed. Review it again.',
  'discovery-disabled': 'Docker discovery is not enabled.',
  'docker-unavailable':
    'Could not read the Docker containers. Check HOMORA_DOCKER_HOST and the proxy.',
  'docker-invalid-response': 'Docker returned an unexpected response.',
  'invalid-widget': 'Provide a valid integration and name.',
  'invalid-url': 'Provide a valid URL.',
  'https-url-required': 'Provide a valid HTTPS URL.',
  'invalid-token': 'Provide a valid token.',
  'invalid-credentials': 'Provide a valid username and password.',
  'invalid-entity': 'Provide a valid entity identifier.',
  'invalid-status-page': 'Provide a valid status page identifier.',
  'invalid-name-or-type': 'Provide a valid name and type.',
  'invalid-name-or-category': 'Provide a valid name and category.',
  'invalid-host': 'Choose an existing Proxmox connection for the host.',
  'dependency-self': 'A service cannot depend on itself.',
  'dependency-cycle': 'This would create a circular dependency.',
  'dependency-limit': 'A service can have at most 50 dependencies.',
  'invalid-ca': 'Invalid CA certificate.',
  'secret-required': 'Enter the secret again when changing the address or its identity.',
  'service-not-found': 'Service not found.',
  'group-not-found': 'Group not found.',
  'group-exists': 'A group with this name already exists.',
  'group-not-empty': 'Move or remove this group’s cards before deleting it.',
  'integration-not-found': 'Integration not found.',
  'integration-unavailable': 'Integration unavailable.',
  'integration-type-unavailable': 'Integration type unavailable.',
  'integration-has-widgets': 'Remove the linked widgets before deleting the integration.',
  'integration-save-failed': 'Could not save the integration.',
  'integration-test-failed':
    'Could not test the integration. Check the connection, permissions and certificate.',
  'integration-query-failed':
    'Could not query the integration. Check the connection, permissions and certificate.',
  'integration-changed': 'The integration changed while it was being queried. Try again.',
  'widget-not-found': 'Widget not found.',
  'account-exists': 'Account already configured.',
  'account-setup-failed':
    'Could not create the account. Check the name and email, and use a password with at least 8 characters.',
  'invalid-current-password': 'The current password is incorrect.',
  'invalid-new-password': 'Use a new password with at least 8 characters.',
  'invalid-profile': 'Provide a name with up to 80 characters.',
  'too-many-attempts': 'Too many attempts. Try again later.',
  'too-many-requests': 'Too many requests. Try again later.',
  'session-not-found': 'Session not found.',
  'identity-invalid': 'Invalid identity or scopes.',
  'identity-not-found': 'Identity not found.',
  'proposal-limit': 'The agent has reached its pending proposal limit.',
  'proposal-unavailable': 'Proposal unavailable.',
  'batch-conflict': 'The changes in this batch conflict. No changes were applied.',
  'config-changed': 'The configuration changed. Review it again.',
  'proxmox-not-configured': 'Proxmox is not configured.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

/** Standard body for an error response. */
export const errorBody = (code: ErrorCode) => ({ code, error: ERROR_MESSAGES[code] });

/**
 * User input error that can be displayed to the client. Any other error thrown
 * by an adapter is treated as internal and becomes a generic response.
 */
export class InputError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
    this.name = 'InputError';
  }
}
