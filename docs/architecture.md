# Homora Architecture

Homora follows a modular monolith pattern: a web application, a Node API, and an
SQLite database, distributed as a cohesive set of packages and processes. This
structure keeps single-user installation simple without precluding module extraction
if concrete requirements emerge.

Integration design and the roadmap are documented in
[integrations](integrations.md). The diagram below represents currently implemented paths;
differences between HTTP and MCP execution models are detailed further down.

```mermaid
flowchart LR
  U[User] --> UI[Web Interface]
  A[MCP Agent] --> MCP[MCP: stdio and HTTP]
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
  DA[Docker inventory agent] --> PUSH[Push ingestion]
  PUSH --> DB
  HTTP --> PUSH
  MCP --> PUSH
  REG --> EXT[Proxmox and External Services]
  MON[Monitoring: scheduler, probes, incidents] --> NP[Network policy]
  NP --> TARGETS[Monitored targets]
  MON --> DB
  MON --> NOTI[Notifications: transitions and delivery]
  NOTI --> VAULT
  NOTI --> NP
  NOTI --> OUT[Telegram, ntfy, Discord, webhook]
  HTTP --> MON
  MCP -. reads observations only .-> DB
```

## Module map

Backend (`apps/backend/src`). Folders are capabilities; the first group has an oxlint-enforced entry point
(`index.ts`), the others are organised by convention.

| Folder                                   | Responsibility                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `monitoring/`, `transfer/`, `discovery/` | Health checks and incidents; import/export formats; Docker discovery. Imported only through `index.ts`.               |
| `mcp/`                                   | MCP tools, scope binding (`identity.ts`), response filtering (`responses.ts`) and the HTTP transport (`http.ts`).     |
| `proposals/`                             | Proposal creation, review and application, batches, queries, managed (typed) proposals.                               |
| `agents/`                                | Agent identities and tokens, scopes, agent-driven changes.                                                            |
| `notifications/`                         | Transition rules, channels, delivery and localisation of outbound messages.                                           |
| `integrations/`                          | Connections, credential configuration, registry, transport, widget persistence and the legacy Proxmox migration.      |
| `routes/`                                | HTTP route modules per capability; they parse, authorise and translate, and hold no business rules.                   |
| root                                     | Composition (`server.ts`, `app.ts`), configuration domain (`service-*`), auth, vault, network policy, audit, logging. |

`mcp-server.ts` stays at the root because `dist/mcp-server.js` is the stdio entry point users configure in their clients.

Packages: `@homora/db` (schema, migrations), `@homora/shared` (contracts and validation shared by both apps; it does
**not** re-export the integration SDK or icons, so import those from `@homora/integrations` and `@homora/icons`),
`@homora/integrations` (SDK and one folder per service), `@homora/widgets` (widget contract), `@homora/i18n`,
`@homora/icons`. `@homora/shared` still imports the guest-name helpers of `@homora/integrations` in `hosts.ts`;
moving them is future work.

Frontend (`apps/frontend/src`): `pages/` compose routes, `features/<name>/` own presentation, hooks and models of one
capability (account, activity, agents, auth, connections, dashboard, discovery, hosts, probes, public-status,
settings, transfer, uptime), and `components/`, `hooks/`, `lib/` keep only what several capabilities share
(UI primitives in `components/ui`, shell and navigation, preferences, formatting). `dashboard` holds the Home (cards,
groups, filters, organize mode); `hosts` the service-to-host map, suggestions and dependencies; `uptime` the detail
view, maintenance and failure causes. A move out of the shared folders needs a single consuming capability; a new
workspace package needs an independent consumer. Route composers stay in `pages/`; `services-page.tsx` still
assembles most Home state and is the next candidate to split. Tests live next to the code, and App journey tests stay
at the application boundary. Feature-to-feature imports exist (for example settings composes public status and transfer
views); do not route them through a barrel.

Entry points: `App.tsx` owns authentication and URL routing, `dashboard-page.tsx` the authenticated shell, and the
Integrations, agents, activity, account and settings pages load on demand.

## Components and Direction

- Web interface: dashboard, settings, proposal review, and agent management.
- Application message catalogs live in `packages/i18n/src/messages`, grouped by feature. The package assembles and type-checks the English and Portuguese catalogs and separately exports notification messages and supported locales; the frontend combines them with integration-owned translations. See `packages/i18n/README.md` for adding a language.
- Frontend localization uses i18next and react-i18next with the browser language detector. The existing `homora-locale` preference, English fallback, flat keys and single-brace interpolation are retained. Integration message catalogs are registered as resources; notification catalogs are imported by the backend without loading frontend messages, and the backend returns stable error codes and English defaults, which the frontend translates. The frontend keeps typed convenience functions and locale-aware formatting around the libraries.

