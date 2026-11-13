# 0017 — Optional passkey sign-in for the administrator account

**Status:** Accepted

## Context

The single administrator signs in with e-mail and password ([ADR 0004](0004-better-auth-web-authentication.md)),
optionally with an authenticator code ([ADR 0016](0016-two-factor-authentication.md)). Issue #149 asks for
passkeys (WebAuthn) as an optional extra way in. The separate `@better-auth/passkey` 1.7.21 plugin matches
the installed Better Auth 1.7.21; its routes, checks and storage were read in the installed package. A
passkey is bound to a relying party ID (RP ID) and to origins, and browsers only offer WebAuthn in a secure
context (HTTPS or `localhost`).

## Decision

- **Optional and additive.** Password sign-in, first-run setup and the second step keep working untouched;
  no passkey is created for anyone. Passkeys only exist for the existing account: no onboarding without a
  session and no second account (the existing user-creation hook still refuses it).
- **RP ID and origins come from configuration, never from the request.** The default RP ID is `localhost`
  with the origin `http://localhost:<web port>`. `HOMORA_PASSKEY_RP_ID` moves it to a domain; only the HTTPS
  origins of `HOMORA_ALLOWED_ORIGINS` under that domain then count (an unmatched RP ID fails at startup).
  Origins are passed to the plugin explicitly, so `Host`, `Origin` and `X-Forwarded-*` cannot select the
  verification target (tested). Addresses (`127.0.0.1`, LAN IPs) cannot be an RP ID, so passkeys are not
  offered there; the interface says so and names the address that works.
- **User verification is required, credentials are discoverable.** Registration and sign-in demand a
  fingerprint, face or PIN (`userVerification: required`, `residentKey: required`); a missing flag is refused.
  Attestation is `none`: Homora stores only the public key, credential ID, counter, transports, the
  backup-eligibility flags and the AAGUID the plugin keeps. No biometric data ever leaves the device.
- **Seven routes are forwarded**: `generate-authenticate-options`, `verify-authentication` (public) and
  `generate-register-options`, `verify-registration`, `list-user-passkeys`, `update-passkey`,
  `delete-passkey` (signed-in administrator). Bodies are validated and reduced (no `createSession`, no
  query-selected authenticator attachment or context). The plugin's registration challenge is a `GET`; the
  interface `POST`s it so the password never travels in a URL.
- **Re-authentication.** Adding and removing a passkey need the current password (shared per-account
  password-guess limit) on top of the plugin's fresh-session requirement (sessions older than a day sign in
  again first). Renaming and listing need only the session. Responses never carry the public key, credential
  ID, counter or session token.
- **Removal policy.** Any passkey, including the last one, can be removed: the password is the
  always-available method. Removing a passkey ends every other session, because sessions do not record how
  they were opened and a lost authenticator is the usual reason. Removing the last one does not touch the
  password or the second step.
- **Session policy.** A passkey sign-in follows the password rule: eight hours with a browser-session cookie,
  or 30 days with a persistent cookie when “Keep me signed in” (#143) is ticked. The form's choice reaches
  the session hook through an internal header the API sets itself (a client-sent copy is dropped, tested).
  Sessions are not renewed, `logout` and revocation are unchanged.
- **Second step.** A passkey with required user verification already combines possession and a local factor,
  so a passkey sign-in does **not** ask for the authenticator code, and the password sign-in still does.
  This is a deliberate policy, stated in the interface and covered by a test; it is not inherited from the
  plugin. OIDC (#147), when added, must choose its own policy the same way.
- **Limits and audit.** Verifying a passkey sign-in, and every registration/removal route, are limited like
  password sign-in (ten per 15 minutes per client address); requesting a challenge has a looser limit.
  Challenges are single-use, last five minutes and are bound to a signed cookie. The activity log records
  `login` (detail “Passkey · browser”), failed logins like a failed password (address and count only),
  `passkey-add`, `passkey-rename` and `passkey-remove`; no assertion, credential or name of the unknown
  authenticator is logged. Every refusal (unknown credential, bad signature, replayed, expired or wrong
  challenge, wrong origin or RP ID, missing user verification) answers the same generic error.
- **Storage.** Migration `0032` adds `passkey` with a unique credential ID and cascade deletion with the
  user. Only public data is stored, so unlike the authenticator secret of ADR 0016, **passkeys do not depend
  on the session secret** and survive a restore with another one. `pnpm auth:reset` also deletes passkeys
  (no orphan rows); `--passkeys-only` removes just them and every session.

## Recovery, domain changes and risks

- **Lost device:** sign in with the password (or another passkey), remove the lost passkey in Account (this
  ends other sessions) and add a new one. If neither works, run `pnpm auth:reset --passkeys-only --yes` on the
  server; with a lost password too, the full `pnpm auth:reset --yes`. There is no remote bypass.
- **Changing the domain or RP ID makes every existing passkey unusable**: credentials are tied to the RP ID.
  They stay in the database but never verify; remove them (Account, or `--passkeys-only`) and register again on
  the new domain. Keep the password working during the move. Moving from `localhost` to a domain is the same.
- Synced passkeys (Apple, Google, a password manager) are as safe as that account; the interface labels them
  “synced”. Homora cannot tell which authenticator or manager holds a credential.
- Cookies stay `SameSite=Strict`; the WebAuthn challenge cookie is signed and short-lived.
- Browsers differ: some do not offer passkeys on non-HTTPS or self-signed origins, and some password
  managers ignore parts of WebAuthn. Compatibility beyond what was tested below is not claimed.

## Validation

Automated: API tests with a software authenticator (registration, listing, rename, removal, replay,
tampering, wrong origin/RP ID, missing user verification, expired challenge, unknown credential, rate
limit, session lifetimes and cookies, second-step policy, closed routes, header-forged origin), RP ID and
config tests, interface tests, migration data-preservation test and script tests (backup/restore with a
different session secret, both resets, legacy databases). See `docs/evolution.md` for the browser pass that
was and was not done.
