# Security

Homora is currently in development and intended for local access. The web interface
and API are not designed for public exposure or secure remote access. Docker Compose
binds the interface to `127.0.0.1`; do not change this boundary or expose the application
behind a public reverse proxy expecting it to provide HTTPS, CSRF protection, or a
hardened remote access model.

## Reporting a Vulnerability

Do not publish details of an unpatched vulnerability in public issues or discussions.
If the repository provides GitHub Security Advisories, submit a private report
through that channel. Otherwise, seek a private contact channel with the maintainers
before sending details; there is currently no documented security contact email.
Include affected versions, impact, and minimal reproduction steps, without real
data or real credentials. There is no established response SLA or bug bounty policy.

## Known Precautions

- Keep `.env`, `data/`, `.session-secret`, `.key`, and `.proxmox` files out of version control
  and with restricted permissions. Custom paths also need protection.
- The database may contain encrypted credentials; the `.key` file is required to
  decrypt them. Protect and store backups separately. Without this key,
  credentials will need to be re-entered.
- MCP is a local read process that accesses the database and key file directly.
  Web sessions do not protect it; use only with trusted system users and MCP clients.
- Use integration credentials with least privilege and validate TLS certificates.
  Do not disable TLS validation.
- Service monitoring blocks RFC1918 and ULA destinations by default. An
  authenticated user can enable private network access on individual services; this
  authorizes only those ranges at the exact configured origin. DNS is pinned for
  the connection, and mixed responses, special ranges, and redirects remain
  blocked. The special ranges list does not cover every local network topology policy.
- Treat service names, URLs, and integration responses as untrusted data.

See the [README](README.md) for backup and recovery, and
[architecture](docs/arquitetura.md) for risks and planned controls. Controls
described as planned should not be assumed to be implemented yet.