- HTTP API: web session authentication (Better Auth, single administrator account), Zod validation of request bodies, parameters,
  and query strings, composing routes by capability. Card and group business rules are
  delegated to the configuration module; connections employ a dedicated module for
  configuration, credentials, persistence, and observations. See [ADR 0004](decisions/0004-better-auth-web-authentication.md) for web authentication.
- Proposal services separate creation, review/application, and query/expiry/withdrawal
  workflows (`proposals/managed-proposal-creator.ts`, `proposals/proposal-review.ts`, and
  `proposals/proposal-queries.ts`); `proposals/index.ts` composes these with service proposal and batch
  lifecycle rules.
- Adapters: validate configuration and query external systems. The central registry
  exposes metadata and execution; each integration encapsulates credential structures
  and specific rate/size limits. Shared manifest contracts and form helpers live in
  `integration-manifest-shared.ts`; each built-in definition has a focused module under
  `packages/integrations/src/integrations/`, exported through the integration SDK.
- Current MCP: local stdio process and stateless Streamable HTTP endpoint with scoped token authentication. The stdio process accesses SQLite
  and the credential vault directly. MCP tool registration is composed by capability in `mcp/index.ts`;
  the `mcp/*-tools.ts` modules own tool groups, while shared authorization and response helpers
  are passed through `mcp/tool-context.ts`. Scope binding (`mcp/identity.ts`), response filtering (`mcp/responses.ts`) and discovery schemas (`mcp/proposal-schemas.ts`) are separate from transports and from the proposal domain; see [ADR 0014](decisions/0014-mcp-agent-proposal-boundaries.md). MCP tools validate inputs with Zod and provide queries
  and proposal creation without going through HTTP routes or web session cookies. They never
  persist card, group, or widget changes without human approval. Connection suggestions open a human-completed form and do not create a connection; integration queries do not return credentials.
- Persistence: SQLite, migrations, and database restore scripts are implemented.
  Credentials for connection adapters are encrypted at rest with an isolated key file;
  an old Proxmox credential file is retained after its transactional migration. Automatic key
  rotation and defense against host compromise are not yet implemented.

## Docker push discovery

A remote Docker agent reads the local Unix socket and pushes only supported discovery
labels to the backend. The ingestion endpoint uses a source-specific hashed token,
not the web session or MCP identity. The SQLite source record stores the latest bounded
inventory and receipt time. Sources expire after five minutes; rotations discard the
inventory. Card import reads a source snapshot and checks its version, freshness and
revocation within the same SQLite write transaction that applies the reviewed cards.
MCP reads the shared inventory directly and can only create reviewable proposals. Once
created, a proposal remains independently reviewable if its source is later revoked.
The local Docker source remains independent. The Docker socket remains privileged,
and the agent requires a private HTTPS path with certificate verification. See
[ADR 0003](decisions/0003-docker-push-discovery.md) and the
[Docker discovery guide](user-guide/docker-discovery.md) for limits and setup.

## Initial Domain Model

Service (name, URL, icon, group), group (name and position), integration (type, config, and secret reference), observation (status and timestamp), proposal (author, diff operations, base configuration version, expiration, and status), and audit event (actor, action, result, and timestamp).

## Security

