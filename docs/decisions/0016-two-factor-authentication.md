# 0016 — Optional two-step verification with an authenticator app

**Status:** Accepted

## Context

The single administrator signs in with e-mail and password ([ADR 0004](0004-better-auth-web-authentication.md)).
Issue #148 asks for an optional second factor that works without any external service. The installed
Better Auth 1.7.21 ships a `twoFactor` plugin (TOTP, recovery codes, sign-in challenge); its behavior
was checked in the installed package, not only in the documentation of a newer version.

## Decision

- **TOTP only, optional, off by default.** No e-mail or SMS codes (the plugin's OTP method is not
  configured) and no trusted-device cookie: the API drops `trustDevice`, so every password sign-in
  that belongs to an account with the second step answers a challenge.
- **Setup is confirmed.** `enable` stores an unverified secret; the second step turns on only when a
  valid code is confirmed. Starting again replaces an unconfirmed secret. The QR code, setup key and
  the ten recovery codes are returned once, to the signed-in administrator, by the setup request;
  `get-totp-uri` and every other plugin route stay closed.
- **Only five plugin routes are forwarded** (`enable`, `verify-totp`, `verify-backup-code`, `disable`,
  `generate-backup-codes`). Bodies are reduced to `password` or `code`. Failures are mapped to Homora
  error codes that the interface translates.
- **Challenge, not session.** A correct password with the second step on answers
  `twoFactorRedirect`, deletes the session the password step created and sets a signed challenge
  cookie valid for five minutes. The interface only treats the response as a login when
  `twoFactorRedirect` is absent, and the activity log records a completed `login` only after the code
  or recovery code is verified. A recovery code also records `two-factor-recovery-used`.
- **Attempt limits.** Five wrong codes end a challenge; ten consecutive wrong codes lock the second
  step for 15 minutes (Better Auth); `verify-*`, `enable`, `disable` and `generate-backup-codes` are also
  limited per client address like sign-in (ten per 15 minutes, in memory). The plugin's default of
  three requests per ten seconds still applies.
- **Re-authentication.** Enabling, disabling and regenerating recovery codes require the current
  password. Disabling also requires a fresh session (Better Auth's one-day freshness), which includes
  “Keep me signed in” sessions older than a day: they must sign in again first.
- **Existing sessions.** Confirming or disabling the second step ends every other session; the
  current session is replaced and keeps its original end time. After the challenge, the lifetime
  follows the password step: eight hours without “Keep me signed in” (session cookie), 30 days with it.
- **Other methods.** The second step applies to password sign-in only. The OIDC sign-in (#147) and a
  possible passkey must decide for themselves whether they satisfy or bypass it; nothing is assumed.
- **Storage.** Migration `0031` adds `twoFactor` and `user.twoFactorEnabled`. The TOTP secret and the
  recovery codes are encrypted by Better Auth with the session secret (`HOMORA_SESSION_SECRET` or
  `<database>.session-secret`). The database alone cannot produce a code. Passwords, secrets, codes and
  the setup URI never enter the activity log, and none of the account responses contains them.

## Recovery and risks

- The session secret now protects more than cookies: **losing or changing it makes the stored TOTP
  secret and recovery codes unreadable**, and the second step can no longer be passed. It must be backed up
  with the database. A backup of the database without the secret does not restore two-step sign-in.
- Recovery is local and needs shell access to the database: `pnpm auth:reset --two-factor-only --yes`
  removes the authenticator secret, the recovery codes and every session while keeping the account and
  password; the full `pnpm auth:reset --yes` also removes the account and leaves no orphan 2FA row.
  There is no remote or e-mail bypass; anyone who can run the script already controls the database.
- Recovery codes are shown once; losing them with the app means using the local procedure.
- A restored backup keeps the second step only when the same session secret is used (tested).

## Validation

Automated: API tests for the challenge, wrong/expired/tampered challenges, attempt limits, recovery
codes, both session lifetimes, disabling, no leakage, closed routes and no device trust; interface
tests; migration data-preservation test; script tests for backup/restore, secret loss and both
resets. **Not performed:** a real authenticator app and a real browser pass.
