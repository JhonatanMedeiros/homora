# 0009 — Declarative integration adapters

**Status:** Accepted (phase 2 of issue #98 implemented; phase 3 additions are recorded below)

## Context

Adding an integration meant editing many places by hand: the adapter, the registry,
two hard-coded type enums (`input-schemas.ts`, `managed-proposals.ts`), the stored
configuration schema and per-type quirks in `integration-connections.ts`, the frontend
kind union, labels, form and data-to-text switch, and the brand icon list. Four of the five
adapters (Jellyfin, Home Assistant, Uptime Kuma, AdGuard Home) are the same shape: validate
a URL and a few fields, make one authenticated GET, check and bound the JSON, return a few
values.

## Decision

A small **closed manifest format**, defined as data in `packages/shared/src/integration-manifest.ts`,
run by **one reviewed interpreter** (`apps/backend/src/manifest-adapter.ts`).

- **Built-in only.** Manifests are TypeScript data in the repository. Nothing is loaded from the
  database, the network or the user at runtime. The registry's rule "explicit registration keeps
  unknown types from executing code" still holds.
- **Validated at startup.** `assertValidDefinition` (zod, `integration-manifest.ts`) runs when the
  registry is created. An invalid manifest throws there, so tests and the build fail, not production.
  It also cross-checks placeholders, request ids, outputs, display values, error codes and brand icons.
- **Vocabulary.** Identity (`type`, `label`, `mark`, `brandIcon`, `capabilities`); fields (`url`,
  `text`, `secret`, `token-id`) with required, max length, anchored pattern, help text and an error
  code; auth (`none`, `bearer`, `token`, `api-key`, `basic`); an ordered list of GET requests with a
  closed path template (named placeholders over text fields, URL-encoded, no expressions); a status and
  a per-request size limit (at most the transport's 2 MB cap); extraction operations over fixed JSON
  paths (`pick`, `config`, `count`, `sum`, `last`, `state`, `tally`) each with a type and bounds;
  `require` checks (a response value equals a config field or a literal); and display data (summary
  text and stats, English default strings with optional translation keys, value maps).
- **No new code path.** No `eval`, no user expressions, no JSONPath filters. Paths are arrays of
  fixed keys and indices; inherited properties and `__proto__` are never read. Any extraction failure
  is "invalid response", never a partial result. A credential reflected in any output string makes the
  response invalid.
- **Same transport.** The interpreter only calls the injected transport (destination policy, DNS
  pinning, TLS, timeouts, size limit, header whitelist). GET only. Authentication maps to the
  whitelisted headers: `authorization` (`Bearer`, `Token`, `Basic`) and, new in this decision,
  `x-api-key` through a new optional `apiKey` request member. `x-api-key` was already on the
  transport's whitelist; no header name was added. The connection transport sends it only when set.
- **Single source of truth.** The registry builds from `integrationDefinitions`. The type enums,
  stored public-config keys, connection input and proposal schemas (`integration-fields.ts`), the
  connection form, the data-to-text rendering, the picker and the brand icon come from the same
  definitions. `GET /api/integrations/catalog` returns `registry.describe()`: fields and display,
  never requests, extraction rules or stored values. MCP discovery keeps `registry.list()`
  (type, label, capabilities); proposals accept only registered types.
- **Existing installations.** Stored public keys (`url`, `allowPrivate`, `entityId`, `username`,
  `slug`) and credentials (`secret`, `tokenId`, `ca`) keep their names. No data migration.

## Parity

Jellyfin, Uptime Kuma, Home Assistant and AdGuard Home were migrated. Before the hand-written adapters were
removed, a differential run compared old and new over URL variants (schemes, credentials, query,
fragment, path, length), slugs, entity ids (including hostile values), credentials and response
variants. Accept or reject decisions, requests and data were identical. The expectations now live in
`manifest-adapters.test.ts`. Differences accepted on purpose: URLs longer than 2048 characters are
rejected by every adapter (phase 1 finding); error messages are generated from the label; and
connection proposals now require `https://` for every integration whose address field is HTTPS-only
(Home Assistant, AdGuard Home, Proxmox), where before only Proxmox did, matching what those adapters
already enforce.

## Alternatives considered

- **Keep code adapters.** Simple and flexible, but each integration repeats validation, error
  handling and bounds, and the many hard-coded places keep drifting. The contract harness (phase 1)
  reduces the risk but not the effort.
- **A richer declarative manifest** (JSONPath with filters, templates with expressions, conditional
  steps). Covers more services, but each feature is a small language to secure and test. Rejected.
- **Embedded scripting** (a sandboxed JS or WASM adapter). Maximum reach, but it is arbitrary code
  running next to credentials and is the opposite of the project's trust model. Rejected.

## What the format does not cover (stays code or is out of scope)

- **Proxmox** stays code: several requests with concurrency, per-guest reads that may fail
  individually, pinned CA certificates and a large payload. It registers by hand through the same
  registry and its metadata lives in the same definitions (`kind: 'code'`).
- POST or any write call, login flows and session cookies, WebSocket-only APIs, custom header names,
  pagination, request bodies, and values derived from several responses beyond `require` and
  `config`.
- Status levels (ok, warning, down) as a display concept: widgets show text values only for now.
  Display values are limited to bounded text, booleans and non-negative finite numbers.

## Consequences

- Adding a simple read-only integration is one manifest, fixtures, a brand icon that already exists
  in `BRAND_ICON_NAMES`, a contract run and documentation (see `docs/adapters.md`).
- The frontend imports the definitions from `@homora/shared` rather than fetching the catalog, so the
  form renders without a request; the endpoint exists for other clients.
- Phase 3 integrations are evaluated against this vocabulary. A service that needs anything listed
  above is skipped and recorded in the pull request, not forced through by widening the transport.