- Mandatory authentication for web UI and MCP; dedicated identities for agents, least privilege scopes, and revocation. Never assume local network is inherently trusted.
- MCP may query and create proposals; persistent configuration modifications occur only after authenticated human review of the exact proposal. Stale, expired, or previously applied proposals are rejected. Never permit agent self-approval or unmediated external integration writes.
- Proxmox integration with least-privilege token and strict TLS certificate validation; guide users through importing trusted CAs. Never accept credentials in agent prompts or leak them via tool returns.
- Monitoring may use an optional separate check URL instead of the card link; the same destination policy applies to the actual target. Check URLs do not accept credentials, queries or fragments. The monitoring read model keeps these addresses separate; signatures use the resolved target and effective check settings. Signature-filtered raw history from before this change is not matched by the new signature, while hourly rollups remain independent of it.
- SSRF mitigation: validate destinations and redirects server-side, constrain ports and hosts, block sensitive local ranges, and re-resolve/pin DNS on connection. Private network access must be explicitly authorized per service/connection, as it is foundational for homelab setups. The instance setting `new_services_allow_private` (`app_settings`, missing = off, `GET`/`PUT /api/service-defaults`, audited as `service-defaults-update`) only seeds `allowPrivate` for `POST /api/services` when the request omits it; the form sends the value explicitly. It is not read on update, import, Docker discovery (local or push) or proposals, and toggling it never rewrites stored services.
- Supported production deployment binds to loopback by default. Additional origins must be explicitly listed in `HOMORA_ALLOWED_ORIGINS`; HTTP origins are accepted only on localhost. When using a reverse proxy, the proxy must terminate HTTPS and protect the API. The default UI bind remains loopback, and `HOMORA_BIND_IP` allows exposing it solely to a reverse proxy on the same private network without altering origin validation. The application does not trust `X-Forwarded-For`/`X-Forwarded-Proto` for authorization decisions; do not configure untrusted proxies or rely on forwarded headers to determine identity or security.
- Integration destination and monitoring policy requires an exact origin (scheme and port included in configured URL), resolves DNS once, pins the authorized IP, rejects disallowed DNS answers and redirects, enforces TLS validation, and sets strict timeouts and payload limits. RFC1918 and ULA are blocked by default; connection adapters require per-connection opt-in and service monitoring requires per-service opt-in. Special network ranges are blocked unconditionally even with this permission. The special ranges list does not guarantee coverage of all local network topologies or policies. Monitoring can additionally trust a local certificate bundle or use an explicit per-service TLS exception, both restricted to authorized private IPs; see [ADR 0021](decisions/0021-monitoring-private-tls-trust.md).
- Web authentication uses Better Auth (email and password) on the application's SQLite database: `user`, `account`, `session` and `verification` tables are versioned Drizzle migrations, and a backend test checks them against what the library requires. Passwords are hashed by the library (scrypt); sessions are stored in the database and survive restarts. Normal sign-in uses a browser-session cookie and an 8-hour server expiry; the opt-in persistent cookie and session expire after 30 days. Neither is automatically renewed. Browser session restoration can preserve session cookies. Session cookies (`homora.session_token`) are signed with a secret from `HOMORA_SESSION_SECRET` or a 0600 file created next to the database, use HttpOnly and SameSite=Strict, and get Secure when the request origin is HTTPS. State-changing operations require explicit allowed origins (checked by the API and by Better Auth's `trustedOrigins`). Sign-in is limited to 10 attempts per client in 15 minutes, counted in memory per client address; the API overwrites an internal header with the address Fastify resolved (honoring `HOMORA_TRUST_PROXY`) so clients cannot choose their own bucket, and behind an untrusted proxy this may aggregate users under the proxy's IP. Telemetry is disabled.
- Only `sign-in/email`, `sign-out`, `get-session`, the five two-step routes (`enable`, `verify-totp`, `verify-backup-code`, `disable`, `generate-backup-codes`) and the seven passkey routes (`generate-authenticate-options`, `verify-authentication`, `generate-register-options`, `verify-registration`, `list-user-passkeys`, `update-passkey`, `delete-passkey`) of Better Auth are reachable; public sign-up is closed and a database hook refuses any second account. Health status, first-run account setup and sign-in are unauthenticated to allow initial setup. Setup is rejected once an account exists and, until then, open to anyone who can reach the interface from an allowed origin (a known trade-off). Proposal reviews record the signed-in account as the reviewer. Optional two-step verification (authenticator app and recovery codes) is described in [ADR 0016](decisions/0016-two-factor-authentication.md); its secret is encrypted with the session secret, so that secret must be backed up with the database. Optional passkeys (WebAuthn with required user verification, bound to an RP ID and explicit origins from configuration, never from request headers; adding or removing one asks for the password; a passkey sign-in follows the password session lifetime and does not ask for the authenticator code) are described in [ADR 0017](decisions/0017-passkey-sign-in.md); their public keys do not depend on the session secret. Account recovery is local: `pnpm auth:reset`, or `pnpm auth:reset --two-factor-only` / `--passkeys-only` to keep the account.
- The signed-in administrator manages their own account through Homora's own routes (`/api/account`, `/api/account/email`, `/api/account/password`, `/api/account/sessions`), not through extra Better Auth paths: profile name, sign-in email, password change and active sessions, which are listed without their tokens and ended by id. Changing the email and the password both require the current password and share the same throttle (10 attempts per account in 15 minutes); the email change keeps every session, is audited as `email-change` and never writes the address to the audit log. When a request that needs a session answers 401, the frontend returns to the sign-in screen with a notice and keeps the page the person was on; a tab coming back to the foreground re-checks the session.
- The Activity feed (`GET /api/activity`) reads `audit_events`, extended with `detail` and `ip_address`: sign-ins and sign-outs, failed sign-ins, password changes, session revocations, profile changes, proposal creation/review/expiry and agent identity events. A failed sign-in stores only the client address and the attempt count, never the typed email or password. Events are kept for 365 days. Each event exposes `proposalId` when it refers to a proposal; the UI links it to the Agents tab. Agent actors carry the agent `id` besides its name. Audit writes never fail the audited action.
- Integration credentials are encrypted with AES-256-GCM using an encryption key in a separate file. `.key`, `.proxmox` and the session secret are created with file mode 0600 (the session secret also encrypts the two-step verification secret); backup and disaster recovery requires preserving and securing these files together. There is no automated key rotation or host-compromise protection. Protect the SQLite database file, backups, and persistent volumes using operating system permissions.
- Appearance is a server setting (`app_settings`), validated for contrast on write. The optional background image is processed by `sharp` (type sniffing, no animation, pixel limit, metadata stripped), stored next to the database and served behind the session with `nosniff`. Custom CSS is validated (no imports, external URLs or script features, 20 KB) and served same-origin as a stylesheet; `?safe=1` and `pnpm css:reset` recover from a broken one. No CSP header is shipped yet. Pages (`pages`, `service_groups.page_id`) group the Home into tabs; see [ADR 0023](decisions/0023-appearance-and-pages.md).
- Secrets are excluded from application logs, backups, and audit trails by default; logs have configurable retention. Backups must be encrypted if they contain credentials.
- CSRF protection, secure sessions, request rate limiting, and input validation; never execute arbitrary shell commands or scripts received from AI agents.
- Content fetched from external services is untrusted: never interpret external responses as prompt instructions for agents. Test prompt injection defenses and authorization boundaries regularly.

