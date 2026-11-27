# 0032 — Optional OIDC sign-in for the administrator account

**Status:** Accepted

## Context

The single administrator signs in with e-mail and password ([ADR 0004](0004-better-auth-web-authentication.md)),
optionally with an authenticator code ([ADR 0016](0016-two-factor-authentication.md)) or a passkey
([ADR 0017](0017-passkey-sign-in.md)). Issue #147 asks to let that account sign in through the identity provider
of the homelab (Authentik, Keycloak, Authelia, Zitadel and similar) while the local password stays as recovery.
Multiple users, roles, guest mode and SAML remain out of scope.

Authentication is Better Auth's job in this project, so the protocol is **not** reimplemented: Better Auth 1.7.25's
`genericOAuth` plugin runs discovery, the authorization code flow with PKCE, `state`, the ID token verification
(signature through the provider's JWKS, issuer, audience, expiry and nonce), the account link and the session. Its
code and options were read in the installed package. Homora only configures it and adds thin gateway routes.

## Decision

- **One provider per installation, off by default, configured by environment** (no database settings and no
  provider screen): `HOMORA_OIDC_ISSUER`, `HOMORA_OIDC_CLIENT_ID`, `HOMORA_OIDC_CLIENT_SECRET`, and optionally
  `HOMORA_OIDC_NAME` (button label) and `HOMORA_OIDC_REDIRECT_ORIGIN`. Without an issuer nothing is active; a partial
  configuration, a non-HTTPS issuer or an unknown redirect origin fails at startup. The client secret lives only in the
  environment: not in the database or backups, never sent to the browser, logs, audit or responses. The interface only
  links and unlinks the identity. Changing the provider needs a restart.
- **Plugin configuration that enforces the policy.** `disableSignUp` and `disableImplicitSignUp` (the provider can never
  create an account; the existing hook that refuses a second account stays as the last line of defence),
  `account.accountLinking.disableImplicitLinking` (a matching e-mail address, verified or not, never links or signs in
  anything; tested), `pkce`, `requireIdTokenVerification`. The provider is listed in `trustedProviders` only because
  the library refuses an **explicit** link otherwise when the provider did not verify the e-mail; that does not enable
  implicit linking. `allowDifferentEmails` is on because the local e-mail is just a login name.
- **Identity = provider id + subject.** The link is the library's own `account` row (`providerId`, `accountId` = the
  token's `sub`), so no schema change was needed. The provider id is `oidc-` plus a hash of the issuer, so an identity
  linked at one provider never matches another provider, even with the same subject. The e-mail claim is requested
  only because the library requires one; it is never used for authorization.
- **Linking is explicit.** A signed-in administrator confirms the password (shared password-guess limit) and Better
  Auth's `link-social` starts the flow from the server; the link is made when the provider returns, bound by the library
  to the session that started it. Nothing from a stranger can link: an unknown subject, a changed subject or a
  matching e-mail all end in the same generic refusal.
- **Tokens are not kept.** Homora never uses the provider's access, refresh or ID tokens. Database hooks null them
  before the `account` row is written or updated (and `encryptOAuthTokens` is on as a backstop), so nothing beyond the
  subject identifier is stored.
- **Cookies.** The provider redirects to `<redirect origin>/api/auth/callback/<provider id>`, a cross-site navigation
  on which `SameSite=Strict` cookies are not sent. Only the library's signed, short-lived `state` cookie is set to
  `Lax` (`advanced.cookies.state`); every other cookie, including the session, stays `Strict`. The session cookie is
  set in the callback's response, which browsers accept for a top-level navigation, and is first sent on the
  next same-site request; this was confirmed in a real browser. The attempt cookies are `Secure` when the configured
  redirect origin is HTTPS.
- **Origin and proxy.** `baseURL` is the configured redirect origin (default: the first HTTPS origin of
  `HOMORA_ALLOWED_ORIGINS`, else `http://localhost:<web port>`), never `Host` or `X-Forwarded-*` (tested). A start
  request must come from that very origin so the cookies are set for the host the provider returns to; from another
  address the interface says which one to use.
- **Routes.** Starting and linking are Homora routes that call Better Auth server-side (`/api/auth/oidc/login`,
  `/api/auth/oidc/link`); the one Better Auth route forwarded is `GET /api/auth/callback/<provider id>`, whose outcome
  is reduced to `/` (signed in), `/account?oidc=linked`, or `?error=denied|failed` (the provider's own error text never
  reaches the page). `sign-in/social`, `link-social`, `list-accounts`, `unlink-account`, token routes and the plugin's
  own routes stay closed (tested). The link is listed and removed through `/api/account/oidc` and
  `/api/account/oidc/unlink` (password required).
- **Sessions.** An OIDC sign-in is a browser-session cookie with an eight-hour server expiry. “Keep me signed in”
  (#143) does not apply to it: the callback is a redirect with no form to carry the choice, and the provider's own
  session governs how long a renewed sign-in stays one click. Sessions are not renewed. **Logout is local**: the
  provider's end-session endpoint is not called, so its own session may remain. Sessions do not record how they were
  opened, so removing the link ends every other session; sessions opened before a provider change keep their normal
  expiry and can be ended in Account.
- **Second step.** The provider is responsible for verifying the person, so an OIDC sign-in does **not** ask for the
  local authenticator code, like a passkey ([ADR 0017](0017-passkey-sign-in.md)). This is stated in the interface and
  covered by a test.
- **Provider change or removal.** Changing the issuer leaves the old link dormant (another provider id): it no
  longer matches, the login button disappears and Account offers to remove it. Removing the `HOMORA_OIDC_*` variables
  turns the feature off; the row stays, harmless, until removed in Account or by `pnpm auth:reset --oidc-only --yes`.
- **Unavailability.** A provider that is down or misconfigured gives a generic “unavailable” message (discovery that
  failed at startup is retried by the library on the next attempt); password and passkey sign-in are never affected.
- **Limits and audit.** Starting and the callback are limited per client address like the password sign-in (ten per
  15 minutes). The activity log records `login` (detail “OIDC · client”), failed logins like a failed password (address
  and count only), `oidc-link` and `oidc-unlink`; no token, claim, subject or secret is logged.

## Network limits (a known divergence from the issue)

Issue #147 asks for the provider's discovery, key and token requests to follow the destination policy used for
monitoring (exact origin, DNS resolved once and pinned, no redirects, private ranges only by opt-in). Better Auth's
plugin makes these requests with its own HTTP client and exposes no transport hook, and the decision here is to use
the library unmodified. Therefore **these requests do not go through Homora's restricted transport**: DNS is not
pinned, redirects are not forbidden, and loopback or private addresses are reachable. The mitigations are that the
issuer is operator-configured through the environment (not user input, not stored, not changeable from the
interface), must be HTTPS, and that the endpoints come from the provider's discovery document, so the trust placed
in the provider is the trust placed in the operator's configuration. A homelab provider on a private network works
without any opt-in; a private certificate authority is trusted through Node's `NODE_EXTRA_CA_CERTS`. If a future
requirement needs the pinned transport, it needs either a Better Auth hook for it or a custom flow, and a new ADR.

## Recovery, backups and risks

- The password always works. `pnpm auth:reset --oidc-only --yes` removes the link and every session; the full reset
  removes it with the account.
- The client secret is in the environment (`.env`, Compose): protect it like the session secret; rotate it at the
  provider and restart. The stored subject identifier is not secret but identifies the administrator at the provider.
- Trust shifts to the provider: whoever controls the linked identity there signs in without a password or the local
  second step. Prefer provider-side MFA.
- Not supported: multiple providers, group/role claims, provider logout, “keep me signed in”, a pinned transport.

## Validation

Automated against a real HTTP provider that signs genuine JWTs and enforces PKCE, the client credentials, the redirect
URI and single-use codes: explicit link, sign-in, session needed and password required to link, one identity,
strict cookies and the eight-hour lifetime, a `Lax` state cookie only, every token failure (issuer, audience, expiry,
nonce, unpublished key), forged, replayed, cookie-less and tampered callbacks, an unknown subject and a matching
verified e-mail refused with no account or link created, no stored tokens or secrets in responses and audit,
unavailable provider and recovery, unlinking and session revocation, provider change, forwarded headers ignored,
closed Better Auth routes, rate limits, `Secure` behind HTTPS, the reset script and configuration parsing. A browser
pass is recorded in [evolution](../evolution.md). **Not verified:** a real provider (Authentik, Keycloak, …) and an
HTTPS reverse proxy with a real certificate.
