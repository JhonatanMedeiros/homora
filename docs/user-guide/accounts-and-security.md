---
description: 'Sessions, password reset, two-step verification, passkeys and secret rotation.'
---

# Accounts, sessions and security

Homora has one local administrator account protected by a password, with optional two-step verification and passkeys.
This guide covers sign-in, sessions, recovery when you are locked out, and how secrets are stored. The full security
model is in [Architecture and security](../architecture.md) and the [security policy](../../SECURITY.md).

![The account page](../screenshots/account.png)

Manage your password, two-step verification and passkeys on the **Account** page in the avatar menu.

## Sessions

- Sessions are stored in the database and survive a backend restart.
- A normal sign-in lasts up to eight hours with a browser-session cookie. **Keep me signed in** uses a persistent
  cookie for up to 30 days. Neither renews automatically, so sign in again after expiry. Browser session restoration
  may keep session cookies after you close the browser.
- The cookie (`homora.session_token`) is `HttpOnly`, `SameSite=Strict` and, when you sign in from an HTTPS origin,
  `Secure`.
- State-changing requests are accepted only from an allowed origin.
- Ten sign-in attempts from one client address in 15 minutes block that address until the window ends. The counter is
  in memory and resets on restart.

### The session secret

The cookie is signed with a secret kept in `<database>.session-secret` (created automatically, mode 0600) or taken from
`HOMORA_SESSION_SECRET` (at least 32 characters). Changing or losing it signs everyone out and, if you use two-step
verification, makes its stored secret and recovery codes unreadable. Back it up with the database.

## Forgot the password

Run `pnpm auth:reset` to see the account, then `pnpm auth:reset --yes` to remove the account and every session. With
Compose: `docker compose exec backend node scripts/auth-reset.mjs --yes`.

Open Homora to create a new account; cards and encrypted connections are kept. Until the first account exists, anyone
who can reach the interface from an allowed origin can claim it, so do this on a private network.

## Two-step verification

Optional and off by default.

1. In **Account**, turn it on with your password.
2. Scan the QR code (or type the key) in an authenticator app and confirm a code.
3. Save the ten one-time recovery codes, shown once.

Sign-in then asks for a code after the password. Five wrong codes end the attempt, and ten in a row block it for 15
minutes. Turning it on or off signs out your other devices, and turning it off or generating new recovery codes asks for
the password again. Trusted devices, email and SMS are not supported.

The authenticator secret and recovery codes are encrypted with the session secret, so keep it in the same backup set as
the database: a restore without it cannot pass the second step.

**Lost the app and the recovery codes, or the secret?** On the server run `pnpm auth:reset --two-factor-only`, then add
`--yes` (with Compose: `docker compose exec backend node scripts/auth-reset.mjs --two-factor-only --yes`). The account
and password stay, the second step is removed and every session ends. There is no remote bypass. Details:
[ADR 0016](../decisions/0016-two-factor-authentication.md).

## Passkeys

Optional and off until you add one.

- In **Account**, add a passkey with your password and your device's fingerprint, face or PIN. You can add several,
  and rename or remove them.
- The sign-in page then offers **Sign in with a passkey**, with no password typed. **Keep me signed in** applies as
  usual, and the password keeps working.
- A passkey sign-in does not ask for the authenticator code, because the passkey already proves the device and your
  fingerprint or PIN.
- Removing a passkey asks for the password and signs out your other devices.

Passkeys need a browser that offers WebAuthn (HTTPS or `localhost`) and work only on the address they were created for.
By default that is `http://localhost:<port>`, not `127.0.0.1` or a LAN IP.

For the HTTPS proxy, set `HOMORA_PASSKEY_RP_ID` to the domain (for example `example.home`, with
`HOMORA_ALLOWED_ORIGINS=https://homora.example.home`). **Changing the domain later makes existing passkeys unusable**;
remove them and add new ones. Passkeys are stored as public keys, so they survive a restore with a different session
secret.

**Lost a device?** Remove its passkey in Account from another device or after signing in with the password. If you
cannot sign in, run `pnpm auth:reset --passkeys-only`, then add `--yes`, on the server (with Compose:
`docker compose exec backend node scripts/auth-reset.mjs --passkeys-only --yes`). Details:
[ADR 0017](../decisions/0017-passkey-sign-in.md).

## Rotating secrets

- **Connection credentials:** rotating the encryption key itself is not supported, and removing `<database>.key` while
  encrypted connections exist makes them unreadable (Homora will not create a new key over them). In practice, create a
  new token at the source (Proxmox, Home Assistant and so on), enter it again on the connection in Integrations, then
  revoke the old token.
- **Agent tokens:** replace one on the Agents page with **Generate new token**, or revoke it. Revoked agents stay in a
  collapsed section for reference; the main list and count show active agents.

Treat the database, the `.key` file and backups as one secret set: anyone holding the key and the database can read the
stored credentials.
