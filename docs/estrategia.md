# Strategy: Homora as an Open Source Alternative

**Date:** 2026-11-10  
**Status:** direction decision confirmed by maintainer. Checked items are implemented;
unchecked items are planned or still need real-world validation. The actual progress of each item is tracked in
[evolucao.md](evolucao.md).

This document positions Homora relative to [Homepage](https://github.com/gethomepage/homepage)
and [Dashy](https://github.com/Lissy93/dashy), the maintainer's primary reference projects.
It complements the [product evaluation](avaliacao-produto.md), which contains a detailed
comparison against other dashboards, and does not replace the
[evolution plan](evolucao.md), which remains the system of record for implementation progress.

## Decisions

| Topic          | Decision                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positioning    | **Parity on adoption blockers, plus a clear differentiator:** human-reviewed agent proposals with explicit permissions and audit logs. Do not compete on sheer integration count. |
| Configuration  | SQLite remains the source of truth. YAML/JSON files serve for **importing, exporting, versioning, and migrating** from Homepage and Dashy.                                        |
| Language       | English as default language for README, documentation, and web UI, with full runtime i18n and complete pt-BR support. Engineering documentation is maintained in English.         |
| Core Principle | Unchanged: useful without Proxmox and without AI agents; network destination policies and secret protections are never relaxed to gain convenience.                               |

## Factual Comparison

Sources: READMEs of both projects, surveyed on 2026-11-10. Capabilities evolve across
versions; verify before publicly claiming feature parity.

| Area          | Homepage / Dashy (Documented)                                                                   | Homora (Current Codebase)                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Integrations  | Homepage documents integrations for 100+ services.                                              | Four read adapters and Proxmox; none validated against live multi-version hosts.                  |
| Widgets       | Service data directly on shortcut tiles, plus informational widgets (weather, clock, search).   | Widgets render inside service cards on the homepage with aggregated telemetry.                    |
| Discovery     | Homepage discovers services via Docker container labels.                                        | Suggestions via Docker labels (optional, via read-only proxy) with human review.                  |
| Configuration | Homepage: YAML files or Docker labels. Dashy: single `conf.yml`, editable via web UI.           | SQLite database, web UI, plus YAML/JSON import/export with preview.                               |
| Status        | Dashy: HTTP status and ICMP ping with custom intervals. Homepage: container health.             | HTTP with status code and latency, optional ICMP ping, and per-service check intervals.           |
| Access        | OIDC in both; Dashy also provides multi-user roles, granular types, and read-only guest access. | Single local administrator account with password authentication.                                  |
| Languages     | Homepage supports 40+ languages; Dashy supports 30+.                                            | English and Brazilian Portuguese via runtime i18n.                                                |
| Customization | Themes, custom CSS (both); Dashy has visual color customizer and multi-page layouts.            | Light and dark themes; no custom CSS injections or multi-page routing.                            |
| Search        | Dashy: numeric hotkeys and web bang searches; Homepage: instant filter.                         | Instant client filter with `Ctrl K` and `/`.                                                      |
| Icons         | Icon library references by name (e.g., SimpleIcons, Dashboard Icons).                           | Bundled brand icons (`brand:name`), built-in Lucide names, custom image URLs, emoji, or initials. |

What Homora already possesses that reference projects do not describe: human approval
tied to the exact diff, agent identities with scoped permissions and revocation,
immutable audit logging, per-destination SSRF policies, and encrypted secrets outside
the browser.

## Roadmap Phases

Each phase delivers tangible value visible to new users. Completion criteria require
real-world validation, not merely passing automated tests.

### R0 — Frictionless Adoption

Goal: a new user discovers the project, installs in minutes, and migrates existing dashboards.

- [ ] Publish reproducible multi-arch Docker image (amd64 and arm64) and document upgrades.
      Workflow and local build exist; no release tag has been published yet.
- [x] Export and import services, groups, and ordering in YAML/JSON, with schema validation
      and skipped items reports. Secrets are never exported.
- [ ] Import Homepage `services.yaml`/`bookmarks.yaml` and Dashy configurations, displaying
      a reviewable preview before writing. Implemented and tested with documentation samples;
      still needs validation against real configurations.
- [x] Icon library by name (permissively licensed open source icon set), retaining emoji and image URLs.
- [x] README, setup guides, and screenshots in English; runtime i18n with English default and
      complete pt-BR localization.

**Done Definition:** clean install and seamless import of real Homepage and Dashy configuration
files, without manual editing, verified in a test environment.

### R1 — Living Homepage and Honest Status

- [x] Semantic monitoring states: reachable, requires login, not found, unreachable, unverified;
      with HTTP status code and latency, without following redirects (preserving P2 destination policy).
- [x] Remove silent 25-service limit or expose queue progress and coverage.
- [ ] In-card widgets (implemented for Proxmox, Jellyfin, Home Assistant, Uptime Kuma and AdGuard;
      pending live validation) with configuration, empty states, and error handling; only call an element
      a widget if it renders real data on the homepage.
- [x] Docker label discovery with reviewable suggestions and read-only socket access.
- [x] Optional ICMP ping and per-service check intervals with safety bounds.
- [x] Brand icons by name (e.g. dashboard-icons with compatible open source license), alongside
      generic `lucide:` icons.
- [x] Columnar layouts with per-group customizable widths, beyond fixed grids.
- [x] Optional top banner with date, time, and system metrics (CPU, memory, storage) polled via
      integrations, without requiring an agent installed on the host.

**Done Definition:** the homepage answers "what went down?" without clicking through tabs,
and no card appears monitored without being checked.

### R2 — Extensible Integrations

- [x] Declarative adapter format (specifying capabilities, fields, and fetch logic) to lower
      contribution friction for external developers: closed manifest, one interpreter, startup
      validation, four adapters migrated with parity checks
      ([ADR 0009](decisoes/0009-declarative-integration-adapters.md)). Proxmox stays code.
- [ ] Prioritize top ~10 most popular self-hosted integrations, validating each against live instances.
      Maintainer list is a hypothesis and should be refined with user demand.
- [ ] Reference case integrations: Portainer, Cloudflare, Tailscale, Netbird, TrueNAS, Beszel,
      and Speedtest Tracker. Each is marked complete only with live validation. Speedtest Tracker,
      Portainer, NetBird, Tailscale and Cloudflare are implemented and **unvalidated** (contract
      tests and fixtures only, no live service); Beszel (login flow with POST) and TrueNAS
      (WebSocket-only API) are skipped, see [integrations](integracoes.md#reference-integrations-issue-98).
- [x] Extract Proxmox from legacy vault into unified connection architecture (see
      [ADR 0001](decisoes/0001-proxmox-connections.md)). The legacy file is migrated at backend
      startup and the legacy routes, transport and fallbacks are gone; only the migrator and the
      `.proxmox` backup remain, to be removed once no unmigrated installation is left.
- [x] Proxmox node selection within a connection: optional, default whole cluster, an unavailable
      node is reported as such and never replaced by cluster totals.
- [x] Contribution guide for new adapters with automated contract testing harnesses
      ([adapters](adapters.md), `adapter-contract.ts`).

**Done Definition:** an external developer can contribute an adapter following documentation,
and prioritized adapters are verified against live production services.

### R3 — Access, Reach, and Customization

- [ ] Optional OIDC authentication and read-only guest access mode.
- [ ] Finalize and document supported network topology scenarios (P2) before advertising access
      outside localhost.
- [x] Theming, custom CSS, background images, translucent cards, and multi-page/tab views
      (issue #97, [ADR 0009](decisoes/0009-appearance-and-pages.md)); not yet checked in a real browser.
- [x] Keyboard shortcuts and optional web search redirection (configurable engine, without leaking
      Homora internal data).

**Done Definition:** validated and documented security model; multiple users can navigate an instance
without sharing administrator credentials.

### R4 — The Differentiator: Governed AI Agents

- [ ] AI agents proposing widgets, integrations, and discovered shortcuts as reviewable diffs with
      full audit trails.
- [ ] Visual verification and load testing of proposal lifecycle (P4).
- [x] Service-to-host operational map with Proxmox: manual associations and evidence-backed
      suggestions, never inferred by name alone. Done in issue #96; validated with simulated
      Proxmox data only.
- [ ] Public demonstration and verifiable positioning: clear boundaries of what agents can and
      cannot do.

**Done Definition:** the governing agent differentiator is demonstrable to people who have not read the source code.

## Reference Case: Migrating a Real Homepage Instance (2026-11-10)

Origin: screenshot of a production Homepage setup maintained by the author (homelab with Proxmox,
DNS, VPN, media, and security). Serves as a practical benchmark: "can I migrate to Homora?".
The screenshot displays final visual results; underlying YAML was not inspected, so the scope
below is inferred and must be cross-checked against actual `services.yaml` and `widgets.yaml`.

| Element on Target Dashboard                                           | Homora Current State                                               | Phase |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ----- |
| Card groups with descriptions and search                              | Implemented                                                        | —     |
| Service availability status                                           | Implemented, including semantic states, latency and uptime history | R1    |
| In-card telemetry (VMs, LXC, CPU, MEM, DNS queries, sites up)         | Implemented as in-card widgets; pending live validation            | R1    |
| Brand logos by name (Proxmox, Portainer, Vaultwarden…)                | Implemented: 163 bundled brand icons plus `lucide:`, emoji and URL | R1    |
| Columns with variable widths                                          | Partial: 1 to 6 columns per group; arbitrary widths not supported  | R1    |
| Top status bar with CPU, memory, storage, date, and clock             | Implemented, fed by a Proxmox connection                           | R1    |
| Integrations: Proxmox, Uptime Kuma, AdGuard, Home Assistant, Jellyfin | Implemented (read-only, verified with mocks)                       | R2    |
| Portainer, Cloudflare, Tailscale, Netbird, Speedtest Tracker          | Implemented, unvalidated (no live service tried)                   | R2    |
| TrueNAS, Beszel                                                       | Skipped: WebSocket-only API; login flow with POST                  | R2    |
| Background image, translucent glass cards, custom accents             | Implemented (server-side setting, contrast checked)                | R3    |
| Search bar triggering external web search ("G" button)                | No: search strictly filters local cards                            | R3    |
| Import `services.yaml`                                                | Implemented (preview before writing); widgets are not imported     | R0    |

Suggested sequence, ordered from highest visual impact to highest implementation cost:

1. In-card widgets tied to existing connections. Without this, new integrations provide
   little visible user value.
2. Brand icons by name (low cost, transformative visual polish).
3. Column layouts and top telemetry bar.
4. Additional integrations, prioritized by real migration usage.
5. Theming and background styling.

What this benchmark does **not** change: Docker discovery and host command execution remain
strictly governed by Homora's principles (local use, least privilege, proposal-only agents).
API keys (e.g. Cloudflare, TrueNAS) utilize the existing encrypted vault.

**Done Definition:** the reference dashboard is recreated in Homora with identical services and
telemetry metrics visible, without manual file editing, and without compromising TLS validation
or network destination policies.

## Risks

- Scope: multi-phase roadmap exceeds solo maintainer bandwidth; treat R0 and R1 as the minimum
  bar to compete and defer R3 and R4 as necessary.
- Perceived parity: large unvalidated catalogs become tech debt. Prioritize a small set of rock-solid adapters.
- Importers rely on moving third-party specs; target tested schemas and fail with clear diagnostics.
- Docker discovery grants privileged socket access; keep read-only, human-approved, and clearly document risks.
- Do not claim superiority over Homepage or Dashy before validating above features with real homelab users.

## Progress Tracking

When a phase begins, translate its milestones into tasks in [evolucao.md](evolucao.md),
applying the same governance rule: items are checked off only with proof of implementation
and automated/manual verification.
