---
description: 'Sessions, password reset, two-step verification, passkeys and secret rotation.'
---

# Accounts, sessions and security

Homora has one local administrator account protected by a password, with optional two-step verification and passkeys. The
full security model is in [Architecture and security](../architecture.md) and the [security policy](../../SECURITY.md).

![The account page](../screenshots/account.png)

Manage your password, two-step verification and passkeys on the **Account** page in the avatar menu.

## Sessions

- Sessions are stored in the database and survive a backend restart.
- A normal sign-in lasts up to eight hours; **Keep me signed in** lasts up to 30 days. Neither renews, so sign in again
  after expiry.
- The cookie (`homora.session_token`) is `HttpOnly`, `SameSite=Strict` and, from an HTTPS origin, `Secure`. State-changing
  requests are accepted only from an allowed origin.
- Ten sign-in attempts from one client address in 15 minutes block that address until the window ends (the counter is in
  memory and resets on restart).

### The session secret

The cookie is signed with a secret kept in `<database>.session-secret` (created automatically, mode 0600) or taken from
`HOMORA_SESSION_SECRET` (at least 32 characters). Changing or losing it signs everyone out and, if you use two-step
verification, makes its stored secret and recovery codes unreadable. Back it up with the database.

## Forgot the password

Run `pnpm auth:reset` to see the account, then `pnpm auth:reset --yes` to remove the account and every session. With
Compose: `docker compose exec backend node scripts/auth-reset.mjs --yes`.

Open Homora to create a new account; cards and encrypted connections are kept. Until it exists, anyone who can reach the
interface can claim it, so do this on a private network.

## Two-step verification

Optional and off by default.

1. In **Account**, turn it on with your password.
2. Scan the QR code (or type the key) in an authenticator app and confirm a code.
3. Save the ten one-time recovery codes, shown once.

Sign-in then asks for a code after the password. Five wrong codes end the attempt, and ten in a row block it for 15
minutes. Turning it on or off signs out your other devices; turning it off or generating new recovery codes asks for the
password. Trusted devices, email and SMS are not supported. The secret and recovery codes are encrypted with the session
secret, so keep it in the same backup set as the database.

**Lost the app and the recovery codes, or the secret?** On the server run `pnpm auth:reset --two-factor-only`, then add
`--yes` (with Compose: `docker compose exec backend node scripts/auth-reset.mjs --two-factor-only --yes`). The account
and password stay, the second step is removed and every session ends. There is no remote bypass. Details:
[ADR 0016](../decisions/0016-two-factor-authentication.md).

## Passkeys

Optional and off until you add one.

- In **Account**, add a passkey with your password and your device's fingerprint, face or PIN. You can add several,
  and rename or remove them.
- The sign-in page then offers **Sign in with a passkey**; the password keeps working. A passkey sign-in skips the
  authenticator code, because the passkey already proves the device and your fingerprint or PIN.
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

## Sign in with your identity provider (OIDC)

Optional and off until you configure it. Homora supports **one** OpenID Connect provider for the one administrator
(Authentik, Keycloak, Authelia, Zitadel and similar). Your password keeps working, so a provider outage never locks
you out.

1. At the provider, create a confidential client with the **authorization code** flow and register the redirect URL
   shown in **Account** (`<your Homora address>/api/auth/oidc/callback`). Homora asks only for the `openid` scope.
2. Set the variables (in `.env`, or the environment of the container) and restart Homora:

   | Variable                                              | Meaning                                                                                                                                                |
   | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `HOMORA_OIDC_ISSUER`                                  | The provider's issuer URL, exactly as it appears in its discovery document. HTTPS only. Setting it turns the feature on.                               |
   | `HOMORA_OIDC_CLIENT_ID` / `HOMORA_OIDC_CLIENT_SECRET` | The client you created. The secret stays in the environment: it is not stored in the database or backups and is never shown.                           |
   | `HOMORA_OIDC_NAME`                                    | Label of the sign-in button (default `OpenID Connect`).                                                                                                |
   | `HOMORA_OIDC_REDIRECT_ORIGIN`                         | The address you open Homora at (default: the first HTTPS origin in `HOMORA_ALLOWED_ORIGINS`, else `http://localhost:<port>`). Start from that address. |
   | `HOMORA_OIDC_ALLOW_PRIVATE_NETWORK`                   | `true` when the provider is on a private network (192.168.x.x, 10.x.x.x…). Off by default.                                                             |
   | `HOMORA_OIDC_CA_FILE`                                 | PEM file of the private certificate authority that signed the provider's certificate.                                                                  |

3. In **Account → Sign-in provider**, confirm your password and choose **Continue**. Sign in at the provider; the
   identity you used is linked. Only that exact identity (issuer and subject) can sign in: an e-mail address, a name
   or a new account at the provider is never enough, and Homora never creates accounts.
4. The sign-in page now offers **Sign in with …**. A provider sign-in is a browser session of eight hours;
   **Keep me signed in** does not apply to it.

Things to know:

- A provider sign-in does not ask for the authenticator code: the provider is responsible for verifying you. Use
  multi-factor at the provider.
- **Sign out is local.** Homora does not sign you out of the provider.
- Removing the link asks for the password and signs out your other devices.
- Homora talks to the provider through Better Auth's own HTTP client: its address is the issuer you configured, over
  HTTPS. A provider on a private network works without extra settings; for a private certificate authority, start
  Homora with `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`. These requests do not use the restricted monitoring transport
  (see [ADR 0032](../decisions/0032-oidc-sign-in.md)).
- Your provider must release the `email` claim (Homora asks for `openid email profile`); the e-mail is never used to
  decide who may sign in.
- The provider must sign ID tokens with a key it publishes (for example RS256); tokens signed with the client secret
  (HS256) are refused. In **Authentik**, choose a **Signing Key** in the OAuth2/OpenID provider: without one it uses
  HS256 and linking fails.
- If the provider is down or misconfigured, sign in with the password. Homora says the provider is unreachable when it
  could not read the provider's configuration since it started; if it had already read it, the button still leads to
  the provider and your browser shows that address's own error page (go back to Homora).
- Changing `HOMORA_OIDC_ISSUER` makes the existing link stop working (Account says so); remove it and link again.
  Removing the variables turns the feature off.

**Cannot reach the provider, or want to detach it?** Sign in with the password and remove the link in Account. If you
cannot sign in, run `pnpm auth:reset --oidc-only`, then add `--yes`, on the server (with Compose:
`docker compose exec backend node scripts/auth-reset.mjs --oidc-only --yes`). Details:
[ADR 0032](../decisions/0032-oidc-sign-in.md).

## Rotating secrets

- **Connection credentials:** rotating the encryption key itself is not supported, and removing `<database>.key` while
  encrypted connections exist makes them unreadable (Homora will not create a new key over them). In practice, create a
  new token at the source (Proxmox, Home Assistant and so on), enter it again on the connection in Integrations, then
  revoke the old token.
- **OIDC client secret:** create a new secret at the provider, put it in `HOMORA_OIDC_CLIENT_SECRET` and restart
  Homora, then revoke the old one.
- **Agent tokens:** replace one on the Agents page with **Generate new token**, or revoke it. Revoked agents stay in a
  collapsed section for reference; the main list and count show active agents.

Treat the database, the `.key` file and backups as one secret set: anyone holding the key and the database can read the
stored credentials.
