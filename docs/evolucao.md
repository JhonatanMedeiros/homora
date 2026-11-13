# Homora Evolution Plan

This plan translates the initial repository evaluation into concrete work phases.
The core priority is a dependable, useful homelab homepage, configurable entirely via
the web interface, and operational without Proxmox or AI agents. Infrastructure
integrations and agent assistance serve as differentiators once the core is robust.

Update items as they are finished, recording relevant decisions and verification
findings directly in the repository. An item should only be marked complete once
both implementation and stated verification criteria are met; existing code alone
does not imply the end-to-end workflow has been validated. Work phases may be decomposed
into smaller subtasks.

> **Direction (2026-11-10):** strategic positioning relative to Homepage and Dashy
> alongside phases R0 through R4 are detailed in [estrategia.md](estrategia.md).
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
- [ ] Establish reproducible Docker image builds (amd64/arm64) and release workflows.
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

Origin: [estrategia.md](estrategia.md), phase R0. Mark items only with stated implementation
and verification evidence.

- [ ] **Reproducible Docker image:** pin Node and nginx base images by version and SHA256 digest,
      build amd64 and arm64 in CI, and document upgrade steps. Implemented and validated locally
      (see log below); **pending** publishing an official release: CI workflow has not run
      against remote registries and `compose.release.yml` remains unverified against published images.
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

Origin: [estrategia.md](estrategia.md), phase R1 and real-world Homepage migration benchmark.
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
  Icons existing solely as PNG in upstream project (e.g. Homepage, Dashy, Linkwarden, Speedtest
  Tracker) were excluded.
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
  automatic card updates on label changes (discovery is strictly on-demand), Traefik/Dashy labels.

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
  metrics and agent assistance represent differentiating opportunities. See [product](produto.md)
  and [architecture](arquitetura.md).

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
`docs/arquitetura.md`). Special ranges, pinned DNS, mixed DNS responses, and redirects stay
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
`SECURITY.md` and `docs/arquitetura.md`. Needs an explicit maintainer decision before
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
- Docs: `SECURITY.md`, `docs/arquitetura.md`, README.
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

See [ADR 0004](decisoes/0004-better-auth-web-authentication.md).

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

See [ADR 0006](decisoes/0006-public-read-only-status-page.md).

- `services.is_public` (default 0) and an `app_settings` table (`public_status_enabled`, `public_status_title`) in migration 0015; existing rows keep `is_public=0`.
- `GET /api/public/status` is the only anonymous API path (exact-path allowlist in the auth hook, GET only), limited by `@fastify/rate-limit` to 60 requests per minute per client IP, cached 15 s, `404 not-found` when disabled or empty. Payload: name, category, `up|down|unknown`, `checkedAt`, `uptime` (24 h) and 24 hourly `bars`; stale observations read as `unknown`.
- Visibility is changed only through authenticated, audited endpoints (`PUT /api/public-status/admin`, `PUT /api/services/:id/public`). It is deliberately outside `ServiceInput`, so imports, exports, agent proposals and MCP cannot change it; MCP exposes `publicStatusEnabled` read-only.
- Frontend: `/status` is routed before the authenticated shell and calls only the public endpoint; Settings has the toggle, title and an exact preview; the service form has the checkbox.
- Validated with `pnpm check`. Backend tests cover the closed default, 404s, opt-in only, no sensitive field or private service in the body, 429, exact-path allowlist, session requirement and audit. The rate limit runs in memory per backend process and the UI was not exercised manually in a browser. Not validated: behavior behind a real Cloudflare Access hostname.

### Monitor: uptime and latency per service (issue #62)

See [ADR 0007](decisoes/0007-service-observation-history-and-uptime.md).

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

See [ADR 0005](decisoes/0005-status-transition-notifications.md).

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

- Migration `0020` adds `host_connection_id`, `host_node`, `host_vmid`, `host_type` (all nullable) to `services`; the connection id references `integration_instances` with `ON DELETE SET NULL`. `packages/db/src/migration.test.ts` starts from a database at migration `0019`, checks that existing cards keep their data with all four columns `NULL`, and that deleting the connection unlinks the card. Decisions are in [ADR 0008](decisoes/0008-service-to-host-map.md).
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

