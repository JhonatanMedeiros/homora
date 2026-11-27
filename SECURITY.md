# Security

Homora is currently in development and intended for local access. The web interface
and API are not designed for public exposure or secure remote access. Docker Compose
binds the interface to `127.0.0.1`; do not change this boundary or expose the application
behind a public reverse proxy expecting it to provide HTTPS, CSRF protection, or a
hardened remote access model.

## Reporting a Vulnerability

Do not publish details of an unpatched vulnerability in public issues or discussions.
Submit a private report through [GitHub Security Advisories](https://github.com/JhonatanMedeiros/homora/security/advisories/new).
If private reporting is unavailable, seek a private contact channel with the maintainers
before sending details; there is currently no documented security contact email.
Include affected versions, impact, and minimal reproduction steps, without real
data or real credentials. There is no established response SLA or bug bounty policy.

## Known Precautions

- While signed in, Homora checks the fixed public GitHub releases feed for release notes and
  newer stable versions every six hours. The request sends no Homora credentials, hostnames, service details or inventory, but GitHub receives
  the server's public IP address. No automatic software update is performed.
- Keep `.env`, `data/`, `.session-secret`, `.key`, and `.proxmox` files out of version control
  and with restricted permissions. Custom paths also need protection.
- The database may contain encrypted credentials; the `.key` file is required to
  decrypt them. Protect and store backups separately. Without this key,
  credentials will need to be re-entered.
- If two-step verification is on, its secret and recovery codes are encrypted with the session
  secret (`.session-secret` or `HOMORA_SESSION_SECRET`): back it up with the database and protect it
  like the `.key`. Recovery without it is local only (`pnpm auth:reset --two-factor-only`).
- Passkeys are optional. Only their public keys are stored, so they do not depend on the session
  secret; they are bound to the RP ID (`localhost`, or `HOMORA_PASSKEY_RP_ID`) and to explicit
  origins, never to request headers. Adding or removing one asks for the password. Recovery is local
  (`pnpm auth:reset --passkeys-only`). See ADR 0017.
- OIDC sign-in is optional, runs on Better Auth's generic OAuth plugin and is configured only by environment
  (`HOMORA_OIDC_*`); the client secret is never stored, logged or sent to the browser. The account is linked
  explicitly (password confirmed) to one provider/subject; e-mail never grants access, implicit linking and sign-up
  are off, and provider tokens are discarded before storage. Provider requests use Better Auth's HTTP client, not the
  restricted network transport, against the operator-configured HTTPS issuer. An OIDC sign-in does not ask for the
  local authenticator code and logout is local. Recovery: `pnpm auth:reset --oidc-only`. See ADR 0032.
- Appearance and custom CSS are administrator-controlled. Custom CSS is validated and served from
  the same origin, but Homora does not send a Content-Security-Policy header today, so treat the
  stylesheet as trusted administrator content. If it breaks the interface, open the page with
  `?safe=1` or run `pnpm css:reset`. The background image is re-encoded (metadata removed) and is
  only served to signed-in sessions; it is included in backups.
- MCP is a local read process that accesses the database and key file directly.
  Web sessions do not protect it; use only with trusted system users and MCP clients.
- Integrations are built in: they are registered in the repository, and no manifest or code is
  loaded from the database, the network or a user at runtime. A declarative adapter is data
  validated at startup and run by one reviewed interpreter (no eval, no expressions). Every
  integration request is a GET through the shared transport (destination policy, DNS pinning,
  TLS, timeouts, a 2 MB response cap) and may only carry the `authorization`, `x-api-key` and
  `accept` headers; credentials are only sent over HTTPS. Cloud integrations (Cloudflare,
  Tailscale, NetBird Cloud) call public endpoints, so an administrator must allow outbound HTTPS
  to those hosts. Reference integrations are unvalidated against live services.
- Use integration credentials with least privilege and validate TLS certificates.
  Do not disable TLS validation.
- Service monitoring blocks RFC1918 and ULA destinations by default. An
  authenticated user can enable private network access on individual services; this
  authorizes only those ranges at the exact configured origin. DNS is pinned for
  the connection, and disallowed DNS answers, special ranges, and redirects remain
  blocked. The special ranges list does not cover every local network topology policy.
  The administrator setting **New services allow private network** (off by default,
  audited) only provides the initial value for services created in the web UI;
  existing services, imports, Docker discovery and agent proposals never inherit it.
  A local monitoring CA bundle adds trust only to authorized private HTTP and TLS checks. An
  administrator may instead opt an individual service into unverified TLS for private targets;
  this is audited and visibly marked, but permits impersonation and expired certificates to appear
  healthy. Neither the bundle nor this exception is included in configuration exports. See
  [ADR 0021](docs/decisions/0021-monitoring-private-tls-trust.md).
- The Proxmox guest inventory (names, ids, state) is more sensitive than the aggregate widget.
  It is returned only to authenticated web sessions, never by the public status page or
  MCP, and cards store only ids. Homora never writes to Proxmox.
- Suggested hosts resolve a card's hostname only through the same outbound destination policy
  (a private result needs that card's own private-network authorization) and never connect to
  the card. Guest addresses are read with read-only requests; the `hosts:read` MCP scope exposes
  guest names and must be granted deliberately. A name match is never treated as evidence.
- Treat service names, URLs, and integration responses as untrusted data.

See [Import, export and backup](docs/user-guide/import-export-backup.md) and
[Accounts and security](docs/user-guide/accounts-and-security.md) for backup and recovery, and
[architecture](docs/architecture.md) for risks and planned controls. Controls
described as planned should not be assumed to be implemented yet.