## Deployment and Open Decisions

React, TypeScript, Node.js, SQLite, and Docker Compose are the active implementation choices.
The default Docker image runs nginx and the backend together, with the backend bound to container
loopback and nginx on port 8080. Compose uses a persistent volume and publishes to loopback. Upgrade and recovery procedures
have documented validation, but reproducible releases and validated network exposure profiles
remain open roadmap items. A Proxmox Community Helper script can be considered once stable
releases exist.

## Current Implementation

- `apps/frontend` contains the React/Vite web application. `apps/backend` contains the Fastify
  API, stdio MCP process, authentication, integrations, network policy, and domain services.
  `packages/shared` exports shared TypeScript contracts and Zod validation; `packages/db` contains
  Drizzle/SQLite schemas, initialization, and migrations. Table definitions are grouped into
  core, monitoring, operations, and authentication modules behind `src/schema.ts`.
- Shared contracts are implemented by domain in `packages/shared/src` (`services.ts`, `hosts.ts`,
  `uptime.ts`, appearance, pages, custom CSS, and integration manifests); `index.ts` is only the
  public export barrel.
- Backend stress-benchmark setup lives in `runtime.ts`; the selected workloads are grouped into
  storage/monitor, HTTP/load, real-monitor, connection, abuse, and soak suites. Process metrics,
  server lifecycle, HTTP/load generation, monitored targets, database seeding, and reporting live
  in focused helpers under `apps/backend/bench`; `run.ts` composes the suites and `lib.ts` keeps
  their helper imports stable.
- `auth.ts` composes Better Auth and the administrator-account lifecycle. Session-secret file
  handling and bounded in-memory rate-limit storage live in `auth-session-secret.ts` and
  `auth-rate-limit.ts`; the existing auth facade exports stay stable.
- `app.ts` composes global server hooks and route modules. Routes for authentication, service/group
  configuration, agents/proposals, Proxmox, and connections reside in `routes/`. `input-schemas.ts`
  validates HTTP contracts and MCP tool inputs before invoking domain logic.
- `service-configuration.ts` composes shared card reads, host-link validation, transaction handling,
  and optimistic version concurrency across HTTP, MCP, and proposal approval. Card mutations and
  application of reviewed service changes live in `service-card-configuration.ts`.
  `service-group-configuration.ts`
  owns group/page assignment and ordering; import/export orchestration lives in
  `service-configuration-transfer.ts` and uses `transfer/index.ts` as the public interface of the
  pure format code ([ADR 0015](decisions/0015-configuration-transfer-boundary.md)).
- `apps/backend/src/transfer/` holds format contracts and parse budgets, the Homora parser, the
  Homepage and Dashy importers (icon mapping, YAML bounds and group collection in
  `importer-common.ts`), the additive planner and the serializer. It imports no routes, SQLite or
  authorization; those stay in the application service. Docker discovery reuses the collector
  through `transfer/index.ts`. `MAX_GROUP_COLUMNS` is owned by `group-limits.ts`.
