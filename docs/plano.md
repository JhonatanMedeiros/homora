# Delivery Plan

This document outlines phase overviews (checklist updated on 2026-11-10; forward-looking direction is in [strategy](estrategia.md)). For prioritized sequencing,
current state, and completion criteria for each milestone, consult the
[evolution plan](evolucao.md).

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
- [ ] Model services and groups (done); responsive and accessible UI (done,
      but pending validation with screen readers and real mobile hardware; see P1).
- [x] Test operations, persistence, unauthorized access, and restoration.

## Phase 2 — Observability and Proxmox

- [x] Implement periodic health checks with timeouts, caching, and refresh indicators.
- [ ] Create Proxmox adapter with read token and TLS validation (implemented;
      connection with imported CA succeeded in maintainer environment, reduced
      permissions and failure scenarios pending validation).
- [ ] Display inventory (done) and provide reviewable suggestions (pending), without modifying infrastructure.
- [ ] Test unavailability, invalid credentials, reduced permissions, and destination policies
      (destination protection tested; remainder depends on real Proxmox setup).

## Phase 3 — MCP and Approval

Implemented: agents have identity, scopes, and revocation; MCP offers
queries and proposals; UI reviews proposals with diff and expiration; and
application records audits under database transactions. Manual visual validation,
high concurrency load testing, and injection tests against real responses remain pending;
see [evolution plan](evolucao.md) for latest status.

## Phase 4 — Distribution and Validation

- [ ] Document installation, configuration, recovery, upgrades, and limitations.
- [ ] Create reproducible Docker image and verify clean install and upgrade data preservation.
- [ ] Validate MVP acceptance criteria in a real environment and log improvements.
- [ ] Evaluate Proxmox helper install script and additional integrations based on user demand.

## Risks and Open Decisions

Discovery can produce incorrect suggestions; integrations require confirmation. Health checking internal URLs increases SSRF surface; define strict destination policy before expanding. Loss of encryption key prevents credential recovery; document backup and rotation. Remote access model, MCP identity, and secret storage require proof of concept before production commitment. No time estimates can be guaranteed without knowing resource availability and additional requirements.
