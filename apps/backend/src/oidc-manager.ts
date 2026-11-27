import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { createAuth } from './auth.js';
import type { Log } from './logger.js';
import {
  oidcProviderId,
  oidcProviderName,
  type OidcConfig,
  type OidcProvider,
} from './oidc-config.js';
import { probeOidcProvider, type OidcProbeFailure } from './oidc-probe.js';
import { hasSealedValues, type createVault } from './vault.js';

const providerSchema = z.object({
  issuer: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  name: z.string(),
});
/** What is still being filled in: only the issuer is certain. */
const draftSchema = providerSchema.partial().required({ issuer: true });
const preferencesSchema = z.object({
  disabled: z.boolean().default(false),
  autoRedirect: z.boolean().default(false),
  longSession: z.boolean().default(false),
});

export type OidcDraft = z.infer<typeof draftSchema>;
export type OidcPreferences = z.infer<typeof preferencesSchema>;
export type OidcSource = 'saved' | 'environment' | 'none';
export type OidcHealth = {
  status: 'unknown' | 'ok' | 'failing';
  failure: OidcProbeFailure | null;
  testedAt: string | null;
};

/** The saved provider exists but cannot be decrypted (the key is missing or was replaced). */
export class OidcUnreadableError extends Error {
  constructor() {
    super('The saved sign-in provider cannot be read.');
  }
}

/** A failing provider is tried again at most this often when the sign-in page asks. */
const RETRY_MS = 30_000;
const SIGNING_WARNING =
  'OIDC sign-in will fail: the provider only signs ID tokens with the client secret. Configure a signing key at the provider (in Authentik, the “Signing Key” of the OAuth2/OpenID provider), then test again.';

type Options = {
  sqlite: DatabaseSync;
  vault: ReturnType<typeof createVault> | undefined;
  auth: ReturnType<typeof createAuth>;
  /** The provider the `HOMORA_OIDC_*` variables define, if any. */
  environment: OidcConfig | undefined;
  redirectOrigin: string;
  log: Log;
};

/**
 * Which provider is in use and how it behaves (ADR 0032). A provider saved in the interface takes
 * precedence over the environment; removing it makes the variables apply again. Preferences are
 * kept apart so that they can change a provider defined by variables. Every change reaches Better
 * Auth through `configureOidc`; nothing here takes part in a sign-in.
 */
