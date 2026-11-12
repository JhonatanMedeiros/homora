/**
 * Reusable contract test for integration adapters. Test-only helper: it imports vitest and is
 * never part of the runtime path. See docs/adapters.md.
 *
 *   runAdapterContract({ name, create, validConfig, secrets, invalidConfigs, fixtures, ... })
 *
 * The harness drives the adapter through a fake transport and enforces the security rules every
 * adapter must keep: validated input, GET-only requests through the shared transport, a path built
 * only from validated config, no secrets in data or errors, generic errors that never echo the
 * remote body, bounded output, and the observation cache semantics.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createIntegrationRegistry,
  createObservationCache,
  IntegrationInvalidatedError,
  type IntegrationAdapter,
} from './integrations.js';

export type FakeRequest = {
  origin: string;
  path: string;
  authorization?: string;
  apiKey?: string;
  maxBodyBytes?: number;
};
export type FakeResponse = { status: number; body: unknown };
export type FakeTransport = (request: FakeRequest) => Promise<FakeResponse>;

/** Marker placed in every remote body; it must never reach a thrown error message. */
export const REMOTE_BODY_MARKER = 'REMOTE-BODY-MARKER-9f3a';

/** Values that must never be accepted where they end up in a request path. */
export const HOSTILE_PATH_VALUES: readonly string[] = [
  '../x',
  'a/../b',
  'a?b=1',
  'a#b',
  'a%2fb',
  'a%2Fb',
  'a b',
  ' a',
  'a\tb',
  'a\nb',
  'a\r\nb',
  'a\u0000b',
  'a/b',
  'a\\b',
  '',
];

const MAX_STRING = 4096;
const MAX_ARRAY = 1000;

export type AdapterContractOptions<Config, Data> = {
  /** Display name for the test suite. */
  name: string;
  create: (transport: FakeTransport) => IntegrationAdapter<Config, Data>;
  /** A config the adapter accepts. */
  validConfig: Config;
  /** Secret values inside `validConfig` (tokens, passwords). They must never leak. */
  secrets: readonly string[];
  /** Configs `validate` must reject: malformed, credentials in URL, bad schemes, oversized. */
  invalidConfigs: readonly { label: string; config: unknown }[];
  /** Config fields that end up in a request path (slug, entity id). Hostile values must be rejected. */
  pathFields?: readonly (keyof Config & string)[];
  fixtures: {
    /** A recorded or documented 200 body, and the data the adapter must return for it. */
    valid: { body: unknown; expected: Data };
    /** 200 bodies with the wrong shape. */
    wrongShape: readonly { label: string; body: unknown }[];
    /** 200 bodies whose fields exceed the adapter's bounds. */
    oversized: readonly { label: string; body: unknown }[];
    /** Builds a 200 body that echoes the secret back; the adapter must reject it or drop it. */
    echoSecret?: (secret: string) => unknown;
  };
  /** The adapter must reject 401 and 403 (default true). */
  authenticated?: boolean;
  /**
   * Whether the adapter converts a thrown transport error into a fixed message (default true).
   * An adapter may opt out only when the shared transport already throws fixed strings; say why.
   */
  sanitizesTransportErrors?: boolean;
  /** Cache TTL used for the cache checks (default 30 s). */
  cacheTtlMs?: number;
};

/** Throws when the output is not bounded: long strings, huge arrays, non-finite numbers. */
export function assertBounded(value: unknown, depth = 0) {
  expect(depth).toBeLessThanOrEqual(8);
  if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(MAX_STRING);
  else if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) {
    expect(value.length).toBeLessThanOrEqual(MAX_ARRAY);
    value.forEach((item) => assertBounded(item, depth + 1));
  } else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => assertBounded(item, depth + 1));
}