- `apps/backend/src/discovery/index.ts` exposes the Docker discovery capability. `local.ts`
  validates the administrator-configured socket or proxy and performs a bounded read-only container
  list; `push.ts` owns remote source tokens, revocation, bounded inventory validation, SQLite storage,
  five-minute freshness and version checks. The separate remote agent reads its own Docker socket
  and pushes supported labels; it does not share the local source's authorization. `labels.ts` is a
  pure transformation shared by both sources and uses the transfer collector; the transfer planner
  and application service still own preview and transactional import. HTTP routes retain explicit
  review, configuration version and private-network opt-in checks; MCP requires discovery scope,
  proposal scope for writes, and human review, with a current inventory guard for remote proposals.
  Frontend discovery components and hooks own presentation and API interaction. A separate package
  was deferred: no independent consumer needs these backend-specific source and storage boundaries.
  No new socket or network access is introduced.
- `proposals/index.ts` composes proposal creation and lifecycle operations. Managed proposal preparation
  lives in `proposals/managed-proposal-creator.ts`; approval and batch review live in `proposals/proposal-review.ts`.
  Atomic batch creation and recreation of expired batches live in `proposals/proposal-batches.ts`.
  Agent token issuance, authentication, rotation, revocation, and safe listing live in
  `agents/agent-identities.ts`. Transaction, authorization and version checks are supplied by the
  proposal service.
- Appearance parsing, shared color math, and server/client contrast policy live in
  `packages/shared/src/appearance.ts`; CSS custom-property generation and DOM application are
  frontend concerns in `appearance-tokens.ts` and `appearance.ts`, respectively.
- `integrations/integration-connection-config.ts` validates stored public config and credentials and applies
  update rules for retaining or replacing secrets and certificates. `integrations/integration-widgets.ts`
  owns widget persistence and service references; `integrations/integration-connections.ts` owns connection
  persistence/encryption, observation caches, and adapter dispatch. `integrations/integration-transport.ts`
  builds the policy-bound JSON transport shared by adapter reads and Proxmox address lookups.
  Declared session profiles may perform a fixed authentication POST; session IDs remain in memory
  per connection and revision, with renewal and invalidation as described in
  [ADR 0018](decisions/0018-integration-session-auth.md).
  Route handlers parse requests and translate results into HTTP status and JSON responses.
- The monitoring capability lives in `apps/backend/src/monitoring/` (see "Monitoring capability"
  below). `observations.ts` persists and serves current observations and failure history; uptime
  SQL aggregation and summary calculations live in `uptime.ts`.
- `integrations/integration-registry.ts` builds the registry from `integrationDefinitions`
  (`packages/integrations/src/integration-manifest.ts`). Simple read-only integrations are
  **manifests**, validated at startup (`backend-manifest-validation.ts`) and run by one SDK interpreter
  (`backend-manifest-adapter.ts`); untrusted response traversal and extraction live in
  `backend-manifest-response.ts`; code adapters are registered through generated catalogs. Type enums, stored
  config keys, proposal schemas, the connection form, widget text and the catalog endpoint derive
  from the same definitions ([ADR 0009](decisions/0009-declarative-integration-adapters.md)).
  `packages/integrations/test-support/adapter-contract.ts` is the test every adapter must pass ([adapters](adapters.md)). All connection adapters use the shared
  network transport with destination policy. Legacy Proxmox credentials are copied once, at
  backend startup, into encrypted connection storage by `integrations/legacy-integrations.ts`; the bridge row and
  widget references are preserved. That module also resolves only live migrated connection ids
  for proposal validation and review. Nothing outside the migrator reads the legacy file.
  The module also owns the startup wrapper, which logs a fixed message and leaves failed
  migrations retryable on the next start.
- The stdio MCP runs in a separate process and accesses SQLite/vault directly. The stateless HTTP MCP runs in the backend at `/mcp`, authenticates a Bearer token on every request, validates host and origin, and applies a per-client request limit. Both use the same tools and proposal rules. It authenticates agent tokens
  with granular scopes, offering queries and proposal creation. It intentionally bypasses the HTTP
  stack and web cookies.
- Group, card-order, and widget proposals capture a fingerprint of groups, cards, widgets,
  and connections, including encrypted references without displaying them. They validate the
  operation in a savepoint and repeat validation inside the approval transaction. A Proxmox
  widget proposal requires an existing Proxmox connection. MCP returns proposals only to their author.
