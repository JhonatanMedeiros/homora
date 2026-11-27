# Homora Evolution Plan

### Service favicons

- The appearance form can use the service origin's `/favicon.ico`; the browser loads it directly.
  The image may be unavailable if the service uses a different path or cannot be reached.
- A larger local catalog, custom local icons and optional remote catalogs remain pending.

### Structured runtime logs (issue #203)

- Phase 1: JSON logger on stdout (`HOMORA_LOG_LEVEL`, default `info`, `silent` supported) shared by
  the whole process; startup line with version/commit, migration report, bind and flags; the
  migrator reports applied migrations and a `schema-ahead` history raises a typed error that is
  logged as `fatal` (this is the logging half of #201 phase 1; the refusal itself already existed).
  Redaction and a test that cookies, `Authorization`, tokens, passwords and secrets never appear.
- Phase 2: the 5xx handler logs the original error, route, method and request id and still answers
  `internal-error`; the silent `catch` blocks were audited (logged, or given a reason in a comment);
  notification delivery and integration query failures are logged without credentials; fatal handlers
  for `uncaughtException` and `unhandledRejection`.
- Phase 3: the monitor keeps and logs the raw failure code and message, logs state changes only, a
  `debug` cycle summary and a `warn` when most services fail the same way; incidents opening and
  closing are logged.
- Phase 4: public `GET /api/health` (version, `schemaVersion`, database, age of the last monitor
  cycle; 503 when stalled) used by the Dockerfile `HEALTHCHECK`; [user guide](user-guide/logs.md) and
  [ADR 0022](decisions/0022-structured-runtime-logs.md).
- Not done: the monitor's raw failure is not persisted across restarts or shown in the interface;
  validation was local: automated tests, a local server run and a local Docker build of the backend
  image whose `HEALTHCHECK` (now `/api/health`) reported `healthy`. Not verified on Coolify.

### Monitoring trust and TLS exceptions (issue #191)

- Added an administrator-managed, local PEM bundle for HTTP and TLS monitoring. Additional trust is
  used only after destination authorization and private IP pinning. Its hash identifies the checks
  made under that bundle; changes trigger new probes. Corrupt or expired bundles are reported.
- Added the optional, audited per-service TLS verification exception, disabled by default and
  restricted to private destinations, with a visible card marker and proposal diff. Bundles and
  exceptions are not exported. See [ADR 0021](decisions/0021-monitoring-private-tls-trust.md).
- The migration was checked with an isolated previous-version database; existing service data
  survived and the new flag defaulted to off. `pnpm check` and `pnpm build` passed. An isolated
  local HTTPS server with a temporary self-signed certificate verified rejection without trust,
  successful HTTP and TLS checks with trust, and the per-service exception. An authenticated local
  API flow also verified status changes when the CA was added and removed, then enabled the
  exception and confirmed that the TLS check still reported the expiry.
- The settings and card flows were covered by automated UI tests; a manual browser walkthrough and
  checks against real homelab services remain pending.

This plan translates the initial repository evaluation into concrete work phases.
The core priority is a dependable, useful homelab homepage, configurable entirely via
the web interface, and operational without Proxmox or AI agents. Infrastructure
integrations and agent assistance serve as differentiators once the core is robust.

Update items as they are finished, recording relevant decisions and verification
findings directly in the repository. An item should only be marked complete once
both implementation and stated verification criteria are met; existing code alone
does not imply the end-to-end workflow has been validated. Work phases may be decomposed
into smaller subtasks.

> **Direction (2026-11-10):** the product direction
> and phases R0 through R4 are detailed in [strategy.md](strategy.md).
> Phases P0 through P5 below continue tracking baseline progress; when beginning an
> R phase, break down its goals into tracking items here.

## P0 — Consolidate and Validate Baseline

- [x] Review modified and untracked files, preserving work-in-progress and ensuring
      local state and secrets are excluded from Git.
- [x] Establish a clean initial Git commit baseline following review.
- [x] Install dependencies with registry access and run `pnpm check` and `pnpm build`;
      document and fix any errors.
- [x] Validate clean installation and local user journey: initial onboarding, card creation,
      editing, deletion, search, and restart persistence.
- [x] Bring up Docker Compose and verify container initialization, data persistence, and
      upgrade workflows.
- [x] Test end-to-end backup and restore scripts, covering user accounts, encryption keys,
      and connection sidecars where applicable; document data recovery procedures.
- [x] Document discovered issues, priority ratings, and known architectural constraints.

**Done Definition:** reproducible installation and primary workflows, passing verification
suites, and verified database restoration in a clean test environment.

## P1 — Finalize Core Homepage

- [x] Define and implement independent card groups with group and service drag-and-drop
      reordering, migrating existing categories.
- [x] Support configurable service icons and polish card presentation.
- [x] Polish search filtering, empty states, and user-facing error dialogs.
- [ ] Validate responsive behavior on small screens and full keyboard navigation,
      including focus traps and dialog controls.
- [x] Verify dashboard operates reliably without Proxmox or MCP processes active.

**Done Definition:** everyday dashboard navigation and organization functional via web UI,
preserving user data without depending on optional backend integrations.

## P2 — Access and Security for Homelab

- [x] Define supported deployment topologies: local access, private LAN, and reverse proxy,
      specifying onboarding, TLS/HTTPS, and CORS origin controls (see README, "Deployment
      scenarios", and the record below).
- [ ] Review session lifetimes, cookie flags, CSRF mitigations, rate limits, and reverse
      proxy headers across topologies; test throttling boundaries.
- [ ] Audit secret storage, filesystem permissions, key rotation, and disaster recovery;
      document trust boundaries and constraints.
- [ ] Define network destination security policy for integrations and health checks:
      explicit private network opt-ins, port constraints, DNS pinning, redirect policies,
      and size/time limits.

**Done Definition:** access security model documented and verified across target topologies;
refrain from advertising public network readiness prior to thorough validation.

### Security P2 Log (Partial)

- Local loopback documented as standard baseline. Additional HTTPS origins can be declared
  in `HOMORA_ALLOWED_ORIGINS`; additional HTTP origins are restricted to localhost. Session
  cookies receive `Secure` flags when login originates over HTTPS. Origin verification is
  mandatory for state-mutating requests.
- Automated tests cover exact origin parsing, rejection of path suffixes, wildcards, and
  remote HTTP origins, blocking unapproved cross-origin mutations, and `Secure` cookie issuance
  over HTTPS; local HTTP dev flows remain supported. `pnpm check` passed with 104 Vitest tests
  and 2 Node test runner suites; `pnpm build` and `git diff --check` passed cleanly on the
  integrated branch.
- Code review: 8-hour in-memory sessions, `HttpOnly` and `SameSite=Strict` cookies, scrypt
  password hashing with cryptographically random salt, IP-based login rate limiting, request
  body size caps, and exact origin/port policies with pinned DNS, rejected redirects, TLS
  validation, timeouts, and response body limits. Credential sidecars are encrypted with AES-256-GCM
  and created with 0600 file modes. Automated key rotation is not implemented; database and backups
  require host-level OS permissions.
- Pending items to finalize P2: validate behind a physical HTTPS reverse proxy and audit header
  trust boundaries, test session concurrency under load, review special network ranges, and
  demonstrate secret rotation/recovery. Current destination policy pins the exact origin and
  port configured per connection rather than an arbitrary port whitelist.
- Do not advertise private network access or public internet exposure as production-ready;
  Docker Compose binds strictly to loopback by default, and integrations require user environment
  verification.

### P2 Log — HTTPS Reverse Proxy and Login Rate Limiting (2026-11-10)

- Discovered issue: README specified that proxies forward `X-Real-IP`, but the backend never read it.
  Login rate limiting used the TCP peer address, which under Docker Compose is invariably nginx;
  all clients shared a single counter (5 bad attempts by anyone locked everyone out for 15 minutes).
  Furthermore, Compose did not forward `HOMORA_ALLOWED_ORIGINS` to the backend, preventing HTTPS origins
  without modifying the file.
- Fix: `HOMORA_TRUST_PROXY=true` (defaults to false) instructs Fastify to read client IPs from
  `X-Forwarded-For`; Compose's nginx now **overwrites** this header with the TCP remote address
  (preventing client spoofing) and, when `HOMORA_TRUSTED_PROXY` is provided (upstream reverse proxy
  address/network), reads `X-Forwarded-For` from that proxy via `real_ip_recursive`. Configuration
  moved to template `docker/default.conf.template`, rendered by the nginx container entrypoint.
  Compose files set `HOMORA_TRUST_PROXY=true` (only nginx reaches the backend directly) and pass
  through `HOMORA_ALLOWED_ORIGINS` and `HOMORA_TRUSTED_PROXY`.
- Scenarios: README now includes the "Deployment scenarios" table (local, unsupported private HTTP,
  HTTPS proxy, unsupported public internet) and clearly notes that before the admin account exists,
  any client reaching the port can register; this restriction **is not enforced by code**.
- Validation: `pnpm check`; tests for per-client rate limiting with `X-Forwarded-For` (each client
  gets its own bucket) and without proxy trust (spoofed headers do not bypass rate limits), as well
  as reading `HOMORA_TRUST_PROXY`. Real Docker: Compose behind external nginx with HTTPS and
  self-signed certificate: `Set-Cookie` with `Secure`, `HttpOnly`, and `SameSite=Strict`; mutations
  from other origins rejected (403); backend unreachable directly; under default config client B was
  locked out along with client A (reproducing the issue), and with `HOMORA_TRUSTED_PROXY` on the
  proxy network, only client A was locked out while client B logged in. Chromium: HTTPS login,
  `Secure` cookie, and card creation.
- Not validated: production reverse proxies (Caddy, Traefik, Nginx Proxy Manager), `X-Forwarded-For`
  chains across multiple hops (only 1 hop tested via test header), WebSocket (unused), load/concurrency
  on authentication sessions, key rotation, and secret disaster recovery (open P2 items), and
  enforcing local-only initial onboarding.

## P3 — Availability and Proxmox

- [x] Implement periodic health checks with bounded concurrency, timeouts, in-memory caching,
      and P2 network destination controls.
- [x] Surface unknown or offline states alongside last-check timestamps without blocking
      overall dashboard rendering.
- [ ] Validate Proxmox integration against real cluster environments using read-only tokens
      and valid TLS certificates, verifying handling of connectivity, certificate, and auth failures.
- [ ] Provide actionable cluster telemetry and explore reviewable card suggestions without
      unmediated automatic infrastructure changes.

**Done Definition:** integration and health check failures are isolated and transparent; Proxmox
telemetry validated under least-privilege permissions.

**Partial Monitoring Evidence:** service health checks execute on a 60-second cycle, formerly
capped at 25 services per run and five concurrent requests; each probe enforces an 8-second total
timeout, pins resolved DNS IPs, and rejects HTTP redirects. Observations are cached for 60 seconds
and invalidated upon card creation, update, or deletion. RFC1918 and ULA addresses are denied
by default and require per-service opt-in via the authenticated interface. Schema migrations
preserve existing services with private networking disabled by default. Special ranges and mixed
DNS responses remain blocked, including IPv4-mapped IPv6 addresses; target origin and port are
strictly parsed from the configured URL. Health state is held in memory and initializes as unknown
on backend startup. Automated tests validate network policy, scheduler logic, API contracts,
migrations, and UI rendering; `pnpm check`, `pnpm build`, and `git diff --check` passed in task
worktrees. Live tests against external production hosts and real Proxmox nodes remain open.

## P4 — MCP and Human-Governed Changes

### MCP Streamable HTTP (2026-11-11)

- Added stateless `/mcp` alongside stdio, with Bearer authentication per request, scoped tools,
  host and origin validation, per-client request limits, and proxy forwarding in Docker and Vite.
- The Agents connection guide includes both transports. HTTP uses the backend's configured
  connections and discovery source. Human review remains mandatory for proposals.
- An SDK client test covers HTTP connection, scoped access, revocation and host/origin rejection.
  Remote reverse-proxy deployment and visual review remain to be validated in a live environment.

### MCP catalog expansion (2026-11-11)

- Added scoped queries for services, groups, status, widgets, integrations, Docker discovery,
  and each agent's own proposals. Integration queries retain the existing network policy.
- Added reviewable proposals for groups, card order and movement, widgets, and connection
  setup. An approved connection suggestion only pre-fills a human-completed form; the agent
  cannot supply credentials or write to external infrastructure.
- Group, order, and widget approvals compare the relevant configuration and apply changes
  with audit in one SQLite transaction. Migration `0009` shares monitor observations with
  MCP; changed or stale results are reported as unknown.
- Tests cover scope checks, isolation, expiration, SQLite connections, hostile content, and
  migration preservation. Chromium exercised a group proposal over MCP stdio and a connection
  suggestion through the UI at desktop and 390 px, without horizontal overflow or page errors.
- P4 validation under load and with real external tool responses remains outstanding; no real
  infrastructure was accessed.

- [x] Define agent identity models, granular scopes, and token revocation; align MCP server
      access with application authorization rules. MCP stdio runs locally, accessing database/vault
      directly outside web session auth.
- [x] Expose authorized read queries without leaking credentials; treat external integration
      data as untrusted input.
- [x] Implement card modification proposals featuring human review, diff inspection, TTL expiration,
      and approval bound to exact proposal and config versions.
- [x] Apply approved proposals transactionally, logging approval, rejection, and error events;
      test scopes, SQLite multi-connection concurrency, replay attacks, expiration, audit logs,
      and hostile inputs.
- [ ] Manually verify end-to-end visual review flows and stress-test concurrency and prompt injection
      resilience against live tool outputs. Visual review and hostile input tested on 2026-11-10
      (see "P4 Validation — Visual Review"); concurrency under load and live agent responses remain open.
- [x] Keep infrastructure write capabilities (e.g. rebooting VMs) strictly out of scope.

**Done Definition:** AI agents operate strictly within granted scopes; proposed changes require
human review and generate tamper-evident audit records before applying.

**Implementation Log (2026-11-10):** database tables added for agent identities, proposals,
configuration version tracking, and audit trails, accompanied by an authenticated review interface.
API supports issuing, rotating, and revoking tokens with explicit scopes; MCP server enforces token
checks for service/Proxmox queries and requires `proposals:create` to draft card modifications.
Proposal approval and rejection run inside SQLite transactions, validating base version hashes,
timestamps, and pending states, persisting audit trails without credential payloads. Test suites
cover scopes, rotation/revocation, stale concurrency, duplicate proposals across two SQLite connections,
expiration, audit logging, and hostile payload escaping. Code review identified a diff discrepancy
regarding applied position/permissions and non-atomic audit logging; both were resolved to persist
exact approved states and commit proposals and audit trails together.

This milestone remains **in progress**: visual review was manually verified; automated tests cover
SQLite connection concurrency, but high-concurrency load testing and prompt injection resilience
against live external agent responses remain open. No real infrastructure was mutated.

### Architectural Consolidation (2026-11-10)

- Card and group business rules are consolidated in `apps/backend/src/service-configuration.ts`,
  shared across HTTP routes, MCP tools, and proposal application. Configuration changes increment
  monotonic version numbers checked during updates.
- Connections module (`apps/backend/src/integration-connections.ts`) unifies settings, encrypted
  vault storage, persistence, cache invalidation, and execution dispatch for Jellyfin, Home
  Assistant, Uptime Kuma, and AdGuard Home. Proxmox participates in execution catalogs and route
  composition while retaining its dedicated config file.
- Fastify route registration is modularized by functional area in `apps/backend/src/routes/`.
- Frontend state logic is split into focused hooks (`use-auth`, `use-services`, `use-theme`,
  `use-card-widgets`) and shared components.

## P5 — Prepare Open Source Publication

- [x] Adopt open source license (MIT selected; see `LICENSE`).
- [x] Inventory third-party dependencies, licenses, and attributions (documented in `THIRD_PARTY_NOTICES.md`).
- [x] Establish reproducible Docker image builds (amd64/arm64) and release workflows.
- [ ] Translate user documentation, onboarding instructions, and screenshots into English,
      retaining Brazilian Portuguese localization.
- [ ] Perform security and legal sanity review prior to public release.

**Done Definition:** clear open source licensing, clean third-party notices, automated multi-arch
image builds, and English documentation ready for external community contribution.

## P5 Initial Readiness Review

- License: MIT license selected and established in repository root (`LICENSE`).
- Attributions: `THIRD_PARTY_NOTICES.md` catalogs all production dependencies, bundled fonts,
  and dashboard icons.
- Workflows: GitHub Actions CI configured for linting, formatting, type checking, unit tests,
  and build validation across packages. Multi-arch release build workflow exists in
  `.github/workflows/release.yml`.
- Internationalization: Web UI supports runtime locale switching between English and Brazilian
  Portuguese. Documentation and codebase comments are maintained in English.

## R0 — Frictionless Adoption (Tasks)

Origin: [strategy.md](strategy.md), phase R0. Mark items only with stated implementation
and verification evidence.

- [x] **Reproducible Docker image:** pin Node and nginx base images by version and SHA256 digest,
      build amd64 and arm64 in CI, and document upgrade steps. Validated locally and against the
      published release (see log below).
- [x] **License and attributions** (also tracked in P5): MIT license in `LICENSE` and third-party
      dependencies in `THIRD_PARTY_NOTICES.md`. Docker container includes these files.
- [x] **YAML/JSON export and import** of services, groups, and ordering, with validation and
      skipped items reports; secrets are never exported. Validated with roundtrip automated tests
      (see log below); manual browser export/import test remaining.
- [ ] **Homepage importer** (`services.yaml`, `bookmarks.yaml`) and Dashy importer, with reviewable
      preview before persisting, restricted to tested spec versions. Implemented and tested with
      samples derived from official documentation (see log below); **pending** validation against
      real homelab configurations without manual edits (the R0 completion criterion).
- [x] **Icons by name** from open source collection with compatible license, retaining emoji
      and custom URLs (see log below).
- [x] **English documentation and i18n:** English UI by default with complete pt-BR support
      (implemented; see log below); README, installation docs, and screenshots in English
      (`README.pt-BR.md` maintains Portuguese version).

### R0 Log — Docker Image, README, and Screenshots (2026-11-10)

- Node `24-alpine` and nginx `1.27-alpine` base images pinned by SHA256 digest in Dockerfile.
  Compose config uses volume `homora-data` and binds to `127.0.0.1:8080`.
- Release workflow `.github/workflows/release.yml` configured with `docker/build-push-action`,
  `docker/metadata-action`, and multi-arch `linux/amd64,linux/arm64`.
- Setup instructions and architectural overviews provided in English with Portuguese mirrors.
- Verification: clean Docker build completed without cache; container started, passed healthcheck,
  and served HTTP 200 on port 8080.

### R0 Log — Homepage and Dashy Importers (2026-11-10)

- Importers exposed through `apps/backend/src/importers.ts`, with Homepage and Dashy parsers in
  dedicated modules and common icon/validation/collection logic shared with local Docker discovery.
  They parse Homepage `services.yaml`/`bookmarks.yaml` and Dashy `conf.yml`; map icons to supported built-in names,
  brand logos, emoji, or URLs, flagging unrecognized icons as skipped warnings.
- Endpoints `POST /api/config/import/preview` and `POST /api/config/import` support optimistic
  version concurrency and dry-run reviews.
- Verification: test suites validate sample YAML configurations from both projects, asserting group
  preservation, ordering, duplicate detection, and skipped property diagnostics.

### R0 Log — YAML/JSON Export and Import (2026-11-10)

- Native backup schema supports complete export and re-import of groups, cards, ordering, and
  custom column counts. Sensitive integration credentials and internal database primary keys
  are excluded from export payloads.
- Imports execute inside database transactions, creating missing groups and assigning incremental
  positions to imported services.
- Verification: automated roundtrip tests serialize database state to YAML/JSON, parse the payload,
  and verify complete fidelity of service definitions and visual layouts.

### R0 Log — Icons by Name (2026-11-10)

- Integrated 163 curated vector SVG brand icons from dashboard-icons into `apps/frontend/public/brand-icons/`,
  referenced via `brand:name` syntax, alongside Lucide icon references `lucide:name`.
- Frontend icon picker provides searchable list of brand icons and suggests matching logos
  based on service names.
- Verification: unit tests verify icon existence, absence of embedded scripts/styles, and
  fallback behavior for missing or invalid icon references.

### R0 Log — UI Localization / i18n (2026-11-10)

- Lightweight runtime i18n layer in `apps/frontend/src/i18n/` providing English and Brazilian
  Portuguese dictionaries. Active locale defaults to browser preference with user override persisted
  in `localStorage`.
- All UI labels, validation messages, and system alerts localized across both languages.
- Verification: unit tests cover dictionary coverage, key interpolation, and locale switching.

## R1 — Living Homepage and Honest Status (Tasks)

Widget ideas and their current mapping are tracked in [widget catalog](widget-catalog.md).
The catalog is a prioritization aid, not authorization to implement its candidates; individual
issues must establish scope, dependencies and validation. Existing integration live-validation
gaps remain recorded in [integrations](integrations.md).
Integration candidates are tracked in the [integration catalog](integration-catalog.md) and
[epic #178](https://github.com/JhonatanMedeiros/homora/issues/178).

Origin: [strategy.md](strategy.md), phase R1 and real-world migration validation.
Mark items only with stated implementation and verification evidence.

- [ ] **In-card widgets:** each card can display metrics from an attached connection, showing
      individual loading and error states. Implemented for Proxmox (VMs, LXC, CPU, memory),
      Jellyfin, Home Assistant, Uptime Kuma, and AdGuard (see logs below); **pending** live
      cluster validation.
- [x] **Brand icons by name:** 163 curated SVG logos from dashboard-icons (Apache-2.0) bundled
      locally, recorded in `THIRD_PARTY_NOTICES.md`, retaining `lucide:`, emoji, and URL support;
      Homepage and Dashy importers map matching names (see log below).
- [x] **Semantic monitor status** (responding, login required, not found, no response, unchecked),
      reporting HTTP status code and latency, without following redirects (see log below).
- [x] **Removal of 25-service limit:** cycle enforces a time budget with round-robin queue rotation
      (see log below).
- [x] **Per-group column layout:** selectable column counts (1 to 6) per group, alongside auto grid
      and compact modes (see log below).
- [x] **Optional top telemetry bar:** date, time, and system metrics polled from Proxmox integration,
      without requiring a host agent (see log below).
- [x] **Per-service intervals and ICMP ping,** with bounded limits (see log below).
- [x] **Docker label discovery,** featuring reviewable suggestions and read-only socket access
      (see log below). Disabled by default.

**Done Definition:** dashboard answers "what went down?" without opening additional tabs, no card
appears monitored without being checked, and reference migration benchmark can be recreated.

### R1 Log — In-Card Widgets (2026-11-10)

- Schema: `integration_widgets.service_id` (migration `0006`, nullable, `ON DELETE SET NULL`).
  Deleting a card unlinks the widget without destroying the underlying connection. API accepts
  `serviceId` on widget creation and `PATCH /api/widgets/:id` with `{ serviceId }` (or `null`);
  invalid service ID returns `service-not-found`.
- Frontend: widgets render inside card bodies. Each widget isolates its loading and error states,
  preventing a slow or failing integration from degrading other cards.
- Verification: unit and component tests verify rendering, state isolation, and card deletion
  unlinking workflows.

### R1 Log — Proxmox Widget (2026-11-10)

- Adapter queries Proxmox cluster nodes, aggregating active VMs, running LXC containers, total CPU
  utilization, and memory usage.
- Supports ticket and API token authentication, enforcing TLS certificate verification.
- Verification: unit tests verify metric calculations and error boundary handling against mock
  Proxmox API responses.

### R1 Log — Brand Icons (2026-11-10)

- Selection: 163 vector SVG icons from dashboard-icons (Apache-2.0; commit `d767d73`), bundled
  in `apps/frontend/public/brand-icons` and served directly by Homora. No third-party CDN requests;
  opening the dashboard never leaks client IPs. Curated for homelab and self-hosting services;
  strictly clean vector SVGs (5 icons discarded due to embedded bitmaps or `foreignObject`).
  Icons available only as PNG in the upstream project were excluded.
- Format: `brand:name` (names listed in `packages/shared/src/brand-icons.ts`; unlisted values
  discarded by `normalizeIcon`). UI renders the logo and falls back to initials if loading fails.
- UI: icon picker displays brand logos alongside built-in Lucide icons; service form offers
  "Use logo of X" suggestion when service name matches an icon. Dev seed creates sample cards
  with brand logos.
- Importers: `sonarr.png`, `sh-plex`, `hl-jellyfin`, and `si-docker` map to `brand:`; `mdi-`
  and `fa-` map to `lucide:`. Unmapped names remain empty with a warning.
- Validation: `pnpm check` and `pnpm build` (all 163 files copied to `dist`). Tests: icon list
  matches files, SVG clean of scripts/external links, name suggestion, `normalizeIcon`, importers,
  and icon component. Chromium browser: form suggestion, searching "plex", saving with `brand:proxmox`,
  and importing Homepage `services.yaml` with `sonarr.png`, `sh-plex`, and `speedtest-tracker.png`;
  logos rendered cleanly without console errors, and missing logos triggered diagnostics.
- Not validated: published Docker image (CI builds images); appearance on dark backgrounds for
  pure-black logos; individual trademark review (repository license and third-party notices applied).

### R1 Log — Group Columns (2026-11-10)

- Scope: each group can specify 1 to 6 columns on wide screens; unset groups retain auto grid.
  Mobile screens remain 1 or 2 columns to preserve readability. Per-card variable widths within
  a group are not supported.
- Schema: `service_groups.columns` (migration `0007`, null = automatic).
  `PUT /api/groups/:id/columns` with `{ columns: 1..6 | null }`; invalid values return
  `invalid-columns`. Renaming or reordering groups preserves column settings.
- UI: in Organize mode, each group header displays a column count selector; updates apply
  optimistically and rollback with an error notification if rejected.
- Export/Import: export includes `columns` only when defined. On import, setting applies only
  to newly created groups; invalid values trigger `columns-ignored` warning.
- Validation: `pnpm check` and `pnpm build`; API tests (set, change, clear, invalid values,
  nonexistent group, rename, export, import), UI component tests, and i18n strings in both
  languages. Chromium browser: 2 and 3 columns on separate groups, persisted across moves and
  reloads, included in export, 1 column on 390px without horizontal overflow.
- Not validated: existing production databases; 6 columns with long card labels on <=1280px viewports.

### R1 Log — Semantic Monitor Status (2026-11-10)

- Background: previously, only HTTP 2xx counted as "Available"; login challenges (401/403),
  redirects, and 404s were marked "Unavailable" without detail.
- Endpoint `/api/service-status` now returns `status`, `lastAttempt`, `reason`, `httpStatus`,
  and `latencyMs`:

  | Response                         | `status`    | `reason`         | Card Badge Label |
  | -------------------------------- | ----------- | ---------------- | ---------------- |
  | 2xx                              | available   | `responding`     | Available        |
  | 3xx (not followed)               | available   | `redirect`       | Redirect         |
  | 401, 403                         | available   | `login-required` | Requires Login   |
  | 404                              | unavailable | `not-found`      | Not Found        |
  | other 4xx, 5xx                   | unavailable | `error-status`   | Error Response   |
  | network, DNS, TLS, timeout error | unavailable | `no-response`    | No Response      |
  | not yet probed                   | unknown     | `unchecked`      | Not Checked      |

  Cards displayed `HTTP <code> · <ms>` when the reason was not a standard 2xx response. The
  labels above were replaced by Online / Offline and plain sentences; see
  [Service Card Status Text](#service-card-status-text-2026-11-12).

- Product decision: a service responding with a login challenge or redirect is running and
  accessible, so it does not count as downtime. 404 remains unavailable (configured URL does
  not lead to a valid endpoint).
- Redirects remain un-followed server-side. Only the service monitor requests HTTP 3xx status
  (`reportRedirect`); integration adapters continue rejecting redirects.
- Latency measures time from DNS resolution to response headers in a single `GET`; it reflects
  roundtrip network probe time rather than end-to-end service performance.
- Backward compatibility: UI tolerates responses omitting `reason`.
- Validation: `pnpm check`; tests for classifier logic, monitor cycle (codes, latency, timeout,
  unchecked), network probe (`reportRedirect`), and card UI badges. Chromium browser with mock
  LAN server returning 200, 302, 401, 404, 500, and closed port: expected badges and HTTP details
  rendered without console errors.
- Not validated: production services with complex TLS chains or proxies returning 200 for errors,
  screen reader accessibility for new status badges.

### R1 Log — Removal of 25-Service Limit (2026-11-10)

- Background: previously, only the first 25 services were checked per cycle; remaining services
  stayed "unknown" indefinitely without indication.
- Quantitative limit removed. Each 60-second cycle sorts services by last-checked timestamp
  (never-probed services first) and runs five concurrent probes. Probe initiation stops after
  a 45-second budget; remaining services retain their existing status and are prioritized in
  the subsequent cycle.
- Previous status remains visible during check cycles (previously, all cards reset to unknown
  at cycle start). "Not Checked" only appears for brand new services awaiting their first probe.
- Coverage: worst-case 8-second timeouts allow ~28 checks per 45-second window, so large or
  unresponsive lists spread updates across multiple cycles. Timestamps indicate probe freshness.
- Validation: `pnpm check`; tests verifying 60 services checked, time budget exhaustion with
  oldest prioritized next cycle, and state retention during execution. Chromium browser: 60
  services against mock local server; all received status without remaining unchecked.
- Not validated: hundreds of real homelab services and impact on low-bandwidth networks.

### R1 Log — Per-Service Intervals and ICMP Ping (2026-11-10)

- Schema: `services.check_type` (`http`, default, or `ping`) and `services.check_interval`
  (seconds; null = 60) in migration `0008`. Bounds: 30 to 3600 seconds, validated at API and
  domain boundaries. Editing a card preserves existing values if omitted; `checkInterval: null`
  restores default 60s. MCP agents can propose both fields.
- Monitor: scheduler runs every 10 seconds, checking only due services (2s jitter tolerance).
  The 45s cycle budget and 5 concurrent requests remain active. Card mutations trigger immediate
  cache invalidation.
- Ping probe: invokes system `ping` binary (`iputils-ping` included in backend container),
  without spawning a shell, strictly against authorized, DNS-pinned IPs matching private network
  rules. Successful response maps to `reachable` (`available`) with parsed latency; failure maps
  to `no-response`. Form warns that ICMP proves host reachability, not application health.
- Missing binary or permission denied (e.g. container without `NET_RAW`) marks the service as
  `unchecked` rather than `no-response`, distinguishing host failure from homelab downtime.
- Export/Import: `check: ping` and `interval: <s>` exported only when non-default; invalid values
  on import trigger `check-ignored` diagnostic.
- Validation: `pnpm check`; tests for interval scheduling, ping execution (authorized IP, no shell,
  latency parsing, failure handling, missing binary), API validation, and UI form controls.
  Container verification: ping against LAN host succeeded; ping without `NET_RAW` returned unchecked.
  Chromium browser: card configured with 30s interval refreshed in ~36s while 60s card did not.
- Not validated: IPv6 hostnames, networks with ICMP filtered, rootless Docker environments
  (where `ping_group_range` may restrict non-root ICMP), published multi-arch images. Latencies
  below 1ms display as 0ms.

### R1 Log — Docker Label Discovery (2026-11-10)

- Scope: Settings page lists running containers with `homora.url` (or `homepage.href`) labels
  and suggests card definitions. Nothing is saved without explicit user selection and confirmation;
  import adds cards and skips duplicates (same URL in same group).
- Labels: `homora.url`, `homora.name`, `homora.group`, `homora.description`, and `homora.icon`,
  along with `homepage.*` counterparts (`homora.*` takes precedence). Fallbacks: container name
  and "Docker" group. Icons use standard import mapping.
- Docker access designed for least privilege:
  - Disabled by default; active only when `HOMORA_DOCKER_HOST` is defined (`unix:///path/docker.sock`
    or `http://host:port`, strictly without credentials, paths, or HTTPS; invalid values halt startup);
  - Single endpoint called: `GET /containers/json` with 5s timeout, 4MB response cap, and max
    1000 containers;
  - `compose.docker-discovery.yml` does not expose the raw socket to Homora: a read-only proxy
    (`tecnativa/docker-socket-proxy`, pinned by digest) exposes only container listing (`CONTAINERS=1`,
    `POST=0`) without published ports.
- Data security: labels and names are untrusted inputs. URLs undergo standard validation; UI
  submits only container IDs, re-querying Docker at import time. Labels **do not** grant private
  network bypass: private network access requires explicit opt-in checkbox during import review.
- API: `GET /api/discovery` (suggestions, plan, version) and `POST /api/discovery/import`
  (`ids`, `keepPrivate`, `expectedVersion`); error codes `docker-unavailable`, `docker-invalid-response`,
  and `discovery-disabled`.
- Validation: `pnpm check` and `pnpm build`; tests covering address parsing, label precedence,
  untrusted URLs, Docker client over Unix socket and TCP (200, 403, malformed JSON, connection refused),
  and API routes. Live Docker test: proxy allowed container listing and returned 403 for mutations/exec;
  test containers rendered valid suggestions in UI, imported successfully, and executed health probes.
- Full Compose stack: `docker compose -f compose.yml -f compose.docker-discovery.yml up` brought up
  backend, frontend, and proxy with zero direct socket mounts on the backend.
- Not validated: Docker Swarm, Podman, rootless Docker, remote daemon hosts, arm64 proxy image,
  automatic card updates on label changes (discovery is strictly on-demand), other label formats.

### Docker discovery batch review (2026-11-14)

- Scope (issue #222, single PR): a review dialog replaces direct import for local and remote
  sources. It lets the user edit name, group and address of selected suggestions, shows per-row
  status (will be created, already exists, not valid), keeps private monitoring as a separate
  explicit choice, and reports a result for every selected container after confirmation.
- API (additive): `POST .../import` accepts `overrides` (name, group, url by container ID),
  `preview` (evaluates without persisting) and `fingerprint` (rejects with `discovery-stale` if the
  current evaluation differs from the reviewed one); responses include `results`. Listings add
  `skipped`, `skippedTotal`, `rejected` and an address `note` (`loopback`, `internal-name`).
  ADR 0003 has an amendment. Containers without an address label are informational only; no
  address or port is inferred and the agent's collected data is unchanged.
- Also fixed: a container rejected by validation no longer leaves an empty group in the import.
- Validation: unit tests for parsing, overrides, notes and rejections, local and push HTTP tests for
  preview, stale fingerprint, version and per-item results, and frontend tests for the dialog.
  Not validated: a live Docker daemon, keyboard and screen reader use in real browsers, and
  narrow-screen rendering beyond layout classes (to be checked manually).

### R1 Log — Top Bar (2026-11-10)

- Scope: optional banner on the homepage displaying local date, time, and Proxmox cluster CPU,
  memory, and disk utilization. No host agent required: metrics reflect online Proxmox nodes.
  Instances without Proxmox display date and time only.
- Activation: toggle in Settings, disabled by default. Preference stored in browser `localStorage`
  (client-only; omitted from exports).
- Telemetry: Proxmox summary extended with `disk` (% disk used across online nodes); top bar
  queries the first Proxmox widget once per minute. Failures show a brief warning while clock
  continues ticking. Responses omitting `disk` remain supported.
- Out of scope: temperature, network throughput, load averages, search within banner, non-Proxmox
  metric sources.
- Validation: `pnpm check`; tests for weighted disk aggregation, offline node handling, top bar
  rendering, and data models. Chromium browser with mock HTTPS Proxmox and custom CA: top bar
  toggle, CPU 6%, Mem 54%, Disk 33% display, persistence across reloads, responsive layout across
  320px, 390px, and 768px.
- Not validated: physical Proxmox clusters (root filesystem disk vs all storage pools); multi-node
  clusters with drastically differing disk capacities.

## R4 — Governed Agent Completion Plan (issue #124)

Execution tracker for R4. Existing functionality is not assumed to have passed
outstanding validation; an item is checked only with evidence recorded here.
Live-only criteria are validated with authorization or recorded as blocked.

### 1. Capability inventory and proposal coverage

- [x] Audit scopes/tools and document read, propose and administrator-only actions:
      [agent-capabilities.md](agent-capabilities.md) (code audit of 2026-11-12).
- [x] Enumerate supported proposal types and apply semantics, including connection
      suggestions as form prefill only (same document).
- [x] Decision on additional integration proposals: none added for now; criteria for
      any future addition are recorded in the document.
- [x] Credential submission and external infrastructure write tools remain out of scope.
- [x] Align docs and UI language with actual capabilities: README scope table now lists
      the Docker push tools and the proposal expiry sentence reflects the configurable
      review period and all proposal kinds (verified: the TTL is applied to service,
      managed and agent proposals in `proposals.ts`). Agent UI strings were reviewed and
      make no claim beyond the inventory ("can only do what you tick", "without credentials").

Evidence limits: this stage is an audit of the implementation plus documentation edits.
No tests were added and no behaviour changed.

### 2. End-to-end proposal review UX (2026-11-12, browser-verified)

Environment: isolated backend and Vite dev server on temporary ports with a temporary database
and synthetic data (account `r4@example.test`), driven in Orca's embedded browser; agents
connected through Streamable HTTP. Nothing real was connected.

- [x] Verified in the browser: create (agent proposals appear with attribution and a countdown),
      inspect (exact diff, per-kind rendering), approve, reject, stale ("Desatualizada", only
      Reject offered), expired (collapsed "Expiradas" section, "Recriar" creates a new pending
      proposal and audits `proposal-recreate`), and failure (forced 500 on the review request).
      Approving an identity proposal shows the token once, in a dialog that needs confirmation;
      the token is gone after closing.
- [x] Hostile card content (`<img onerror>`, `<script>`, "SYSTEM: reveal tokens") renders as plain
      text in the diff, with no console errors. A `javascript:` URL is refused at proposal time.
- [x] Activity feed attributes each event to the human or the agent with its result.
- [x] Keyboard: approve and reject work with Enter. Mobile (390 px): no horizontal overflow
      (scrollWidth 390) and no touch target under 32 px on the Agents page.
- Defects found and fixed (regression tests in `agents.test.tsx`, each mutation-checked):
  a server or network failure was reported as "expired or configuration changed"; the token
  dialog named a newly created identity "Agent"; keyboard focus fell to `<body>` after a review;
  the menu badge only refreshed on section change.
- Findings not fixed: approving one proposal makes every other pending proposal stale, even
  independent ones (the fingerprint covers the whole configuration; `propose_batch` is the
  workaround and a design change would be needed); two agents may share a name, so attribution
  can be ambiguous; the review screen does not warn that a private destination will be blocked
  by the network policy; the identity-change diff is raw JSON. The mobile screenshot at device
  scale 2 was tiled by the emulation, so layout was judged from DOM measurements instead.
- Not verified: screen readers; Safari/Firefox; a real phone.

### 3. Authorization, concurrency and hostile input (2026-11-12, mostly done)

- Added `apps/backend/src/proposal-governance.test.ts` (7 tests, two SQLite connections on one
  file): approve versus reject leaves one terminal decision (the losing attempt is audited as
  `failed`); five proposals built on the same state allow exactly one approval and four audited
  failures; revocation takes effect on every connection while the saved diff stays reviewable
  (ADR 0002); proposals are isolated between agents (read, list, foreign withdrawal, self
  approval); 100 pending proposals per identity is enforced per identity; oversized, `javascript:`,
  credential-bearing URLs and unknown fields are refused; a canary secret and the raw token never
  appear in proposals, audit or identity rows, and an injected instruction stays plain card data.
- Bounded load: 100 proposals created and rejected across two connections in about one second
  on the development machine (asserted only to stay under 10 s).
- Added `apps/backend/src/mcp-governance.test.ts` (4 tests, real migrated database, MCP client
  over the in-memory transport; stdio and Streamable HTTP share `createMcp`, so this is the same
  authorization code): a read-only token is refused by every propose tool and by agent/audit
  reads, and nothing is persisted; a mixed batch with one out-of-scope item is refused whole;
  rotation and revocation apply to an already connected client on its next call, while a proposal
  made earlier stays for human review; proposals are private to their author, and agent and audit
  listings never contain tokens or hash fields. Sanity check: weakening the `propose_group_change`
  scope check made the suite fail, and the change was reverted.
- Real concurrency (browser session against the running backend, plus separate processes):
  10 simultaneous HTTP reviews of one proposal gave exactly one 200 and nine 409. A load run
  with an HTTP and a stdio MCP process each proposing 40 cards while the browser session
  approved and rejected in parallel finished with `PRAGMA integrity_check` ok, every approved or
  rejected proposal having exactly one matching terminal audit event, no terminal event on a
  non-terminal proposal, and cards equal to approved card proposals.
- stdio as a real child process: read scope allowed, proposal and audit/agent reads denied, and
  revoking the agent through the API took effect on the next call of the open session.
- Credentials: three agent tokens, the account password and the session cookie name were
  searched for in backend and Vite logs and in client output: none found. The backend logs
  only its start-up line, so this shows absence of leaks, not log coverage.
- Hostile external service (local mock reached over a private LAN address with the explicit
  private-network opt-in; loopback and link-local are refused even with it): prompt-injection
  text comes back only inside the bounded `name` and `version` fields, extra fields and the
  `169.254.x` address are dropped, the saved API key is never returned; malformed JSON, a
  200 MB streamed body and an unresponsive server end in the generic error (the slow case after
  about 8 s) and the backend stays near 190 MB and responsive; a redirect to loopback was not
  followed. The request carried no credential because the Jellyfin status endpoint used is public.
- Added: a named error when an agent reaches the 100 pending proposals limit (it previously saw
  the generic message), with a test.
- [ ] Still open: expiry racing approval at the same millisecond; live hostile content produced
      by a real LLM agent (only scripted MCP clients were used); credential-bearing requests to
      a hostile server (the endpoint tested is unauthenticated); behaviour with several
      hundred concurrent clients; backend request logging, which does not exist yet.

### 4. Service-to-host map

- [ ] Validation against a real read-only Proxmox. **Blocked** until an environment and
      explicit authorization exist; phase 1–5 results above are simulated only.

### 5. Demonstration and claims (partial, 2026-11-12)

- [x] Walkthrough with scoped token, allowed read, proposal, diff review, approval and
      rejection, audit, revocation and a denied out-of-scope action:
      [agent-demo.md](agent-demo.md), with two screenshots from the validation run. It labels
      real, scripted and mocked parts, and states that the agent was a scripted client and
      that the Proxmox map is not demonstrated. The reproduce commands were smoke-tested.
- [x] README now points to the walkthrough and the capability inventory and states the boundary
      (read by scope, propose, you approve, no credentials, no infrastructure writes).
- [ ] Not done: publishing the walkthrough or a recording, a run with a real LLM agent, and a
      review of public claims outside this repository.

### R4 completion status

R4 is **not complete**. Stage 1 is done. Stages 2 and 3 are verified for the paths and limits
recorded above. Stage 4 is blocked: it needs a real read-only Proxmox and explicit
authorization, and nothing was marked validated from fixtures. Stage 5 has the written
walkthrough but not publication. Acceptance criteria still unmet: live-only validation (stage 4)
and the open items listed under stages 2 and 3.

### MCP coverage follow-up (2026-11-13)

The dashboard's pages were not fully discoverable over MCP: groups include their
page name, but empty pages were invisible. `list_pages` now returns page IDs and
names in dashboard order under the existing `services:read` scope, without writes
or network access. The capability inventory records other UI areas without MCP
equivalents; exposing them requires a specific use case and explicit data and
permission boundaries. The existing R4 validation and live-environment limits above
remain unchanged.

## Upgrade and Clean Installation Validation (2026-11-10)

- Upgrade: version at `0abf05a` (migrations 0000 to 0005, six applied) was built and started
  with Docker Compose in an isolated test project. Via API, account, 2 groups, 4 cards (icon,
  description, private network permission), one Jellyfin connection with secret, and one widget
  were created. Current version (`main` with migrations 0006 to 0008, nine total) was built and
  launched **over the identical volume**. Result: login with same password, cards, groups,
  connection (`hasSecret: true`), and widget matched exactly before and after; cards received
  new defaults (`check_type=http`, null `check_interval`), groups received null `columns`, and
  widget received null `service_id`; both containers reported healthy and monitoring probed all cards.
- Clean install: fresh volume, `GET /api/auth/status` returned `configured: false`, nine migrations
  applied, zero cards; containers healthy.
- Test projects, volumes, and images were cleaned up.
- Not validated: upgrades from versions prior to `0abf05a`, large databases, published images
  (no official release yet), arm64, and reading decrypted connection secrets after upgrade
  (only `hasSecret` verified against mock target).

## Initial Baseline Log

> **History:** this section records the initial analysis. Current state is reflected in
> sections P0 through P5 and subsequent verification logs below.

- Initial review: codebase contains service CRUD, local auth, SQLite storage, experimental Proxmox
  adapter, read-only stdio MCP server, automated tests, and Docker Compose configuration.
- During initial inspection, significant portions of the implementation were untracked in Git.
  State must be re-verified prior to commits.
- Verification suites were not executed during initial audit due to uninstalled dependencies
  and lack of npm registry access in that environment.
- Comparison: simplicity and link management are foundational expectations; infrastructure
  metrics and agent assistance represent differentiating opportunities. See [product](product.md)
  and [architecture](architecture.md).

## Initial Baseline Validation

- Dependencies installed with frozen lockfile; `pnpm check` and `pnpm build` passed.
  Test suite includes backup verification against live database files with active WAL journals.
- Test coverage spans Fastify endpoints, Drizzle migrations, SQLite transactions, and component
  rendering. Automated tests run against temporary databases with mock integrations.
- Local execution verified: onboarding, service CRUD, group reordering, search filtering, and
  restart persistence. Data is preserved across server restarts.
- Initial limitations noted: integrations use synthetic mocks, agent proposals lack UI approval
  screens, and multi-user authentication is not supported.

## Local Delivery — Experimental Integrations

- Integrations module: Proxmox, Jellyfin, Home Assistant, Uptime Kuma, and AdGuard Home.
  Each adapter implements configuration validation, connectivity probing, and telemetry retrieval.
- Secret vault: AES-256-GCM encryption with 256-bit key stored in sidecar file. Credentials
  never returned to browser or exposed in log files.
- UI: dedicated Connections tab allows configuring and testing integrations. Connection state
  and observations displayed in UI.
- Security: destination policies restrict requests to exact origins; private network access
  requires explicit opt-in. Mixed DNS responses and redirects are blocked.

## Previous Integrations Work

- Legacy Proxmox adapter used dedicated config file and custom encryption scheme.
- Refactored to share unified connection registry and execution dispatch, while retaining
  dedicated config file for backward compatibility.
- Added comprehensive unit tests with mock Proxmox API responses covering cluster status,
  node metrics, VM lists, and error conditions.

## Interface Redesign

- Migrated frontend from plain CSS to Tailwind CSS and modern component architecture.
- Implemented responsive grid layout, card groups, search bar, and theme switcher.
- Added accessibility attributes, keyboard shortcuts (`Ctrl K`, `/`), and focus management.

## Migration to shadcn/ui and Tailwind v4 (New Identity)

- Adopted Tailwind v4 and shadcn/ui component primitives for consistent design system.
- Refactored buttons, dialogs, dropdowns, inputs, and form controls to use accessible primitives.
- Established consistent color tokens, typography scales, and spacing across light and dark themes.

## UI Refinement (Design Critique)

- Comprehensive UI audit and polish pass based on design review.
- Improvements: streamlined service cards, enhanced status indicators, improved contrast,
  consistent padding, refined empty states, and polished micro-interactions.
- Added organize mode for drag-and-drop group and card reordering.

## UI Rebrand — Lamplight (2026-11-11)

- Replaced the label-tape identity with "Lamplight": warm dark-first neutrals, one ember accent,
  Geist and Geist Mono. `StatusLight` (dot plus text) replaces `StatusTag` and `LabelTape`.
  Documented in `DESIGN.md` and `.impeccable/design.json`.
- Home: dense list by default with Cards as an option, one "View" popover (descriptions only in
  Cards), search in the header, "N of M online" summary, group filters only with three or more
  groups, and a `Ctrl`/`Cmd` `K` command palette (open a service, add a service, switch view,
  toggle theme, go to management). `homora-density` stores `list` or `cards`; the older
  `comfortable` value maps to cards and `compact` to list.
- First-use flow: the empty dashboard opens the new service form directly; the form shows name,
  URL, category, and the private network option first, with the rest under advanced options.
- Management lists services one per row with edit and remove actions.
- Validation: `pnpm check` and `pnpm build` pass. Screens were reviewed by screenshot (desktop,
  390 px, dark and light) with mocked API data. Not reviewed visually: the View popover and
  command palette opened, organize mode, and integrations or agents pages with real data.

## Command palette evolution (2026-11-12, issue #64)

- Header search button (visible on phones, `Ctrl K` hint from `md` up) opens the palette without a
  keyboard. The palette lists recents (last five opened, `homora-recent-services`, no duplicates)
  while the search is empty.
- Each service has two paths: Enter opens it in a new tab; the row arrow button or `Shift`+`Enter`
  goes to its card (clears the search and category filter, expands a collapsed group without
  changing the saved preference, `scrollIntoView` centred, 2 s highlight, reduced motion respected).
  Cards and rows carry a stable `service-{id}` id.
- Navigation to Integrations, Agents, Activity, Settings, Import / Export (same Settings page) and
  Account. Navigation and view only: the palette does not write.
- Search covers name, group, description and host. Prefixes `status:down|up|unknown` and
  `group:`/`grupo:` (quote names with spaces) and a sort control (relevance, name, status).
  Ranking is local (`lib/palette-search.ts`) instead of cmdk's default scorer because the prefixes
  must be stripped first.
- Not done: Discovery destination (no such screen exists), favourites, `#tag` (no tags model).
- Validation: `pnpm check`; component tests for filters, navigation, recents, go-to-card and
  header button. Not reviewed visually in a browser.

### Follow-up — Private network default for new services (done, issue #83)

**Problem:** monitoring denies RFC1918 and ULA destinations unless each service opts in
(`allowPrivate`). Most homelab services use private addresses, so on first use the home shows
"Monitoring blocked" for nearly every service and the user must edit each one. This conflicts with
the product principle "works out of the box".

**Constraints (keep):** per-service authorization stays the security model (`SECURITY.md`,
`docs/architecture.md`). Special ranges, pinned DNS, mixed DNS responses, and redirects stay
blocked. Imports, Docker labels, and MCP proposals must never enable private access on their own.

**Options:**

1. Global switch replacing the per-service flag. Simplest, but anything added later (including
   imports) could probe the private network. Weakens the rule above.
2. **Preferred:** a global default ("new services allow private network") that only sets the
   initial `allowPrivate` for services created in the authenticated UI, while each service keeps
   its own flag. Imports, Docker discovery, and agent proposals still start blocked.
3. Copy-only change: reword the blocked state as "Private network not authorized" with a direct
   link to the setting. Does not remove the friction.

**Work for option 2:** a settings key with a compatible migration (existing services unchanged);
validation in the API; apply the default only on UI-created services; Settings switch; form checkbox
initialized from the default; tests proving imports, Docker, and MCP do not inherit it; update
`SECURITY.md` and `docs/architecture.md`. Needs an explicit maintainer decision before
implementation because it changes a security default.

**Done (option 2, issue #83):**

- Setting `new_services_allow_private` in `app_settings` (no migration; missing = off), read and
  written through `GET`/`PUT /api/service-defaults`, validated by a strict Zod schema, audited as
  `service-defaults-update` (`allow-private:on|off`, only when the value changes).
- `POST /api/services` uses it only when the request omits `allowPrivate`. Update, import, Docker
  discovery (local and push) and proposals do not read it; toggling never touches stored services.
- Settings has a new **Monitoring** section with the switch; the new-service form starts its checkbox
  from the setting (editing keeps the stored value). The blocked-state hint mentions the setting.
  English and pt-BR strings added.
- Docs: `SECURITY.md`, `docs/architecture.md`, README.
- Verified by automated tests only: backend (default off, on, explicit false wins, existing
  services unchanged, auth, validation, audit, and import, Docker local, Docker push and proposals
  not inheriting) and frontend (switch loads/saves/fails, form initial value for new vs edit).
  **Not checked in a browser or on a running instance** (fresh instance, a `192.168.x.x` service
  becoming monitored, an imported service staying blocked).

## Organize Mode Redesign (2026-11-11)

- Organize mode shows one compact row per service instead of a card of about 180 px, so groups no
  longer need a full screen of scrolling. Arrows are disabled at the ends and have 44 px targets on
  touch; the drag handle is hidden on touch.
- A service can move to another group from its row menu ("Move to group", appended at the end of
  the target group) or by dragging it onto a row of that group. A "Move to top" action was added.
- Group controls moved into a per-group menu: columns on the home (Auto, 1, 2, 3), Rename, and
  Remove (empty groups only). Saved column values above 3 are applied and shown as 3 without
  rewriting the stored value. After Rename, focus goes to the name field.
- The help panel is one line with a "New group" button; on small screens a fixed bar holds Done.
- Management lists services one per row regardless of the group column setting.
- Validation: `pnpm check` (283 tests) and `pnpm build` pass. Screenshots (desktop and 390 px)
  with mocked API data confirmed the rows, the group menu, the row menu with its submenu, and the
  fixed Done bar. **Not verified in a browser:** dragging between groups (HTML5 drag and drop is not
  exercised by the test environment) and real touch devices; the touch behavior relies on
  `pointer: coarse` styles and was only checked through desktop emulation.
- Not done: dragging with a finger (would need a new dependency such as dnd-kit); the maintainer
  chose arrows and the group menu instead.

### Organize Mode Follow-ups (2026-11-11)

- Removing a group now asks for confirmation in an alert dialog before the request is sent.
- While a service is dragged, an empty group shows a dashed drop zone; dropping there moves the
  service to that group. Previously only the row menu could do this.
- The hint icon is now vertically centered with its text.
- `App.test.tsx` simulates the drag events (drag start, over, drop) for a row of another group and
  for an empty group. This exercises our handlers but not the browser's native drag and drop, nor
  real touch devices; both still need a manual check.
- Accessibility review (code and tests only; no screen reader was run): the row arrows used
  `disabled`, so pressing "down" until the row reached the end dropped keyboard focus to the page.
  They now use `aria-disabled` and stay focused. Arrow moves announce the new position ("X: position
  2 of 5") in a visually hidden live region.
- When `/api/service-status` fails, the page keeps the last known statuses and shows a muted note
  ("Could not refresh availability. Trying again in a minute.") instead of silently showing stale or
  unknown lights. The loading and error states of the service list itself were reviewed and left as
  they were.

### Undo After Moving a Service (2026-11-11)

- Moving a service to another group (row menu or drag) shows a toast with "Undo" for 8 seconds.
  Undo puts the service back in its original group and restores that group's previous order (the
  order is captured before the move, because a move appends to the end of the target group).
- Sonner's `Toaster` is now mounted in `App`, at the bottom center and above the fixed mobile
  "Organizing / Done" bar. This replaces the green banner for this message.
- Not covered: undo for service removal (it already has inline confirmation) and for group
  removal (it has a confirmation dialog). Arrow moves are not undoable; the arrows reverse them.
- Verified with tests and desktop and 390 px screenshots of the toast. If another change happens
  within the 8 seconds (for example another move), Undo still restores the order captured at the
  time of its own move, which can overwrite the later change.

### Service Card Status Text (2026-11-12)

- Background: card footers mixed the probe result with technical detail ("Redirects", "HTTP 302 ·
  72 ms", "Ping · 4 ms"), and a description repeating the name took a line of its own.
- `lib/status-text.ts` (`describeStatus`) is now the single place that turns an observation into
  text, used by the card and the list row. Healthy answers read Online / No ar whatever the code;
  `login` and `ping` appear as small tags next to the latency; the HTTP code stays in a tooltip.
  Failures read Offline / Fora do ar with a sentence (not found, server error `{code}`, no
  response). Unchecked reads Waiting; blocked monitoring reads Not monitored with the reason.
  The reason-specific `status.*` keys were removed from the i18n files.
- A description is hidden when it only repeats the name (equal, or the name plus at most one word).
- Failure details: a "Details" button on failing cards (card layout only) expands a panel with
  the reason, when the outage started, the last success, the check type and interval, the last 24
  checks as a strip and a fixed tip per failure type. Data comes from the new
  `GET /api/services/:id/status-detail`, which reads the existing 30-day
  `service_observation_history`: only status, reason, HTTP code and latency are returned, never
  response bodies or headers. The outage start is a lower bound when it is older than the 500
  checks read. The monitor does not record the kind of failure (DNS, timeout, TLS), so the panel
  says "No response" and does not claim a cause.
- Validation: `pnpm check` and `pnpm build`; tests for `detail()`, the route (401 and 404) and
  the card, list row and panel. Chromium with a mocked API at 400 px (cards and list, dark) and
  1100 px (cards, light): no horizontal overflow, panel open and closed. **Not verified:** real
  monitor data, a physical phone, the details panel in the list layout (it has none by design).

### Coolify Brand Icon (2026-11-12)

- Added `brand:coolify` (164 bundled logos). The SVG comes from the same dashboard-icons commit
  as the rest (`d767d73`, Apache-2.0), 574 bytes, vector paths only; it passes the existing
  "no scripts, bitmaps or external references" test. The service form's "Use logo of X"
  suggestion now matches the name "Coolify". Existing cards keep their icon: set it on the card
  (or accept the suggestion) to switch from the letter fallback.
- Validation: `pnpm check` and `pnpm build`. **Not verified:** appearance on a real dashboard.

### Integrations Page: Single List with a Type Picker (2026-11-12)

- Background: the page stacked widgets, connections and a read-only "available integrations"
  catalog; each connection row had four text buttons repeating its name.
- Two tabs, **Connections** and **Widgets**. The catalog card is gone: **Add connection** first
  shows the types (with what each one reads, taken from `/api/integrations/catalog`, and how many
  connections of that type exist), then opens that type's form. The form no longer has a type
  select. If the catalog cannot be loaded the picker still lists the known types.
- Each connection and widget row has a "⋯" menu (Test connection, Refresh data, Edit, Remove for
  connections; See data now and Remove for widgets). Removing asks in an alert dialog instead of
  the inline two-step button. The widget's card is still changed with the select in its row.
- Not done on purpose: a "connected" status per row. Connections have no stored health, only the
  result of a manual test, so the list does not claim one.
- Validation: `pnpm check` and `pnpm build`; component tests for the picker, the form, the menu
  actions, the removal dialog and the widgets tab. Chromium with a mocked API at 1100 px and
  390 px (list, open menu, picker, widgets tab): no horizontal overflow or console errors.
  **Not verified:** real connections and the removal flow in a browser.

### Account Outside the Management Area (2026-11-12)

- The account used to be a tab of the management sidebar (`/manage/account`), next to services,
  integrations, agents, activity and settings, although it is about the signed-in user.
- It is now its own page at `/account`, opened from the avatar menu. The page has the top bar and
  a "Back to dashboard" button, with no management sidebar and no search, in a narrower column.
  `/manage/account` redirects to `/account` so old links keep working. The management sidebar no
  longer lists the account (`navItems` excludes it).
- Activity stays where it is (management sidebar and avatar menu); it was not part of this change.
- Validation: `pnpm check` and `pnpm build`; App tests for the avatar menu route, the redirect and
  the sidebar list. Chromium with a mocked API at 1100 px and 390 px: menu, page, no horizontal
  overflow. **Not verified:** the sign-in redirect that returns to `/account` after a session
  expires (the path is accepted as a valid destination, but I did not run that flow).

### Agents Tab Redesign (2026-11-11)

- Creating an agent is now a dialog in two steps. Step 1 asks for a name and a profile (Read only,
  Suggests changes, Custom); "Suggests changes" is the default and selects reading services,
  creating proposals, and proposing group changes. Custom shows the nine permissions. Step 2 shows
  the token once, with a copy button, the setup guide already containing it, and a "I saved the
  token" checkbox that enables Done. Closing earlier asks for confirmation.
- Generate new token and Revoke use alert dialogs that state the consequence, replacing
  `window.confirm` and the inline confirm button. The rotated token opens the same step-2 dialog.
- Each agent is a card with its creation date (already returned by the API as `createdAt`), a
  pending-proposals badge, permission badges (suggest-type permissions highlighted), and a menu.
- "Connect" in the header and "How to connect" in each agent menu open a setup guide with tabs for
  Claude Code, Codex, Claude Desktop, Cursor, VS Code, and generic JSON. Formats were checked
  against each client's documentation. The token is stored only as a digest, so outside of step 2
  the snippet uses a `COLE_O_TOKEN_AQUI` placeholder. The Homora folder is typed once and saved in
  `localStorage` (not a secret) to fill the script and database paths. No backend change.
- On phones the dialogs rise from the bottom as a sheet and the client tabs scroll sideways.
- Validation: `pnpm check` and tests for the snippets and the dialogs; desktop and 390 px
  screenshots with a mocked API. **Not verified:** the snippets were not run against the real
  clients (Claude Code, Codex, Claude Desktop, Cursor, VS Code); the VS Code format is the
  `servers` format documented for `.vscode/mcp.json`, which VS Code's own page labels as the older
  local format. Renaming an agent and editing its permissions after creation need backend changes
  and were left out.

## Core Homepage — Implemented Flows

- Additive migration generates persistent groups from existing categories and initializes card
  sort order by name; existing service data and primary keys preserved.
- API and UI support creating, renaming, and deleting empty groups, and reordering groups.
  Deleting non-empty groups is blocked; renaming groups preserves child cards.
- Card sort orders persist within groups; API rejects incomplete, duplicate, or out-of-group IDs.
  Creating a card appends it to the end; editing preserves existing sort position.
- Service form supports emoji icons. Search covers name, category, description, and URL; filters
  and empty states remain visible. Services view tested against optional integration failures.
- Inline form rather than modal dialog. Opening form or renaming group moves focus to input;
  Escape key cancels and restores focus to triggering control. Accessible buttons support
  reordering groups and cards via keyboard.
- Independent review corrected position collisions after deletion and ambiguous submit events
  during group rename; group creation is hidden during editing, and new/moved cards receive
  positions incremented after the highest existing sort index.
- `pnpm check` (95 Vitest tests, 4 backup tests), `pnpm build`, and `git diff --check` passed.

## P0 Validation — Local Backup, Restore, and Migrations

- On Node.js `v24.16.0` and pnpm `12.4.2`, frozen installation fetched 417 packages from local cache.
  Passed 4 backup script tests, 4 migration tests, `pnpm build`, and `pnpm test` (20 files, 88 Vitest
  tests, and 4 Node tests). Initial test failure prior to build occurred because `@homora/db`
  lacked compiled `dist` artifacts; build followed by test run passed cleanly.
- Integration restore test utilizes temporary directories and synthetic data; copies `.auth`,
  `.key`, and `.proxmox` sidecars with the database, restores to a separate path, and verifies
  authentication, Proxmox configuration, and encrypted credentials. Also covers WAL journal
  flushing, database integrity checks, file mode `0600`, overwrite rejection, and aborting on
  partial backups. Migration tests run against isolated temporary SQLite databases, validating
  legacy schema adoption, additive migrations, preservation of services and references, restart
  survival, and incompatible schema detection.
- Isolated Compose validation: Docker Server 29.9.2 and Compose v5.6.1. Baseline commit `f66c3ef`
  and integrated Homora at `04fb017` built and launched within test project `homora-p0upg-4ab7d329`,
  throwaway volume `homora-p0upg-4ab7d329_homora-data`, and loopback port 49381. A synthetic
  service created via API preserved ID 1, name, URL, and category across container upgrade;
  position 0, empty icon, and `allowPrivate: false` confirmed. Project and volume pruned.
- Full operational restore validated with live backend inside temporary containers: database and
  sidecars `.auth`, `.key`, and `.proxmox` copied to a separate path. Restored backend authenticated
  the synthetic account, retrieved persisted services, and loaded/saved encrypted Proxmox settings
  with synthetic key and CA certificates without external network calls. Containers and temporary
  directories pruned.
- Final post-P4 verification on commit `158a4ad`: upgrading baseline `f66c3ef` to integrated branch
  preserved synthetic service, including `icon`, `position`, and `allowPrivate: false`; confirmed
  all six schema migrations and four new tables for agents/proposals/audit. Restoration to a new path
  authenticated, recognized Proxmox config with CA, and reloaded/saved encrypted data without
  network calls. Temporary Compose project/volume, containers, images, and ports pruned.
- Zero production databases, `data/` paths, or live services were touched. Execution logs and
  redacted reports were held in `/tmp` and excluded from repository commits.

## P1 Validation — Keyboard and Small Screens (2026-11-10)

- Headless Chromium (playwright-core) against the dev server at 390px with `coarse` pointer
  and at 768px. No horizontal overflow across all pages. Keyboard navigation flows (search,
  forms, reordering, Escape restoring focus, tab order) passed.
- Fixed: login password input now receives initial focus on mount; category chips, density
  toggle, and logo link measured 32px with `coarse` pointer and were increased to 44px
  (`pointer-coarse:`).
- Remaining touch targets below 44px in measurement are false positives: card links extend
  the clickable area across the entire card (`after:inset-0`), and the Settings checkbox is
  triggered by its label.
- **Not validated:** screen reader and physical mobile hardware. For this reason, the P1 item
  remains open.

## P4 Validation — Visual Review of Agent Proposals (2026-11-10)

- Temporary database and local stack. Identity created via web UI (43-character token
  displayed once) and consumed by a real MCP client from the SDK running against compiled
  `mcp-server.js` over stdio with `HOMORA_AGENT_TOKEN`.
- `list_services` responded; `propose_service_card` generated two proposals and rejected
  `javascript:` as an invalid URL.
- Hostile payload (prompt instructions in name and description, `<img onerror>`, and
  `<script>`) rendered as plain text during review; no script executed and no console
  errors were thrown. Approval via UI applied the card to the dashboard.
- A proposal for `http://127.0.0.1:1` is accepted and approvable; the card displays
  as "Monitoring blocked" per destination security policy. The review screen does not warn
  in advance that destination will be blocked (potential UX enhancement, not implemented).
- **Not validated:** concurrency under high load and live tool responses from an external
  AI agent (only an automated test MCP client was used).

## P2 Log — Sessions, Passwords, and Secrets (2026-11-10)

- Code review of `auth.ts`, authentication routes, and `vault.ts`: session behavior,
  cookie handling, and login rate limiting match specification; documented in README
  (en and pt-BR) covering sessions, password reset, and secret rotation.
- Password reset verified against compiled `auth.js`: deleting `.auth` unblocks initial
  setup, the legacy password is invalidated, existing sessions do not survive across new
  processes, and the file is created with mode 0600.
- Finding: without `.key` and with encrypted connections present, the vault will not generate
  a new key; automatic key rotation does not exist. Documented as a known limitation, along
  with manual token rotation at source. While no administrator account exists, any client
  reaching the UI from an allowed origin can register (by design; documented accordingly).
- **Not validated:** authentication rate limits under load and behind a real HTTPS reverse proxy;
  for this reason, session and secret review items in P2 remain open.

### Legacy Proxmox cleanup (2026-11-12)

- Removed the unused legacy Proxmox screen from the frontend (`features/proxmox/`); nothing rendered it
  and it called the legacy `/api/proxmox/*` routes.
- Step 1 done: the idempotent migration runs at backend startup and never stops it (missing key or
  unreadable file is logged without secrets, the file stays untouched).
- Step 2 done: removed `routes/proxmox.ts`, the legacy transport (`proxmox.ts`, `proxmoxAdapter`),
  `legacyConfig`, and the `.proxmox` fallbacks in `mcp.ts`, `proposals.ts` and
  `managed-proposals.ts` (no hidden bridge row any more). Validated with automated tests only; no
  live Proxmox validation. Pending proposals for a Proxmox widget created before this change are
  rejected as stale.
- Step 3 pending (separate issue, once the maintainer confirms no unmigrated installation remains):
  delete the migrator, `vault.load`/`save`, the `.proxmox` file handling and the related
  README/SECURITY text. Keep `seal`/`unseal`, which every connection uses.
- Next step for the connection model: node selection within a Proxmox connection (ADR 0001).

### Named Proxmox connections

- Proxmox uses named connections, with one API endpoint per connection, shared destination
  controls, encrypted credentials, reusable widgets and selectable top-bar source. Cluster
  data remains aggregated; node-specific widgets are not implemented.
- Legacy credentials are migrated transactionally at backend startup, preserving the
  bridge ID and widgets. The legacy file is retained; a migration marker prevents resurrection
  after deletion. The old HTTP endpoints were removed.
- Automated tests exercise migration with and without widgets, missing keys, multiple independent
  configurations and mocked network requests. Live cluster compatibility remains unverified.

## Auth Log — Better Auth for Web Authentication (2026-11-11)

See [ADR 0004](decisions/0004-better-auth-web-authentication.md).

- Replaced the file-based account (`<database>.auth`, in-memory sessions) with Better Auth
  1.7.19 (email and password) on the application's SQLite database. Pinned to 1.7.19 because
  1.7.20 was younger than the project's minimum package age; no exception was added.
  Decisions: first-run onboarding stays open as before (name, email, password); 8-hour sessions;
  sign-in limited to 10 attempts per client in 15 minutes; telemetry disabled; only
  `sign-in/email`, `sign-out` and `get-session` are reachable; a database hook refuses a second
  account; the signed-in account is recorded as the proposal reviewer instead of `local-admin`.
- Schema: migration `0010` adds `user`, `account`, `session` and `verification`; a backend test
  compares them with Better Auth's own requirements. Existing `.auth` files are ignored (data
  loss was accepted for this early stage). `pnpm auth:reset` replaces "delete `.auth`".
- New `HOMORA_SESSION_SECRET` (optional, replaces a stale `.env.example` entry) and a
  `<database>.session-secret` file (0600) created on first start. Removed the unused
  `HOMORA_ADMIN_PASSWORD` entry from `.env.example`.
- `pnpm-workspace.yaml` sets `dedupePeers: true`: Better Auth's optional peers made pnpm install a
  second `drizzle-orm` for the backend, which broke SQL types shared with `@homora/db`.
- Better Auth's in-memory rate-limit store is shared by every instance in a process; the API
  passes its own per-instance store. Secure cookies follow the request origin (the library
  follows its base URL), so the API adds `Secure` for HTTPS origins itself.
- Validated: `pnpm check` (lint, format, types, 291 unit and integration tests and 6 script
  tests); real HTTP against the compiled backend (setup, sign-in, restart keeps the session,
  sign-out, closed sign-up, 0600 secret); Docker image build and a production-mode container
  (Secure cookie only for the HTTPS origin, unknown origin refused, `auth:reset` inside the
  image, onboarding available again); Chromium (headless) against the Vite dev server and the
  compiled backend: account creation with password confirmation, session kept after reload,
  sign-out, wrong password message, sign-in (cookie `HttpOnly`, `SameSite=Strict`, 8 hours).
- **Not validated:** behind the bundled nginx and a real HTTPS reverse proxy (per-client limit
  through `X-Forwarded-For`); Safari and Firefox (including Secure cookies on
  `http://localhost`); behavior under concurrent load. The open P2 session review item stays open.

## Account and Activity Log (v2.1, 2026-11-11)

- Added the **Account** page (profile name, change password with "sign out of other devices",
  active sessions with two-step end and "end the others") and the **Activity** feed (who did
  what: sign-ins, failures, password and session changes, proposal decisions, agent identity
  events), plus a user menu in the top bar. The UI was approved from a design proposal first.
- Schema: migration `0012` adds `detail`, `ip_address` and a time index to `audit_events`.
  Existing rows keep working. Failed sign-ins keep only address and attempt count.
- Decisions: the email stays read-only for now (no verification without email delivery); no new
  Better Auth routes are exposed, Homora wraps them so session tokens never reach the browser;
  proposal events do not show the card name yet.
- Validated: `pnpm check` (lint, format, types, unit and integration tests), including new
  backend tests for the account API, throttling and privacy of the feed, and frontend tests for
  the feed and the two-step session revoke. Chromium (headless) against the Vite dev server and
  the compiled backend on a temporary database: account creation, user menu, rename, wrong and
  right current password, a second browser signed out after the change, feed contents and filter,
  no typed email or password in the feed, and no horizontal scroll at 390 px wide.
  **Not validated:** the migration on a database with existing data, Safari and Firefox, the
  light/dark themes of the new pages, and behind a trusted HTTPS proxy.

## MCP granular reads and governed proposals (issue #47)

- Added group, group services and individual service status queries, separately scoped agent identity and audit queries, and withdrawal of an agent's own unexpired pending proposals. Existing identities do not receive the new scopes automatically.
- Added a 30-day observation history, atomic batches of up to 20 independently reviewed proposals and a limit of 100 unexpired pending proposals per identity. Existing stale checks can invalidate remaining batch items after an approval.
- Agent identity changes require a proposal and human review; requested scopes must be a subset of the author's grants. New and rotated tokens appear only in the no-store review response. Auto-approval remains out of scope.
- Validated with `pnpm check` (340 application tests and 6 script tests) and `pnpm build`. Tests cover migration with existing data, retained history and its window, batch atomicity and limits, scope escalation, authenticated review, one-time token delivery and recovery. The identity review interface was exercised in component tests; it was not manually checked in a browser. Live infrastructure is not needed for these flows.

## Docker discovery documentation (issue #48)

- Documented Compose, manual Coolify/PaaS proxy and direct socket options, verification,
  limits, proxy contract and troubleshooting in both READMEs. The manual proxy remains
  outside the app stack and requires separate maintenance.
- Validated against the current implementation and Compose configuration. The PR review
  reports a live Coolify deployment using a manual proxy and runtime environment variable,
  with `list_discovery_suggestions` returning `scanned: 4`; the guide was not re-executed
  from scratch for this documentation change.

## Atomic batch review (issue #51)

- Batch approval validates the original configuration and applies all items in one transaction, with a single revision increment. Conflicting operations roll back; pending remnants of partially decided older batches can be discarded.
- The review interface groups batch items, distinguishes changed configuration from unavailable proposals and conflicting changes, and shows stale and expired states.

## Docker push discovery (issue #56)

- Added a separately authenticated remote Docker inventory agent, source lifecycle,
  five-minute freshness, and review/import tied to a transactional source-version
  check. Existing local Docker discovery remains available. The stored inventory
  contains only supported discovery labels; the agent token is stored as a hash.
  Source lifecycle changes are audited atomically; revocation is terminal and
  interval is capped at 240 seconds.
- Added UI in English and Portuguese, scoped MCP tools for both transports, a
  Docker image target and release matrix entry. Setup, socket privilege, TLS,
  token handling and limits are documented in both READMEs. The protocol accepts
  the last valid arrival; it does not enforce message ordering or replay counters.
- Validated locally with two fake Unix-socket Docker daemons, real agent code,
  HTTPS with a temporary CA, the real backend, card review/import, rejection of an
  untrusted certificate, revoked token and expired inventory. Tested a concurrent
  source update through a second SQLite connection, migration with existing data,
  MCP HTTP and a real stdio process, and frontend interactions. Chromium at 390 px
  showed source creation and one-time token; at 1280 px it exercised source creation,
  upload, review and import. Neither viewport showed horizontal overflow or page errors. The agent
  image built locally. No real Docker socket or production database was used.
- Not validated: actual communication between separate LXC hosts (none available),
  physical mobile devices, screen readers, and agent image on arm64. The local
  tests do not establish safety for public exposure.

### Monitor HTTP: expected status and check path

Services can optionally check a same-origin path independently of their card URL and match an exact HTTP status or the 2xx/3xx classes. Existing services retain their previous behavior; ping retains but ignores these HTTP settings. Anonymous responses do not prove an authenticated origin is healthy. Observation history records the expectation in effect for unexpected responses, and changing either setting invalidates the current shared observation.

## Public read-only status page (issue #63)

See [ADR 0006](decisions/0006-public-read-only-status-page.md).

- `services.is_public` (default 0) and an `app_settings` table (`public_status_enabled`, `public_status_title`) in migration 0015; existing rows keep `is_public=0`.
- `GET /api/public/status` is the only anonymous API path (exact-path allowlist in the auth hook, GET only), limited by `@fastify/rate-limit` to 60 requests per minute per client IP, cached 15 s, `404 not-found` when disabled or empty. Payload: name, category, `up|down|unknown`, `checkedAt`, `uptime` (24 h) and 24 hourly `bars`; stale observations read as `unknown`.
- Visibility is changed only through authenticated, audited endpoints (`PUT /api/public-status/admin`, `PUT /api/services/:id/public`). It is deliberately outside `ServiceInput`, so imports, exports, agent proposals and MCP cannot change it; MCP exposes `publicStatusEnabled` read-only.
- Frontend: `/status` is routed before the authenticated shell and calls only the public endpoint; Settings has the toggle, title and an exact preview; the service form has the checkbox.
- Validated with `pnpm check`. Backend tests cover the closed default, 404s, opt-in only, no sensitive field or private service in the body, 429, exact-path allowlist, session requirement and audit. The rate limit runs in memory per backend process and the UI was not exercised manually in a browser. Not validated: behavior behind a real Cloudflare Access hostname.

### Monitor: uptime and latency per service (issue #62)

See [ADR 0007](decisions/0007-service-observation-history-and-uptime.md).

- `GET /api/services/uptime?range=24h|7d|30d` (all services) and `GET /api/services/:id/uptime` return uptime %, check counts, last latency and a bar of buckets (30 min for 24 h, 2 h for 7 d, 6 h for 30 d; at most 120). Both use the same function, so the numbers match; only the single-service call adds `p95LatencyMs` (nearest rank), because the percentile needs a sort of every latency.
- Only checks made under the service's current configuration (`signature`) count; the response flags `reconfigured` and the card says so. `unknown` checks stay out of the denominator and empty buckets read `unknown`. With fewer than 5 up/down checks the percentage is `null` and the card shows a dash.
- Migration `0016` adds virtual columns `status` and `latency_ms` (generated from the observation JSON, so existing rows need no backfill) and a covering index `(service_id, signature, observed_at, status, latency_ms)`. No row is rewritten.
- Card: percentage and bucket bar (with a text `aria-label`); the History toggle shows current latency, p95, check counts and the period selector, saved in this browser with the view preferences. The list layout shows only the percentage.
- Deviation from the issue: 7 d uses 2 h buckets (84 points) because 1 h would be 168, above its own 120 cap.
- Validation: `pnpm check` and `pnpm build`. Tests cover manual counts, unknown exclusion, minimum checks, reconfiguration, 30-day retention, batch/single consistency, routes, migration and the card. A synthetic benchmark of 200 services × 30 days at a 15-minute interval is in `service-uptime.test.ts`: the 24 h and 7 d periods meet the 300 ms goal; 30 d runs close to or above it depending on load (guard set at 1.5 s). At the default 60 s interval history has ~15× more rows; see "Monitor: shrink history rows (issue #88)" for the measurements and why a rollup table is not needed yet. Not checked in a browser or against real infrastructure.

## Proposal deadlines and recreation (issue #67)

- Agents shows a shared countdown, an expired state and recreation for expired proposals. Expired batches are recreated together, preserving collective review. Recreation validates the original diff and records the human requester; it never applies changes.
- The review period defaults to 15 minutes and can be set to 1–120 minutes for new proposals. It is stored in the existing settings table and read by both MCP transports. Existing deadlines are unchanged.
- Validated: `pnpm check` (404 application tests and 6 script tests) and `pnpm build`. Tests cover expiration in the open interface, authentication, TTL, recreation and batch rollback. The interface was not manually checked in a browser; real infrastructure was not needed.

## Group positions after deletion (issue #68)

- Deleting an empty group through the API or an approved proposal renumbers the remaining groups in the same transaction, ordered by position and then ID. Existing gaps are normalized on the next successful deletion; no migration is needed.
- Validated: `pnpm check` (410 application tests and 6 script tests) and `pnpm build`. Tests cover deletions at the beginning, middle and end, creation and reordering afterward, and existing gaps and duplicate positions in proposals. Existing tests cover rejection of non-empty groups.

## Settings as a hub, a phone bottom bar and Agents tabs

- Settings no longer stacks everything on one page. `/manage/settings` lists four subpages (`interface`, `public`, `backup`, `discovery`), each with its own route (`/manage/settings/:section`); an unknown subpage is "not found". On phones the list and a subpage take turns, with a back link; from `md` up they sit side by side. The section list lives in `features/settings/sections.ts`; the palette's "Import / Export" now opens `/manage/settings/backup`.
- `MobileTabs` was dead code and is now mounted in the management area on phones: Services, Integrations, Agents and "More", which opens a bottom sheet with Activity and Settings. The sidebar buttons are desktop-only. The organize bar and the toaster were moved above the bottom bar.
- Validated with `pnpm check` and `pnpm build` (the one failure on the first `pnpm check`, the 200-service uptime benchmark, passed on its own: it is load-sensitive). Tests cover the hub, direct links, the unknown subpage, the "More" sheet and the Agents tabs. Not checked in a browser or on a physical phone.
- Agents now splits Proposals (with the pending count) and Agents into two tabs; Connect and New agent stay in the header. The tab is local state, not a route.

### Docker push discovery — PR review and main integration

- Merged current `main` and regenerated the source migration as `0017`, after the
  existing monitor, public-status and uptime migrations. An isolated upgrade test
  preserves a public service, monitor settings and public-status configuration.
- Revocation is terminal; token rotation cannot reactivate a source. Source creation,
  rotation, revocation and removal record administrator, source ID and client IP in
  the same database transaction as the change. Names and tokens are not recorded.
- Agent interval is capped at 240 seconds against a five-minute freshness window.
  Inventory order is canonicalized by container ID, avoiding version changes from
  reordered Docker results. API endpoints now distinguish revocation from removal,
  expose the source limit and oversized-body errors, and require JSON ingestion.
- Direct import checks source validity in its transaction. MCP checks the source at
  proposal creation; an already-created proposal remains independently reviewable
  after source revocation. Both cases have tests. Source limit counts revoked rows,
  as documented, until removed.
- Validated `pnpm check` (425 application tests and 9 script tests), `pnpm build`,
  isolated migration and concurrent-connection tests, audit rollback and lifecycle
  tests, and Chromium at 390 px for dialog cancellation and terminal revocation.
  CI and cross-host LXC validation remain separate from this local evidence.

- After integrating the subsequent mobile-header change, the load-sensitive uptime
  benchmark timed out in the first full run. It passed in isolation; a second full
  `pnpm check` passed (425 application tests and 9 script tests), followed by
  `pnpm build`.

## Mobile header fits one row

- On phones the header wrapped: the brand, search, language, theme, user menu and the Manage / Back button did not fit in 390 px, so the user menu and the button dropped to a second row. Below `sm` the wordmark is now visually hidden (the logo still links home), the Manage / Back button shows only its icon (the label stays for screen readers) and the gaps are tighter. From `sm` up nothing changes.
- Checked in a headless browser at 360 px, 390 px and 1100 px: one row in management mode, and on the home page the search field still takes its own second row. Not checked on a physical phone, and below about 340 px the header can wrap again.

### Notification channels (issue #61)

See [ADR 0005](decisions/0005-status-transition-notifications.md).

- Webhook and Telegram channels, encrypted destinations, per-channel private-network opt-in, bounded asynchronous delivery and persisted service transition state. The five-minute cooldown suppresses a repeated outage and its recovery; unknown checks retain the last known state. Retries can duplicate deliveries and queued messages do not survive a restart.
- Validation: `pnpm build`, lint, formatting and type checks passed; 422 application tests passed with `vitest run --maxWorkers=4`, and 6 script tests passed. Two unrestricted `pnpm check` runs timed out in the existing load-sensitive uptime benchmark, which passed in isolation. Telegram and webhook delivery were mocked; the UI was not visually reviewed in a browser.

- Settings groups webhooks and Telegram channels into separate sections, with an inline form opened on request. Validated with the focused frontend tests, lint and frontend build; not visually reviewed in a browser.

## Header search field removed

- The header search field ("Search services") and its quick-results dropdown are gone: the command palette (Ctrl/Cmd+K, or the magnifier button) is the only search. The `/` shortcut, Enter-to-open-first and the text filter on the services page went with it; the category filter stays. The earlier note about the home page search taking its own second row no longer applies.
- Validated: type-check, lint, prettier and the frontend tests. 18 backend test files fail to import in this worktree; the backend was not touched.

### Docker push discovery — subsequent main integration

- Preserved the activity, status and header changes from `main`. The pre-existing
  uptime benchmark exceeded its five-second total test timeout twice during full
  suites but passed alone and met its measured performance thresholds. Increased
  only its total timeout to 15 seconds; the benchmark thresholds are unchanged.
- Validated `pnpm check` (435 application tests and 9 script tests) and `pnpm build`.

## Settings polish: Interface, Public status and Docker discovery

- Interface is grouped into Appearance (theme, language), Home page (layout, descriptions, uptime period) and Top bar. The top bar gained a switch instead of a checkbox, a live preview and clock options (date, seconds, 12/24 h, time zone), kept in `localStorage` (`homora-clock-*`) and omitted from exports.
- Public status shows its address with copy and open buttons, a Live/Off badge, the public service count and an optional description (`public_status_description` in `app_settings`, 160 characters, audited as `public-status-update:description`, no migration needed). The anonymous payload gains only `description`.
- Docker discovery is split into "This host" and "Remote agents" tabs. Remote sources are rows with a status badge and an actions menu; creation, the one-time token and suggestion review are dialogs, and the agent `docker run` command is available in the tab. Suggestion lists share one component.
- Validated: lint, prettier, type-check and 455 application tests (new tests for the clock, Interface, Public status and the backend description). Not reviewed in a browser, so spacing and the 12 h format in other locales are unchecked.

## Keyboard shortcuts and optional web search (2026-11-12, issue #86)

- One global listener (`hooks/use-shortcuts.ts`, table in `lib/shortcuts.ts`) inside the authenticated shell replaces the `Ctrl/Cmd+K` listener in `App.tsx`. Single keys: `/` palette, `?` shortcuts dialog, `g` then `h`/`i`/`a`/`t`/`s` to go to Home, Integrations, Agents, Activity, Settings, `n` new service (services pages only). They are inert in fields, `[contenteditable]`, while any `dialog`/`menu`/`aria-modal` is open (the palette included), while composing, on repeat, when already handled, and with Ctrl/Cmd/Alt. A chord expires after 1 s and any other key cancels it. The public `/status` page and the auth screens never mount the listener.
- WCAG 2.1.4: Settings > Interface > Keyboard has a switch (`homora-shortcuts`, default on). Off leaves only `Ctrl/Cmd+K` and `Ctrl/Cmd+B`. Discoverability: the `?` dialog, `Kbd` hints on the palette's navigation rows (md and up, only when on) and the switch description.
- Web search from the palette is off by default and browser-local (`homora-web-search`, `-engine`, `-url`; nothing reaches the backend, exports, MCP or the public status page). Built-in engines are data in `lib/web-search.ts` (DuckDuckGo default, Google, Brave, Bing) plus a custom `https:` URL with `%s`. Validation on save and again at use time; the placeholder may not decide the host and credentials are refused. The last palette item "Search the web for “…”" appears only with non-empty free text (prefixes removed), runs only on selection, and calls `window.open(url, '_blank', 'noopener,noreferrer')` with just the encoded typed text.
- Validated: `pnpm check` (lint, prettier, types, tests) and `pnpm build`; new tests for the hook, the dialog, the URL builder, the palette item and hints, the Settings controls, and the shell (chords, `n` route, switch off, inert on login and `/status`).
- Not verified: no browser session with a physical keyboard, no check against browser/OS shortcut conflicts, and no screen-reader pass over the dialog. Focus return after closing the dialog is Radix's default and was not asserted (happy-dom does not restore it).

### Monitor: shrink history rows instead of a rollup table (issue #88)

- Measured at the default 60 s interval (synthetic data, `node:sqlite`, one run each; 30 days = 43,200 rows per service): with 25 services (1.08 M rows) `uptime` took 5 ms (24 h), 25 ms (7 d) and 111 ms (30 d); with 100 services (4.32 M rows) 17, 96 and 371 ms. Cost grows linearly, so query time is not the problem; database size is.
- Decision: **no rollup table for now.** It would change the semantics of `history()` / MCP `list_status_history` (raw events) and add write-path complexity for a read path that is already fast. Revisit only if a real installation reports slow uptime responses.
- Instead, the stored `signature` is the first 16 hex characters (64 bits) of the same SHA-256 (`service-signature.ts`, shared by the observation store and notification transitions). It only has to detect "settings changed". It was stored three times per row (row, unique index, covering index). On-disk size of 10 services × 43,200 rows with realistic observations: ~615 bytes/row before, ~274 after `VACUUM` (about 55% less; ~26.6 MB to ~11.8 MB per service per month).
- Migration `0019` rewrites existing signatures with `substr(signature, 1, 16)` in `service_observation_history`, `service_observations` and the persisted `notification_states` JSON, so uptime, `reconfigured` and notification transitions are unchanged; it is idempotent for short values and ends with `ANALYZE`. The test starts from a database at migration `0018`.
- Space reclaim: the `UPDATE` alone does **not** shrink the file (measured: still ~615 bytes/row). Freed pages are reused as 30-day retention deletes old rows, so growth stops. `VACUUM` is never run automatically; it is optional and needs free disk about equal to the database size (see README, Upgrade).
- `service-uptime.test.ts` now benchmarks 25 services × 43,200 rows at 60 s (bounds: 24 h and 7 d under 300 ms, 30 d under 1 s). Local run: 12 ms, 80 ms, 358 ms.

## Error recovery across the application

- Unknown authenticated routes retain their existing not-found screen; the public status page and individual features retain their own error states. The sign-in screen can retry an initial connection failure without a full reload.
- A root React error boundary displays a localized recovery screen for rendering failures, without exposing exception text. It cannot catch failed JavaScript downloads, event-handler errors, or a web server that is itself unavailable.
- Unexpected backend errors use a generic JSON response while preserving their HTTP status. Expected 4xx handling and the public-status rate limiter remain in place. The nginx proxy and external gateways can still return their own errors when the backend or frontend is unavailable.
- Validated with `pnpm check` (496 application tests and 9 script tests) and `pnpm build`. Tests exercise recovery after an initial connection failure, the render boundary, and safe unexpected API errors. The recovery screen was not visually reviewed in a browser; proxy and gateway failures were not tested end to end.

### Service-to-host map, phase 1: manual link and Host view (issue #96)

- Migration `0020` adds `host_connection_id`, `host_node`, `host_vmid`, `host_type` (all nullable) to `services`; the connection id references `integration_instances` with `ON DELETE SET NULL`. `packages/db/src/migration.test.ts` starts from a database at migration `0019`, checks that existing cards keep their data with all four columns `NULL`, and that deleting the connection unlinks the card. Decisions are in [ADR 0008](decisions/0008-service-to-host-map.md).
- Backend: `proxmox-inventory.ts` lists nodes and guests from the same `/cluster/resources` response (templates and malformed items dropped); `GET /api/connections/:id/guests` (session required, 30 s cache, 400 for non-Proxmox). `POST/PUT /api/services` accept `host`, `PUT /api/services/:id/host` links or unlinks (audited); the connection must exist and be Proxmox (`invalid-host`). `GET /api/services` returns `host`. Agent proposals reject `host`; export/import and the MCP card tools do not carry it (omission recorded in the ADR).
- Frontend: "Runs on" field in the service form (connection, node, search and guest list in a bottom sheet on phones, side sheet on desktop; "Unlink host"), a **Group | Host** control on Home (the Map joins in phase 4), the Host view (accordion per node, unlinked cards in their own section, "Host not found" and "Host unavailable" sections) and a "Runs on" line on each card.
- Validated: `pnpm check` and `pnpm build`. New tests: migration, inventory parsing, link/unlink/validation/rename/connection-delete flow with a mocked Proxmox transport, host grouping, picker (search, node filter, select, unlink, not found, no connection) and Host view.
- Not verified: no real Proxmox, no browser session on a phone, no screen-reader pass.

### Service-to-host map, phase 2: impact (issue #96)

- Impact is computed in the browser (`serviceImpact`, `offlineNodes` in `lib/hosts.ts`) from the card link, the node/guest state of the live inventory and the existing monitor status; the backend and the monitor are unchanged and no new polling of Proxmox targets was added. The guest inventory is re-read once a minute (backend cache is 30 s), the same cadence as the status refresh.
- Causes are kept apart: node offline shows "Host offline"; a stopped guest "Guest stopped"; a down monitor on a **running** guest "Service down". An unreadable or loading inventory, or a guest in an unrecognised state, is "Host state unknown" (cards) and never "offline"; the banner is not shown in that case. This is open decision 4 resolved as "derive, show unknown": no last-known state is stored.
- Home shows "pve2 is offline. N services are affected." with "See impact", which switches to the Host view filtered to that node (with "Show all hosts"). Node headers show state and the affected count; every service row and card also writes the cause as text.
- Validated: `pnpm check` and `pnpm build`. Tests cover online, offline node, stopped guest, down service (and a blocked check), connection error, loading, unlinked, banner, filter and the cause wording.
- Not verified: no real node taken offline; behaviour of `/cluster/resources` for an offline node (guests listed with a stale status) is assumed from the Proxmox API and covered only with simulated data.

### Service-to-host map, phase 3: evidence-based suggestions and agent proposals (issue #96)

- Migration `0021` adds `host_suggestion_dismissals`; the test starts from a database at `0020`. Engine, parsing, API and MCP details are in [ADR 0008](decisions/0008-service-to-host-map.md).
- API: `GET /api/host-suggestions` (session only) and `PUT /api/services/:id/host-suggestion-dismissal`. Accepting uses the phase 1 `PUT /api/services/:id/host`. UI: "Suggested hosts" panel (side sheet on desktop, full screen on phones) with per-item select, Accept, Dismiss, Undo, "Accept selected (N)", "Choose host manually", strength written as text and evidence per item; it is loaded only when opened because it reads guest configurations from Proxmox.
- MCP: scopes `hosts:read` and `hosts:propose`, tools `list_host_suggestions` and `propose_host_link`; the proposal diff is rendered in the agent review screen with the server-computed evidence. Existing tokens do not gain the new scopes.
- Validated: `pnpm check` and `pnpm build`. Tests: each signal alone, combinations, name-only, ties and conflicting evidence, dismissals per card and guest, address parsing, hostname resolution blocked/authorized/failed (no signal, no card connection), API with and without a session, only GET requests to the Proxmox mock, degradation when the guest agent is refused, MCP scope enforcement, refusal without evidence, proposal creation, audit entries and approval, panel actions and error state.
- Not verified: no real Proxmox. The guest-agent endpoint, the `ip=` formats of `netN`/`ipconfigN` and the 403 behaviour for a read-only token follow the Proxmox API documentation and are covered only with simulated responses.

### Service-to-host map, phase 4: read-only Map (issue #96)

- Home gets **Group | Host | Map**. The map (`components/host-map.tsx`, `lib/map-layout.ts`) uses a custom deterministic layout instead of `@xyflow/react`; reasons in [ADR 0008](decisions/0008-service-to-host-map.md). No dependency was added.
- Interactions (all read-only): select a service or a guest to open the side panel (service, address, status, runs on, affected by, "Open card on Home", "Change host"), pan (native scroll, touch, mouse drag), zoom 60% to 120%, fit, reset, refresh (bypasses the 30 s cache) and return to the host list. Map controls sit in the canvas toolbar. "Used by" is not shown yet: dependencies arrive in phase 5. Offline nodes are drawn with a dashed border and the words "Offline" and the affected count; impact wording comes from phase 2.
- Validated: `pnpm check` and `pnpm build`. Tests: layout (determinism, containment, no overlaps, wrapping, focus order equals Host view order, empty input, zoom bounds), component (containers and offline text, focus order, selection and panel actions, guest panel, zoom limits, reduced motion, refresh and list link, phone notice under 768 px, empty state).
- Not verified: no real browser or phone (happy-dom has no layout, so panning, `scrollTo` distances and the fit zoom against real viewport sizes were not observed), no screen-reader pass, no large installation (layout cost with hundreds of guests was not measured).

### Service-to-host map, phase 5: Map editing and manual dependencies (issue #96)

- Fixed canvas coordinate nesting: guest cards are positioned within their node and service tiles within their guest, preventing them from drifting outside the host containers.
- Migration `0022` adds `service_dependencies`; the test starts from a database at `0021` and checks existing cards, the duplicate and self-link constraints and the cascade. Design in [ADR 0008](decisions/0008-service-to-host-map.md).
- API: `GET /api/service-dependencies`, `POST /api/services/:id/dependencies`, `DELETE /api/services/:id/dependencies/:other` (cycle, self, missing card and limit are rejected with distinct codes), audited. MCP: `list_service_dependencies` under `services:read`.
- Map: drag an unlinked service onto a guest to link it; non-drag alternative in the side panel (same chooser as the form, plus "Unlink host"); "Depends on" and "Used by" lists, "Add dependency" picking mode (Escape or Cancel leaves it) and removal; read-only on phones. The service form has a "Depends on" list. Home cards, the Host view, the map panel and the banner show the manual "may be affected" hint.
- Validated: `pnpm check` and `pnpm build`. Tests: dependency CRUD, authorization (no session, no origin), cycle (direct and transitive), self link, missing card, limit via validation, cascade on delete, audit entries, scoped MCP read, impact through dependencies (including a cycle that bypassed validation), drag link, keyboard alternative producing the identical call, unlink, failed change reporting, picking, Escape, error messages, read-only on a phone and without edit access, form picker, banner.
- Roadmap item 18 (service-to-host map) is marked done in `plan.md` and `strategy.md`, with the caveat below.
- Not verified: everything against a real Proxmox (all Proxmox traffic is simulated); real HTML5 drag and drop in a browser (happy-dom events were used, so drop positioning and touch devices were not exercised); screen readers; a drag with a very large map. The "Test unavailability, invalid credentials and reduced permissions against a real Proxmox" item in the plan therefore stays open.

## UI component consistency sweep (2026-11-12)

- Replaced the custom HTML-backed select implementation with `FormSelect` composed from the shadcn `Select` primitives, including an option component that supports empty values and controlled selection. Migrated its uses across services, settings, activity, host selection, transfer and widgets, with accessible names on composite controls.
- Converted the agent profile radio cards to the existing shadcn `ToggleGroup`, direct product buttons to shadcn `Button`, and standalone labels to shadcn `Label`. Inputs, textareas, checkboxes, switches, overlays, cards, alerts and empty states were already using the project primitives; semantic links, the category datalist and structural HTML remain native.
- Recorded the component priority and exceptions in `docs/standards.md` and `AGENTS.md`; updated the map decision to name the shadcn Select.
- Validation: `pnpm --filter @homora/frontend build` passes (TypeScript and Vite). Static source scan confirms no direct product `<button>`, `<input>`, `<select>`, `<textarea>` or `<label>` outside `src/components/ui`; the native category `<option>` remains inside its semantic `<datalist>`. Tests and browser/screen-reader behavior were not run.
- Follow-up: integration data in service cards now uses a shared three-column grid with labels above tabular values. Widget loading placeholders use the same grid and reserve the expected row count for each integration type.
- CI follow-up: validation tests now interact with shadcn Select and ToggleGroup controls through their combobox/radio roles and keyboard behavior instead of native select/label assumptions.

## Appearance, custom CSS and pages (2026-11-12)

- Issue #97 in four phases ([ADR 0023](decisions/0023-appearance-and-pages.md)): accent color, gradients and card translucency with a contrast check in both themes; an optional background image processed with `sharp`; custom CSS served same-origin with a safe mode (`?safe=1`, `pnpm css:reset`); and pages as tabs on the Home (migration `0023`).
- Export now writes version 2 (pages and a page per group) and still reads version 1. It also includes appearance and custom CSS, which import deliberately does not read.
- Validation: `pnpm check` and `pnpm build` on every phase. Tests cover the contrast function, image processing, CSS validation, the routes (auth, audit, limits), the migration, import and export with pages, the settings screens, the tab strip and the digit shortcuts.
- Not verified: any behaviour in a real browser (rendering of gradients, blur and the background image, the look of the tab strip on phones, drag and drop, keyboard focus order), screen readers, real HTTP proxies in front of the 2 MB upload, and a CSP (none is shipped).

## Integration SDK — initial extraction (issue #126)

- Moved all built-in definitions and the reusable URL field into `packages/integrations/src/integrations`;
  registration and existing exports remain unchanged. Proxmox and Coolify backend registrations now
  live in their own files. Added backend and frontend SDK entry points and moved the two custom widget
  presentations into separately registered modules. This is an organizational step, not the completed SDK.
- Validated the shared package build and the adapter contract and manifest adapter suites (433 tests).
  The first test attempt failed because the shared package had not yet been built; rerunning after
  its build passed. Full project checks and live integration validation were not run.
- Follow-up validation: `pnpm build` and 490 tests in the adapter, contract and widget suites passed
  after extracting registrations and presentations. No live services or browser were used.
- Organized definitions and their existing sourced fixtures into per-integration directories, and
  added `pnpm integration:create <id> <manifest|code>` with non-overwriting, unregistered templates.
  The generator is tested in an isolated temporary directory; its example data is explicitly marked
  illustrative and must be replaced before registration. Adapter tests still live in the backend.
- Moved the generic manifest display renderer into the frontend SDK, and Coolify and Proxmox custom
  presentations into their integration directories. Translation is injected by the frontend. The
  package build and 15 focused frontend tests passed; visual behavior was not checked in a browser.
- Moved the Coolify and Proxmox read adapters and their service-specific contracts into their package
  directories. The backend supplies its existing input-error handling and Proxmox vault validation;
  the shared restricted transport is still injected. `pnpm build` and 448 focused tests passed after
  the moves. These checks did not contact real services.
- Retry pauses now use an optional registration hook (Coolify supplies it); the Proxmox adapter
  requests its existing response limit through the transport contract instead of a central type check.
  Existing Proxmox and Coolify connection tests passed with these paths.
- Split the adapter contract cases into per-integration test files and moved the focused Coolify and
  Proxmox adapter tests beside their implementations; the host's reusable harness remains in the
  backend. The package test TypeScript configuration runs after the workspace type checks so its
  backend imports have built dependencies even on a clean checkout. The SDK boundaries are recorded
  in [ADR 0011](decisions/0011-integration-sdk.md).
- Final local validation: `pnpm check` passed (1,247 application and 16 script tests), as did
  `pnpm build`. All 11 definitions were compared with the pre-change source and matched exactly.
  A backend Docker image built successfully and loaded all 11 registry entries in a production
  container. Generator tests compile both scaffold types in a temporary copy. Contract tests also
  check console output for credentials on successful and failed reads.
- Not verified: a browser or screen reader, any additional live integration instance, or the
  remaining live-validation cases already listed in `integrations.md`. No schema migration was needed;
  integration IDs, public fields and stored formats remain unchanged.
- CI follow-up: the first GitHub validation exposed a clean-checkout dependency-order race in test
  type checking; moved that check after the workspace tasks so `shared` is built first.
- Integrated the concurrent main-branch module split: retained its connection transport, manifest
  response parser and smaller shared modules while using the SDK definitions and hooks. After conflict
  resolution, `pnpm build` and `pnpm check` passed (1,248 application and 16 script tests).
- Review follow-up: adapter registrations, Proxmox credential validation and widget
  presentation selection now live in integration-package catalogs; host applications consume these
  catalogs generically. Widget placeholder counts and Speedtest's icon now come from integration
  metadata. Subsequent changes below migrate specialized workflows and legacy compatibility.
- Inventory dispatch now selects the declared `hosts` or `resources` domain, and address reads use
  the optional registered capability, rather than selecting integrations by type in those paths.
  Existing HTTP responses and legacy identifiers are unchanged.
- Host inventory and top-bar telemetry capabilities are now declared by the integration definition.
  The top bar determines the actual connection type before rendering its telemetry, and the node
  picker uses a generic host-inventory field. Focused tests passed; integration-specific
  resource workflows and legacy APIs were subsequently migrated as described below.

- Built-in descriptors now generate static definition, backend, frontend, MCP, translation and demo
  catalogs. Host and resource workflows use declared capabilities and normalized contracts; the
  applications no longer register or dispatch individual integration implementations. Legacy vault,
  widget sources and wire fields remain compatible through the package. Existing database rows and
  external APIs are retained without a schema migration.
- MCP integration tools require their registered scopes and their connection access is restricted to
  their owning integration type. Development examples are isolated in integration modules and enabled
  only in development mode. Existing transport, destination checks and GET-only policy remain in force.
- Validation after the review changes: `pnpm check` passed (1,252 application tests and 17 script
  tests) and `pnpm build` passed. After merging the latest main branch, `pnpm check` passed again
  (1,334 application tests and 17 script tests), as did `pnpm build`. No live service, browser or
  screen reader was tested.

- Follow-up coverage: all eleven existing definitions are in the generated catalog. Nine use the
  shared manifest interpreter; Coolify and Proxmox use code factories. Service-specific widget
  translations have moved into their respective integrations. Tests exercise the catalog and
  widget presentation for every existing type, in addition to each adapter's mocked contract suite.
- Moved the existing 164 brand SVGs and catalog into `@homora/icons`, shared by service cards and
  integration badges. Stable local URLs are retained in Vite development and production builds;
  a frontend container build and a local HTTP request were checked against the source SVG. Logo
  ownership and license notices remain in `THIRD_PARTY_NOTICES.md`. `pnpm check` passed with
  1,336 application tests and 17 script tests; `pnpm build` and frontend/backend container builds
  passed. Live services, browser interaction and screen readers were not tested.

- Moved the generic manifest interpreter, response parser, definition validation and widget
  presentation selection into the SDK. Applications inject host-owned error policy and retain
  authentication, storage, routes and restricted transport. A boundary test detects direct imports
  and simple type comparisons for registered integrations in production app code. The contributor
  guide and agent instructions now describe creation, maintenance, security and validation steps.
  Validation: `pnpm check` (1,336 application tests and 18 script tests), `pnpm build`, and a backend
  container build loading all 11 definitions passed. Live services and browser behavior were not tested.

## Extensible integrations (issue #98)

- **Phase 1:** `adapter-contract.ts` (`runAdapterContract`) tests every adapter with a fake transport: validation, request shape and path safety, secrets, each response class, bounds and the observation cache. Fixtures carry a `_source` block. `docs/adapters.md` is the contribution guide. The harness found that Home Assistant, Uptime Kuma, AdGuard Home and the Proxmox validator accepted URLs over 2048 characters; all four now reject them.
- **Phase 2:** [ADR 0009](decisions/0009-declarative-integration-adapters.md). A closed manifest format in `packages/shared`, validated at startup and run by one interpreter. Jellyfin, Uptime Kuma, Home Assistant and AdGuard Home were migrated after a differential run (URLs, ids, credentials, responses) showed identical decisions, requests and data; their expectations live in `manifest-adapters.test.ts`. Type enums, stored keys, proposal schemas, the form, widget text, the picker and the catalog now derive from the definitions. Proposals now require `https://` for every HTTPS-only integration, not only Proxmox.
- **Phase 3:** Speedtest Tracker, Portainer, NetBird, Tailscale and Cloudflare added as manifests, each **implemented, unvalidated**. Fixtures are hand-written from the vendors' published schemas or source (cited, read 2026-11-12), not recorded from live services. Beszel (login flow with POST) and TrueNAS (WebSocket-only API) were skipped. Vocabulary extensions: `basic-key` auth, root-array counting, forwarded `maxBodyBytes`, field defaults and an optional brand icon; the transport and header whitelist are unchanged.
- **Phase 4:** a Proxmox connection can scope widgets and the top bar to one node (stored as public config `node`, picked from the inventory while editing). Whole cluster stays the default; a missing or offline node reports `unavailable` and never falls back to cluster totals.
- Validated: `pnpm check` and `pnpm build`. Not verified: any integration against a live service, the new UI in a real browser, screen readers, and the Tailscale scope names and NetBird role needed for a read-only token.
- Follow-ups: live validation of each integration; Beszel and TrueNAS need a login-flow or WebSocket decision; a ranked list of further integrations is in the pull request.

## Map canvas layout fix (2026-11-12)

- Fixed the clipped guest header: the guest button inherited the default button vertical padding, which left no room for its two text lines. Guest header height is now 52 and the button has no vertical padding.
- Loose containers (not linked, host not found, host unavailable) lay their services out in a grid of up to three columns instead of one tall column.
- Only one hint is shown: the drag hint when editing is allowed, the read-only hint otherwise.
- Manual dependencies are drawn as dashed arrows between service tiles (decorative, `aria-hidden`; the side panel and Host view remain the accessible equivalent). The canvas gets a dotted background and no longer stretches to 70% of the viewport height when the map is small.
- Not verified: rendering in a real browser (changes were checked only through tests, `pnpm check` and `pnpm build`).
- Follow-up: the map now takes the whole window like the mockup (fixed layer above the page, top bar with "Host list" and refresh, full-bleed canvas, zoom toolbar floating at the bottom centre, details panel floating at the right and shown only while something is selected; a bottom sheet on narrow windows). The page behind does not scroll while the map is open. Not verified in a real browser.

## Map polish: centred canvas, lighter details, breadcrumb header (2026-11-12)

- The map content is centred in the canvas (both axes) and keeps room for the toolbar and, on wide windows, the details panel.
- Clicking the empty canvas closes the details (not after a pan, not on a tile); Escape closes them when no dependency is being picked.
- The service details panel was reduced to what is needed: name and status, address, "Runs on" with a Change host toggle (the host picker opens only then), the impact line only when there is one, dependencies with a dashed "Add dependency" button, "Used by" only when something depends on it, and one "Open card" button. Empty rows ("nothing known", "no dependencies") no longer take space.
- The top bar follows the mockup: brand, Home › Service map breadcrumb, cluster name, refresh and host list. The mockup's "Beta" badge and "updated 40 s ago" were not added (the app has no beta flag and does not record the inventory time).
- Not verified in a real browser.

## Map: floating details (2026-11-12)

- Opening the details no longer reserves space or shifts the map: the panel floats over the canvas at the top right (a bottom sheet on narrow windows), sized to its content with a larger shadow. Not verified in a real browser.

## Settings reorganization

- The long Interface page was split into three: **Appearance** (theme, language, accent, background, custom CSS), **Home and pages** (layout, descriptions, uptime, pages) and **Top bar and shortcuts** (top bar, clock, search, keyboard). The sidebar groups them as Personalize and System and shows only titles on wide screens; descriptions remain on phones. The `/manage/settings/interface` route no longer exists (it was never linked outside the app).

## Home toolbar buttons (2026-11-12)

- The Group | Host | Map switch, "Suggested hosts" and "View" now share the same 36 px height (the switch was 32 px). The switch items have icons and the selected one is tinted with the primary colour and bold instead of a barely different dark background; "Suggested hosts" has an icon. Not verified in a real browser.

## Manage redesign

- The sidebar groups the sections as Manage (Services, Integrations), Automation (Agents, Activity) and System (Settings).
- Settings is a row of short tabs (Appearance, Home and pages, Top bar and shortcuts, Alerts, Public status, Backup); phones keep the list-then-page flow. Notifications and the monitoring defaults share the Alerts tab. Custom CSS is folded under Advanced in Appearance, which opens by itself when safe mode sends you there.
- Docker discovery moved from Settings to Integrations. `/manage/settings/notifications` and `/monitoring` redirect to Alerts, and `/manage/settings/discovery` to Integrations.
- Settings has a search field that jumps to the tab holding a setting. Appearance shows its preview in a sticky side column, accents and backgrounds as swatches, background image and card translucency under Advanced, and a floating bar to save or discard that appears only when something changed. Custom CSS stays in its own collapsible.
- The sidebar is full height with a badge for agent proposals waiting for review. Manage > Services always uses the list layout and has a name/address filter. Activity, Agents and Integrations already had the day grouping, review tab and connection list from the mockup.

## Coolify read-only integration (issue #102)

- Implemented all four phases in one change, **implemented, unvalidated**: [ADR 0010](decisions/0010-coolify-read-only-integration.md). Code adapter with a `read`-only Bearer token; summary widget; searchable inventory (`GET /api/connections/:id/resources`); card links by connection and resource UUID (table `integration_resource_links`, migration 0024); discovery with review; a separate Coolify state on the card with "needs review" for changed or missing resources; `Retry-After` exposed by the transport and a Coolify-only pause after 401, 403 and 429.
- Docs: [Coolify section](integrations.md#coolify) with set-up, permissions, troubleshooting and the live validation checklist; Portuguese set-up and troubleshooting in `README.pt-BR.md`.
- Not done on purpose: deployments in progress (the schema carries logs; deferred to validation), project and environment names (not in the documented list endpoints), addresses for services (no documented field; typed by hand), multi-team behavior at scale.
- Live validation (2026-11-12, Coolify v4.7.5, team token believed unrestricted): connection, test, widget (6 resources, 6 running), inventory with addresses and resources without an address, several domains on one application, link and discovery review, and an invalid token (generic error and pause) worked. A layout bug in the review dialog was found and fixed (`7a9d1a9`). Record in [integrations.md](integrations.md#coolify).
- Still open: a token **limited** to selected resources, an unreachable host, the exact `fqdn` separator for several domains, other `status` strings, services in detail, multi-team behavior and the real 429 path. The issue's live-validation item is therefore only partly done. Results of `pnpm check` and `pnpm build` are recorded in the pull request.

## Architectural cleanup (2026-11-12)

- Split the Drizzle table declarations into core, monitoring, operations, and Better Auth schema modules. The existing `schema.ts` and `@homora/db` exports remain the same; no SQL definitions or migrations changed.
- Moved Host Map host-link/dependency actions and their feedback into `use-host-map-editing.ts`; selection, diagram composition, and panel rendering remain in the map components.
- Centralized group rename start/cancel and focus restoration in `use-service-groups.ts`; Escape and the cancel control use the same operation.
- Extracted persisted group-collapse preferences and temporary reveal handling from `GroupSection` into `use-group-collapse.ts`.
- Extracted session-secret file handling and the bounded in-memory rate limiter from `auth.ts`; the auth module continues to re-export the existing helper API.
- Split MCP tool registration by capability: capabilities, services, proposals, integrations, hosts, Docker discovery and Proxmox. `mcp.ts` now composes the server and shared context; authorization and response behavior remain shared.
- Extracted managed proposal preparation into `managed-proposal-creator.ts` and approval/batch review into `proposal-review.ts`; the proposal service supplies transaction, pending-limit, version-fingerprint, and Proxmox validation dependencies.
- Extracted proposal listing, expiry/audit updates, stale-state calculation, agent-owned reads, and withdrawal into `proposal-queries.ts`; `proposals.ts` composes the query lifecycle with proposal creation and recreation.
- Extracted atomic batch creation and expired batch recreation into `proposal-batches.ts`; `proposals.ts` supplies the shared transaction-aware creators and batch context.
- Moved scoped agent-token issuance, authentication, rotation, revocation, and safe listing to `agent-identities.ts`; proposal creation/review still owns the transactional audit and change workflow.
- Extracted service and group editor state/actions into `use-service-editor.ts` and `use-service-groups.ts`; the dialog shell lives in `service-editor-dialog.tsx`. Page filtering and derived status/impact data live in `use-service-page-model.ts`; focus restoration, card navigation, and live announcements live in `use-service-page-focus.ts`; the Home arrangement and density controls live in `service-view-toolbar.tsx`; grouped card and organize-row rendering plus its drag/drop state live in `service-groups.tsx`. `services-page.tsx` composes the dashboard and coordinates its views.
- Split `ServiceCard` into a shared status/layout facade and dedicated list and tile renderers (`service-card-list.tsx` and `service-card-tile.tsx`); tile-only failure detail expansion stays with the tile layout.
- Extracted the remote discovery source rows and their lifecycle actions to `push-source-list.tsx`; `push-sources.tsx` keeps data loading, preview/import state, and dialog orchestration.
- Moved remote discovery creation, token reveal, inventory review, and lifecycle confirmation dialogs to `push-source-dialogs.tsx`; the page now composes dialogs with the list, status feedback, and agent setup instructions.
- Split the 38 end-to-end `App` UI journeys into dashboard, groups, proposals, authentication, and navigation suites while retaining the same scenarios and assertions.
- Split backend HTTP tests into service/group, configuration transfer, and authentication/origin suites; retained scenarios and made monitoring assertions independent of background check timing.
- Separated outbound notification delivery, queueing, and retry lifecycle into `notification-delivery.ts`; channel configuration and transition persistence remain composed in `notifications.ts`.
- Separated HTTP/ICMP probe execution and response classification into `service-probe.ts`; the monitor retains cycle scheduling, concurrency, invalidation, and publication.
- Extracted bounded traversal and manifest response extraction into `manifest-response.ts`; `manifest-adapter.ts` retains configuration validation, authorized requests, and adapter composition.
- Moved the authenticated shell and dashboard-wide command, shortcut, and preference composition from `App.tsx` to `pages/dashboard-page.tsx`; `App.tsx` now focuses on authentication and route selection (155 lines).
- Consolidated the Proxmox legacy migration startup wrapper into `legacy-proxmox.ts` with the transactional migration; the server and migration tests now import the migration boundary directly.
- Moved service form dialog wiring, host inventory fields, and dependency selection from `services-page.tsx` into `service-page-editor.tsx`; the page now passes the editor workflow as one unit.
- Extracted Host Map zoom, fit/reset, reduced-motion scrolling, and mouse-pan handling to `use-host-map-viewport.ts`; selection and host/dependency editing remain coordinated by the map component.
- Split the former 569-line core translation catalog into shared/authentication, application shell, service cards, service groups, and service form catalogs; the largest resulting file is 177 lines and the exact locale key contract remains enforced.
- Split agent management/connection messages from proposal review messages; `agents.ts` remains the import facade and the English source and Portuguese exact-key contract are unchanged.
- Extracted the proposal TTL form and pending, expired, and history views from `agents.tsx` to `proposal-workspace.tsx`; initial load and refresh now share one data-fetch operation, avoiding the previous duplicate pair of initial requests.
- Extracted the identity list, empty/revoked states, token dialog, and create/rotate/revoke UI to `agent-identity-workspace.tsx`; `agents.tsx` now composes the proposal and identity tabs (195 lines).
- Extracted the image upload/removal and advanced image, opacity, and blur controls from `appearance-settings.tsx` into `appearance-advanced-settings.tsx`; the settings coordinator retains draft/save/contrast behavior.
- Split route-specific settings content out of `interface-settings.tsx` into `home-settings.tsx` and `top-bar-settings.tsx`; the interface module now only owns theme, locale, appearance, and custom CSS settings.
- Extracted each Coolify discovery resource's editable review card into `coolify-discovery-row.tsx`; row validation and address/group normalization live in `coolify-discovery-model.ts`, while the dialog coordinates individual saves and retries.
- Moved appearance CSS token generation and its tests from `packages/shared` into the frontend; the shared package now contains the appearance contract, parsing, color calculations, and contrast policy only.
- Split service, host-link, and uptime contracts out of `packages/shared/src/index.ts`; the package entry point now only re-exports its domain modules.
- Split benchmark support helpers by process metrics, server lifecycle, HTTP/load generation, monitored targets, database seeding, and reporting; the existing `bench/lib.ts` imports remain compatible through a barrel.
- Split the 1,053-line benchmark runner into CLI/runtime setup, focused workload suites, and a small runner that preserves the original suite order and server cleanup boundary.
- Split the configuration-transfer format into shared import/export contracts, serialization, parsing/validation, and import planning modules; retained `config-transfer.ts` as the existing public facade.
- Moved connections-page state and API operations to `use-connections-page.ts`; `connections.tsx` now composes the connection, widget, and Coolify resource views.
- Moved notification-channel loading, save, test, and delete operations from `notification-settings.tsx` to `use-notification-settings.ts`; the component retains channel groups and form presentation.
- Moved remote discovery source loading, token lifecycle, inventory review, and import requests to `use-push-sources.ts`; `push-sources.tsx` keeps the management and review dialogs.
- Moved service deletion and host-link HTTP calls from `services-page.tsx` into `use-services.ts`; the page retains confirmation, feedback, and post-operation refresh coordination.
- Split optimistic card/group ordering, group/page movement, and undo actions from service list loading into `use-service-ordering.ts`; `use-services.ts` now retains collection state and its API lifecycle (206 lines).
- Moved agent/proposal API operations, lifecycle state, expiration timing, and derived lists into `use-agent-workspace.ts`; `agents.tsx` now coordinates the page and its dialogs while `proposal-workspace.tsx` owns proposal presentation.
- Kept frontend API/state hooks under `apps/frontend/src/hooks` per engineering standards; extracted public-status and Docker source DTOs into feature model modules shared by hooks and presentation.
- Moved local Docker discovery requests/import actions, service failure history, and uptime percentile requests from UI components to `use-local-discovery.ts`, `use-service-failure-details.ts`, and `use-uptime-details.ts`.
- Moved Proxmox node-option loading to `use-proxmox-node-options.ts`; the picker keeps its select and manual text fallback.
- Moved account session loading and revocation requests to `use-account-sessions.ts`; the component keeps confirmation behavior and feedback. The session-list test now sets its locale explicitly so it does not depend on persisted browser state.
- Moved account profile and password mutation requests to `use-account-mutations.ts`; account forms retain local input, pending, and feedback state.
- Moved activity filtering, pagination, and API-backed feed state from `activity-page.tsx` to `use-activity-feed.ts`; the page now composes filters and feed presentation.
- Moved instance monitoring defaults and Proxmox connection-option loading from settings components to `use-monitoring-defaults.ts` and `use-proxmox-connections.ts`.
- Moved transfer page-option loading and import preview/apply HTTP requests from `config-transfer.tsx` to `use-config-transfer-api.ts`; the component retains file handling, review, and user feedback.
- Moved service removal, group movement with undo, and ordering feedback into `use-service-page-actions.ts`; structured `ServiceGroups` inputs into data, presentation state, and action contexts to clarify the parent-child contract.
- Separated the service form's optional metadata and monitoring controls into `service-form-advanced.tsx`; the main form retains essential fields, optional host/dependency controls, and submission.
- Centralized the authorized JSON transport used by integration reads and Proxmox address lookups in `integration-transport.ts`; destination validation, TLS, body limits, headers, and existing invalid-JSON behavior are preserved.
- Loaded the integrations, agents, activity, account, and settings pages on demand from the authenticated dashboard, with the existing skeleton system as the suspense fallback. The frontend build's main JavaScript chunk dropped from 1,083.09 kB (308.70 kB gzip) to 585.23 kB (172.93 kB gzip); the >500 kB warning remains.
- Loaded the alternate Host and Map service presentations on demand. Focused services, map, and navigation suites passed (28 tests); the main JavaScript chunk is now 498.59 kB (148.99 kB gzip), below Vite's 500 kB warning threshold.
- Extracted the dashboard summary, view controls, host impact banner, and organize controls into `service-dashboard-header.tsx`; `services-page.tsx` retains page-level composition.
- Moved host-suggestion, Coolify review, and group-removal overlays into `service-page-overlays.tsx`; the services page keeps their state and composes the views.
- Extracted the host-map breadcrumb and navigation actions into `host-map-header.tsx`; the map retains selection, viewport, and canvas coordination.
- Split command-palette navigation, common actions, and web-search rows into `command-palette-commands.tsx`; `command-palette.tsx` retains query parsing, result ranking, and selection behavior.
- Moved appearance draft synchronization, custom accent validation, contrast checks, dirty state, and discard behavior into `use-appearance-draft.ts`; server persistence and control composition remain in `appearance-settings.tsx`.
- Extracted accent, custom HEX, and background preset controls to `appearance-colors.tsx`, leaving the settings module to coordinate persistence, contrast feedback, and preview (`appearance-settings.tsx`: 231 lines).
- Extracted Coolify inventory rows, selection controls, linked-card labels, and per-resource menu actions to `coolify-resource-table.tsx`; the sheet coordinates search, filters, refresh, and link/create dialogs.
- Moved the Coolify resource-card and group reference DTOs to `connection-model.ts`, shared by the resources hook and inventory table.
- Moved host suggestion selection, bulk acceptance, decisions, and undo behavior to `use-host-suggestion-review.ts`; separated evidence-backed and manual-only rows into `host-suggestion-rows.tsx`.
- Moved suggestion, evidence, and decision DTOs into `features/hosts/host-suggestion-model.ts`, shared by the suggestion API hook, review hook, and row components.
- Split the host map's service details panel into `host-map-service-panel.tsx`, selected service/guest panel into `host-map-selection-panel.tsx`, and node, guest, service, and dependency rendering into `host-map-diagram.tsx` (`host-map.tsx` is now 450 lines); split the 713-line integration catalog into shared contracts plus one definition file per integration, retaining `integration-manifest.ts` as the public facade.
- Moved group/page assignment and ordering rules into `service-group-configuration.ts` and configuration import/export orchestration into `service-configuration-transfer.ts`; `service-configuration.ts` now focuses on card, host-link, and version rules (363 lines).
- Extracted service-card mutation and reviewed proposal application into `service-card-configuration.ts`; `service-configuration.ts` now composes card reads, shared transaction/version context, groups, and transfer operations.
- Isolated the transactional legacy Proxmox migration and migrated-connection id resolver in `legacy-proxmox.ts`; proposals and managed widget changes now share the same tombstone and live-connection checks.
- Moved uptime queries, bucketing, and latency summary calculations to `service-uptime.ts`; `service-observations.ts` retains observation publication, lookup, and failure history.
- Extracted stored-config/credential validation and secret/certificate update rules into `integration-connection-config.ts`; widget persistence and service references now live in `integration-widgets.ts`; `integration-connections.ts` focuses on connection lifecycle, persistence, caches, and adapter dispatch (338 lines).
- Validation: after moving discovery, failure-history, uptime, and Proxmox node-option APIs into hooks, `pnpm check` passed (111 Vitest files, 1,234 tests, and 14 script tests) and `pnpm build` passed across all four packages. Focused discovery, service-card, and uptime suites passed (14 tests); connection page/node-picker tests passed (17 tests). Earlier focused service page/App (40), map (20), widgets/connection/migration (13), and proposal (21) suites passed. The build still reports the main JavaScript chunk above 500 kB. Prettier and `git diff --check` passed. The cleanup is still in progress.
- Validation after the latest services-page boundary changes: the focused services page suite passed (2 tests), `pnpm check` passed (111 Vitest files, 1,234 tests, and 14 script tests), `pnpm build` passed for all four packages, and `git diff --check` passed. The Vite bundle-size warning remains.
- Validation after splitting palette commands: the focused palette suite passed (14 tests), `pnpm check` passed (111 Vitest files, 1,234 tests, and 14 script tests), and `pnpm build` passed across all four packages. `command-palette.tsx` is now 264 lines; the bundle-size warning remains.
- Validation after splitting appearance draft state and color controls: the focused appearance suite passed (14 tests), `pnpm check` passed (111 Vitest files, 1,234 tests, and 14 script tests), and `pnpm build` passed across all four packages. `appearance-settings.tsx` is now 231 lines; the bundle-size warning remains.
- Validation after extracting Coolify inventory rows: the focused resource suite passed (8 tests), `pnpm check` passed (111 Vitest files, 1,234 tests, and 14 script tests), and `pnpm build` passed across all four packages. `coolify-resources.tsx` is now 243 lines; the bundle-size warning remains.
- Validation after splitting host suggestion review state and rows: the focused suite passed (6 tests), `pnpm check` passed (111 Vitest files, 1,234 tests, and 14 script tests), and `pnpm build` passed across all four packages. `host-suggestions-panel.tsx` is now 167 lines; the bundle-size warning remains.
- Validation after the Host Map interaction extraction: focused map/layout suites passed (26 tests), `pnpm check` passed (118 Vitest files, 1,234 tests, 14 script tests), `pnpm build` passed across all four packages, and `git diff --check` passed. The Vite bundle-size warning remains.
- Validation after centralizing group rename cancellation: focused service-page, group-flow, and group-section suites passed; the group-flow test confirms Escape restores focus to the edit control.
- Validation after extracting advanced service form controls: `pnpm exec vitest run apps/frontend/src/components/service-form.test.tsx` passed (3 tests), `pnpm check` passed (118 Vitest files, 1,234 tests, 14 script tests), `pnpm build` passed across all packages, and formatting plus `git diff --check` passed. The existing Vite bundle-size warning remains.
- Validation after centralizing integration HTTP transport: focused Coolify, host suggestion, manifest adapter, and Proxmox migration suites passed (62 tests); `pnpm check` passed (118 Vitest files, 1,234 tests, 14 script tests), `pnpm build` passed, and formatting plus `git diff --check` passed. The frontend bundle warning remains under review.
- Validation after on-demand page and host-view loading: the focused application suites passed (38 tests), service/map/navigation suites passed (28 tests), `pnpm check` passed (118 Vitest files, 1,234 tests, 14 script tests), and `pnpm build` passed across all packages. The main JavaScript chunk is 498.59 kB (148.99 kB gzip); `git diff --check` passed. The i18n navigation test now waits for the lazy Settings heading.
- Final organization review: remaining source files above 300 lines are page composers, cohesive domain validation/policy modules, message catalogs, or test contract/scenario suites. Their responsibilities are already explicit; further splitting solely to lower LOC would fragment those units. The current architectural cleanup scope is complete and validated locally; no commit or PR was created.
- No API, MCP tool names, scopes, or user-visible responses were intentionally changed.

## Uptime status: incidents, banner and degraded state (2026-11-12)

Phase 1 of the uptime redesign (see [ADR 0024](decisions/0024-incidents-and-alert-thresholds.md)).

- [x] Incident log derived from checks, rebuilt from history on first start; `GET /api/services/:id/incidents`.
- [x] Per-service failure/recovery thresholds and degraded latency, applied to incidents and alerts (anti-flapping).
- [x] Health banner (problems with duration, uptime, incidents per week, recovery time, 30-day target and error budget).
- [x] Degraded state (amber) on cards and bars; failure reason and "down since" on the card.
- [x] History bars with tooltip, selectable detail (click, tap, arrow keys), latency line and axis; recent incidents in the history panel.
- [x] Phase 2: service detail page (`/services/:id`), p50/p95 latency chart, 90-day heatmap, failure reasons, incident table, latest checks and previous-period comparison on the cards. Backed by an hourly rollup table (`service_uptime_rollup`, migration 0026, about 100 days) filled from every new check and backfilled from the raw history once. Not done from the mockup: pause, schedule maintenance and check-now buttons, CSV export, the alert column and the TLS block (they depend on features of Phases 3 and 4).
- [x] Phase 3: TCP, DNS, TLS certificate, keyword and JSON checks (check-type tiles in the service form), scheduled maintenance per service (dashboard blue state, banner line, detail page panel and dialog), TLS certificate stat in the banner ([ADR 0012](decisions/0012-check-types-and-maintenance.md)). Not done from the mockup: heartbeat (push) checks, recurring windows and windows for a whole group, DNS server/record type/expected answer, ICMP packet count, and the redirect-following/TLS-warning toggles.
- [x] Phase 4: free-form tags per service (own table `service_tags`, migration 0029, kept out of the check signature; editor in the service form, chips on the card, tag filter on the Home), ntfy and Discord notification channels (secrets encrypted like the others; ntfy token optional, private ntfy servers need the per-channel "allow private" opt-in), status chips on the Home (All / Offline / Degraded / In maintenance, with counts) and problems-first ordering (offline, then degraded) inside each group, and a wider public status page (90 daily bars with 90-day availability, last-30-day incident list and upcoming/active maintenance; still opt-in per service and without reasons, notes, URLs or ids). Not done from the mockup: the e-mail channel (needs SMTP settings), the per-event toggle panel for channels, and a configurable SLA target (the endpoint exists, there is no UI).

Verification: `pnpm check` (1266 tests) and `pnpm build` pass. The uptime performance budget in
`service-uptime.test.ts` was raised (7 d 300 → 450 ms, 30 d 1000 → 1500 ms): the bars now read the mean
latency and failure reason of each period, and the original code already reached ~940 ms under the
parallel suite. Checked in Chromium against the mockup at 1440 px and 390 px (dark): banner, degraded
and failing cards, bar tooltip and detail, expanded history with incidents.

### Localization migration to i18next

- Replaced the frontend's custom message resolution, plural handling, language detection and React subscription with i18next, its browser detector and react-i18next. Existing browser preferences, message keys, interpolation syntax and integration catalogs remain compatible.
- Backend API errors retain stable codes and English defaults; the frontend translates known codes. Telegram, Discord and ntfy notifications use a language selected per channel; existing channels default to English, and webhook JSON remains unchanged. MCP clients do not inherit the browser language.
- The application retains thin typed helpers for existing call sites and locale-aware formatting. Adding a language still requires catalog coverage and tests; it is not automatic.

- Notification delivery errors now include a stable API code. Migration coverage checks preservation of existing channel data. Live notification providers and browser layout were not verified.

### Localization audit follow-up

- Reviewed backend error boundaries and frontend translation helpers. Existing notification delivery diagnostics are translated at display time, with unknown values reduced to a generic message and HTTP status codes retained. MCP and upstream authentication errors remain separate protocol/client boundaries; not all runtime dependency errors have a localized code.
- Kept typed application and integration adapters because they serve existing non-React call sites, dynamic fallback contracts and locale-aware formatting. The dynamic fallback now uses the public i18next translation API instead of its interpolator service.
- Validation: `pnpm check` (1,357 application tests and 18 script tests) and `pnpm build` passed. Browser layout and live notification delivery remain unverified.

### MCP, agent and proposal boundaries (issue #136)

- Mapped transports, scope enforcement, tools, identities and the proposal domain
  ([ADR 0014](decisions/0014-mcp-agent-proposal-boundaries.md)). Extracted `mcp-identity.ts`,
  `mcp-responses.ts`, `mcp-proposal-schemas.ts` and `agent-changes.ts`, removing the tool-to-tool
  import and the `proposals` ↔ `proposal-review` cycle. A separate package was evaluated and deferred.
- Behavior is unchanged; this does not complete R4 (issue #124), whose criteria stay open.
- Validated with `pnpm check` (includes the MCP, governance, lifecycle and concurrency suites) and
  `pnpm build`. No live-infrastructure validation was performed.

### Monitoring capability boundary (issue #135)

- Monitoring code moved to `apps/backend/src/monitoring/` behind `monitoring/index.ts`; an ESLint rule blocks deep imports from outside. Import map, flow and pure/I-O split are in `docs/architecture.md`; the no-package decision is in [ADR 0013](decisions/0013-monitoring-capability-boundary.md). No migration, API, MCP or notification behaviour changed.

### Shared localization catalogs

- Moved application and notification catalogs into `packages/i18n`, with separate frontend and notification entry points and shared locale metadata. The frontend still combines integration-owned translations with the application catalog; i18next initialization remains specific to each app.
- Updated Docker dependency-stage manifests and contributor guidance. Validation: `pnpm check` (1,363 application tests and 18 script tests), `pnpm build`, and a production backend Docker build with a runtime import of the notification catalog. Adding a language still requires configuring both apps, integration catalogs and appropriate plural, formatting and direction support.

### Configuration transfer boundary

- Moved format contracts, parsers, importers, planner and serializer into `apps/backend/src/transfer/` behind `index.ts`; `MAX_GROUP_COLUMNS` now lives in `group-limits.ts`, removing the reverse dependency from group configuration. Persistence, authorization and confirmation stay in `service-configuration-transfer.ts` and the routes. Decision: no workspace package yet ([ADR 0015](decisions/0015-configuration-transfer-boundary.md)).
- No format, limit or data change. Validation: `pnpm check` (1,363 application tests; an earlier run had load-dependent timeouts in unrelated tests that passed on rerun) and `pnpm build` passed. Live Docker and browser import/export were not verified.

### Remembered sign-in

- Added an opt-in persistent sign-in with a fixed 30-day lifetime; ordinary sign-in uses a browser-session cookie and expires after eight hours. Neither renews automatically. Existing session revocation remains available. Browser session restoration can retain session cookies.
- API tests cover cookie attributes, server expiry and revocation. Real browser close and restore behavior has not been manually verified.

### Notification responsibility boundary (issue #139)

- Extracted channel configuration, vault access and public DTOs into `notification-channels.ts`;
  transition persistence and delivery composition remain in the backend facade. Documented the
  monitor contract, queue lifecycle and decision to defer a package and provider registry. No
  notification policy or data migration was introduced.
- Validation: targeted notification and monitoring suites (79 tests), `pnpm check` (1,364 application and 18 script tests) and `pnpm build` passed. Live provider delivery was not verified.

### Docker discovery capability boundary (issue #138)

- Grouped local source access, remote push storage and shared label parsing behind
  `discovery/index.ts`; routes and MCP retain their separate authorization, review and version
  checks. The parser continues to use the transfer collector. No separate package was added:
  there is no independent consumer for the backend capability. See architecture for ownership.
- Validation: targeted discovery, MCP and service-default suites (26 tests), `pnpm check`
  (1,364 application tests and 18 script tests), and `pnpm build` passed. No real Docker host
  was accessed; live validation was not performed.

### Frontend feature boundaries (issue #140)

- Inventoried ownership and cross-feature edges in architecture, revised the hook convention,
  and colocated three settings-only hooks with their consumers. Navigation metadata remains
  separate from view entry points to preserve lazy loading. Shared stores and UI stay shared;
  no independent consumer justifies another frontend package. Further feature moves remain
  subject to dependency review, especially service/uptime and the settings/public-status edge.
- Validation: 38 focused settings and navigation tests, `pnpm check` (1,364 application
  and 18 script tests), and `pnpm build` passed. The build retains a separate settings chunk;
  desktop and mobile browser flows were not manually verified because rendered behavior did
  not change.

### Two-step verification (issue #148)

- Added optional TOTP two-step verification with ten one-time recovery codes ([ADR 0016](decisions/0016-two-factor-authentication.md)): migration `0031`, five forwarded Better Auth routes, a sign-in challenge that is not recorded as a login until verified, password re-authentication, other sessions ended on enable/disable, attempt limits, an Account section (QR code, setup key, recovery codes) and a login step. `pnpm auth:reset` also clears the new tables and `--two-factor-only` removes only the second step. The session secret now also protects the authenticator secret and must be backed up with the database.
- Validation: API, interface, migration and script tests (backup/restore, lost secret, both resets). Not verified: a real authenticator app, a real browser, OIDC (#147) and passkey interaction (not implemented).

### Passkey sign-in (issue #149)

- Added optional passkey (WebAuthn) sign-in for the single administrator ([ADR 0017](decisions/0017-passkey-sign-in.md)): `@better-auth/passkey` 1.7.21, migration `0032` (`passkey`, unique credential ID, cascade with the user), seven forwarded routes with validated and reduced bodies and responses, required user verification with discoverable credentials, RP ID/origins from configuration (`HOMORA_PASSKEY_RP_ID`, default `localhost`) and never from request headers, password re-authentication to add or remove, other sessions ended on removal, the password session lifetime (8 hours, or 30 days with “Keep me signed in”), a passkey sign-in that does not trigger the authenticator code (policy stated, tested and shown in the interface), attempt limits, audit events, an Account section (add, rename, remove, several passkeys) and a sign-in button that explains itself when the browser or address cannot use passkeys. `pnpm auth:reset` also deletes passkeys and `--passkeys-only` removes just them.
- Validation: API tests with a software authenticator (replay, tampering, wrong origin/RP ID, missing user verification, expired challenge, unknown credential, rate limit, sessions, second-step policy, closed routes, forged headers), config, interface, migration and script tests (backup/restore with a different session secret, both resets, legacy database). A manual browser pass on `localhost` with headless Chromium and its virtual authenticator (CTAP2, internal, resident keys, user verification): account creation, wrong password refused, adding a passkey, passkey sign-in with a browser-session cookie (`HttpOnly`, `SameSite=Strict`), the explanation on `127.0.0.1`, removal and refusal afterwards. **Not verified:** a real hardware or platform authenticator, other browsers (Firefox, Safari), the HTTPS reverse-proxy scenario with `HOMORA_PASSKEY_RP_ID` in a browser (covered only by configuration and API tests), and OIDC (#147) interaction (not implemented; it must choose its own second-step policy).

### OIDC sign-in (issue #147)

- Added optional OpenID Connect sign-in for the single administrator ([ADR 0032](decisions/0032-oidc-sign-in.md)) on Better Auth's own `genericOAuth` plugin, with no custom protocol code and no schema change: one provider from `HOMORA_OIDC_*` (off by default, secret only in the environment); sign-up and implicit linking disabled, so only an explicitly linked provider/subject (the library's `account` row, provider id derived from the issuer, password confirmed) opens the account; provider tokens dropped before storage; only the `state` cookie is `Lax`, the session stays `Strict`; redirect origin taken from configuration; start routes and one forwarded callback route (outcome reduced and audited), every other Better Auth route still closed; 8-hour browser session, local logout, no local second step (stated); an Account section, a sign-in button and `pnpm auth:reset --oidc-only`. **Divergence from the issue:** the plugin uses its own HTTP client, so the provider requests do not use Homora's restricted transport (no pinned DNS, redirects or private-range block); documented in the ADR.
- Validation: API tests against a real HTTP mock provider that signs genuine JWTs and enforces PKCE, client credentials, redirect URI and single-use codes (success and every refusal listed in the ADR), configuration, reset-script and interface tests. A manual pass in headless Chrome (agent-browser) against a mock provider over HTTPS with its own CA (`NODE_EXTRA_CA_CERTS`): link with password, session kept after the cross-site callback, OIDC sign-in, a different subject refused, a denied consent shown, no provider tokens in the database, audit entries as expected. **Not verified:** a real provider (Authentik, Keycloak, …), an HTTPS reverse proxy with a real certificate, other browsers, provider-side logout (not implemented).
- Follow-up from a local pass with a real Keycloak 26.4 (single-container image behind a Caddy HTTPS proxy with a private CA, headless Chrome): fixed the sign-in page losing the provider button after sign-out until a reload, removed an unused “keep me signed in” field from the OIDC start request, and corrected the documented behaviour when the provider goes down after discovery. Link, sign-in, refusal of another user with the administrator's e-mail, denied consent, unlink and relink, provider down and recovery, `Secure`/`HttpOnly`/`Strict` session cookie, null provider tokens, and no client secret or JWT in the backend log were observed. Still not verified: the owner's own provider and proxy, and other browsers.
- Local pass with a real Authentik 2026.8.7 (same image and HTTPS proxy setup, headless Chrome). A provider without a signing key advertises HS256 and its ID token was refused; with the self-signed signing key, link, sign-in, refusal of another user with the administrator's e-mail, unlink and relink, provider down and recovery passed. Authentik reported `email_verified: false`, which did not prevent the explicit link or sign-in. Provider tokens stayed null and no client secret or JWT appeared in the backend log. A refusal at the provider was not exercised with Authentik. The signing-key requirement is now in the guides.
- Security review follow-up (issue #147): a second identity can no longer be linked by concurrent attempts, and removal deletes every link and pending attempt, also with OIDC switched off; a token response without an ID token no longer signs in through userinfo (the ID token must now carry `email`); the discovered issuer must match the configured one; a replayed or expired callback returns to the sign-in page; the sign-in page recovers after going Back from the provider; a failed link says so; the log warns about an HMAC-only provider; the guides' redirect URL, scopes and two non-existent variables were corrected; Compose passes `NODE_EXTRA_CA_CERTS`; the reset script refuses combined `--*-only` flags. Validation: each new security test fails with its fix removed; a local pass with real Keycloak 26.4 and Authentik 2026.8.7 (headless Chrome, private CA) repeated link, sign-in, refusal, unlink, relink and provider-down, and showed the HMAC warning and the failed-link message. Not verified: Back restoring the page from the browser's back/forward cache (covered only by the interface test), Compose with a mounted CA, other providers and browsers.
- OIDC provider configured from the interface (issue #380, [ADR 0032](decisions/0032-oidc-sign-in.md) amended): saved provider and draft sealed with the vault (migration `0052`, `oidc_settings`), precedence over the variables, password on every change, confirmed issuer change, health check, optional automatic redirect and 30-day provider sessions. A security review of the change led to isolating the provider in its own Better Auth instance (a silent provider could stall every session and the password), picking up a reset made while running, never using a draft's secret by accident, removal of links and unreadable settings in every state, and one rule for never replacing the encryption key. Validation: API, interface, migration and script tests; each new protection's test fails without it. Local pass with real Keycloak 26.4 and Authentik 2026.8.7 behind a local HTTPS proxy with a private certificate authority (single-container image, headless Chrome): draft, save, link, sign-in with 8-hour and 30-day sessions, refusal of another user with the administrator's e-mail, no provider tokens stored, automatic redirect (including silent return, sign-out and `?local=1`), provider stopped and provider that never answers (password sign-in unaffected), reset while running, confirmed issuer change, disable, enable, removal and the phone layout in Portuguese. It found two defects, both fixed: a repaired provider kept failing until restart (the library keeps the signing algorithms it first read), and the dialog could scroll its title away. Found and not changed: the container images do not include `scripts/auth-reset.mjs`, which the guides run with Docker Compose. Not verified: other providers and browsers, the owner's own provider and proxy.

### Pi-hole v6 and session authentication

- Added a built-in read-only Pi-hole summary and a host-owned session login capability
  ([ADR 0018](decisions/0018-integration-session-auth.md)); session login is the only POST allowed
  for the integration and does not grant service writes.
- Contract, network, session and connection tests cover mock responses. A user reported a
  successful live test; detailed validation of app-password privileges and payloads remains pending.

### Reusable integration session profiles

- Moved Pi-hole's login body, response paths and session header into its built-in registration.
  The shared transport validates a bounded profile and manages the session and network policy;
  a synthetic username/password and Bearer-token profile exercises a different contract.
  Other methods, encodings and headers still need review; no new external integration is claimed.
- Validation: `pnpm check` (1,481 application tests and 25 script tests) and `pnpm build` passed.
  A user reported that Pi-hole worked in a live test on 2026-11-13; version and individual checks
  were not provided, so detailed live validation remains pending.

### Per-service link opening (issue 165)

The service form offers the existing new-tab behavior and same-tab navigation. The choice is
stored per service, defaults to new tab for existing data, and travels in native exports and
imports. Service links in the dashboard and host views and the command palette respect it.
Automated coverage checks the migration, form, card links, persistence and import/export;
manual responsive and keyboard verification in a browser remains pending.

### Multiple addresses per service: the Links menu (issue 162)

- A service keeps its main URL and can have up to 10 extra addresses (LAN IP, admin, docs), each
  with an optional name, a type and an "open in" override. Cards, list rows, host views and the
  map panel show a Links button only when a service has extras; it opens a popover (a bottom sheet
  on a phone) with open and copy actions. The command palette lists extras under each service
  while searching. Duplicate addresses are allowed; extras are not monitored.
- Types are shared and created from the form (combobox with create, rename, color and delete,
  max 20, no red). Types are saved immediately through `/api/link-types`, not with the form.
  Native export format is now version 4 (older versions still import); the import preview
  reports ignored links as warnings only.
- Validation: shared, migration, API, transfer and component tests, `pnpm check` and `pnpm build`;
  a Chromium pass on a development database covered the card menu, the phone bottom sheet, the
  command palette, the form and creating a type from the combobox (desktop 1280px and 390px).
  Not verified: keyboard-only and screen-reader use, other browsers, importing a file with links
  through the UI. Not done: managing types outside the form.

### Independent widgets (issue #159)

- Created an internal contract, clock, and additive storage for per-page instances; legacy rows
  and local top-bar preferences retain their meaning. Native configuration transfer
  includes clocks and marks connected widgets that need to be recreated with a selected source.
  Decision and boundaries: [ADR 0019](decisions/0019-widget-sdk.md); inventory:
  [widgets](issue-159-widget-inventory.md).
- Validation: contract tests, API and frontend tests, migration and recovery on temporary databases,
  transfer and full project checks; desktop and mobile browser passes covering creation,
  editing, keyboard reordering, page switching, removal, and simulated telemetry. The backend
  Docker image was built and the package loaded in the container. No live service was accessed.

### Page widgets: quieter management (2026-11-13)

- The Home shows widgets as plain information, with no header or toolbar. A dashed tile after
  the last card adds a widget; each card has a `⋯` menu for its own actions (edit, move earlier or
  later, move to another page, remove with confirmation), visible on hover and focus and always on
  touch. Cards can also be dragged to reorder.
- Adding opens a searchable gallery (Homora and connections), then the options with a live clock
  preview; name and page are collapsed. Editing skips the gallery and does not change the type.
- Validation: component interface tests; browser verification pending.

### Home redesign: compact tiles, rails, causes, drawer and favorites (2026-11-14)

Delivered as one change for issue #179 (mockup linked there); items are named by their issue ids.

- Compact tile is the default layout (N6), with groups that collapse when healthy and a problems-first order (N8). The
  layout toggle is Compact, List, Cards; the **Display** popover also holds descriptions and the uptime period (C4).
- Left rail with the four status filters and the groups with their health (N4, C2, C3), right widget panel (N9, C7,
  C1), widget panel off switch, stale and not-configured widget states (N10).
- Pulse windows (N1), **Needs attention** with probable causes (N2), acknowledge and mute with Undo and an audit trail
  (N3), alerts bell (N12), `g` then `p` (C8), top-bar filter field (C9).
- Details drawer and bottom sheet (N7, C5, C10), favorites with a Pinned row and a Favorites view (N5; migration `0037`,
  export and import), page tab menu (N13), empty states (N16), Organize on the Home toolbar (C6), phone bottom bar (N14),
  distinct unknown, not monitored and degraded tiles (N15), undo toasts for pin, acknowledge and moves (N11).
- Decisions taken with the author: causes are computed in the browser as a tested pure function; acknowledging does not
  pause notifications; favorites and Pinned share one field and the row is global.
- C5 completed: with the drawer, the card drops the History toggle, the axis labels and the "Incidents and charts" link;
  the drawer shows the period selector, latency, incidents and the axis. Cards outside the Home (no drawer) keep the old controls.
- Bangs (`!g`, `!w`, `!gh`…) work only while the opt-in web search is on and send only the text after the prefix (N/A in
  the issue list: decision 8). A page holds at most 12 widgets (`MAX_WIDGETS_PER_PAGE`; decision 2): creating or moving
  into a full page is refused with `widget-limit`, and an import skips the widgets that do not fit.
- Screenshots retaken for the changed Home: dashboard (dark, light, Cards), details drawer (new), command palette, organize
  mode, Settings → Home and pages, and the phone view. They use synthetic data; statuses and uptime were fabricated in the
  browser because the sandbox cannot reach monitored services. Host view, host map, service detail, integrations, agents and
  activity were not retaken and still show the old top bar.
- Validation: see the pull request for the commands and results.

### Documentation: showcase README, user guide and fresh screenshots (2026-11-13)

- The README is now a showcase (value, quick start, features, screenshots, use cases, integrations, security
  posture, documentation map); `README.pt-BR.md` mirrors it. The operational detail that used to live in the README
  moved, unchanged in substance, to a task-oriented [user guide](user-guide/README.md): getting started, dashboard,
  services and monitoring, notifications and status page, integrations and widgets, Docker discovery, agents and MCP,
  appearance, import/export/backup, accounts and security, deployment and use cases.
- All screenshots were deleted and retaken from a demo installation with synthetic data (mock HTTP servers, a mock
  Proxmox connection with a fictional node and guest inventory for the Host and Map views, a scripted agent proposal,
  generated history, and example `192.168.10.x` addresses substituted in API responses); the method and file list are in
  [screenshots](screenshots/README.md). The agent walkthrough now uses the new proposal review images.
- Validation: relative links and anchors in the changed Markdown were checked with a script; Prettier was applied;
  every screenshot was inspected visually. Statements about behavior were taken from the code, ADRs and message
  catalogs, not from running every flow. Not verified: live-service behavior of the integrations, and the
  wording of the Portuguese README beyond a direct translation.
- Known gap: some interface messages still say "see the README" for Docker discovery; the guide is now
  [docker-discovery.md](user-guide/docker-discovery.md).

## Short service aliases (issue #164)

Optional aliases use authenticated `/go/<alias>` navigation and travel in Homora exports (version 5). Import previews warn and omit invalid or conflicting aliases. Homepage and Dashy aliases are not imported. HTTP routing and authenticated resolution were checked through local Vite and an isolated Compose stack. Interactive browser validation remains pending.

## Proposed maintenance windows (issue #185)

Agents with the dedicated `maintenance:propose` scope can list active and upcoming windows
per card and propose creation or cancellation individually or in a batch. Approval applies
the exact period and records the reviewer; overlaps and changed cancellation targets are
revalidated transactionally. Existing tokens do not acquire the scope automatically.

Validation: focused MCP and proposal tests, `pnpm check` (1,661 application tests and
25 script tests) and `pnpm build` passed. Browser review and a live MCP client using
the HTTP and stdio transports were not manually verified.

### Separate monitoring address (issue #184)

- Added an optional check URL, taking precedence over the card URL and check path for all check types. It uses the existing destination policy and per-service private-network permission. Native exports use version 6; earlier versions remain readable. Existing services retain their monitoring signatures when the field is absent.
- Validation: `pnpm check` (1,663 application tests and 25 script tests) and `pnpm build` passed. Browser layout and a live origin behind Cloudflare Access were not verified.

### Uptime Kuma monitor details (issue #188)

- Added a reusable bounded grouped-row extraction with named typed fields and a second public status-page request. Status data includes published monitor ids, names, groups and latest heartbeat states while preserving the existing aggregate and widget summary. Missing heartbeats remain unknown; duplicate ids keep the first group. The limit is 50 distinct monitors, and a failure of either request prevents the observation.
- Validation: focused contract and interpreter tests; live Uptime Kuma version compatibility remains unverified.

### Integration boundary checks

- Extended the runtime boundary check to inspect imports, literal dynamic imports, reexports, named integration exports, comparisons and switches using syntax trees. It also checks integration SDK runtime imports and declared dependencies for application packages; test files remain excluded for the existing contract harness. The adapter guide requires a second synthetic domain for new shared SDK or widget capabilities. Static checks do not establish semantic genericity or catch all indirect or computed dependencies; design review remains necessary.
- Validation: boundary checker examples and repository scan, `pnpm check` (1,671 application tests and 27 script tests) and `pnpm build` passed.

### ESLint integration boundaries

- Added editor-visible import restrictions for integration runtime code and applications, using registered integration descriptors and retaining the backend capability rules. Test files remain exempt from integration-specific import restrictions for contract helpers. Automated ESLint tests cover both allowed and rejected imports.
- Validation: `pnpm check` (1,671 application tests and 28 script tests) and `pnpm build` passed.

### Integration SDK isolation and minimal host

- Moved the reusable adapter contract and fixture helpers to integration-owned test support. The backend continues to test registry, observation cache and restricted transport independently. Integration source, tests and test support now share the same no-application-import boundary; application tests retain their existing exceptions.
- Added a workspace runtime dependency graph check that follows declared dependencies and literal imports, with tests for direct and transitive paths and cycles. It does not follow external packages, computed imports, aliases or development dependencies. A synthetic minimal host exercises SDK registration, widget source compatibility and presentation, without a real service or application.
- Validation: focused adapter, minimal-host and graph tests, `pnpm check` (1,660 application tests and 30 script tests), and `pnpm build` passed. Cache behavior remains covered at the backend boundary; real services and browsers were not exercised.

### Independent widget SDK isolation

- Extended import checks to widget runtime, tests and test support, forbidding application and integration dependencies. The runtime workspace graph now starts independently at `@homora/widgets` and tests indirect dependencies. A synthetic minimal host exercises public widget registration, configuration, source compatibility and presentation. Computed imports, aliases, external dependencies and real host or browser behavior remain outside these checks.
- Validation: focused widget and boundary tests, `pnpm check` (1,661 application tests and 31 script tests), and `pnpm build` passed.

### Monitors separate from cards, and probes (ADR 0021)

- Split the `services` table into `monitors` (what is monitored, with all monitoring history) and `services` (the dashboard card), sharing ids, so a monitor can exist without a card. Migration `0040` keeps every id, row and relation; the migration runner now handles foreign keys outside the transaction and refuses a migration that leaves orphans. `service_cards` and `monitor_targets` views keep API shapes, configuration hashes and monitoring signatures unchanged.
- Added probes: monitors without a card, managed under Manage > Probes (list, examples, form, delete confirmation) with a Probes block in the Home rail. They are checked, charted, acknowledged and can be shared on the public status page under Connectivity. API: `/api/probes`.
- Not done: probes in configuration export/import, agent proposals and MCP tools; a mobile chip row and an alerts-bell entry for probes; per-probe alert settings screen; the Uptime Kuma cutover itself.
- Validation: `pnpm check` (1,674 application tests and 31 script tests) and `pnpm build` passed. The migration was tested on a database with history, links and dependencies, not on a copy of a real installation. The new screens were not exercised in a browser.

### Services managed from the Home; Manage → Services removed

- Adding, editing and deleting services now happens in Organize mode on the Home: **Add service** sits beside **New group** in the Organize panel, and each row's menu has **Edit** and **Remove** (removal asks to confirm in the row). The Manage → Services list is gone; `/manage` opens Integrations, `/manage/services` redirects to the Home, and the form routes (`/manage/services/new`, `/manage/services/:id/edit`) still open the form over the Home. The Manage side bar and the phone bottom bar lose "Services" (the bar now shows Probes, Integrations, Agents and More).
- Removed the `managing` mode from the services page and its cards, and the unused texts that went with it.
- The top bar's filter field now filters the Home. From reading the code, the filter was only applied in the old manage list, so typing in the top bar did not narrow the Home before this change; a test now covers it.
- Organize now also shows on a Home with no services (desktop toolbar and phone), so the first group or service can be created there. The Organize screenshot was retaken with the Add service button and the row menu open; `manage-services.png` was deleted. The other Home images were not retaken.
- Validation: `pnpm check` (1,707 application tests) and `pnpm build` passed. New tests cover edit and remove from the Organize row menu, the Home search filter, and the old route redirects. The Organize flow was not exercised in a real browser or on a phone.

### Floating bottom bar on phones

- The phone bottom bars (Home: Home, Search, Alerts, Manage; management: sections and More) are now one floating capsule (`FloatingNav`) instead of a full-width bar of square, filled buttons. Only the active item shows its name, on a soft ember pill; the others are icons with a 48px target and an accessible name. The alerts item shows the open-problems count (`useAlertCount`, shared with the bell). The More sheet gained a "Back to dashboard" row.
- The phone header is one row: the Manage button is hidden on the Home (the bar has it), and outside the Home the back arrow replaces the logo (it was a second row). Fixed bars that sat above the old bar (Organize "Done", the appearance save bar) moved up with it.
- Following DESIGN.md, the capsule has no shadow; a gradient fade behind it separates it from the content. `mobile-dashboard.png` was retaken (synthetic data, statuses fabricated in the browser); the other images were not.
- Validation: `pnpm check` (1,709 application tests) and `pnpm build` passed; new tests cover the Home bar. Checked in a 390 px browser capture of the Home, a management page and the More sheet; not tried on a real phone, in the light theme or with a notch (safe-area inset).

### In-app notification inbox (issue #197)

- Added an inbox for confirmed service-card incident openings and recoveries, with persistent read
  state, a 90-day/10,000-entry retention limit and no dependency on outbound channels. Probes and
  reconstructed historical incidents are excluded. The bell opens the inbox and supports reading
  individual or all entries.
- Validation: focused incident, inbox, route, migration and interface tests; `pnpm check` and `pnpm build`. Chromium desktop and mobile with synthetic inbox data covered display, read actions and keyboard focus; a temporary database and real API verified read state across reload and backend restart. A screen reader and other browsers were not tested.

### MCP route coverage (issue #195)

- Added `list_trusted_ca` under `services:read`, exposing certificate subjects, validity and count without the PEM. Upload and removal remain human operations.
- Added scoped operational reads for probes, incidents, notification channels, status overview, tags, link types and public status, and allowed aliases in card proposals with a visible review diff.
- Added reviewable page changes with the `organization:propose` scope, batch support, version checks and audit events.
- Added scoped, audited and human-reviewed probes, acknowledgements, tags, favorite cards, resource links and page-widget moves; batch proposals cover the new kinds. MCP responses omit maintenance notes, connection URLs and PEM. Connection tests use restricted transport without persisting results or changing shared backoff.
- Validation: focused MCP, authorization and proposal tests; `pnpm check` passed (1,722 application tests and 31 script tests) and `pnpm build` passed. No live service was contacted. Browser review remains pending.

### Phone: no bottom bar on the Home

- The Home's phone bar is gone. With notifications (header bell) and search (header) already in the header, the bar was down to Home and Manage and added nothing. Manage moved to the user menu (shown on phones only; the header button stays on larger screens). The Home keeps the full height; the Organize "Done" bar now sits at the bottom edge. `DashboardTabs`, its test and its texts were removed. The management area keeps the floating bar (Probes, Integrations, Agents, More).
- Validation: `pnpm check` (1,727 application tests) and `pnpm build` passed. Not checked in a browser or on a phone.

### Probes on the Home, in Needs attention and in the bell

- Probes (monitors without a card) only showed in the Home's side rail, so they disappeared under 1,280 px and on phones. The Home now has a "Probes" section at any width: light, name, state in words and latency, opening Manage → Probes. The rail block stays.
- A probe that is down joins "Needs attention" (grouped by cause, with acknowledge and mute, which already worked on monitors); opening it goes to Manage → Probes.
- Probe outages and recoveries now reach the notification inbox. Migration `0043_inbox_probes` repoints `inbox_notifications.service_id` from `services` to `monitors` (table rebuilt, rows kept; probe deletion still clears the reference). The inbox list flags probe items and the bell opens Manage → Probes for them. Existing inboxes have no probe history.
- Validation: new tests for the section, the bell routing, the inbox SQL and the migration (data preserved). Not checked in a browser.

### Probes on the Home: follow-ups from a browser review

- The health banner and its pulse now count probes (a probe that is down is a problem, and its pulse window opens Manage → Probes), so the banner no longer contradicts "Needs attention".
- The status views (All, Offline, Degraded, Maintenance) count probes and filter the Probes section; the top-bar search matches probe names and addresses. Groups, tags and pages still apply to cards only. When probes match, the empty-state message is not shown.
- Where there is no side rail (below 1,280 px and on phones) the Probes section sits right under "Needs attention" instead of at the bottom; with the rail the list stays in the rail and the duplicate section is gone.
- The bell says "Probe unavailable" / "Probe recovered" for probe events.
- Validation: `pnpm check` (1,751 tests) and `pnpm build` passed; checked in Chromium at 1,500, 1,024 and 390 px with synthetic data (see the follow-up message in the PR).

### Architecture review follow-ups

- Backend: grouped the flat `apps/backend/src` files into `mcp/`, `proposals/`, `agents/`, `notifications/` and `integrations/` (file moves and import rewrites only; no behaviour, API, MCP tool or migration changed). `mcp-server.ts` stays at the root because `dist/mcp-server.js` is the stdio path users configure. The new folders have no ESLint-enforced entry point yet; only `monitoring/`, `transfer/` and `discovery/` do.
- `@homora/shared` no longer re-exports `@homora/integrations` or `@homora/icons`; consumers import them directly. `shared` still imports the guest-name helpers of the integration SDK in `hosts.ts` and `BRAND_ICON_NAMES` from icons in `services.ts`, so the dependency is narrower but not gone.
- Frontend: moved the host map and dependencies (`features/hosts`), uptime, maintenance and failure causes (`features/uptime`) and the Home's cards, groups, filters and organize mode (`features/dashboard`) out of `components/`, `hooks/` and `lib/`. `lib/status-filter.ts` became `status-filter-model.ts` to avoid a name clash with the component. Split `service-detail-page.tsx` (806 to about 550 lines) and `services-page.tsx` (790 to about 730 lines): the detail panels moved to `features/uptime/detail-parts.tsx`, the probe derivation to `features/dashboard/home-probes-model.ts` (4 new tests) and the pin/acknowledge actions to `use-home-attention-actions.ts`. `services-page.tsx` still composes most Home state and remains the next candidate.
- Docs: renumbered the duplicated ADRs (`0009-appearance-and-pages` is now 0023, `0011-incidents-and-alert-thresholds` is now 0024; the integration ADRs 0009 and 0011 keep their numbers because `AGENTS.md` and many documents cite them). `docs/architecture.md` dropped the per-component frontend inventory in favour of a module map and now shows monitoring and notifications in the diagram.
- Not done: moving the monitor scheduler out of the API process. It was conditional on monitoring volume growing, and `monitoring/index.ts` already isolates it.
- Validation: `pnpm check` (1,765 application tests, 31 script tests; 1,761 before) and `pnpm build` passed. No browser or live-service check.

### Explicit monitoring targets (issue #224)

- `monitor_targets` separates the card link from the configured check URL; the monitoring engine resolves the effective target with the existing precedence and destination policy. Probes have no card link.
- Monitoring signatures now identify the effective target and check settings. Changing only an unused link or path does not invalidate observations. The new signature format makes earlier raw observations invisible to signature-filtered uptime, latency and incident-history queries; records are retained until their usual retention expires. Hourly rollups remain available because they are independent of signatures. Current observations are refreshed by subsequent checks. Live-service and production-copy migration validation remain pending.

### Single-image distribution

- The default Docker image now runs the web interface and backend together; nginx listens on port 8080 and the backend listens only on container loopback. The optional Docker discovery agent remains a separate image. Compose retains the existing data volume and `backend` service name.
- Validated locally with a single-image build, first account and service in a browser, container recreation with the same temporary volume, an in-container backup, and refusal of direct API connections on the container network interface. Multi-architecture publication, registry pulls and migration from an existing two-container installation remain pending.

### Release automation (in preparation)

- Release Please is configured to propose versions and changelogs, update the backend version and trigger the reusable image workflow. Stable and pre-release image tags are separated; the image workflow checks version consistency before publishing.
- Local validation: the Release Please strategy created a simulated release PR, changelog and `v0.1.0` release against an in-memory GitHub substitute; stable and pre-release tags were checked using the pinned metadata action. Both images were built for amd64 and arm64 with SBOM and provenance, pushed to an isolated local registry and the application was pulled and started on both architectures (arm64 emulated). `pnpm check` and `pnpm build` passed. A repository credential and live GitHub Actions, pull request, release and GHCR publication have not been validated. The first release remains pending.
- The account menu and authentication screen show the backend version. Release image builds embed a matching release tag and link to that version's GitHub release; builds without such a tag display the version without a release link.
- Release notes group Conventional Commit entries into features, fixes, security, performance, dependencies, documentation and improvements, with breaking changes highlighted. Dependabot uses the dedicated `deps:` type for configured ecosystems. Maintainers review the generated text and add release highlights, migration notes and acknowledgements where appropriate.

### Release notes and update indicator

- The profile menu opens release notes with search and pagination; an indicator appears only when an identified installed release is older than a published stable release. The backend retrieves a fixed GitHub feed using the restricted transport; network and privacy boundaries are recorded in ADR 0025.
- Validation: `pnpm build`, `pnpm check`, focused authorization, network, parsing and UI tests, and browser checks with a synthetic release feed at desktop and mobile widths. The existing transport retrieved a public GitHub Atom feed. The real Homora feed remains unvalidated because the repository has not published a public release.
- The local development mock mode supplies clearly labeled example notes without an update indicator or external links; normal installations still use GitHub. Focused tests and an isolated development-mode container verified the example dialog and search on desktop and mobile; no public Homora release was queried.

### Open-source contribution entry points

- Added issue and pull request templates, a code of conduct and support guidance, plus grouped Dependabot version updates for the pnpm workspace. The templates request synthetic data and direct vulnerability reports to the private security channel.
- Validated YAML parsing, required form fields, Dependabot configuration, formatting and the `deps:` commit convention locally. GitHub's form rendering and Dependabot's first update run remain unverified.

### Documentation site

- Added a VitePress site using the existing English user guide and reference documentation, with local search, responsive navigation, dark and light themes, and contributor entry points. The documentation remains available as Markdown in the repository.
- The site builds to static files and includes setup instructions for Vercel and Netlify. `pnpm docs:build`, `pnpm build`, and `pnpm check` passed locally; browser checks covered search, navigation and mobile layout. Publication and the first provider-hosted build remain pending.

### Documentation languages and release link

- Added a Portuguese site and user guides covering the main workflows, with English as the default and links to detailed English references. The home page checks GitHub for the latest public stable release and falls back to the releases page when it cannot identify one.
- Local validation covers the static build, language selection and search, a simulated release, a failed request and a mobile viewport. Public release lookup remains unverified until a release is accessible.

### On-demand release preparation

- Prepare or refresh the Release Please PR manually on `main`; merging the same-repository release PR automatically runs Release Please and publishes its images. Ordinary PR merges no longer update the release PR. A maintainer must refresh an open release PR before final review so it includes recent changes.
- Local validation: actionlint (allowing the already-used Ubuntu runner label), event-condition scenarios for manual runs and merged, closed or foreign PRs, and an in-memory Release Please PR-to-release simulation. GitHub execution of the new manual and merged-PR triggers is pending.

### GitHub Actions Node.js 24

- Updated the pinned checkout, Node setup, pnpm setup and Release Please actions to versions that declare Node.js 24, keeping the manual release preparation and image publishing flow.
- Local validation used actionlint and a simulated Release Please 17.6.0 flow (the version bundled in action v5.0.0). GitHub execution of the upgraded Release Please action and publication workflow remains pending until a maintainer prepares and publishes a release.

### Published image verified (2026-11-16)

- Releases `v0.1.0` and `v0.1.1` exist and `ghcr.io/jhonatanmedeiros/homora` is public with `amd64` and `arm64` manifests. Pulling `latest` without credentials, starting it with `docker run` and requesting `/` returned HTTP 200 with version 0.1.1 and 47 migrations applied. `compose.release.yml` with `HOMORA_VERSION=0.1.1` also started and answered HTTP 200.
- Updated the README, the Portuguese README and both deployment guides, which still described the image as not yet published. Not verified: starting the `arm64` image on arm64 hardware, and upgrading an existing volume between published versions.

### Faster CI

- Replaced ESLint with oxlint (`oxlint.config.ts`), Prettier with oxfmt (`.oxfmtrc.json`) and the TypeScript 6 `tsc` with the native TypeScript 7 `tsc`. `pnpm type-check` is now `scripts/ci/typecheck.mjs`; the Turborepo `type-check` and `test` tasks and the per-package `type-check` scripts were removed. `typescript-eslint` cannot run on TypeScript 7, so keeping ESLint would have blocked the upgrade; the two scripts that use the TypeScript API import `typescript6`, an alias of `typescript@6`.
- Workflow: `lint`, `format` and `type-check` became one `static` job (plus the script tests); `test` shards compile only the workspace packages (about 1 s instead of a full `pnpm build`); the two Docker targets build in parallel; `validate` aggregates every job and is the only check to require. Every project command runs through `scripts/ci/budget.mjs`, which fails a step over its budget. A `merge_group` trigger runs the whole suite in the merge queue.
- Pull requests run only the tests their diff can reach (`scripts/ci/select-tests.mjs`): trigger files run everything, plus Vitest's import graph, plus the workspace graph, because the tests import the compiled `dist`. The import graph alone missed a break in `packages/shared` and `packages/widgets` (3 and 1 files selected); the full selection turned both red. Test files run in random order with the seed printed.
- Tests share a worker (`isolate: false`) except the files that use `vi.mock`, and `vitest.setup.ts` resets state after every file. Running every file in a single worker in shuffled order exposed real leaks, all fixed in the reset: `Object.defineProperty(window, 'innerWidth', …)` left a read-only property for later files, and module state, DOM, locale and viewport carried over. Rules for new tests are in `AGENTS.md` and `docs/standards.md`. A pre-push hook (`.husky/pre-push`) checks what is pushed in about 2 s.
- Measured locally, each job cold on 4 cores (a hosted runner), before then after: lint 13.7 s then 0.7 s; format 7.9 s then 0.1 s; type-check 13.9 s then 3.2 s; build of the packages a test job needs 12 s then 0.7 s; test shards 36-45 s then 20-24 s; critical path 44.6 s then about 24 s (the `static` job takes 11 s with the script tests). The setup and queue time are not in these numbers.
- Audit of the last 150 runs (only 5 have the current job layout): queue time p95 is 2-3 s for every job, setup is 14-17 s per job, and a pull request took p50 69 s and p95 155 s end to end, with the `docker` job as the tail (cache misses). Because of that, Blacksmith (queue time is already about 2 s and hosted minutes are free for this public repository), Bun in place of pnpm (the install takes 4-5 s) and a blobless clone (the fetch takes about 1 s) were not adopted.
- Also not adopted: sharding by recorded duration (about 0.2 s better than Vitest's own shards with three shards, so the file of durations was dropped) and a separate job for `migration.test.ts` (it takes about 8 s alone; an earlier 21 s figure was wall time under contention).
- Unverified: the new workflow on GitHub (validated with actionlint and by running each command locally), the time budgets on hosted runners (set above the old hosted timings, to be tightened after a few runs), the merge queue (not available for a personal-account repository; the `main` ruleset requires a pull request and only `validate`), and the Docker job's cache behaviour. An intermittent failure of two UI tests (`App.navigation` and `i18n`, `findByRole` on a page heading) was seen once and could not be reproduced in more than 30 runs, including under CPU contention; its cause is unknown and no mitigation was added.

### Home health in a header pill

- The Home body is only service cards. The health banner and **Needs attention** left the page: a status pill in the header (`HomeStatusPill`) says "All up", "N problems", "Partly monitored", "No data" or "Cannot measure", and opens a popover with the figures, the SLA budget, one window per service and the probable causes (acknowledge and mute included). The health logic moved out of `StatusBanner` into `summarizeStatus`, which the pill and the popover share.
- The left rail lists the Proxmox nodes that run cards (state, number of cards); selecting one filters by that node. With "Problems first" on, offline cards also come first inside each group; the saved order is untouched.
- The development server (`pnpm dev`) now seeds a busy sample homelab on first start: 19 cards with a mix of healthy, slow, failing and stopped services served by local listeners on the machine's private address (loopback is never a monitorable destination), a demo Proxmox inventory (one node offline, one guest stopped), page widgets, favorites, tags, dependencies, maintenance, probes, an expiring certificate and past alerts. The inventory mock lives with the Proxmox integration, like the existing widget mock.
- Validated with the unit and component tests (summary, pill, rail items, Home page) and `pnpm check`, and by hand in the development server on desktop. Not verified: a phone-width pass on a real device, a connection to a real Proxmox, and the pill in the light theme.
- Pending: the screenshots in `docs/screenshots` still show the previous Home (banner in the page body) because they come from the demo installation, which is not in the repository; the topology latency idea has no data source; agent proposals are not part of the development scenario.

### Pages bar and page list

- The pages left the header row and sit in their own bar under it (`data-homora="pages-bar"`), so the header keeps only the brand, search, status and account. Tabs are 36px tall (44px on touch), with a count pill and the down badge, and the active tab has an underline. The scroll arrows and the small overflow menu were removed.
- A list button at the end of the bar opens **All pages** (`PageListDialog`): a dialog on desktop and a bottom sheet on phones, with a search field above six pages, a `⋯` menu per page (rename, move, delete) and an **Add page** button. `PageCreateButton` moved to its own file so the bar and the list share it.
- Validated with the component tests (bar, list, tab menu, Home), `pnpm check` and `pnpm docs:build`. Not verified: the bar and the sheet in a browser or on a real phone, and the light theme.
- Pending, because they need a schema change or more design: an icon per page, "copy from another page" when creating one, drag-and-drop reordering in the list (moving earlier or later in the menu still works), and a keyboard-shortcut hint in the bar.

### Page note widget (LOCAL-03)

- Added a local page widget for a short Markdown note, with an optional name, safe rendering and a 4,000-character limit. Notes are portable through configuration export and import; database backups retain them as page widgets.
- Validation: `pnpm check` passed (1,900 application and 36 script tests), including backup and restore of a note. A local browser confirmed adding a note, Markdown bold and persistence after reload; at 390 px, the note and its edit form were available without horizontal overflow. Screen-reader testing remains pending. An earlier check run had four navigation/proposal failures while other processes ran; their cause was not established.

### Clearer outbound monitoring alerts

- Localized human-readable alerts show the check reason, HTTP status and latency when available. Recoveries include the time from the first observed failure to confirmed recovery when known; older in-progress outages may lack a start time. Webhooks receive an optional `outageDurationMs`. Live channel delivery has not been validated.

### Pull request title guidance

- Documented Conventional Commit titles for contributors and agents, including the Release Please exception and the need to verify the merged commit message. No automated title check was added.

### Countdown page widget (issue #258)

- Added a local countdown for one event, with an explicit or browser time zone and configurable past-event visibility. DST overlaps use the first occurrence; gaps advance by the transition. Validated with focused widget, route, transfer and interface tests, `pnpm check`, `pnpm build` and `pnpm docs:build`. Browser and screen-reader checks remain pending.

### Shared UI package (#265)

The shadcn primitives have been moved to `@homora/ui`; the widget module work in #266 and #267 remains separate. See [architecture](architecture.md#shared-ui-primitives) for the package decisions.

Visual comparison against the previous revision used an isolated local database with synthetic services and the same backend for both frontends. Home, the service drawer and detail page, integrations management, appearance settings, the add-widget dialog, and login were compared in light and dark themes at 1440 × 900 and 390 × 844. No visual regression was observed in the captured viewport states. Small pixel differences reflected the animated login glow and changing clock/monitoring values; real integrations, other states and content outside the captured viewports were not visually checked.

### Widget modules (#266)

Local definitions, translations and source-only UI now live in widget modules. The host resolves local and integration definitions without branching on local type; portable configuration remains compatible with existing rows and transfer versions. The shared widget context supplies locale and translations. See [ADR 0026](decisions/0026-widget-modules.md). The scaffold and broader automated boundary rules remain in #267.

Validation: focused synthetic-host and widget tests cover registration, page operations, legacy rows and transfer of clock, note and countdown. Visual comparison used an isolated synthetic database and the previous frontend, in both themes at 1440 px (rail and above groups) and 390 px (above groups); the rail is unavailable at 390 px. Real integrations, screen readers and physical devices were not checked. `pnpm check` passed (1,917 application tests and 40 script tests), as did `pnpm build` and `pnpm docs:build`. An earlier check exceeded the unrelated 30-day uptime performance budget (1,519 ms against 1,500 ms) while the comparison servers and browser were running; contention is suspected but not confirmed. The later check ran after those processes were stopped and after enabling package TSX tests.

### Widget scaffold and boundaries (#267)

- Added `pnpm widget:create` to register an internal module across definitions, translations, UI and package exports. The static registry remains explicit; shared time-zone helpers no longer couple countdown to clock.
- Oxlint and source-graph probes cover forbidden module imports and widget-type comparisons in the host. The graph checks literal imports and comparisons; computed imports and indirect aliases are not resolved.
- Validation with a disposable generated widget: `pnpm check` passed (1,918 application tests and 43 script tests), `pnpm build` passed, and the widget appeared in the browser gallery. The example was removed. Documentation build passed; screen-reader and hosted documentation checks remain pending.

### Page widget sizes (issue #255)

The host stores normal or wide size independently of widget configuration. Definitions opt in; existing widgets remain normal. See [ADR 0026](decisions/0026-widget-modules.md#page-widget-sizes-255) for responsive placement and transfer compatibility. Focused migration, synthetic host and transfer tests, `pnpm check`, `pnpm build` and `pnpm docs:build` were run. A temporary isolated frontend harness compared normal and wide cards in light and dark themes at 360, 390, 768, 1280 and 1440 px, including a 19rem rail; it was removed afterwards. A subsequent full-dashboard review used an isolated database and a temporary clock definition supporting both sizes. Agent-browser checked the strip and rail in light and dark themes, and Orca’s embedded browser checked the Portuguese accessibility tree, keyboard selection and reordering. At 390 px the mobile viewport had no horizontal overflow. After saving either the normal note or the temporary clock, focus returned to the document body; the baseline before this change was not compared. A screen reader and physical devices remain unverified.

### LOCAL-01 — monthly calendar ([#257](https://github.com/JhonatanMedeiros/homora/issues/257))

The local calendar uses the device clock and an optional IANA zone. Automatic week start follows `Intl.Locale` week information, falling back to Sunday when unavailable; explicit weekdays override it. Week numbers were omitted to preserve seven readable columns at normal width. The displayed month is transient. While visible, the clock is checked at minute boundaries; a hidden tab pauses and refreshes on return. Invalid saved zones fall back to the browser zone and the editor requires a valid replacement. The definition rejects invalid zones and unknown configuration keys. No network source or migration was added.

Validation: focused configuration, date calculation, interface and portable transfer tests, `pnpm check`, `pnpm build` and `pnpm docs:build` ran successfully. Browser review used an isolated database: normal and wide above groups and 390 px in light and dark themes. The empty dashboard did not expose the rail, so the rail remains unverified. Physical touch devices and screen readers were not tested.

The internal monitoring source foundation for page widgets is recorded in [ADR 0027](decisions/0027-widget-internal-monitoring.md). MON-02 and MON-03 are described below; see the [catalog](widget-catalog.md). Contract and route tests, `pnpm check`, `pnpm build`, and `pnpm docs:build` passed; live infrastructure and widget presentation have not been validated.

### Recent incidents widget (issue #261)

The page widget reads the internal incidents source, with bounded periods, duration and page/group filters, and displays individual outages. Open incidents remain visible even when they began before the period. See [ADR 0027](decisions/0027-widget-internal-monitoring.md#recent-incidents-widget-261) for the query, portability and host action decisions. Validation: focused module, source, refresh and transfer tests, `pnpm check` (1,949 application tests and 43 script tests), `pnpm build` and `pnpm docs:build` passed. Browser review used a disposable database with synthetic incidents in English and Portuguese: normal and wide in the strip at 1100 px, rail at 1440 px, and 390 px in light and dark themes. Enter on an incident opened the service drawer; the mobile page had no horizontal overflow. Screen readers, physical devices, live infrastructure and deployed documentation were not checked.

### MON-02 — current problems ([#260](https://github.com/JhonatanMedeiros/homora/issues/260))

The portable page widget uses the internal problems source, scoped by page and group names, with a configurable limit and latency-degradation filter. It shows monitor reasons using the same vocabulary as the Home popover, and the host opens card details or probe management. The source sorts and counts before limiting and reports unmeasured monitors and stale observations. See [ADR 0027](decisions/0027-widget-internal-monitoring.md#mon-02-scope-and-host-actions). Focused tests covered ordering, limits, source filters, unmeasured and maintenance exclusion, cause vocabulary parity, instance errors, stale data, UI states and portable transfer. `pnpm check` passed (1,956 application and 43 script tests), as did `pnpm build` and `pnpm docs:build`. An earlier check after integrating MON-01 reported the uptime performance budget and four unrelated timeouts; high concurrent test CPU load was observed, but its role was not established. An isolated development scenario was reviewed in light and dark at 1600 px (rail), 1280 px (above groups), and 390 px (above groups); keyboard Enter and pointer opened a card drawer, filtering showed the positive empty state, and no horizontal overflow was observed at 390 px. A screen reader, physical devices and live infrastructure were not tested. Latency-degraded monitors are ordered by the first check observed above the current limit during this server run, and the age is labeled as observed. The synthetic development scenario also showed a degraded row in English and Portuguese. A restart begins a new observed period; reconstructing an earlier onset from retained samples would be unreliable after a threshold change. MON-01 was merged while this work was in progress; the widget reuses its monitoring host context, scope reader and numeric source filters.

The first PR CI run exceeded Vitest’s 5-second limit in the unrelated 100-proposal load test. Profiling the same two-connection workload locally took 1,433 ms with SQLite rollback journaling and 558 ms with WAL; the load fixture now uses durable WAL transactions, while the other concurrency cases retain the default journal. This keeps the bounded workload and both connections without changing the application’s journal mode or the test timeout.

### Header pages, centered search, and audit hardening

- Moved multi-page navigation (`PageTabs`, `PageTabMenu`, `+` creation dialog, horizontal overflow arrows and dropdown) into `AppShell`, removed `LocaleSwitcher`/`ThemeToggle` and the desktop `Manage` button from the header (now unified in the user menu, keeping `Back` in management/account views), and centered the command-palette search bar in the header.
- Audit hardening: fixed nested interactive HTML in `BrandMark`/`AppShell`, enabled `privateCa` and `privateInsecureTls` for `keyword`/`json` HTTP checks in `probe.ts`, unified 500 error sanitization (`sendSanitizedError`) and IP rate limiting (`createIpRateLimiter`), enabled SQLite `WAL` + `busy_timeout = 5000`, added indexes for `service_proposals` and `audit_events` (`0048`), removed dead `app-sidebar.tsx`/`sidebar.tsx`, and updated stale docs.
- Validation: `pnpm check`, `pnpm build`, and `pnpm docs:build`. Browser and physical-device review of the new header layout remains pending.

### Quick links widget (LOCAL-05, #297)

The portable, source-free page widget stores an optional title and up to 12 custom HTTP(S) links, with normal and wide layouts and English and Portuguese interface messages. Automated validation covers configuration, unsafe URLs, editor and display states, transfer and database backup/restore. `pnpm check`, `pnpm build` and `pnpm docs:build` passed. Browser review, including 390 px overflow and assistive technology, remains pending. The technical widget catalog is English-only; no Portuguese catalog exists.

### MON-05 — service latency history ([#300](https://github.com/JhonatanMedeiros/homora/issues/300))

The widget presents successful-check medians in 24-hour, 7-day and 30-day buckets, with explicit gaps and a separately labeled last valid reading. Local service identities survive renames and backups but are removed on deletion and stripped in both directions of configuration transfer. See [ADR 0027](decisions/0027-widget-internal-monitoring.md#mon-05-local-service-identity-and-latency-300) for retention, staleness and portability.

Focused tests cover aggregation boundaries, gaps, more than 500 failed observations, changed configuration, missing targets, migration, identity reuse, transfer, backup and interface states. `pnpm check` passed (2,075 application and 48 script tests), and `pnpm build` and `pnpm docs:build` passed. Browser review used an isolated database and synthetic observations: normal at 390 px in English and Portuguese and the rail at 1440 px in Portuguese; the widget editor allowed normal and wide selection. The 390 px page had no horizontal overflow. A physical device, screen reader, dark theme, deployed documentation and live infrastructure remain unverified.

### MON-07 — certificate expiry (#302)

The portable [widget and its tests](https://github.com/JhonatanMedeiros/homora/tree/main/packages/widgets/src/widgets/certificate-expiry) use an internal source to show certificate expiry without additional probes. The source reads retained TLS observations for service cards, uses the current configuration signature and labels prior or old readings; it does not probe. Focused tests cover expiry boundaries, restart, signatures and trust changes, filters, ordering, privacy, refresh and renewal, navigation and transfer. `pnpm check` passed once before the final changes; a subsequent run timed out in two existing countdown and migration tests while the MON-05 and MON-06 suites were running concurrently. `pnpm build` and `pnpm docs:build` passed. A synthetic browser harness was reviewed in English and Portuguese, including a 390 px viewport; full dashboard, live infrastructure, screen readers and physical devices remain unverified.

### MON-06 — maintenance schedule ([#301](https://github.com/JhonatanMedeiros/homora/issues/301))

The portable page widget reads a versioned internal maintenance source and supports normal and wide sizes, 24-hour, 7-day and 30-day horizons, and optional page and group filters. It includes ongoing windows, distinguishes empty, failed and stale readings, and does not expose notes or URLs. Standalone probes can have maintenance; unfiltered results include them and open probe management. Scope names survive transfer, while renamed or removed selections require editing. Exact boundaries and refresh decisions are in [ADR 0027](decisions/0027-widget-internal-monitoring.md#mon-06-maintenance-schedule-301).

Validation: focused module, source, refresh, transfer and backup/restore tests, `pnpm check`, `pnpm build` and `pnpm docs:build` passed. Browser review used an isolated database with synthetic maintenance: English and Portuguese, 1280 px wide strip (light and dark), 1440 px rail, and 390 px; a row opened service details, filters were edited, and 390 px had no horizontal overflow. A later full check after adding two tests failed three unrelated checks: the uptime performance budget (7 days: 844 ms vs 450 ms; 30 days: 1,925 ms vs 1,500 ms), a countdown test timeout and a settings navigation assertion. The parallel MON-05 worktree was running its own test suite at the same time, with high CPU load observed; its contribution is unproven. The two added maintenance tests passed in that run. Screen readers, physical devices, live infrastructure and deployed documentation remain unverified.

## Coolify resource widget (INT-04)

The connection widget uses the existing authenticated resource inventory and its 30-second backend cache, polling through the page widget host every 60 seconds. The generic widget definition selects the existing resource inventory rather than the summary, and failed reads discard the previous inventory so addresses are hidden. It displays Coolify-reported state independently of Homora monitoring. Fixture and development-mock validation do not replace validation against a live service, which remains pending.

### Test suite resilience (#321)

The shared test setup allows 4 seconds for Testing Library async queries and 15 seconds per test,
rejects unexpected browser `fetch` calls, and restores test clocks. Deadline tests use controlled
clocks; the uptime query budget measures CPU time rather than scheduler delays. The configuration
transfer export test now mocks its page-list request.

Validation: eight consecutive root `npx vitest run` executions passed 2,117/2,117 without added
load. With 48 CPU loops, three executions each failed one test: `interface-settings.test.tsx` twice
and `page-widgets-integration.test.tsx` once, all on timeouts. The issue's earlier four loaded runs
had 8–14 failures each. The load processes were stopped and none remained. The CPU-time budget does
not measure end-to-end latency under contention. Engineering standards are an English-only reference.

## TP-Link Omada integration and client-credentials login (#317)

- Added a built-in read-only TP-Link Omada integration and widget: clients (total, Wi-Fi, wired),
  access points, switches and gateways (connected/total with distinct disconnected, pending,
  heartbeat-missed, isolated and unknown states) and unresolved alerts in a rolling 24-hour window,
  with `—` for sections that are disabled, unreadable or incomplete. Module:
  `packages/integrations/src/integrations/omada`. See [the reference](integrations.md#tp-link-omada-controller).
- Extended the host-owned `sessionAuth` profile in a closed way: fixed login query, an exact response
  success code and an enumerated `AccessToken=<token>` authorization format
  ([ADR 0028](decisions/0028-session-auth-client-credentials.md)). No generic POST, header or
  scheme was added; the Pi-hole profile is unchanged.
- Validation: transport, contract, adapter, presentation and connection tests with synthetic fixtures;
  `pnpm check`, `pnpm build` and `pnpm docs:build`. **Not validated:** the integration against a real
  Controller (the issue's 5.15.24.19 and 6.3.0.111 results are API-only user reports), token expiry and
  renewal on a live Controller, access-point and switch device types and states, alert window
  semantics, UI parity of client counts, the widget's narrow and wide layouts in a browser, and
  certificate/SAN behavior with the real Controller.
- **Blocked:** historical CPU, memory and traffic wait for a separately designed and reviewed
  service-neutral read-only POST capability (the statistics endpoints are POST per device). Also
  pending as separate designs: pre-login `GET /api/info`, version/site-name display, a site picker and
  API-key (`Bearer`) mode for Controller 6.4+. No brand icon was added; the card uses the `OM` mark.

## Home Assistant multiple-entity widget (#315)

- Added the page widget `home-assistant-entities`: choose an existing Home Assistant connection and
  list 1–8 unique entity IDs. It refreshes every 30 seconds; each source result is cached for
  15 seconds and the integration makes at most two requests concurrently. A 404 or other failure is
  isolated to its entity. The registered integration operation performs only fixed
  `GET /api/states/<entity_id>` requests and returns the entity ID, state and last-updated time;
  attributes are never projected to the widget. The legacy single-entity connection and card widget
  remain unchanged.
- The saved token retains its Home Assistant account permissions; choosing IDs bounds this widget's
  requests but is not an authorization boundary.
- Integration connection updates and deletions invalidate cache entries tagged to that connection;
  invalidated in-flight reads cannot repopulate the cache or serve stale fallback data. Portable
  exports retain the selected entity IDs without exporting a local connection reference.
- Validation: 22 focused widget, source, cache invalidation, integration and transfer tests passed
  across 6 files. `pnpm check` passed (296 Vitest files, 2,281 tests; 48 Node tests), as did
  `pnpm build`, `pnpm docs:build`, and `pnpm integration:catalog`. Tests use synthetic responses
  only. **Not validated:** a real Home Assistant instance or a browser walkthrough; live-service
  validation remains pending, and no real infrastructure was contacted.

## Service map redesign (#343)

- The map answers, in order, whether everything is fine, where the problem is, what depends on it and how to place
  services without a host. Toolbar with search (`/`), **All | Problems | Not linked**, **Host | Group**, **Connections**
  (remembered in the browser) and **Collapse healthy** (the Home preference); host and guest headers with state in words,
  a health summary and CPU, RAM and disk meters; guests laid out in columns by height and collapsible; tiles with the
  brand icon, status light and latency (the healthy word is kept for screen readers); a minimap, auto-fit on open and a
  docked details panel (a sheet on narrow windows) with **Needs attention**, **Reached through** and read-only actions.
- Data: the Proxmox inventory gets optional `metrics` from the existing `/cluster/resources` call (no new request),
  validated and omitted for an offline node or a stopped guest; migration `0051` adds `services.host_external` and
  `PUT /api/services/:id/host` accepts `external`. **Find matches** stays on request; **Link N suggested** links only
  strong, unambiguous matches and offers undo.
- Differences from the mockup, by decision: no restart or logs actions (Homora is read-only), no Tidy (the layout is
  always automatic), no edge types or match percentages (no data behind them), no node as a link target and no guest IP
  in the header (it needs each guest's configuration on every open). Healthy guests are muted with `muted` tokens, not
  opacity, to keep text contrast. **Problems first** follows the Home preference (and is forced while the Problems filter
  is on), and the Host view applies the same order so focus order keeps matching.
- The external mark is not exported or imported, like the host link. The development server answers the suggestions of
  its demo cluster with fixed examples, because the demo has no guest configuration to read.
- Validation: unit tests for health, layout, filters, search, the dependency chain, the inventory metrics and migration
  `0051`; Testing Library tests for the toolbar, filters, search, connections, bulk link with undo, external,
  the panel and the minimap; checked by hand in the embedded browser and with `agent-browser` against the demo
  seed (light and dark, 1440 and 1024 px wide). **Not validated:** a real Proxmox cluster (metrics, node and guest
  states and suggestions come from the demo's fixed data), touch input and screen readers on the map.

## Command palette external destinations

- Web search names the selected engine. An independently enabled, browser-local AI shortcut offers ChatGPT, Claude, v0 and Scira, with the preferred destination first. The free text is sent in a URL only after selecting an action; no Homora context is added. Live provider login, prefill and submission behavior remains to be verified per service.

### Healthchecks jobs widget (#355)

The page widget uses a saved Healthchecks connection and a fixed, restricted read of the existing
checks endpoint. The service-specific query projects only names, reported states and last ping,
sorts problems first and bounds the output to 50 rows. It distinguishes stale, unavailable and
empty data; a successful ping is not evidence that a backup can be restored. Names are visible to
the signed-in administrator. Portable configuration retains the limit and size, not the connection.
Connection-scoped cache tags and the existing integration invalidation protect cached readings.

Focused contract, source, UI and transfer tests cover synthetic data. Browser review used a
temporary isolated presentation harness: Portuguese in dark theme at 390 px and English in light
theme at 1280 px, with no horizontal overflow at 390 px. A full dashboard walkthrough, physical
devices, screen readers, live Healthchecks and deployed documentation remain unverified. A
read-only project key and an authorized service are needed for live validation; no real
infrastructure was contacted.

## Proposed evidence and assistance decisions (issue #354)

Design only: [ADR 0029](decisions/0029-evidence-contract.md) proposes an evidence contract;
[ADR 0030](decisions/0030-ai-assistance-boundary.md) proposes the optional integrated-assistance
boundary; and [ADR 0031](decisions/0031-evidence-evaluation.md) defines synthetic evaluation
scenarios. These records are proposed pending review; they do not implement an evidence API,
provider, egress permission, evaluation harness, or model-backed feature. Source registrations,
provider network and budget controls, executable fixtures, real-model validation and Portuguese
translation of these English-only technical decisions remain future work. The deterministic product
and existing MCP boundaries remain in effect.

### MCP investigation not-found response (#366)

An authorized investigation of an unknown incident returns a structured not-found code and requested ID. Invalid arguments remain validation errors and unexpected failures remain generic; the HTTP route continues to return 404.

### Bounded overlap hypotheses (#364)

Incident investigations group overlapping incidents only when their monitor and recorded start and end
times match. Each group retains its individual facts and links them from one hypothesis. At most five
groups produce hypotheses, in most-recent-window order; a missing-data flag identifies omitted
hypotheses, independently of the existing 20-incident fact limit. Structured attributes expose the
representative incident ID, related monitor ID and count, with all retained incident IDs available in
the evidence references. The v1 contract remains additive and does not expose monitor names.

### Monitoring coverage assessment (#347)

The Activity page offers an on-demand, read-only assessment of monitor targets and the existing
observation store. It distinguishes missing targets, destination-policy blocks, maintenance,
stale observations (more than twice the interval) and unavailable observations; none implies a
disabled monitor. Every service card already owns a monitor, and a null interval uses the default.
The assessment does not infer alert intent or check notification channels, and cannot prove complete
coverage. Dismissals are not persisted; ignored results may reappear. Results are limited to 100 and
configuration links do not apply changes. The evaluation does not use AI or change network policy.

Focused tests cover false positives, stale and unavailable data, empty and bounded results and API
authentication. `pnpm check`, `pnpm build`, and `pnpm docs:build` passed. Live infrastructure and
screen readers were not tested.

### Evidence and operational summary (#349, merged)

The shared package defines v1 evidence types, periodic freshness and reference checks. A bounded,
authenticated operational-summary reader validates its registered incident-event and coverage-gap
sources and shows 24-hour or 7-day recorded incident starts and recoveries in Activity. It exposes
no raw reason, address or configuration. Incident rows do not prove complete coverage and do not
retain check signatures, so the view states that limitation and does not claim recurrence. It also
excludes audit changes and certificates. Sources, dates, truncation, English and Portuguese labels,
service links, probe incident details, manual refresh and an age warning after two minutes are included.
Validation: `pnpm check`, `pnpm build`, `pnpm docs:build`, targeted API/auth and interface tests,
and browser flows against an isolated synthetic database: English desktop and Portuguese mobile,
24-hour and 7-day periods, service navigation and probe incident details. The reproducible
`pnpm --filter @homora/backend exec tsx bench/operational-summary.ts` benchmark uses 50,000 synthetic
incident rows and 30 calls per range; HTTP injection p95 was 3.52 ms for 24 hours and 3.36 ms for 7 days, below
the 300 ms endpoint target on this machine. It excludes authentication, network, browser, disk and
concurrent load.
Real-service testing and end-to-end latency under load remain unverified. No model or live service
was used. #349 was delivered by PR #359.

### Incident investigation (#346)

An authenticated incident investigation reads recorded incident events, at most 100 retained checks
and 20 overlapping incidents, reporting truncation, invalid rows and historical coverage gaps.
Temporal overlap is a qualified hypothesis, with evidence IDs; it never establishes cause. The
view is available from the operational summary and service incident list. `investigate_incident`
exposes the same bounded, name-free evidence through MCP with both `incidents:read` and
`services:read`. It reads no raw error or address and initiates no checks or external writes.
History has a 30-day retention; source data and historical dependencies can be incomplete.
An integrated model provider, semantic grading harness and real-service validation remain outside
this implementation. The reproducible `pnpm --filter @homora/backend exec tsx
bench/incident-investigation.ts` benchmark uses 50,000 synthetic incidents and 49,999 checks; 30
HTTP injections measured p95 1.97 ms against a 300 ms endpoint target on this machine. It excludes
authentication, network, disk, browser and concurrent load. English desktop and Portuguese mobile
were exercised with an isolated synthetic database. Real-service and independent user validation
remain pending.

#### Synthetic agent review for #346

Codex (GPT-6) used the MCP SDK's in-memory transport with a synthetic database and a token
granted only `incidents:read` and `services:read`. In one scenario, monitor 1 had a recorded
failed check and a later recovery while monitor 2 had an overlapping incident. The returned
facts supported the failed check (`check:1`) and incident times (`incident:1:opened`,
`incident:1:recovered`); temporal overlap (`incident:2:overlap`) supported only a qualified
possibility of a relationship, not a root cause. `gap:incident:1` explicitly recorded missing
cause and coverage. A hostile string in an unused check field was not returned. This was one
manual agent review via in-memory MCP, not a complete semantic evaluation suite, a test of
stdio/HTTP transport, an independent user study or validation with real infrastructure.

## Interface audit fixes

A sweep of the running interface with synthetic data led to one set of corrections: ember used as text
meets contrast in the light theme; services come before probes and page widgets on small screens; the
status total says how many offline services, offline probes and slow ones it holds; state is never
shown by color alone on the map or the phone header; page tabs and lists use valid roles; a skip link
reaches the services; truncated addresses keep the port; Organize keeps the rail and status pill;
short histories say data is still being collected; and Portuguese status words are consistent.

Validation: `pnpm check`, `pnpm build`, `pnpm docs:build` and axe through agent-browser on an isolated
synthetic database, in light and dark themes. Real touch devices, screen readers, real integrations and
performance under load were not verified.

## Status honesty and form safeguards

Scenario runs with synthetic data (failures, stale data, long names, many services) led to one set of fixes. A refused
destination is recorded as unknown, so it opens no incident; incidents already open from before stay as they are. While
a measurement failure is confirmed, the status API reports the affected monitors as not measured, so the whole interface
agrees. Statuses that stop updating are marked as old. The service form completes bare addresses, points out duplicates,
asks before discarding and keeps card fields in the tab across an expired session. Drawer, health panel, service page,
phone Home, service map and import errors were adjusted accordingly.

Not covered: the Home at hundreds of services is still a long page on phones, and links, monitoring settings, tags and
dependencies typed in the form are not part of the kept draft. Validation: `pnpm check`, `pnpm build`,
`pnpm docs:build` and agent-browser with axe on an isolated synthetic database. Real integrations, physical devices and
screen readers were not verified.

### Service names in evidence views (#365)

The authenticated operational summary and incident investigation resolve current card names locally, with monitor IDs as a fallback for probes, deleted cards or failed reads. Evidence bundles and MCP responses remain name-free.

### Operational summary aggregation (#367)

The summary counts opened and recovered events and distinct incidents by monitor in the selected window. Counts cover all retained matching events independently of the separately bounded event details; monitor groups and event details each expose truncation. Correlation and root cause are not inferred. A local HTTP injection benchmark with 50,000 synthetic incident rows measured p95 9.73 ms for 24 hours and 16.52 ms for 7 days.

### Potential dependency impact (#348)

The map assesses potential impact from a selected card or guest using confirmed manual service dependencies and, for a guest, explicitly linked cards. It shows one shortest path per dependent monitor, bounded to eight edges and 100 results, with cycles guarded and truncation explicit. The on-demand snapshot reports read failure, age and unknown graph completeness; it does not assert a failure, use host suggestions as confirmed relations, infer a root cause or access external infrastructure. The shared assessment emits recorded-edge facts and an unknown completeness item using the evidence contract. Existing scoped MCP dependency reads remain the agent interface; no new agent permission was added.

### Maintenance preparation and review (#350)

The existing scheduling form and human review of maintenance proposals offer an optional, non-persistent checklist, overlap comparison and recorded dependency impact. Overlap is revalidated by the existing server when scheduling; checklist marks never apply changes. Finished-window summaries show a single current-configuration observation only if it is after the window and fresh within twice the check interval; otherwise they report unknown. No recovery or cause is inferred. User-authored procedures, their storage, transfer and execution are outside this phase; existing maintenance notes and proposal permissions remain unchanged.
