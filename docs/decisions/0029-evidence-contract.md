# ADR 0029: Evidence contract

**Status:** Proposed (design only).

**Date:** 2026-11-25

## Context

[Issue #354](https://github.com/JhonatanMedeiros/homora/issues/354) precedes the operational summary and incident investigation. They need a common vocabulary without assuming that an integrated model exists. Monitors include cards and standalone probes ([ADR 0020](0020-monitors-and-probes.md)); raw observations are retained for 30 days, while incident rows have different retention ([ADR 0027](0027-widget-internal-monitoring.md)). Absence of a row does not establish that nothing happened.

## Decision

This is the target v1 contract, not an implemented API. #349 must implement and test it before consumers rely on it. A bundle has `version: 1`, `evaluatedAt` (UTC RFC 3339 timestamp), and `items`. All timestamps below use that representation. Item IDs are unique within a bundle; references resolve within that bundle. Bundles are bounded by the producing feature, which must disclose truncation and unavailable sources rather than treating them as empty.

Each item contains `id` (nonempty string), `version: 1`, `kind` (`fact`, `hypothesis`, or `unknown`), `source` (a registered source code), `subject` (`{type, id}` with nonempty strings), `evaluatedAt`, `freshness` (`fresh`, `stale`, `unknown`, or `historical`), `confidence` (`confirmed`, `inferred`, or `unknown`), `summary` (bounded plain text), and `link` (a relative Homora route or `null`). Links are constructed by the server, never accepted from external data; they are not sent to a model. `attributes` is a source-specific, typed allowlist, never an unrestricted blob. Unknown fields are rejected at trust boundaries. No credentials or secrets are allowed anywhere, including text, identifiers and links. The precise registered source and attribute schemas, size bounds, and link targets must be specified and reviewed by #349 before a source is used; unregistered sources are rejected.

- A **fact** has `confidence: confirmed`, an actual `observedAt`, an optional `window` with `from <= to <= evaluatedAt`, and a source capable of supporting its precise statement. An incident derived from checks is a fact about the recorded incident, not a confirmed underlying cause. An observation later than `evaluatedAt` is invalid.
- A **hypothesis** has `confidence: inferred`, nonempty `evidenceIds` resolving to facts, and no claim of confirmed cause. It may carry `observedAt` only for an actual observation, never a fabricated one. References cannot be self-references or cycles. Hypotheses do not become facts by repetition.
- An **unknown** has `confidence: unknown`, `freshness: unknown`, nonempty `missing` entries, and a source describing the attempted lookup or coverage assessment. Its `evaluatedAt` records when the gap was assessed; `observedAt` is `null` when no observation exists. Its summary cannot claim a conclusive result.

For facts from periodic checks with a matching current settings signature, `fresh` means `0 <= evaluatedAt - observedAt <= 2 * effectiveInterval`; strictly greater is `stale`. The effective interval includes the default when unset. Changed settings invalidate the old reading for current state; missing, paused, blocked, future-dated or otherwise unusable readings yield `unknown`, not a fresh state. A stale reading may describe what was last observed, not current health. Historical facts use `historical` and their actual observation/window; retention and coverage are stated separately. A time-bound incident update needs its own observation time; an old start time does not prove an incident is still open. Other source types must define their freshness policy before use. This rule does not silently change existing screens or widget contracts, which have their own thresholds.

`id` identifies an immutable item revision within its source: a changed underlying event gets a new revision ID. Computing a later freshness classification does not change the underlying observation or its identity; `evaluatedAt` and freshness are bundle-time annotations, not evidence of a new check. The producer must define stable revision IDs for each registered source and handle removed or expired records. `version` denotes schema compatibility, not record revision. Additive optional fields may remain v1 only if existing consumers can safely ignore them; incompatible meaning or required-field changes require v2 and explicit consumer support.

### Examples

The source codes and attributes below are proposed registrations, not existing APIs. Synthetic IDs and routes are illustrative.

```json
{
  "version": 1,
  "evaluatedAt": "2026-01-01T12:00:00Z",
  "items": [
    {
      "id": "check:example-1",
      "version": 1,
      "kind": "fact",
      "source": "monitor-check",
      "subject": { "type": "monitor", "id": "example" },
      "observedAt": "2026-01-01T11:59:30Z",
      "evaluatedAt": "2026-01-01T12:00:00Z",
      "freshness": "fresh",
      "confidence": "confirmed",
      "summary": "The check returned HTTP 503.",
      "link": null,
      "attributes": { "httpStatus": 503 }
    },
    {
      "id": "incident:example-1:revision-1",
      "version": 1,
      "kind": "fact",
      "source": "monitor-incident",
      "subject": { "type": "monitor", "id": "example" },
      "observedAt": "2026-01-01T11:59:30Z",
      "evaluatedAt": "2026-01-01T12:00:00Z",
      "freshness": "historical",
      "confidence": "confirmed",
      "summary": "An incident opened at 11:59:30 UTC.",
      "link": null,
      "attributes": { "event": "opened" }
    },
    {
      "id": "gap:example-1",
      "version": 1,
      "kind": "unknown",
      "source": "coverage-assessment",
      "subject": { "type": "monitor", "id": "example" },
      "observedAt": null,
      "evaluatedAt": "2026-01-01T12:00:00Z",
      "freshness": "unknown",
      "confidence": "unknown",
      "summary": "Earlier check history is unavailable.",
      "link": null,
      "missing": ["check-history-before-2025-12-02"],
      "attributes": {}
    }
  ]
}
```

Invalid: the following hypothesis has no supporting fact and claims a confirmed cause; a validator must reject it even though it has a source and time.

```json
{
  "id": "hyp:1",
  "version": 1,
  "kind": "hypothesis",
  "source": "analysis",
  "subject": { "type": "monitor", "id": "example" },
  "observedAt": null,
  "evaluatedAt": "2026-01-01T12:00:00Z",
  "freshness": "unknown",
  "confidence": "confirmed",
  "summary": "The router caused the outage.",
  "link": null,
  "evidenceIds": [],
  "attributes": {}
}
```

Text semantics require review or a source-specific renderer in addition to structural validation; a schema alone cannot prove a statement true or detect every secret. Internal display and external egress use separate allowlists and validation ([ADR 0030](0030-ai-assistance-boundary.md)).

## Alternatives

An unrestricted text blob cannot enforce provenance or safe egress. Requiring observation times on gaps would invent data. Reusing mutable incident IDs as immutable evidence revisions would make citations ambiguous. Applying a single freshness threshold to all existing screens would change current behavior without feature review.

## Consequences

No migration, endpoint, model or runtime change is authorized by this ADR. Implementers must define source registrations, IDs, safe links, bounds and validation; legacy records may be unavailable or only partially cover a requested interval. Citation IDs alone do not preserve expired evidence.