- `integration_instances` keeps the result of the last explicit test (`last_test_at`, `last_test_result`): `ok` or a short reason code (`rejected`, `http-error`, `timeout`, `unavailable`, `invalid-response`, `failed`). The service's own message is never stored. `POST /api/connections/:id/test` records it, editing a connection clears it, and `GET /api/connections` returns it as `lastTest`. Automatic reads do not write it.
- Cards may link to a Proxmox guest (`host_*` columns on `services`, ids only); `proxmox-inventory.ts` and `GET /api/connections/:id/guests` expose guest names to authenticated sessions only. Neither the public status page nor MCP returns them. See [ADR 0008](decisions/0008-service-to-host-map.md).
- Host suggestions (`host-suggestions.ts`) and the `hosts:read` / `hosts:propose` MCP scopes are described in ADR 0008. A `host-link` managed proposal sets only Homora's link; its evidence is computed by the server at proposal time.
- Favorites (`service_pins`) and acknowledgements (`service_acknowledgements`, one row per service holding the acknowledged incident id and an optional `muted_until`) are separate from the card configuration: they do not bump the configuration version and are removed with the service. Acknowledging only changes what the Home highlights; monitoring and notifications are untouched. Every change is audited (`service-pin`, `service-unpin`, `service-acknowledge`, `service-acknowledge-clear`) and pins travel in the native export (`pinned: true`). "Probable causes" are computed in the browser from the open incidents and the host links (`lib/causes.ts`).
- Extra addresses of a service (`service_links`, max 10, ordered, never monitored; `link_types` shared, max 20, unique ignoring case, deleting a type leaves the links untyped) are written with the service form in one transaction and managed by `/api/link-types`; the native export (version 4) embeds type name and color.
- Manual dependencies between cards (`service_dependencies`, acyclic, audited) feed the impact hints; MCP reads them with `list_service_dependencies` under `services:read`. See ADR 0008.
- The opt-in anonymous status page is described in [ADR 0006](decisions/0006-public-read-only-status-page.md).
- The observations migration shares the web monitor's latest results with the MCP process.
- MCP agent identity and audit queries require separate `agents:read` and `audit:read` grants. Audit queries omit IP addresses and details and are bounded by the 365-day retention window. An agent may withdraw only its own unexpired pending proposal, atomically recording the withdrawal; this does not apply configuration changes.
- See [ADR 0007](decisions/0007-service-observation-history-and-uptime.md) for observation history and uptime.
- Observations are appended with a settings signature and observation time, deduplicated and retained for 30 days (the signature is a 16-character hash prefix; at the default 60 s interval a service accumulates roughly 12 MB of history per month); monitor publication cleans old rows. A batch creates at most 20 proposals in one transaction, subject to 100 unexpired pending proposals per identity. A human reviews and decides the complete batch together. Approval checks every original fingerprint before applying all changes in one transaction and increments the configuration version once; conflicts roll back the entire batch. Partially decided legacy batches cannot be approved and their remaining proposals can be discarded.
- `agents:propose` enables identity proposals. Requested scopes must be a subset of the proposer's current scopes at creation. The reviewed diff never contains credentials; approval creates or rotates the token in the review transaction and returns it once with `no-store`. Changes to identities are audited under the human reviewer. See [ADR 0002](decisions/0002-governed-agent-proposals.md).
  Each result is tied to the service check settings; changed settings or stale results are
  reported as unknown. The backend clears old observations at startup and publishes completed
  cycles; an MCP status query does not start checks.
- A configuration change probes only services that are new or whose check settings changed (the
  monitor keeps the signature each result was measured under); it never re-probes the whole
  inventory. Publication writes only rows that changed, and idle cycles write nothing. The
  all-services uptime response is built in slices that yield to the event loop, cached for 10 s
  per range and configuration version, and shared as one `Buffer`, because the body reaches tens
  of MB on thousands of services. Import parsing refuses documents with more than 20,000 flow
  collections before the YAML parser runs.
- Probe execution and HTTP/ICMP classification live in `monitoring/probe.ts`; `monitoring/monitor.ts`
  owns scheduling, concurrency, invalidation, and publication of check cycles.
- SQLite is the primary persistent store. Schema changes are versioned migrations; session
  sessions and the administrator account live in the database; sign-in rate-limit counters and
  certain observation caches are maintained in memory.

## Monitoring capability

