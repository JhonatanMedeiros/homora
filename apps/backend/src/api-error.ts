/**
 * API errors: each error response has a stable `code` (translated by the frontend) and an
 * `error` with the default message in English, useful for clients that do not translate.
 * Internal details, paths and third-party texts never enter the response.
 */
export const ERROR_MESSAGES = {
  'auth-required': 'Authentication required.',
  'origin-not-allowed': 'Origin not allowed.',
  'not-found': 'Not found.',
  'invalid-data': 'Invalid data.',
  'invalid-query': 'Invalid query.',
  'invalid-decision': 'Invalid decision.',
  'invalid-card-order': 'Invalid card order.',
  'invalid-group-order': 'Invalid group order.',
  'invalid-columns': 'Choose between 1 and 6 columns, or automatic.',
  'invalid-group-name': 'Provide a group name with up to 40 characters.',
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
  'session-not-found': 'Session not found.',
  'identity-invalid': 'Invalid identity or scopes.',
  'identity-not-found': 'Identity not found.',
  'proposal-unavailable': 'Proposal unavailable.',
  'batch-conflict': 'The changes in this batch conflict. No changes were applied.',
  'config-changed': 'The configuration changed. Review it again.',
  'proxmox-not-configured': 'Proxmox is not configured.',
  'proxmox-config-failed': 'Could not load the existing configuration.',
  'proxmox-save-failed': 'Could not save the configuration.',
  'proxmox-test-failed': 'Could not test the connection.',
  'proxmox-load-failed':
    'Could not load the Proxmox configuration. Check the integration files and the key.',
  'proxmox-failed': 'Proxmox request failed.',
  'proxmox-tls':
    'The Proxmox TLS certificate is not trusted or does not match the address. Configure a trusted CA for the backend.',
  'proxmox-dns': 'Could not resolve the Proxmox address. Check DNS and the configured URL.',
  'proxmox-refused':
    'Connection refused by Proxmox. Check the address, the port and that the service is running.',
  'proxmox-unreachable':
    'Could not reach Proxmox. Check the network, the firewall and the configured address.',
  'proxmox-connection-failed':
    'Connection to Proxmox failed. Check the network and the configured address.',
  'proxmox-unauthorized':
    'Proxmox rejected the authentication (HTTP 401). Check the token ID and secret.',
  'proxmox-forbidden': 'Proxmox denied access (HTTP 403). Check the user and token permissions.',
  'proxmox-http-error':
    'Proxmox returned an unexpected HTTP status. Check the service and the configured address.',
  'proxmox-invalid-response':
    'Invalid response from Proxmox. Check that the URL points to a Proxmox server.',
  'proxmox-incomplete-response': 'Incomplete response from Proxmox.',
  'proxmox-response-too-large': 'The Proxmox response exceeded the allowed size.',
  'proxmox-timeout': 'Timed out connecting to Proxmox. Check the network and firewall.',
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