export function createOidcManager({
  sqlite,
  vault,
  auth,
  environment,
  redirectOrigin,
  log,
}: Options) {
  const row = () =>
    sqlite.prepare('SELECT provider, draft, preferences FROM oidc_settings WHERE id = 1').get() as
      | { provider: string | null; draft: string | null; preferences: string }
      | undefined;

  function unseal<T>(sealed: string, schema: z.ZodType<T>): T {
    try {
      if (!vault) throw new OidcUnreadableError();
      return schema.parse(JSON.parse(vault.unseal(sealed)));
    } catch {
      throw new OidcUnreadableError();
    }
  }

  function preferences(): OidcPreferences {
    const stored = row()?.preferences;
    return preferencesSchema.parse(stored ? JSON.parse(stored) : {});
  }

  /** The saved provider and draft; `unreadable` instead of falling back to another provider. */
  function stored() {
    const current = row();
    let unreadable = false;
    const read = <T>(sealed: string | null | undefined, schema: z.ZodType<T>) => {
      if (!sealed) return;
      try {
        return unseal(sealed, schema);
      } catch {
        unreadable = true;
        return;
      }
    };
    const provider = read(current?.provider, providerSchema);
    const draft = read(current?.draft, draftSchema);
    return { saved: Boolean(current?.provider), provider, draft, unreadable };
  }

  /** The provider that applies, whether or not it is switched off. */
  function configured(): { source: OidcSource; provider: OidcProvider | undefined } {
    const { saved, provider } = stored();
    if (saved) return { source: 'saved', provider };
    return environment
      ? { source: 'environment', provider: environment }
      : { source: 'none', provider: undefined };
  }

  let health: OidcHealth = { status: 'unknown', failure: null, testedAt: null };
  let probedIssuer: string | undefined;
  let probing: Promise<OidcHealth> | null = null;
  let signingWarned = false;

  /** Reads the provider once; concurrent requests share the answer. */
  function test(): Promise<OidcHealth> {
    const issuer = configured().provider?.issuer;
    if (!issuer) return Promise.resolve(health);
    if (probing && probedIssuer === issuer) return probing;
    probedIssuer = issuer;
    const run = probeOidcProvider(issuer).then((failure) => {
      const result: OidcHealth = {
        status: failure ? 'failing' : 'ok',
        failure,
        testedAt: new Date().toISOString(),
      };
      // A result for a provider that was replaced meanwhile says nothing about the current one.
      if (probedIssuer !== issuer) return result;
      // What the library read while the provider was not working must not outlive the repair.
      if (!failure && health.status !== 'ok') auth.refreshOidc();
      health = result;
      if (failure === 'signing') {
        if (!signingWarned) log.warn({ failure }, SIGNING_WARNING);
        signingWarned = true;
      } else if (failure) log.warn({ failure }, 'the OIDC provider is not working');
      return result;
    });
    probing = run.finally(() => {
      if (probedIssuer === issuer) probing = null;
    });
    return probing;
  }
  const testInBackground = () => void test().catch(() => {});

  const fingerprint = () => JSON.stringify(row() ?? null);
  let seen = fingerprint();
  let applied = JSON.stringify(auth.oidc?.config ?? null);
  /** Hands Better Auth the provider that is in use now. */
  function apply() {
    const { provider } = configured();
    const next =
      provider && !preferences().disabled
        ? {
            issuer: provider.issuer,
            clientId: provider.clientId,
            clientSecret: provider.clientSecret,
            name: provider.name,
            redirectOrigin,
          }
        : undefined;
    const key = JSON.stringify(next ?? null);
    if (key === applied) return false;
    applied = key;
    auth.configureOidc(next);
    return true;
  }

  /** Forgets what was learned about the previous provider. */
  function changed() {
    seen = fingerprint();
    apply();
    health = { status: 'unknown', failure: null, testedAt: null };
    probedIssuer = undefined;
    probing = null;
    signingWarned = false;
  }

  function write(values: {
    provider?: OidcProvider | null;
    draft?: OidcDraft | null;
    preferences?: Partial<OidcPreferences>;
  }) {
    const current = row();
    const seal = (value: object | null | undefined, previous: string | null) => {
      if (value === undefined) return previous;
      if (value === null) return null;
      if (!vault) throw new OidcUnreadableError();
      try {
        return vault.seal(JSON.stringify(value), !hasSealedValues(sqlite));
      } catch {
        // The key is missing while sealed values exist.
        throw new OidcUnreadableError();
      }
    };
    sqlite
      .prepare(
        `INSERT INTO oidc_settings (id, provider, draft, preferences) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET provider = excluded.provider, draft = excluded.draft,
           preferences = excluded.preferences`,
      )
      .run(
        seal(values.provider, current?.provider ?? null),
        seal(values.draft, current?.draft ?? null),
        JSON.stringify({ ...preferences(), ...values.preferences }),
      );
    seen = fingerprint();
  }

  if (stored().unreadable)
    log.error(
      {},
      'the saved OIDC provider cannot be decrypted: sign-in with it is off until it is removed or the key is restored',
    );
  apply();

  return {
    redirectOrigin,
    environment: () => environment !== undefined,
    preferences,
    stored,
    configured,
    name: () => oidcProviderName(configured().provider?.name),
    health: () => health,
    test,
    testInBackground,
    /** "Test again": also makes the next sign-in read the provider afresh. */
    async retest() {
      const result = await test();
      if (result.status === 'ok') auth.refreshOidc();
      return result;
    },
    /** Picks up a change made outside this process, such as by the reset script. */
    sync() {
      if (fingerprint() === seen) return;
      changed();
      testInBackground();
    },
    /** Whether the key allows saving, asked before anything is removed to make room. */
    writable() {
      try {
        vault?.seal('probe', !hasSealedValues(sqlite));
        return vault !== undefined;
      } catch {
        return false;
      }
    },
    /** Whether the sign-in button may be offered: in use and not known to be failing. */
    available() {
      if (!auth.oidc) return false;
      if (health.status !== 'failing') return true;
      // A provider that comes back is noticed without anyone saving or restarting.
      if (Date.now() - Date.parse(health.testedAt!) >= RETRY_MS) testInBackground();
      return false;
    },
    /** A complete provider replaces the one in use; the draft it was completed from goes. */
    saveProvider(
      provider: OidcProvider,
      changes: Partial<OidcPreferences>,
      { clearDraft }: { clearDraft: boolean },
    ) {
      write({ provider, ...(clearDraft ? { draft: null } : {}), preferences: changes });
      changed();
    },
    /** A draft is only remembered; the provider in use stays as it is. */
    saveDraft(draft: OidcDraft) {
      write({ draft });
    },
    discardDraft() {
      write({ draft: null });
    },
    savePreferences(changes: Partial<OidcPreferences>) {
      write({ preferences: changes });
      // Switching the provider on or off rebuilds it; the other preferences change nothing there.
      if (apply()) testInBackground();
    },
    /** Deletes everything saved here; the environment, if any, applies again. */
    remove() {
      sqlite.exec('DELETE FROM oidc_settings');
      changed();
    },
    /** The id Better Auth would store for the provider that applies. */
    providerId() {
      const issuer = configured().provider?.issuer;
      return issuer ? oidcProviderId(issuer) : null;
    },
  };
}
export type OidcManager = ReturnType<typeof createOidcManager>;
