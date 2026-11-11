# Homora Architecture

Homora follows a modular monolith pattern: a web application, a Node API, and an
SQLite database, distributed as a cohesive set of packages and processes. This
structure keeps single-user installation simple without precluding module extraction
if concrete requirements emerge.

Project comparisons and integrations roadmap are documented in
[integrations](integracoes.md). The diagram below represents currently implemented paths;
differences between HTTP and MCP execution models are detailed further down.

```mermaid
flowchart LR
  U[User] --> UI[Web Interface]
  A[MCP Agent] --> MCP[MCP Server]
  UI --> HTTP[HTTP Routes]
  HTTP --> SC[Configuration Module]
  HTTP --> PS
  MCP --> PS[Proposals Module]
  PS --> SC
  PS --> DB
  SC --> DB[(SQLite)]
  HTTP --> IC[Connections Module]
  HTTP --> REG
  HTTP --> VAULT
  IC --> DB
  IC --> VAULT[Encrypted Vault]
  IC --> REG[Integrations Registry]
  MCP --> REG
  MCP --> VAULT
  REG --> EXT[Proxmox and External Services]
```

## Components and Direction

- Web interface: dashboard, settings, proposal review, and agent management.
- HTTP API: web session authentication, Zod validation of request bodies, parameters,
  and query strings, composing routes by capability. Card and group business rules are
  delegated to the configuration module; connections employ a dedicated module for
  configuration, credentials, persistence, and observations.
- Adapters: validate configuration and query external systems. The central registry
  exposes metadata and execution; each integration encapsulates credential structures
  and specific rate/size limits.
- Current MCP: local stdio process with scoped token authentication that accesses SQLite
  and the credential vault directly. MCP tools validate inputs with Zod; provides queries
  and proposal creation without going through HTTP routes or web session cookies. Never
  persists card changes without human approval and never returns secrets.
- Persistence: SQLite, migrations, and database restore scripts are implemented.
  Credentials for connection adapters are encrypted at rest with an isolated key file;
  Proxmox retains a legacy credential file. Automatic key rotation and defense against host
  compromise are not yet implemented.

## Initial Domain Model

Service (name, URL, icon, group), group (name and position), integration (type, config, and secret reference), observation (status and timestamp), proposal (author, diff operations, base configuration version, expiration, and status), and audit event (actor, action, result, and timestamp).

## Security

- Mandatory authentication for web UI and MCP; dedicated identities for agents, least privilege scopes, and revocation. Never assume local network is inherently trusted.
- MCP may query and create proposals; persistent card modifications occur only after authenticated human review of the exact proposal. Stale, expired, or previously applied proposals are rejected. Never permit agent self-approval or unmediated external integration writes.
- Proxmox integration with least-privilege token and strict TLS certificate validation; guide users through importing trusted CAs. Never accept credentials in agent prompts or leak them via tool returns.
- SSRF mitigation: validate destinations and redirects server-side, constrain ports and hosts, block sensitive local ranges, and re-resolve/pin DNS on connection. Private network access must be explicitly authorized per service/connection, as it is foundational for homelab setups.
- Supported production deployment binds to loopback by default. Additional origins must be explicitly listed in `HOMORA_ALLOWED_ORIGINS`; HTTP origins are accepted only on localhost. When using a reverse proxy, the proxy must terminate HTTPS and protect the API. The default UI bind remains loopback, and `HOMORA_BIND_IP` allows exposing it solely to a reverse proxy on the same private network without altering origin validation. The application does not trust `X-Forwarded-For`/`X-Forwarded-Proto` for authorization decisions; do not configure untrusted proxies or rely on forwarded headers to determine identity or security.
- Integration destination and monitoring policy requires an exact origin (scheme and port included in configured URL), resolves DNS once, pins the authorized IP, rejects mixed DNS answers and redirects, enforces TLS validation, and sets strict timeouts and payload limits. RFC1918 and ULA are blocked by default; connection adapters require per-connection opt-in and service monitoring requires per-service opt-in. Special network ranges are blocked unconditionally even with this permission. The special ranges list does not guarantee coverage of all local network topologies or policies.
- Local administrator passwords are hashed with scrypt and a cryptographically secure salt; session tokens are stored in memory with an 8-hour TTL, invalidated on server restart. Session cookies use HttpOnly and SameSite=Strict; HTTPS origins set Secure. State-changing operations require explicit allowed origins. Login rate limiting is in-memory based on the socket remote address seen by the backend; behind a proxy, this may aggregate users under the proxy's IP.
- Health status, initial onboarding setup, and login are unauthenticated endpoints to allow initial setup. Onboarding is rejected once an admin account exists; logout is idempotent and clears the session cookie.
- Integration credentials are encrypted with AES-256-GCM using an encryption key in a separate file. `.auth`, `.key`, and `.proxmox` are created with file mode 0600; backup and disaster recovery requires preserving and securing these files together. There is no automated key rotation or host-compromise protection. Protect the SQLite database file, backups, and persistent volumes using operating system permissions.
- Secrets are excluded from application logs, backups, and audit trails by default; logs have configurable retention. Backups must be encrypted if they contain credentials.
- CSRF protection, secure sessions, request rate limiting, and input validation; never execute arbitrary shell commands or scripts received from AI agents.
- Content fetched from external services is untrusted: never interpret external responses as prompt instructions for agents. Test prompt injection defenses and authorization boundaries regularly.

