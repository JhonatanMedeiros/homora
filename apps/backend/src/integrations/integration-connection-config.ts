import { isValidCaPem } from '@homora/utils/node';
import { integrationInstances } from '@homora/db';
import { z } from 'zod';
import { InputError } from '../api-error.js';
import { integrationRegistry } from './integration-registry.js';
import { hasField, publicFieldShape, publicFieldsOf } from './integration-fields.js';

type Row = typeof integrationInstances.$inferSelect;
export type ConnectionInput = {
  type?: string;
  name?: string;
  url?: string;
  allowPrivate?: boolean;
  tokenId?: string;
  secret?: string;
  ca?: string;
  removeCa?: boolean;
  /** Public fields declared by the integration definition (entityId, username, slug, ...). */
  [field: string]: string | boolean | undefined;
};
export type Credentials = { secret?: string; ca?: string; tokenId?: string };
export type ConnectionData = {
  url: string;
  allowPrivate: boolean;
  [field: string]: string | boolean | undefined;
};

const connectionTypes = new Set(integrationRegistry.list().map(({ type }) => type));
const storedConfigSchema = z
  .object({
    url: z.string().max(2048),
    allowPrivate: z.boolean().default(false),
    ...publicFieldShape(255),
  })
  .strict();
const credentialsSchema = z
  .object({
    secret: z.string().max(65536).optional(),
    ca: z.string().max(65536).optional(),
    tokenId: z.string().max(255).optional(),
  })
  .strict();

function validateCa(ca: string) {
  if (!isValidCaPem(ca)) throw new InputError('invalid-ca');
}

export function parseConnectionData(row: Row): ConnectionData {
  const parsed = storedConfigSchema.safeParse(JSON.parse(row.publicConfig));
  if (!parsed.success) throw new Error('Configuração da integração inválida.');
  return parsed.data;
}

export function publicConnection(row: Row) {
  const data = parseConnectionData(row);
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    ...data,
    hasSecret: row.certificateRef === 'secret' || row.certificateRef === 'both',
    hasCa: row.certificateRef === 'ca' || row.certificateRef === 'both',
    lastTest:
      row.lastTestAt !== null && row.lastTestResult !== null
        ? { at: row.lastTestAt, result: row.lastTestResult }
        : null,
  };
}

/**
 * Short, stable reason for a failed test. The service's own message is never stored or shown:
 * it can echo addresses or details of the internal network.
 */
export function testFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if ((error as { privateNetwork?: unknown } | null)?.privateNetwork === true)
    return 'private-network';
  if (/HTTP response (401|403)\b/.test(message)) return 'rejected';
  if (/HTTP response/.test(message)) return 'http-error';
  if (/time(d)? ?out|exceeded/i.test(message)) return 'timeout';
  if (/temporarily unavailable/i.test(message)) return 'unavailable';
  if (/invalid .*(json|response)|JSON/i.test(message)) return 'invalid-response';
  return 'failed';
}

export function readConnectionCredentials(
  row: Row,
  vault?: { unseal: (value: string) => string },
): Credentials {
  if (!row.secretRef) return {};
  if (!vault) throw new Error('Cofre indisponível.');
  const parsed = credentialsSchema.safeParse(JSON.parse(vault.unseal(row.secretRef)));
  if (!parsed.success) throw new Error('Credenciais da integração inválidas.');
  return parsed.data;
}

/** Applies update semantics and validates credentials/config without making a network call. */
export function prepareConnection(
  input: ConnectionInput,
  current: Row | undefined,
  saved: Credentials,
  validateAdapter: (type: string, data: ConnectionData, keys: Credentials) => unknown,
) {
  const old = current ? parseConnectionData(current) : undefined;
  const type = input.type || current?.type || '';
  const name = input.name || current?.name || '';
  if (!connectionTypes.has(type) || !name) throw new InputError('invalid-name-or-type');
  const data: ConnectionData = {
    url: input.url || old?.url || '',
    allowPrivate: input.allowPrivate ?? old?.allowPrivate ?? false,
    ...Object.fromEntries(
      publicFieldsOf(type).flatMap(({ key, required }) => {
        const given = typeof input[key] === 'string' ? (input[key] as string) : undefined;
        const kept = (old?.[key] as string | undefined) ?? '';
        // A required field keeps its saved value when empty; an optional one can be cleared.
        const value = required ? given || kept : (given ?? kept);
        return value === '' && !required ? [] : [[key, value]];
      }),
    ),
  };
  const identityFields = publicFieldsOf(type).filter(({ identity }) => identity);
  const tokenField = hasField(type, 'token-id');
  let originChanged = false;
  if (old) {
    try {
      originChanged = new URL(data.url).origin !== new URL(old.url).origin;
    } catch {
      throw new InputError('invalid-url');
    }
  }
  const identityChanged =
    !!current &&
    (current.type !== type ||
      originChanged ||
      identityFields.some(({ key }) => old?.[key] !== data[key]) ||
      (tokenField && !!input.tokenId && saved.tokenId !== input.tokenId));
  if (identityChanged && saved.secret && !input.secret) throw new InputError('secret-required');
  const keys: Credentials = {
    secret: input.secret || (identityChanged ? undefined : saved.secret),
    tokenId: tokenField ? input.tokenId || (originChanged ? undefined : saved.tokenId) : undefined,
    ca: input.removeCa ? undefined : input.ca || (identityChanged ? undefined : saved.ca),
  };
  if (keys.ca) validateCa(keys.ca);
  validateAdapter(type, data, keys);
  return { type, name, data, keys };
}