- Migration `0021` adds `host_suggestion_dismissals`; the test starts from a database at `0020`. Engine, parsing, API and MCP details are in [ADR 0008](decisoes/0008-service-to-host-map.md).
- API: `GET /api/host-suggestions` (session only) and `PUT /api/services/:id/host-suggestion-dismissal`. Accepting uses the phase 1 `PUT /api/services/:id/host`. UI: "Suggested hosts" panel (side sheet on desktop, full screen on phones) with per-item select, Accept, Dismiss, Undo, "Accept selected (N)", "Choose host manually", strength written as text and evidence per item; it is loaded only when opened because it reads guest configurations from Proxmox.
- MCP: scopes `hosts:read` and `hosts:propose`, tools `list_host_suggestions` and `propose_host_link`; the proposal diff is rendered in the agent review screen with the server-computed evidence. Existing tokens do not gain the new scopes.
- Validated: `pnpm check` and `pnpm build`. Tests: each signal alone, combinations, name-only, ties and conflicting evidence, dismissals per card and guest, address parsing, hostname resolution blocked/authorized/failed (no signal, no card connection), API with and without a session, only GET requests to the Proxmox mock, degradation when the guest agent is refused, MCP scope enforcement, refusal without evidence, proposal creation, audit entries and approval, panel actions and error state.
- Not verified: no real Proxmox. The guest-agent endpoint, the `ip=` formats of `netN`/`ipconfigN` and the 403 behaviour for a read-only token follow the Proxmox API documentation and are covered only with simulated responses.

### Service-to-host map, phase 4: read-only Map (issue #96)

- Home gets **Group | Host | Map**. The map (`components/host-map.tsx`, `lib/map-layout.ts`) uses a custom deterministic layout instead of `@xyflow/react`; reasons in [ADR 0008](decisoes/0008-service-to-host-map.md). No dependency was added.
- Interactions (all read-only): select a service or a guest to open the side panel (service, address, status, runs on, affected by, "Open card on Home", "Change host"), pan (native scroll, touch, mouse drag), zoom 60% to 120%, fit, reset, refresh (bypasses the 30 s cache) and return to the host list. Map controls sit in the canvas toolbar. "Used by" is not shown yet: dependencies arrive in phase 5. Offline nodes are drawn with a dashed border and the words "Offline" and the affected count; impact wording comes from phase 2.
- Validated: `pnpm check` and `pnpm build`. Tests: layout (determinism, containment, no overlaps, wrapping, focus order equals Host view order, empty input, zoom bounds), component (containers and offline text, focus order, selection and panel actions, guest panel, zoom limits, reduced motion, refresh and list link, phone notice under 768 px, empty state).
- Not verified: no real browser or phone (happy-dom has no layout, so panning, `scrollTo` distances and the fit zoom against real viewport sizes were not observed), no screen-reader pass, no large installation (layout cost with hundreds of guests was not measured).

### Service-to-host map, phase 5: Map editing and manual dependencies (issue #96)

- Fixed canvas coordinate nesting: guest cards are positioned within their node and service tiles within their guest, preventing them from drifting outside the host containers.
- Migration `0022` adds `service_dependencies`; the test starts from a database at `0021` and checks existing cards, the duplicate and self-link constraints and the cascade. Design in [ADR 0008](decisoes/0008-service-to-host-map.md).
- API: `GET /api/service-dependencies`, `POST /api/services/:id/dependencies`, `DELETE /api/services/:id/dependencies/:other` (cycle, self, missing card and limit are rejected with distinct codes), audited. MCP: `list_service_dependencies` under `services:read`.
- Map: drag an unlinked service onto a guest to link it; non-drag alternative in the side panel (same chooser as the form, plus "Unlink host"); "Depends on" and "Used by" lists, "Add dependency" picking mode (Escape or Cancel leaves it) and removal; read-only on phones. The service form has a "Depends on" list. Home cards, the Host view, the map panel and the banner show the manual "may be affected" hint.
- Validated: `pnpm check` and `pnpm build`. Tests: dependency CRUD, authorization (no session, no origin), cycle (direct and transitive), self link, missing card, limit via validation, cascade on delete, audit entries, scoped MCP read, impact through dependencies (including a cycle that bypassed validation), drag link, keyboard alternative producing the identical call, unlink, failed change reporting, picking, Escape, error messages, read-only on a phone and without edit access, form picker, banner.
- Roadmap item 18 (service-to-host map) is marked done in `plano.md` and `estrategia.md`, with the caveat below.
- Not verified: everything against a real Proxmox (all Proxmox traffic is simulated); real HTML5 drag and drop in a browser (happy-dom events were used, so drop positioning and touch devices were not exercised); screen readers; a drag with a very large map. The "Test unavailability, invalid credentials and reduced permissions against a real Proxmox" item in the plan therefore stays open.

## UI component consistency sweep (2026-11-12)

