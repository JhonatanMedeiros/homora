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

- **One provider per installation, off by default.** It is configured in **Account → Sign-in provider** or by
  environment (`HOMORA_OIDC_ISSUER`, `HOMORA_OIDC_CLIENT_ID`, `HOMORA_OIDC_CLIENT_SECRET`, optionally
  `HOMORA_OIDC_NAME`); `HOMORA_OIDC_REDIRECT_ORIGIN` stays server configuration. A partial environment configuration, a
  non-HTTPS issuer or an unknown redirect origin fails at startup. A provider saved in the interface takes precedence
  over the variables; removing it makes them apply again. A saved provider that cannot be decrypted turns OIDC off
  instead of falling back to the variables.
- **Changing it needs no restart.** Sessions, the password, passkeys and the second step run on a Better Auth instance
  that knows no provider. A second instance, over the same database and secret, exists only while a provider is in use,
  runs its sign-in and link, and is rebuilt when it changes. This isolation matters because the library's startup waits
  for the provider's discovery document without a time limit: a provider that does not answer can delay only its own
  sign-in (ten seconds, then the instance is replaced so the next attempt asks again). Sessions, links and attempt
  limits survive a change, unfinished attempts are deleted, and a callback still running on the previous instance can
  create neither a link nor a session. A change made by `pnpm auth:reset` is picked up by the running server on the
  next sign-in or account request. Better Auth's `sso` plugin, made for database-defined providers, was evaluated
  (1.7.25) and rejected: it has no explicit linking for a signed-in account, signs in on userinfo when the ID token is
  missing, stores the client secret in clear and sends no nonce.
- **Storage.** Table `oidc_settings` (migration `0052`) holds the saved provider and an optional **draft** (issuer
  first, to obtain the redirect URL), both sealed with the vault key used for integration credentials, and plain
  preferences (disabled, automatic redirect, long session), which also apply to a provider from the variables. A draft
  never replaces the provider in use. The client secret is write-only: it is never returned, logged or audited, and a
  stored one is reused only for the same issuer, and a draft's only when that draft is completed; one from the
  variables is never copied. Whatever is saved but cannot be decrypted can be removed in Account, and no new key is
  created while any sealed value exists.
- **Every change asks for the password** (shared guess limit). A new issuer must be confirmed when a link exists; it
  removes the link. A new issuer or removing the saved configuration ends the other sessions; disabling keeps
  configuration, link and sessions. An issuer changed outside the interface leaves the link marked as old.
- **Health check.** On save, at startup, after a failed attempt and on request, Homora reads the discovery document and
  the keys itself (5 s, 256 KiB) to say whether a sign-in could work: reachable, exact issuer, HTTPS endpoints for an
  HTTPS issuer, an asymmetric algorithm and a published key. It takes no part in a sign-in. The sign-in button is hidden
  while it fails; a failing provider is tried again at most every 30 seconds when the sign-in page asks.
  The library keeps the discovery document it first read, including the signing algorithms, so a successful test after a
  failure, and every “Test again”, rebuild the provider instance; attempts in progress stay valid.
