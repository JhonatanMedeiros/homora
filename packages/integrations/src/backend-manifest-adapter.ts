import type { ManifestValidationHost } from './backend-manifest-validation.js';
export type ManifestHost = ManifestValidationHost & { inputError(code: string): Error };
import type { IntegrationManifest, ManifestField } from './integration-manifest.js';
import { defineBackendIntegration } from './backend.js';
import type {
  IntegrationAdapter,
  IntegrationRegistration,
  IntegrationTransport,
} from './backend.js';
import { assertValidDefinition } from './backend-manifest-validation.js';
import {
  extractManifestStep,
  requiredValuesMatch,
  type ManifestConfig,
  type ManifestData,
} from './backend-manifest-response.js';

/** Flat configuration: `url`, public text fields, and the credentials (`secret`, `tokenId`). */
export type { ManifestConfig, ManifestData } from './backend-manifest-response.js';

const hasControl = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
const invalidResponse = (label: string) => new Error(`Invalid response from ${label}.`);

function validateUrl(field: ManifestField, input: unknown, inputError: ManifestHost['inputError']) {
  const code = field.errorCode ?? (field.httpsOnly ? 'https-url-required' : 'invalid-url');
  if (typeof input !== 'string' || input.length > field.maxLength) throw inputError(code);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw inputError(code);
  }
  if (
    !(field.httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!field.allowPath && url.pathname !== '/')
  )
    throw inputError(code);
  return field.allowPath ? url.toString().replace(/\/+$/, '') : url.origin;
}

function validateField(
  field: ManifestField,
  input: unknown,
  inputError: ManifestHost['inputError'],
): string {
  if (field.kind === 'url') return validateUrl(field, input, inputError);
  const code = field.errorCode ?? 'invalid-config';
  if (input === undefined || input === null || input === '') {
    if (field.required) throw inputError(code);
    return '';
  }
  if (
    typeof input !== 'string' ||
    input.length > field.maxLength ||
    hasControl(input) ||
    (field.pattern !== undefined && !new RegExp(`^(?:${field.pattern})$`).test(input))
  )
    throw inputError(code);
  return input;
}

function validateConfig(
  manifest: IntegrationManifest,
  input: unknown,
  inputError: ManifestHost['inputError'],
): ManifestConfig {
  if (!input || typeof input !== 'object') throw inputError('invalid-config');
  const config: ManifestConfig = {};
  for (const field of manifest.fields) {
    const value = validateField(field, (input as Record<string, unknown>)[field.key], inputError);
    if (value !== '') config[field.key] = value;
  }
  return config;
}

function authorization(manifest: IntegrationManifest, config: ManifestConfig) {
  const secret = config.secret ?? '';
  switch (manifest.auth.type) {
    case 'bearer':
      return { authorization: `Bearer ${secret}` };
    case 'token':
      return { authorization: `Token ${secret}` };
    case 'api-key':
      return { apiKey: secret };
    case 'basic-key':
      return { authorization: `Basic ${Buffer.from(`${secret}:`, 'utf8').toString('base64')}` };
    case 'basic':
      return {
        authorization: `Basic ${Buffer.from(`${config[manifest.auth.usernameField] ?? ''}:${secret}`, 'utf8').toString('base64')}`,
      };
    default:
      return {};
  }
}

function buildPath(template: string, config: ManifestConfig) {
  return template.replace(/\{([A-Za-z0-9]+)\}/g, (_match, key: string) =>
    encodeURIComponent(config[key] ?? ''),
  );
}

/**
 * Turns a manifest into an adapter. The only way it reaches the network is the injected transport
 * (destination policy, TLS, limits, header whitelist): GET only, path built from validated config.
 */
export function createManifestAdapter(
  manifest: IntegrationManifest,
  transport: IntegrationTransport,
  inputError: ManifestHost['inputError'],
): IntegrationAdapter<ManifestConfig, ManifestData> {
  const label = manifest.label;
  const validate = (config: ManifestConfig) => validateConfig(manifest, config, inputError);
  return {
    type: manifest.type,
    label,
    capabilities: manifest.capabilities,
    validate,
    async collect(input) {
      const config = validate(input);
      const url = new URL(config.url!);
      const basePath = url.pathname.replace(/\/+$/, '');
      const secrets = [config.secret, config.tokenId].filter((value): value is string => !!value);
      const bodies = new Map<string, unknown>();
      for (const request of manifest.requests) {
        const query = Object.entries(request.query ?? {})
          .map(([key, value]) => `${key}=${buildPath(value, config)}`)
          .join('&');
        let response: { status: number; body: unknown };
        try {
          response = await transport({
            origin: url.origin,
            path: `${basePath}${buildPath(request.path, config)}${query ? `?${query}` : ''}`,
            ...authorization(manifest, config),
            ...(request.maxBodyBytes ? { maxBodyBytes: request.maxBodyBytes } : {}),
          });
        } catch {
          throw new Error(`Could not connect to ${label}.`);
        }
        if ([401, 403].includes(response.status) && manifest.auth.type !== 'none')
          throw new Error(`${label} refused authentication or access.`);
        if (response.status === 404 && manifest.messages?.notFound)
          throw new Error(manifest.messages.notFound);
        if (response.status !== (request.expectStatus ?? 200)) throw invalidResponse(label);
        if (!response.body || typeof response.body !== 'object') throw invalidResponse(label);
        bodies.set(request.id, response.body);
      }
      const body = (request?: string) => bodies.get(request ?? manifest.requests[0]!.id);
      const fail = (): never => {
        throw invalidResponse(label);
      };
      if (!requiredValuesMatch(manifest, body, config)) fail();
      const out: ManifestData = {};
      for (const step of manifest.extract) extractManifestStep(step, body, config, fail, out);
      // A credential reflected by the remote service must never reach a response.
      const containsSecret = (value: unknown): boolean =>
        typeof value === 'string'
          ? secrets.some((secret) => value.includes(secret))
          : Array.isArray(value)
            ? value.some(containsSecret)
            : value !== null && typeof value === 'object'
              ? Object.values(value).some(containsSecret)
              : false;
      if (containsSecret(out)) fail();
      return out;
    },
  };
}

/** Registry entry for a manifest. The definition is validated here, at registry creation. */
export function createManifestRegistration(
  manifest: IntegrationManifest,
  host: ManifestHost,
): IntegrationRegistration {
  assertValidDefinition(manifest, host);
  return defineBackendIntegration(manifest, {
    prepare(context) {
      if (!context.transport) throw new Error('Integration transport unavailable.');
      const adapter = createManifestAdapter(manifest, context.transport, host.inputError);
      const values: ManifestConfig = {};
      for (const field of manifest.fields) {
        const raw =
          field.key === 'secret'
            ? context.credentials.secret
            : field.key === 'tokenId'
              ? context.credentials.tokenId
              : context.publicConfig[field.key];
        if (typeof raw === 'string') values[field.key] = raw;
      }
      const config = adapter.validate(values);
      return () => adapter.collect(config);
    },
  });
}
