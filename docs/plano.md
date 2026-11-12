# Delivery Plan

This document outlines phase overviews (checklist updated on 2026-11-12, including the private-network default (#83), legacy Proxmox cleanup (#85), keyboard shortcuts (#86), ADRs 0004-0007 (#87) and the history size fix (#88); forward-looking direction is in [strategy](estrategia.md)). For prioritized sequencing,
current state, and completion criteria for each milestone, consult the
[evolution plan](evolucao.md). Phases R0 to R4 (adoption, living homepage, integrations, access, governed agents)
are tracked in [strategy](estrategia.md) and [evolution plan](evolucao.md), not repeated here.

## Phase 0 — Validation

- [x] Evaluate existing dashboards and document real gaps in
      [product and competitor evaluation](avaliacao-produto.md); positioning hypothesis
      still needs validation with users.
- [ ] Finalize name, target audience, and usage examples; verify name and trademark availability.
- [x] Choose tech stack (Fastify, React, SQLite), distribution format (Docker
      Compose), and authentication model (local account) following technical prototype.

## Phase 1 — Foundation

- [x] Set up repository structure, local development, formatting, static analysis, and CI.
- [x] Implement authentication, persistence, migrations, backup, and restore.
- [x] Model services and groups; build a responsive, accessible UI.
- [ ] Validate the UI with screen readers and real mobile hardware (see P1).
- [x] Test operations, persistence, unauthorized access, and restoration.

## Phase 2 — Observability and Proxmox

- [x] Implement periodic health checks with timeouts, caching, and refresh indicators.
- [x] Create Proxmox adapter with read token and TLS validation, as a named connection
      (see [ADR 0001](decisoes/0001-proxmox-connections.md)); the legacy single-endpoint code
      was removed and only its startup migrator remains.
- [ ] Validate the Proxmox adapter against real environments: reduced permissions and failure
      scenarios. A connection with an imported CA succeeded in the maintainer environment.
- [x] Display inventory without modifying infrastructure.
- [x] Provide reviewable card suggestions from Proxmox (service-to-host map, R4). Delivered in
      five phases (issue #96, [ADR 0008](decisoes/0008-service-to-host-map.md)); validated only
      against simulated Proxmox responses, so the real-environment item below stays open.
- [x] Personalization (R3): accent, gradients, translucent cards, background image, custom CSS
      with safe mode, and pages on the Home (issue #97,
      [ADR 0009](decisoes/0009-appearance-and-pages.md)).
- [x] Test destination protection (network policy).
- [ ] Test unavailability, invalid credentials, and reduced permissions against a real Proxmox.

## Phase 3 — MCP and Approval

- [x] Agent identities with scopes and revocation.
- [x] MCP (stdio and Streamable HTTP) with queries and proposals.
- [x] UI review of proposals with diff and expiration; atomic batches.
- [x] Audit records written under database transactions.
- [ ] Manual visual validation, high concurrency load testing, and injection tests against real
      responses (see P4 in [evolution plan](evolucao.md)).

## Phase 4 — Distribution and Validation

- [ ] Document installation, configuration, recovery, upgrades, and limitations (README and
      architecture docs exist; review for completeness before release).
- [x] Create a reproducible Docker image and verify clean install and upgrade data preservation
      (validated locally on 2026-11-10).
- [ ] Publish the first release: the multi-arch workflow (`release.yml`) has not run and no tag exists.
- [ ] Validate MVP acceptance criteria in a real environment and log improvements.
- [ ] Evaluate Proxmox helper install script and additional integrations based on user demand.
      (Declarative adapters, the contract harness, five reference integrations and Proxmox node
      selection are done and unvalidated; live validation is still pending. Beszel and TrueNAS were
      skipped for transport reasons, see `integracoes.md`.)

## Risks and Open Decisions

Discovery can produce incorrect suggestions; integrations require confirmation. Health checking internal URLs increases SSRF surface; define strict destination policy before expanding. Loss of encryption key prevents credential recovery; document backup and rotation. Remote access model, MCP identity, and secret storage require proof of concept before production commitment. No time estimates can be guaranteed without knowing resource availability and additional requirements.
