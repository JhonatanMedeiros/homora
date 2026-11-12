import type {
  Extraction,
  IntegrationManifest,
  JsonPath,
  Literal,
  ManifestField,
} from '@homora/shared';
import { InputError, type ErrorCode } from './api-error.js';
import type {
  IntegrationAdapter,
  IntegrationRegistration,
  IntegrationTransport,
} from './integrations.js';
import { assertValidDefinition } from './integration-manifest.js';

/** Flat configuration: `url`, public text fields, and the credentials (`secret`, `tokenId`). */
export type ManifestConfig = Record<string, string>;
export type ManifestData = Record<string, string | number | boolean | null>;

const hasControl = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
const invalidResponse = (label: string) => new Error(`Invalid response from ${label}.`);

function validateUrl(field: ManifestField, input: unknown) {
  const code = (field.errorCode ??
    (field.httpsOnly ? 'https-url-required' : 'invalid-url')) as ErrorCode;
  if (typeof input !== 'string' || input.length > field.maxLength) throw new InputError(code);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InputError(code);
  }
  if (
    !(field.httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!field.allowPath && url.pathname !== '/')
  )
    throw new InputError(code);
  return field.allowPath ? url.toString().replace(/\/+$/, '') : url.origin;
}

function validateField(field: ManifestField, input: unknown): string {
  if (field.kind === 'url') return validateUrl(field, input);
  const code = (field.errorCode ?? 'invalid-config') as ErrorCode;
  if (input === undefined || input === null || input === '') {
    if (field.required) throw new InputError(code);
    return '';
  }
  if (
    typeof input !== 'string' ||
    input.length > field.maxLength ||
    hasControl(input) ||
    (field.pattern !== undefined && !new RegExp(`^(?:${field.pattern})$`).test(input))
  )
    throw new InputError(code);
  return input;
}

function validateConfig(manifest: IntegrationManifest, input: unknown): ManifestConfig {
  if (!input || typeof input !== 'object') throw new InputError('invalid-config');
  const config: ManifestConfig = {};
  for (const field of manifest.fields) {
    const value = validateField(field, (input as Record<string, unknown>)[field.key]);
    if (value !== '') config[field.key] = value;
  }
  return config;
}

function walk(value: unknown, path: JsonPath): unknown {
  let current = value;
  for (const step of path) {
    if (typeof step === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[step];
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      if (!Object.hasOwn(current, step)) return undefined;
      current = (current as Record<string, unknown>)[step];
    }
  }
  return current;
}
const collection = (value: unknown): unknown[] | null =>
  Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : null;
const MAX_ENTRIES = 10_000;

function typed(
  value: unknown,
  type: 'string' | 'boolean' | 'integer' | 'number',
  bounds: { maxLength?: number; min?: number; max?: number },
): string | number | boolean | undefined {
  if (type === 'string')
    return typeof value === 'string' && value.length > 0 && value.length <= (bounds.maxLength ?? 0)
      ? value
      : undefined;
  if (type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (type === 'integer' && !Number.isSafeInteger(value)) return undefined;
  if (bounds.min !== undefined && value < bounds.min) return undefined;
  if (bounds.max !== undefined && value > bounds.max) return undefined;
  return value;
}
const sameLiteral = (a: unknown, b: Literal) => a === b;
function stateOf(
  value: unknown,
  states: Readonly<Record<string, readonly Literal[]>>,
  other: string,
) {
  for (const [name, literals] of Object.entries(states))
    if (literals.some((literal) => sameLiteral(value, literal))) return name;
  return other;
}

/** Runs one extraction step against the parsed responses. Any failure is an invalid response. */
function extractStep(
  step: Extraction,
  body: (request?: string) => unknown,
  config: ManifestConfig,
  fail: () => never,
  out: ManifestData,
) {
  if (step.op === 'config') {
    out[step.out] = config[step.key] ?? null;
    return;
  }
  const source = walk(body(step.request), step.path);
  switch (step.op) {
    case 'pick': {
      if ((source === undefined || source === null) && step.optional) {
        out[step.out] = null;
        return;
      }
      const value = typed(source, step.type, step);
      if (value === undefined) fail();
      out[step.out] = value as string | number | boolean;
      return;
    }
    case 'count': {
      const items = collection(source);
      if (!items || items.length > MAX_ENTRIES) return fail();
      const total = step.where
        ? items.filter((item) => sameLiteral(walk(item, step.where!.path), step.where!.equals))
            .length
        : items.length;
      if (total > (step.max ?? 100000)) fail();
      out[step.out] = total;
      return;
    }
    case 'sum': {
      const items = collection(source);
      if (!items || items.length > MAX_ENTRIES) return fail();
      let total = 0;
      for (const item of items) {
        const value = walk(item, step.field);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fail();
        total += value;
      }
      if (total > step.max) fail();
      out[step.out] = total;
      return;
    }
    case 'last': {
      if (!Array.isArray(source) || source.length === 0 || source.length > MAX_ENTRIES)
        return fail();
      const value = typed(walk(source.at(-1), step.field), step.type, {
        maxLength: step.maxLength,
        min: -1e15,
        max: 1e15,
      });
      if (value === undefined) fail();
      out[step.out] = value as string | number | boolean;
      return;
    }
    case 'state':
      out[step.out] = stateOf(source, step.states, step.other);
      return;
    case 'tally': {
      const groups =
        source && typeof source === 'object' && !Array.isArray(source)
          ? Object.values(source)
          : null;
      if (!groups || groups.length > MAX_ENTRIES) return fail();
      for (const name of [...Object.keys(step.states), step.other]) out[name] = 0;
      for (const group of groups) {
        if (!Array.isArray(group)) return fail();
        const latest: unknown = group.at(-1);
        const name = stateOf(
          latest === undefined ? undefined : walk(latest, step.field),
          step.states,
          step.other,
        );
        out[name] = (out[name] as number) + 1;
      }
      return;
    }
  }
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
): IntegrationAdapter<ManifestConfig, ManifestData> {
  const label = manifest.label;
  const validate = (config: ManifestConfig) => validateConfig(manifest, config);
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
      for (const rule of manifest.require ?? []) {
        const actual = walk(body(rule.request), rule.path);
        const expected = rule.equalsConfig !== undefined ? config[rule.equalsConfig] : rule.equals;
        if (expected === undefined || actual !== expected) fail();
      }
      const out: ManifestData = {};
      for (const step of manifest.extract) extractStep(step, body, config, fail, out);
      // A credential reflected by the remote service must never reach a response.
      for (const value of Object.values(out))
        if (typeof value === 'string' && secrets.some((secret) => value.includes(secret))) fail();
      return out;
    },
  };
}

/** Registry entry for a manifest. The definition is validated here, at registry creation. */
export function createManifestRegistration(manifest: IntegrationManifest): IntegrationRegistration {
  assertValidDefinition(manifest);
  return {
    type: manifest.type,
    label: manifest.label,
    capabilities: manifest.capabilities,
    definition: manifest,
    prepare(context) {
      if (!context.transport) throw new Error('Integration transport unavailable.');
      const adapter = createManifestAdapter(manifest, context.transport);
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
  };
}