/** Rules for each request an adapter makes, regardless of the adapter. */
export function assertRequestIsSafe(request: FakeRequest, secrets: readonly string[]) {
  expect(
    Object.keys(request).every((key) =>
      ['origin', 'path', 'authorization', 'apiKey', 'maxBodyBytes'].includes(key),
    ),
  ).toBe(true);
  expect(new URL(request.origin).origin).toBe(request.origin);
  expect(['http:', 'https:']).toContain(new URL(request.origin).protocol);
  // Absolute path, visible ASCII only (no whitespace or control characters), no fragment, no
  // dot segments, no encoded separators: it can only address the intended resource.
  expect(request.path).toMatch(/^\/[\x21-\x7e]*$/);
  expect(request.path).not.toContain('#');
  expect(request.path.split('?')[0]!.split('/')).not.toContain('..');
  expect(request.path).not.toMatch(/%2f|%5c|%00/i);
  if (request.authorization !== undefined) {
    expect(request.authorization.length).toBeLessThanOrEqual(4096);
    expect(request.authorization).not.toMatch(/[\r\n]/);
  }
  if (request.maxBodyBytes !== undefined) {
    expect(Number.isSafeInteger(request.maxBodyBytes)).toBe(true);
    expect(request.maxBodyBytes).toBeGreaterThan(0);
    expect(request.maxBodyBytes).toBeLessThanOrEqual(2_000_000);
  }
  if (request.apiKey !== undefined) {
    expect(request.apiKey.length).toBeLessThanOrEqual(4096);
    expect(request.apiKey).not.toMatch(/[\r\n]/);
  }
  for (const secret of secrets) {
    expect(request.origin).not.toContain(secret);
    expect(request.path).not.toContain(secret);
  }
}