`apps/backend/src/monitoring/` groups everything that decides and records service health. Its public
interface is `monitoring/index.ts` (`createServiceMonitor`, `startServiceMonitor`,
`createObservationStore`, `createRollupStore`, `createIncidentStore`, `createMaintenanceStore`,
`MaintenanceError`, `serviceSignature` and the `ServiceStatus`/`CheckResult`/`StatusReason` types).
An oxlint rule rejects imports of the folder's other files from outside it.

Execution flow: `monitor.ts` (scheduler, concurrency, invalidation) -> `probe.ts` (HTTP/ICMP/TCP/DNS/TLS/
keyword/JSON classification; uses `network-checks.ts` for raw sockets and `check-body.ts` for body
matching) -> `monitor.ts` publishes results to `observations.ts` (append, dedupe, 30-day retention,
which feeds `rollup.ts` hourly rows) and to the notification callback wired in `app.ts`.
`uptime.ts` is read-side SQL aggregation; `incidents.ts` derives incidents and thresholds from history;
`maintenance.ts` stores windows. `signature.ts` hashes the check settings and is the only module also used by
notifications. Imports inside the folder are acyclic (`probe` <- `monitor`; `rollup` <- `observations`;
`signature` is a leaf); `observations` and `incidents` take only types from `monitor`.

`measurement.ts` tells a failing measurer from failing services. When at least 80% of the measured monitors
(and at least four) fail with the same `reason` in two consecutive cycles, `app.ts` stops feeding those checks
to incidents and notifications (they see them as `unknown`; the first such cycle is held back, so a real outage
that is not widespread is delayed by one cycle at most) and one global row in `measurement_incidents` is opened.
Monitors failing for another reason keep their own incidents. The first cycle that is no longer widespread
closes it; checks made while blind are never counted afterwards. It adds one inbox entry (`measurement-down`/
`measurement-up`, no service) and one audit event (`monitoring-measurement`, actor `system`), exposes
`measurement` on `GET /api/status-overview` (Home banner) and makes the public status payload carry
`monitoring: 'unavailable'` with every service `unknown` and no `down` bar since the failure started. The
observation history and uptime still record the raw failures: the uptime series is not corrected yet.

Pure versus I/O: `check-body.ts`, `signature.ts` and the classification functions in `probe.ts` are pure;
`network-checks.ts` and the probe execution do network I/O; `observations`, `rollup`, `uptime`,
`incidents` and `maintenance` take a `DatabaseSync` and do SQLite I/O; `monitor.ts` owns timers.

Boundaries that deliberately stay outside: server composition and route registration (`app.ts`,
`routes/`), schema and migrations (`packages/db`), and destination authorization, DNS pinning,
redirect and TLS controls (`network-policy.ts`, `network-request.ts`), which probes call but cannot
bypass. The MCP process only reads observations and never starts checks. No workspace package was
created; see [ADR 0013](decisions/0013-monitoring-capability-boundary.md).

## Assessment and Architectural Priorities

The architectural baseline is appropriate for an early-stage product: modular boundaries
between frontend, backend, and shared packages are well-established, external integrations
remain in the backend, the database is backed by migrations, and automated unit/integration
tests cover critical paths. Strict TypeScript, pnpm workspaces, Turborepo, oxlint, oxfmt,
Vitest, and CI provide solid engineering hygiene. Microservices or additional generic
frameworks are unnecessary.

Key areas of attention focus on consistency and safe evolution:

1. Zod validation at HTTP boundaries stops malformed payloads from reaching domain rules.
   Maintain stable external error messages and validate serialized data read back from the database.
2. The connections module encapsulates credential management, persistence, and observation
   behind clean HTTP handlers. Preserve test coverage over observable flows and refactor only
   when doing so increases cohesion.
3. MCP and HTTP share core card configuration logic, and stdio MCP maintains direct local database/vault
   access and its own token auth. Scope changes and proposal lifecycles must consider both
   interfaces; public schemas must remain strictly secret-free.
4. Extract large pages or hooks into smaller units when doing so reduces cognitive load and
   simplifies test boundaries.
5. Legacy Proxmox files remain sensitive after migration. The migration marker prevents deleted
   connections from being re-imported, and the legacy HTTP routes were removed.
6. Integration kinds, fields and display text used to be declared by hand in the registry, schemas
   and UI. They now come from one definition per integration (ADR 0009); only code adapters
   (Proxmox) still carry their own execution and Proxmox-specific rendering.

For ongoing contribution and review rules, consult [Engineering Standards](standards.md).
Structural changes affecting boundaries, persistence, security, or deployment must be recorded
in an Architecture Decision Record (ADR) alongside documentation updates.