## Deployment and Open Decisions

React, TypeScript, Node.js, SQLite, and Docker Compose are the active implementation choices.
Compose uses a persistent volume and publishes to loopback. Upgrade and recovery procedures
have documented validation, but reproducible releases and validated network exposure profiles
remain open roadmap items. A Proxmox Community Helper script can be considered once stable
releases exist.

## Current Implementation

- `apps/frontend` contains the React/Vite web application. `apps/backend` contains the Fastify
  API, stdio MCP process, authentication, integrations, network policy, and domain services.
  `packages/shared` exports shared TypeScript contracts and Zod validation; `packages/db` contains
  Drizzle/SQLite schemas, initialization, and migrations.
- `app.ts` composes global server hooks and route modules. Routes for authentication, service/group
  configuration, agents/proposals, Proxmox, and connections reside in `routes/`. `input-schemas.ts`
  validates HTTP contracts and MCP tool inputs before invoking domain logic.
  `service-configuration.ts` encapsulates card/group domain invariants, transactional updates,
  and optimistic version concurrency across HTTP, MCP, and proposal approval.
- `integration-connections.ts` orchestrates connection settings, credential encryption,
  persistence, observation caching, and adapter dispatch; route handlers parse requests and
  translate results into HTTP status and JSON responses.
- `integration-registry.ts` registers metadata and execution handlers for Jellyfin, Home
  Assistant, Uptime Kuma, AdGuard Home, and Proxmox. The four connection adapters leverage
  the network transport with destination policy; Proxmox retains its legacy vault and dedicated
  transport, but participates in the unified catalog and execution registry.
- MCP runs in a separate process and accesses SQLite/vault directly. It authenticates agent tokens
  with granular scopes, offering queries and proposal creation. It intentionally bypasses the HTTP
  stack and web cookies.
- SQLite is the primary persistent store. Schema changes are versioned migrations; session
  state and certain observation caches are maintained in memory.

## Assessment and Architectural Priorities

The architectural baseline is appropriate for an early-stage product: modular boundaries
between frontend, backend, and shared packages are well-established, external integrations
remain in the backend, the database is backed by migrations, and automated unit/integration
tests cover critical paths. Strict TypeScript, pnpm workspaces, Turborepo, ESLint, Prettier,
Vitest, and CI provide solid engineering hygiene. Microservices or additional generic
frameworks are unnecessary.

Key areas of attention focus on consistency and safe evolution:

1. Zod validation at HTTP boundaries stops malformed payloads from reaching domain rules.
   Maintain stable external error messages and validate serialized data read back from the database.
2. The connections module encapsulates credential management, persistence, and observation
   behind clean HTTP handlers. Preserve test coverage over observable flows and refactor only
   when doing so increases cohesion.
3. MCP and HTTP share core card configuration logic, but MCP maintains direct local database/vault
   access and its own token auth. Scope changes and proposal lifecycles must consider both
   interfaces; public schemas must remain strictly secret-free.
4. Extract large pages or hooks into smaller units when doing so reduces cognitive load and
   simplifies test boundaries.
5. While execution dispatch is unified, credential storage and configuration for Proxmox differ
   from connection adapters. Maintain this distinction until product requirements and a migration
   path justify unification.
6. Integration kinds are currently declared across execution catalogs, backend schemas, and UI.
   Keep these types explicit; centralize this contract when future adapters make duplication
   tangible, rather than introducing complex generic code generators now.

For ongoing contribution and review rules, consult [Engineering Standards](padroes.md).
Structural changes affecting boundaries, persistence, security, or deployment must be recorded
in an Architecture Decision Record (ADR) alongside documentation updates.
