import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { InvalidPasswordError, RateLimitedError, SessionNotFoundError } from '../auth.js';
import type { createAuth } from '../auth.js';
import { createRateLimitStorage, SIGN_IN_WINDOW_SECONDS } from '../auth-rate-limit.js';
import { errorBody } from '../api-error.js';
import type { AuditLog } from '../audit.js';
import {
  OidcFieldError,
  oidcProviderId,
  oidcProviderName,
  validateOidcClientId,
  validateOidcClientSecret,
  validateOidcIssuer,
  validateOidcName,
} from '../oidc-config.js';
import { OidcUnreadableError, type OidcManager } from '../oidc-manager.js';
import { oidcCallbackPath } from './oidc.js';

type Auth = ReturnType<typeof createAuth>;

const password = z.string().min(1).max(1024);
const passwordSchema = z.object({ password }).strict();
const configSchema = z
  .object({
    password,
    issuer: z.string().trim().min(1).max(2048),
    clientId: z.string().trim().max(256).optional(),
    clientSecret: z.string().max(1024).optional(),
    name: z.string().trim().max(40).optional(),
    /** The person saw that the linked identity of another issuer will be removed. */
    confirmIssuerChange: z.boolean().optional(),
    /** The form started from the draft: its secret may be used, and saving completes it. */
    fromDraft: z.boolean().optional(),
  })
  .strict();
const preferencesBody = z
  .object({
    password,
    disabled: z.boolean().optional(),
    autoRedirect: z.boolean().optional(),
    longSession: z.boolean().optional(),
  })
  .strict();
/** "Test again" reads the provider; a few a minute are plenty. */
const TESTS_PER_WINDOW = 30;

/**
 * The sign-in provider in Account (ADR 0032): what is configured, the identity linked to it and
 * the changes to both. Every change asks for the current password; the client secret is written
 * and never read back.
 */