- Replaced the custom HTML-backed select implementation with `FormSelect` composed from the shadcn `Select` primitives, including an option component that supports empty values and controlled selection. Migrated its uses across services, settings, activity, host selection, transfer and widgets, with accessible names on composite controls.
- Converted the agent profile radio cards to the existing shadcn `ToggleGroup`, direct product buttons to shadcn `Button`, and standalone labels to shadcn `Label`. Inputs, textareas, checkboxes, switches, overlays, cards, alerts and empty states were already using the project primitives; semantic links, the category datalist and structural HTML remain native.
- Recorded the component priority and exceptions in `docs/padroes.md` and `AGENTS.md`; updated the map decision to name the shadcn Select.
- Validation: `pnpm --filter @homora/frontend build` passes (TypeScript and Vite). Static source scan confirms no direct product `<button>`, `<input>`, `<select>`, `<textarea>` or `<label>` outside `src/components/ui`; the native category `<option>` remains inside its semantic `<datalist>`. Tests and browser/screen-reader behavior were not run.
- Follow-up: integration data in service cards now uses a shared three-column grid with labels above tabular values. Widget loading placeholders use the same grid and reserve the expected row count for each integration type.
- CI follow-up: validation tests now interact with shadcn Select and ToggleGroup controls through their combobox/radio roles and keyboard behavior instead of native select/label assumptions.

## Appearance, custom CSS and pages (2026-11-12)

- Issue #97 in four phases ([ADR 0009](decisoes/0009-appearance-and-pages.md)): accent color, gradients and card translucency with a contrast check in both themes; an optional background image processed with `sharp`; custom CSS served same-origin with a safe mode (`?safe=1`, `pnpm css:reset`); and pages as tabs on the Home (migration `0023`).
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
  in [ADR 0011](decisoes/0011-integration-sdk.md).
- Final local validation: `pnpm check` passed (1,247 application and 16 script tests), as did
  `pnpm build`. All 11 definitions were compared with the pre-change source and matched exactly.
  A backend Docker image built successfully and loaded all 11 registry entries in a production
  container. Generator tests compile both scaffold types in a temporary copy. Contract tests also
  check console output for credentials on successful and failed reads.
- Not verified: a browser or screen reader, any additional live integration instance, or the
  remaining live-validation cases already listed in `integracoes.md`. No schema migration was needed;
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
  tests) and `pnpm build` passed. No live service, browser or screen reader was tested.

## Extensible integrations (issue #98)

- **Phase 1:** `adapter-contract.ts` (`runAdapterContract`) tests every adapter with a fake transport: validation, request shape and path safety, secrets, each response class, bounds and the observation cache. Fixtures carry a `_source` block. `docs/adapters.md` is the contribution guide. The harness found that Home Assistant, Uptime Kuma, AdGuard Home and the Proxmox validator accepted URLs over 2048 characters; all four now reject them.
- **Phase 2:** [ADR 0009](decisoes/0009-declarative-integration-adapters.md). A closed manifest format in `packages/shared`, validated at startup and run by one interpreter. Jellyfin, Uptime Kuma, Home Assistant and AdGuard Home were migrated after a differential run (URLs, ids, credentials, responses) showed identical decisions, requests and data; their expectations live in `manifest-adapters.test.ts`. Type enums, stored keys, proposal schemas, the form, widget text, the picker and the catalog now derive from the definitions. Proposals now require `https://` for every HTTPS-only integration, not only Proxmox.
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

- Implemented all four phases in one change, **implemented, unvalidated**: [ADR 0010](decisoes/0010-coolify-read-only-integration.md). Code adapter with a `read`-only Bearer token; summary widget; searchable inventory (`GET /api/connections/:id/resources`); card links by connection and resource UUID (table `integration_resource_links`, migration 0024); discovery with review; a separate Coolify state on the card with "needs review" for changed or missing resources; `Retry-After` exposed by the transport and a Coolify-only pause after 401, 403 and 429.
- Docs: [Coolify section](integracoes.md#coolify) with set-up, permissions, troubleshooting and the live validation checklist; Portuguese set-up and troubleshooting in `README.pt-BR.md`.
- Not done on purpose: deployments in progress (the schema carries logs; deferred to validation), project and environment names (not in the documented list endpoints), addresses for services (no documented field; typed by hand), multi-team behavior at scale.
- Live validation (2026-11-12, Coolify v4.7.5, team token believed unrestricted): connection, test, widget (6 resources, 6 running), inventory with addresses and resources without an address, several domains on one application, link and discovery review, and an invalid token (generic error and pause) worked. A layout bug in the review dialog was found and fixed (`7a9d1a9`). Record in [integracoes.md](integracoes.md#coolify).
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