- **Automatic redirect** (off by default, only with a working, linked provider): opening Homora leaves for the provider
  after the health check passes. `/login?local=1` never redirects; neither does a return with an error, a browser where
  the person signed out and has not signed in since, or a second arrival within a minute in the same tab.
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
  `/api/auth/oidc/link`); the one Better Auth route forwarded is `GET /api/auth/callback/<provider id>` of the provider
  in use, whose outcome is reduced to `/` (signed in), `/account?oidc=linked`, or `?error=denied|failed` (the
  provider's own error text never reaches the page). `sign-in/social`, `link-social`, `list-accounts`, `unlink-account`,
  token routes and the plugin's own routes stay closed (tested). The configuration and the link are managed under
  `/api/account/oidc` (session required; changes require the password). The sign-in page learns only the button label,
  whether an identity is linked and whether to redirect; the issuer and client ID are shown to the signed-in
  administrator.
- **Sessions.** An OIDC sign-in is a browser-session cookie with an eight-hour server expiry. A 30-day persistent
  session is opt-in: “Keep me signed in” (#143) for the provider button, and a saved preference for the automatic
  redirect. The choice travels to the callback in a short-lived `Lax` cookie scoped to the callback path, and the
  gateway turns it into a server header that clients cannot set. Sessions are not renewed. **Logout is local**: the
  provider's end-session endpoint is not called, so its own session may remain. Sessions do not record how they were
  opened, so removing the link ends every other session; sessions opened before a provider change made through the
  variables keep their normal expiry and can be ended in Account.
- **Second step.** The provider is responsible for verifying the person, so an OIDC sign-in does **not** ask for the
  local authenticator code, like a passkey ([ADR 0017](0017-passkey-sign-in.md)). This is stated in the interface and
  covered by a test.
- **Unavailability.** While discovery has not succeeded, starting an attempt gives a generic “unavailable” message and
  the library retries on the next attempt. Once discovery succeeded, the library keeps it: with the provider down, the
  button, if still shown, leads there and the browser shows that address's own error. The automatic redirect checks
  first. Password and passkey sign-in are never affected.
- **ID token only.** The plugin's userinfo request is disabled (`userInfoUrl` empty): the library would otherwise
  accept a token response without an ID token and take the subject from userinfo, without verifying signature,
  audience, expiry or nonce. So the ID token must carry `sub` and `email`.
- **Issuer check.** An attempt starts only if the discovered `issuer` equals the configured one. The health check also
  requires HTTPS endpoints from an HTTPS issuer and hides the button otherwise; it does not stop a request made to
  `/api/auth/oidc/login` directly, so the operator still trusts the provider's discovery document.
- **One identity, always removable.** A second identity is refused when the account row is created (callbacks run one
  at a time), removal deletes every `oidc-*` row and unfinished attempts, and it works with OIDC switched off.
- **Signing keys.** ID tokens are verified against the provider's published keys, so a provider that signs only with
  the client secret (`HS*`, Authentik's default without a signing key) cannot work. The health check says so in the
  interface and the log.
- **Limits and audit.** Starting and the callback are limited per client address like the password sign-in (ten per
  15 minutes), and “Test again” to thirty. The activity log records `login` (detail “OIDC · client”), failed logins
  like a failed password (address and count only), `oidc-link`, `oidc-unlink` and `oidc-config`; no token, claim,
  subject or secret is logged.

## Network limits (a known divergence from the issue)

Issue #147 asks for the provider's discovery, key and token requests to follow the destination policy used for
monitoring (exact origin, DNS resolved once and pinned, no redirects, private ranges only by opt-in). Better Auth's
plugin makes these requests with its own HTTP client and exposes no transport hook, and the decision here is to use
the library unmodified; the health check uses an ordinary request too. Therefore **these requests do not go through
Homora's restricted transport**: DNS is not pinned, redirects are not forbidden, and loopback or private addresses are
reachable.

**Since the issuer can be set in the interface, it is user input.** Whoever holds a session **and** the password can
make Homora request an HTTPS address of their choice, including a private one, and learn whether it looks like an OpenID
provider (no response content is shown). That is accepted for a single administrator who can already configure monitors
and integrations that reach the private network; the issuer must be HTTPS, and every change asks for the password and is
audited. A homelab provider on a private network works without any opt-in; a private certificate authority is trusted
through Node's `NODE_EXTRA_CA_CERTS`. If a future requirement needs the pinned transport, it needs either a Better Auth
hook for it or a custom flow, and a new ADR.

## Recovery, backups and risks

- The password always works. `pnpm auth:reset --oidc-only --yes` removes the link, the saved configuration and every
  session; the full reset removes them with the account.
- A saved client secret is in the database, sealed with `<database>.key`: back both up together and protect them as one
  secret set. One from the variables stays in the environment. Rotate it at the provider, then save it in Account (or
  change the variable and restart).
- Trust shifts to the provider: whoever controls the linked identity there signs in without a password or the local
  second step. Prefer provider-side MFA. Whoever holds a session and the password can point the sign-in elsewhere,
  overriding the variables; the reset script undoes it.
- Not supported: multiple providers, group/role claims, provider logout, a pinned transport.

## Validation

Automated against a real HTTP provider that signs genuine JWTs and enforces PKCE, the client credentials, the redirect
URI and single-use codes: explicit link, sign-in, session needed and password required to link, one identity,
strict cookies and the eight-hour lifetime, a `Lax` state cookie only, every token failure (issuer, audience, expiry,
nonce, unpublished key), forged, replayed, cookie-less and tampered callbacks, an unknown subject and a matching
verified e-mail refused with no account or link created, no stored tokens or secrets in responses and audit,
unavailable provider and recovery, unlinking and session revocation, provider change, forwarded headers ignored,
closed Better Auth routes, rate limits, `Secure` behind HTTPS, the reset script and configuration parsing. Browser passes are recorded in [evolution](../evolution.md),
including real Keycloak 26.4 and Authentik 2026.8.7 behind a local HTTPS proxy with a private certificate authority.
**Not verified:** other providers (Authelia, Zitadel, …), a reverse proxy with a publicly trusted certificate on a
real network, and other browsers.