export function registerOidcSettingsRoutes(
  app: FastifyInstance,
  auth: Auth,
  audit: AuditLog,
  manager: OidcManager,
  { allowLoopbackHttp }: { allowLoopbackHttp: boolean },
) {
  const redirectUri = (issuer: string) =>
    `${manager.redirectOrigin}${oidcCallbackPath(oidcProviderId(issuer))}`;

  async function view(userId: string | undefined) {
    const { draft, unreadable } = manager.stored();
    const { source, provider } = manager.configured();
    const preferences = manager.preferences();
    const links = auth.oidcLinks.list().filter((row) => row.userId === userId);
    const link = links.find((row) => row.providerId === manager.providerId()) ?? links[0];
    return {
      enabled: auth.oidc !== undefined,
      name: provider ? oidcProviderName(provider.name) : null,
      redirectUri: provider ? redirectUri(provider.issuer) : null,
      redirectOrigin: manager.redirectOrigin,
      identity: link
        ? { createdAt: link.createdAt, current: link.providerId === manager.providerId() }
        : null,
      source,
      /** Variables exist, whether or not a saved provider takes their place. */
      environment: manager.environment(),
      unreadable,
      provider: provider
        ? {
            issuer: provider.issuer,
            clientId: provider.clientId,
            name: oidcProviderName(provider.name),
          }
        : null,
      draft: draft
        ? {
            issuer: draft.issuer,
            clientId: draft.clientId ?? '',
            name: draft.name ?? '',
            hasSecret: Boolean(draft.clientSecret),
            redirectUri: redirectUri(draft.issuer),
          }
        : null,
      ...preferences,
      health: manager.health(),
    };
  }

  /** The signed-in account after the password is confirmed; otherwise the reply is sent. */
  async function confirmed(
    request: FastifyRequest,
    reply: FastifyReply,
    given: string,
    action: 'oidc-config' | 'oidc-unlink',
  ) {
    const session = await auth.session(request.headers);
    if (!session) {
      void reply.code(401).send(errorBody('auth-required'));
      return null;
    }
    try {
      await auth.confirmPassword(request.headers, given);
    } catch (error) {
      if (error instanceof RateLimitedError)
        void reply.code(429).send(errorBody('too-many-attempts'));
      else if (error instanceof SessionNotFoundError)
        void reply.code(401).send(errorBody('auth-required'));
      else if (error instanceof InvalidPasswordError) {
        audit.record({
          actor: `user:${session.userId}`,
          action,
          result: 'failed',
          ipAddress: request.ip,
        });
        void reply.code(400).send(errorBody('invalid-current-password'));
      } else throw error;
      return null;
    }
    return session;
  }

  /** Removes the links, answering for the failures; false when the reply was already sent. */
  async function unlinked(request: FastifyRequest, reply: FastifyReply, actor: string) {
    try {
      await auth.oidcLinks.removeAll(request.headers);
      return true;
    } catch (error) {
      if ((error as { body?: { code?: string } }).body?.code === 'SESSION_NOT_FRESH') {
        void reply.code(400).send(errorBody('session-not-fresh'));
        return false;
      }
      audit.record({ actor, action: 'oidc-unlink', result: 'failed', ipAddress: request.ip });
      void reply.code(400).send(errorBody('oidc-link-failed'));
      return false;
    }
  }

  const record = (request: FastifyRequest, userId: string, detail: string) =>
    audit.record({
      actor: `user:${userId}`,
      action: 'oidc-config',
      result: 'ok',
      detail,
      ipAddress: request.ip,
    });
  // Sessions do not record how they were opened, so every other one ends.
  const endOtherSessions = (request: FastifyRequest) =>
    auth.revokeOtherSessions(request.headers).catch(() => {});
  const unreadableReply = (reply: FastifyReply, error: unknown) => {
    if (!(error instanceof OidcUnreadableError)) throw error;
    return reply.code(409).send(errorBody('oidc-unreadable'));
  };
  const linkedToCurrent = () =>
    auth.oidcLinks.list().some((link) => link.providerId === manager.providerId());

  // One change at a time. Callbacks do not wait here, so that a provider that stopped answering
  // can always be replaced.
  let changes: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => T | Promise<T>) => {
    const run = changes.then(work);
    changes = run.catch(() => {});
    return run;
  };

  app.get('/api/account/oidc', async (request) =>
    view((await auth.session(request.headers))?.userId),
  );

  app.post('/api/account/oidc/config', async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const input = parsed.data;
    try {
      validateOidcIssuer(input.issuer, { allowLoopbackHttp });
      if (input.clientId) validateOidcClientId(input.clientId);
      if (input.clientSecret) validateOidcClientSecret(input.clientSecret);
      if (input.name) validateOidcName(input.name);
    } catch (error) {
      if (!(error instanceof OidcFieldError)) throw error;
      return reply
        .code(400)
        .send(errorBody(error.field === 'issuer' ? 'oidc-invalid-issuer' : 'invalid-data'));
    }
    const session = await confirmed(request, reply, input.password, 'oidc-config');
    if (!session) return reply;
    const actor = `user:${session.userId}`;

    const saved = await inTurn(async () => {
      const { draft, provider } = manager.stored();
      // A stored secret is only reused for the issuer it was typed for: it is never sent to
      // another one. A secret from the environment is never copied.
      // A draft's secret is untested: it replaces a working one only when the draft is completed.
      const secretOf = (value: { issuer: string; clientSecret?: string } | undefined) =>
        value?.issuer === input.issuer ? value.clientSecret : undefined;
      const clientSecret =
        input.clientSecret || (input.fromDraft ? secretOf(draft) : undefined) || secretOf(provider);
      try {
        if (!input.clientId || !clientSecret) {
          manager.saveDraft({
            issuer: input.issuer,
            clientId: input.clientId || undefined,
            clientSecret,
            name: input.name || undefined,
          });
          record(request, session.userId, 'draft');
          return 'draft' as const;
        }
        const previous = manager.configured().provider?.issuer;
        const issuerChanged = previous !== undefined && previous !== input.issuer;
        const next = oidcProviderId(input.issuer);
        const stale = auth.oidcLinks.list().some((link) => link.providerId !== next);
        if (stale && !input.confirmIssuerChange) {
          void reply.code(409).send(errorBody('oidc-confirm-issuer'));
          return null;
        }
        const keepsLink = !stale && auth.oidcLinks.list().length > 0;
        // Nothing is removed for a configuration that could not be saved afterwards.
        if (!manager.writable()) throw new OidcUnreadableError();
        if (stale && !(await unlinked(request, reply, actor))) return null;
        manager.saveProvider(
          {
            issuer: input.issuer,
            clientId: input.clientId,
            clientSecret,
            name: oidcProviderName(input.name),
          },
          // Leaving automatically for a provider nobody linked yet is never carried over.
          keepsLink ? {} : { autoRedirect: false },
          { clearDraft: input.fromDraft === true },
        );
        if (stale || issuerChanged) await endOtherSessions(request);
        record(request, session.userId, 'save');
        return 'saved' as const;
      } catch (error) {
        void unreadableReply(reply, error);
        return null;
      }
    });
    if (!saved) return reply;
    if (saved === 'saved') await manager.test();
    return view(session.userId);
  });

  app.post('/api/account/oidc/preferences', async (request, reply) => {
    const parsed = preferencesBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const { password: given, ...changes } = parsed.data;
    const session = await confirmed(request, reply, given, 'oidc-config');
    if (!session) return reply;
    const done = await inTurn(() => {
      if (!manager.configured().provider) {
        void reply.code(404).send(errorBody('oidc-not-configured'));
        return false;
      }
      const preferences = manager.preferences();
      if (
        changes.autoRedirect &&
        !preferences.autoRedirect &&
        ((changes.disabled ?? preferences.disabled) ||
          !linkedToCurrent() ||
          manager.health().status === 'failing')
      ) {
        void reply.code(409).send(errorBody('oidc-auto-unavailable'));
        return false;
      }
      manager.savePreferences(changes);
      record(request, session.userId, 'preferences');
      return true;
    });
    return done ? view(session.userId) : reply;
  });

  app.post('/api/account/oidc/draft/discard', async (request, reply) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const session = await confirmed(request, reply, parsed.data.password, 'oidc-config');
    if (!session) return reply;
    await inTurn(() => manager.discardDraft());
    record(request, session.userId, 'discard');
    return view(session.userId);
  });

  app.post('/api/account/oidc/remove', async (request, reply) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const session = await confirmed(request, reply, parsed.data.password, 'oidc-config');
    if (!session) return reply;
    const done = await inTurn(async () => {
      // Whatever cannot be read can always be removed, even if only a draft was saved.
      const { saved, unreadable } = manager.stored();
      if (!saved && !unreadable) {
        void reply.code(404).send(errorBody('not-found'));
        return false;
      }
      const linked = auth.oidcLinks.list().length > 0;
      if (linked && !(await unlinked(request, reply, `user:${session.userId}`))) return false;
      manager.remove();
      await endOtherSessions(request);
      record(request, session.userId, 'remove');
      return true;
    });
    if (!done) return reply;
    manager.testInBackground();
    return view(session.userId);
  });

  const testLimiter = createRateLimitStorage();
  app.post('/api/account/oidc/test', async (request, reply) => {
    const limit = await testLimiter.consume(`oidc-test:${request.ip}`, {
      window: SIGN_IN_WINDOW_SECONDS,
      max: TESTS_PER_WINDOW,
    });
    if (!limit.allowed) return reply.code(429).send(errorBody('too-many-attempts'));
    await manager.retest();
    return view((await auth.session(request.headers))?.userId);
  });

  app.post('/api/account/oidc/unlink', async (request, reply) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const linked = auth.oidcLinks.list().length > 0;
    const session = await confirmed(request, reply, parsed.data.password, 'oidc-unlink');
    if (!session) return reply;
    const actor = `user:${session.userId}`;
    if (!linked) return reply.code(404).send(errorBody('not-found'));
    if (!(await inTurn(() => unlinked(request, reply, actor)))) return reply;
    await endOtherSessions(request);
    audit.record({ actor, action: 'oidc-unlink', result: 'ok', ipAddress: request.ip });
    return { ok: true };
  });
}