Proposal review deadlines default to 15 minutes and are configurable from 1 to 120 minutes in SQLite. Changes affect new proposals only and are shared by the web API and both MCP transports. An authenticated administrator can recreate an expired proposal or its complete expired batch; the original diff is revalidated, no change is applied, and recreation and TTL changes are audited. Recreated proposals retain the original agent attribution; the audit records the human requester and source proposal.

Notification flow stays in the backend. `app.ts` wires the monitor publication callback to
`notifications/index.ts`, which loads and validates persisted transition state and thresholds, runs
`notifications/notification-transitions.ts`, commits the new state in a transaction, then publishes its events
to delivery. The transition tracker is an in-memory rules engine; it consumes the monitoring
public `ServiceStatus` and `serviceSignature` contract, ignores duplicate attempts and unknown
checks, and applies thresholds and cooldown. An empty publication does not delete state. A
storage failure in the callback is caught by `app.ts`; delivery is not queued if the state commit
fails. State is separate from the startup-cleared observation cache.

`notifications/notification-channels.ts` owns channel validation, CRUD, public DTOs and vault access;
`notifications/notification-delivery.ts` loads enabled channels and credentials at attempt time, formats events
with `notifications/notification-i18n.ts`, and sends through the authorized network transport. Routes expose the
facade after the application session checks. Credentials and destinations are encrypted with the
integration vault key and are never returned by the channel API. The transport resolves and pins
an authorized address, forbids redirects and validates TLS; private webhook and ntfy access needs
per-channel opt-in. Webhook events retain their structured contract; human messages use the
channel locale.

Delivery is best effort: the in-memory queue holds at most 100 waiting jobs, records overflow,
and attempts each job up to three times without delay. Failures are sanitized and recorded per
channel; retries can duplicate messages. The monitor is stopped before delivery shutdown, which
discards queued jobs and waits for the active drain. A direct channel test is outside that queue.
A separate package would have no independent consumer and would pull backend persistence, vault
and transport across a boundary; a provider registry would add indirection to four concrete
formats without a second consumer. Both are deferred. See [ADR 0005](decisions/0005-status-transition-notifications.md).

### Localization boundaries and helper audit

- API routes generally use `errorBody` with a stable code and an English default. The frontend's `apiError` maps known codes to the active language and falls back to the server text for unrecognized codes. The global Fastify handler still forwards client errors, and authentication's upstream library and MCP HTTP expose their own English/protocol errors; MCP and direct API consumers do not inherit the browser locale.
- Notification delivery persists a small set of sanitized English diagnostics for compatibility. The UI translates known historical values at display time, preserves HTTP status codes, and displays a generic translated message for unknown values. The database and API remain compatible.
- The frontend `t` and `useI18n` adapters preserve typed message keys, existing call sites and re-render subscriptions; `tOr` bridges optional integration keys and their default strings to i18next. `apiError` implements the API-specific fallback policy. Locale persistence and the document `lang` attribute remain app configuration. Date, number and text helpers call native `Intl` with the active locale. These adapters do not implement a separate translation engine.
- Catalog completeness and placeholders are checked in tests, but those tests cannot establish translation quality or prove that every possible runtime error from dependencies is localized.

## Internal widget contract

`@homora/widgets` defines configuration, localization, states, and source contracts without depending on integrations. `@homora/integrations` adapts its presentations and manifests to the contract; applications do not implement service-specific rules. Home page instances are stored separately from legacy rows. The host maintains credentials, transport, and caching; the top bar continues to use local browser preferences. See [ADR 0019](decisions/0019-widget-sdk.md) and the [widget inventory](issue-159-widget-inventory.md). Page widgets are not part of MCP.

### Short service aliases

An optional unique alias belongs to a service and resolves through the session-protected `/api/go/:alias` endpoint. The SPA handles `/go/:alias` and navigates to the validated current primary URL after authentication. The endpoint does not request the destination and responses are not cacheable. The public status page does not expose aliases.

### In-app notification inbox

Confirmed incident openings and recoveries for service cards and probes are recorded in `inbox_notifications`
within the incident transaction. Historical incident reconstruction does not create inbox entries.
`inbox_notifications.service_id` references `monitors`, so a probe's events are kept too and the list
flags them (`probe`). The inbox is independent of outbound delivery and its cooldown, and reading an
entry does not acknowledge or mute an incident. Names and incident details survive deletion while
references are cleared. The current administrator shares a single read state. Entries are pruned
at startup, insertion and listing after 90 days or beyond 10,000 entries, including unread entries. The
inbox is not an audit log. The frontend polls the authenticated API every minute.