export function runAdapterContract<Config, Data>(options: AdapterContractOptions<Config, Data>) {
  const { validConfig, secrets, fixtures } = options;
  const sanitizes = options.sanitizesTransportErrors ?? true;
  const respond = (response: FakeResponse) => {
    const transport = vi.fn<FakeTransport>(async () => response);
    return { transport, adapter: options.create(transport) };
  };
  const rejection = async (adapter: IntegrationAdapter<Config, Data>, config = validConfig) => {
    try {
      await adapter.collect(config);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error('Expected the adapter to reject.');
  };
  const expectGeneric = (message: string) => {
    expect(message).not.toContain(REMOTE_BODY_MARKER);
    for (const secret of secrets) expect(message).not.toContain(secret);
    expect(message.length).toBeLessThan(200);
  };

  describe(`adapter contract: ${options.name}`, () => {
    describe('metadata', () => {
      it('declares a type, a label and capabilities and no secrets', () => {
        const adapter = options.create(vi.fn());
        expect(adapter.type).toMatch(/^[a-z0-9-]{2,40}$/);
        expect(adapter.label.length).toBeGreaterThan(0);
        expect(adapter.capabilities.length).toBeGreaterThan(0);
        const metadata = JSON.stringify([adapter.type, adapter.label, adapter.capabilities]);
        for (const secret of secrets) expect(metadata).not.toContain(secret);
        const listed = JSON.stringify(createIntegrationRegistry([adapter]).list());
        for (const secret of secrets) expect(listed).not.toContain(secret);
      });
    });

    describe('validate', () => {
      it('accepts the valid config without changing its meaning', () => {
        expect(() => options.create(vi.fn()).validate(validConfig)).not.toThrow();
      });
      for (const { label, config } of options.invalidConfigs)
        it(`rejects ${label}`, async () => {
          const { transport, adapter } = respond({ status: 200, body: {} });
          expect(() => adapter.validate(config as Config)).toThrow();
          await expect(adapter.collect(config as Config)).rejects.toThrow();
          expect(transport).not.toHaveBeenCalled();
        });
      for (const field of options.pathFields ?? [])
        for (const value of HOSTILE_PATH_VALUES)
          it(`rejects ${JSON.stringify(value)} in ${field} before any request`, async () => {
            const { transport, adapter } = respond({ status: 200, body: {} });
            const config = { ...validConfig, [field]: value } as Config;
            expect(() => adapter.validate(config)).toThrow();
            await expect(adapter.collect(config)).rejects.toThrow();
            expect(transport).not.toHaveBeenCalled();
          });
    });

    describe('request', () => {
      it('uses only the whitelisted shape, a safe path, and never leaks secrets into it', async () => {
        const { transport, adapter } = respond({ status: 200, body: fixtures.valid.body });
        await adapter.collect(validConfig);
        expect(transport).toHaveBeenCalled();
        for (const [request] of transport.mock.calls) assertRequestIsSafe(request, secrets);
      });
    });

    describe('responses', () => {
      it('maps the valid fixture to the expected bounded data without secrets', async () => {
        const { adapter } = respond({ status: 200, body: fixtures.valid.body });
        const data = await adapter.collect(validConfig);
        expect(data).toEqual(fixtures.valid.expected);
        assertBounded(data);
        for (const secret of secrets) expect(JSON.stringify(data)).not.toContain(secret);
      });
      for (const { label, body } of fixtures.wrongShape)
        it(`rejects a 200 with the wrong shape: ${label}`, async () => {
          const { adapter } = respond({ status: 200, body });
          expectGeneric(await rejection(adapter));
        });
      for (const { label, body } of fixtures.oversized)
        it(`rejects a 200 with oversized fields: ${label}`, async () => {
          const { adapter } = respond({ status: 200, body });
          expectGeneric(await rejection(adapter));
        });
      it('rejects a 200 whose body is missing or not an object', async () => {
        for (const body of [null, undefined, '<html>not json</html>', 42, true]) {
          const { adapter } = respond({ status: 200, body });
          expectGeneric(await rejection(adapter));
        }
      });
      if (fixtures.echoSecret)
        for (const secret of secrets)
          it('never returns a secret echoed by the remote service', async () => {
            const { adapter } = respond({ status: 200, body: fixtures.echoSecret!(secret) });
            try {
              const data = await adapter.collect(validConfig);
              expect(JSON.stringify(data)).not.toContain(secret);
            } catch (error) {
              expectGeneric(error instanceof Error ? error.message : String(error));
            }
          });
      const statuses = [
        ...(options.authenticated === false ? [] : [401, 403]),
        404,
        429,
        500,
        502,
        503,
        204,
        302,
      ];
      for (const status of statuses)
        it(`rejects HTTP ${status} with a generic error that does not echo the body`, async () => {
          const { adapter } = respond({ status, body: { message: REMOTE_BODY_MARKER } });
          expectGeneric(await rejection(adapter));
        });
      it('rejects a network error or timeout', async () => {
        for (const message of ['Timeout exceeded.', 'Connection failed.', 'ECONNRESET']) {
          const adapter = options.create(async () => {
            throw new Error(message);
          });
          const text = await rejection(adapter);
          expectGeneric(text);
          if (sanitizes) expect(text).not.toBe(message);
        }
      });
      if (sanitizes)
        it('does not forward text thrown by the transport', async () => {
          const adapter = options.create(async () => {
            throw new Error(`failed ${secrets.join(' ')} ${REMOTE_BODY_MARKER}`);
          });
          expectGeneric(await rejection(adapter));
        });
      it('rejects an invalid-JSON signal from the transport', async () => {
        const adapter = options.create(async () => {
          throw new Error('Invalid JSON response.');
        });
        expectGeneric(await rejection(adapter));
      });
    });

    describe('observation cache', () => {
      const ttl = options.cacheTtlMs ?? 30_000;
      it('caches a success, never a failure, and drops a stale result after invalidation', async () => {
        let now = 1_000;
        const cache = createObservationCache<Data>(ttl, () => now);
        let mode: 'ok' | 'fail' = 'fail';
        const transport = vi.fn<FakeTransport>(async () =>
          mode === 'ok'
            ? { status: 200, body: fixtures.valid.body }
            : { status: 500, body: { message: REMOTE_BODY_MARKER } },
        );
        const adapter = options.create(transport);
        const read = () => cache.collect(() => adapter.collect(validConfig));

        await expect(read()).rejects.toThrow();
        const afterFailure = transport.mock.calls.length;
        mode = 'ok';
        const first = await read();
        expect(first.data).toEqual(fixtures.valid.expected);
        expect(transport.mock.calls.length).toBeGreaterThan(afterFailure);
        const afterSuccess = transport.mock.calls.length;
        await read();
        expect(transport.mock.calls.length).toBe(afterSuccess);
        now += ttl + 1;
        await read();
        expect(transport.mock.calls.length).toBeGreaterThan(afterSuccess);

        // Invalidation while a request is in flight must not store the late result.
        let release: (response: FakeResponse) => void = () => undefined;
        let started = false;
        let released = false;
        const valid: FakeResponse = { status: 200, body: fixtures.valid.body };
        // The first request waits; later ones (multi-request adapters) answer at once.
        const slow = options.create(() =>
          released
            ? Promise.resolve(valid)
            : new Promise<FakeResponse>((resolve) => {
                started = true;
                release = (response) => {
                  released = true;
                  resolve(response);
                };
              }),
        );
        const fresh = createObservationCache<Data>(ttl, () => now);
        const pending = fresh.collect(() => slow.collect(validConfig));
        const settled = expect(pending).rejects.toBeInstanceOf(IntegrationInvalidatedError);
        await vi.waitFor(() => expect(started).toBe(true));
        fresh.invalidate();
        release({ status: 200, body: fixtures.valid.body });
        await settled;
      });
    });
  });
}
