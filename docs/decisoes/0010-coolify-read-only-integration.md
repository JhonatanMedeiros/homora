# 0010 — Coolify read-only integration

**Status:** Accepted (issue #102, all four phases in one change; unvalidated against a live instance)

## Context

Issue #102 asks for an optional, read-only Coolify integration: a summary widget, a searchable
inventory, links between resources and cards, and discovery with human review. It must never write to
Coolify, never collect secrets and never change cards by itself. The existing manifest format
([ADR 0009](0009-declarative-integration-adapters.md)) cannot express it: Coolify's status is a
composite string (`running:healthy`), the inventory needs two reads with partial failure, and the
transport hid the `Retry-After` header Coolify sends on 429.

## Decision

- **Code adapter** `coolify` (`kind: 'code'`), registered like Proxmox. Token with the `read`
  permission only, sent as `Authorization: Bearer`. Reads `GET /api/v1/resources` (applications and
  services; other types ignored) and `GET /api/v1/applications` (only `fqdn`). A failing
  `/applications` read removes addresses but not the inventory. `GET /services/{uuid}` is never used
  because it returns Compose content; services therefore have no address and need a typed URL.
  The connection test and summary use `/resources`, so a limited token works (the team endpoint answers
  403 to it). Fields are picked explicitly and bounded; nothing else is copied.
- **Transport:** `getAuthorizedResponse` now also reports `retryAfterSeconds` (integer seconds,
  clamped 1 to 3600). Request headers, GET-only and the whitelist are unchanged.
- **Backoff, Coolify only:** Coolify blocks a client after 30 failed requests per minute and notifies
  the team. After a 401, 403 or 429 the connection layer pauses automatic queries for that connection
  for `max(Retry-After, 60 s)`, at most 15 minutes, answering with the same generic error. Editing the
  connection clears it and the explicit test bypasses it. It never caches a success; "failures are not
  cached as successful states" still holds.
- **Links:** table `integration_resource_links` (migration 0024), one resource per card, keyed by
  connection and resource UUID, with the last reviewed name and address (`seen_name`, `seen_url`).
  Links are deleted with the card or the connection. The inventory and links are authenticated-session
  endpoints only (not MCP, not the public status page).
- **Review, not synchronization:** the UI compares the live inventory with `seen_*`. A difference or a
  vanished resource only marks the card "needs review". Keeping, updating the card or removing the link
  are explicit user actions. Discovery builds a draft in the browser and creates cards, through the
  existing card endpoint, only after confirmation; private-network monitoring stays off by default.
- **State semantics:** Coolify's state is shown apart from the HTTP check. Missing, unreadable or
  unrecognized data is `unknown` or "unavailable", never offline.

## Consequences

- Project and environment names are not shown: the documented list endpoints give only a numeric
  environment id.
- Deployments in progress (`GET /deployments`) are not implemented. Its schema includes `logs`,
  `configuration_snapshot` and commit messages and the issue defers it to validation (phase 4).
- Multiple connections (teams) already work as separate connections with isolated failures and caches;
  behavior on large installations is unvalidated.
- Supporting a manifest `prefix` match for status values would not remove the other reasons for code.

## Alternatives considered

- **Manifest:** no composite-status mapping, no partial failure, no link workflow.
- **Calling `/services/{uuid}` for domains:** rejected; the response carries Compose content.
- **Automatic sync of names and URLs into cards:** rejected by the issue; changes require review.
