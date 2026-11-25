# ADR 0030: Optional AI assistance boundary

**Status:** Proposed (design only).

**Date:** 2026-11-25

## Context

Homora remains useful without an AI provider. [ADR 0029](0029-evidence-contract.md) defines a proposed internal evidence contract, not permission to send it unchanged. Integrated assistance differs from an external MCP client: MCP uses its existing scopes and proposal review, and is not made subject to an integrated provider configuration by this ADR. [Issue #354](https://github.com/JhonatanMedeiros/homora/issues/354) requests a decision before implementation.

## Decision

Inference for a future integrated feature runs through a server-side provider adapter, never directly from the browser. An administrator may configure local or external providers; an OpenAI-compatible endpoint is not necessarily local. No default key is bundled; a provider that requires a key is unavailable without one, while a local provider can legitimately require none. Provider keys are held in the server vault, encrypted at rest, and never returned to the browser, MCP or logs.

A persistent global master switch and a per-feature opt-in both default off. Only the administrator can change them; changes are audited. The consent screen identifies the provider and destination and describes fields that leave the product. Before either switch is enabled, no feature may call the provider. Disabling either prevents new calls immediately and requests cancellation of affected in-flight calls; it cannot recall data already delivered. Failure, disabled state, timeout, exhausted budget, or invalid output leaves the deterministic view usable with a clear notice.

### Egress and untrusted content

The backend constructs a distinct versioned egress bundle from explicitly registered, typed allowlists. Default fields are request-scoped opaque item and subject IDs, kind, source code, observation/assessment times, temporal coverage, freshness, confidence, permitted structured status/reason codes, counts, HTTP status and evidence references. A bounded summary may be generated from allowlisted structured values, not copied from raw text. Internal links are mapped locally after response validation and never sent. A separately disabled-by-default option permits bounded display names, after explicit disclosure; names may expose private information and remain untrusted. Nothing else leaves unless separately designed and approved.

Credentials, keys, tokens, full configuration, raw logs and errors, request/response bodies, addresses, IPs and MACs are prohibited in all fields. Validate structured fields and render summaries from safe templates; arbitrary string redaction alone cannot guarantee this. Reject or omit an item when its permitted representation cannot be produced safely, and disclose omitted evidence. Do not forward raw provider errors to logs or clients. Per-source tests must include secret/address canaries and adversarial names, summaries and reason fields. Delimit and label external text as data, remove control characters and bound lengths; these measures do not guarantee resistance to prompt injection. Model output is untrusted: validate its structure and references; never execute it, call tools, perform requests or writes from it. Existing human review and external-integration read-only boundaries continue to apply.

### Network and budget gates

A provider destination is a new network capability requiring its own design and security review before implementation. At minimum specify explicit private-network permission, destination validation, DNS resolution and pinned IP, no redirects, validated TLS, timeouts and response size limits, consistent with [engineering standards](../standards.md). A configured local endpoint is not exempt. Do not implement an adapter until these controls and permission semantics are approved and tested.

Initial proposed per-request maxima are 8,000 input tokens, 1,000 output tokens and 20 seconds; verify tokenizer and provider support before use. The administrator configures per-request cost and daily ceilings and per-actor rate/concurrency limits. Before dispatch, conservatively estimate and atomically reserve the maximum possible cost against both limits; account for concurrent calls and persist the reservation across restart. Reconcile reported usage after completion. If price, token bound, or cost cannot be determined, do not dispatch; an ambiguous outcome retains the conservative reservation until reconciled. A local provider may use zero cost only after the administrator explicitly declares no charge; time, token and rate limits still apply. The precise currency, default ceilings, reset boundary, accounting and provider-specific tokenizer/pricing verification are deferred to the implementation design; until approved and enforceable the feature cannot be enabled. A provider may bill differently or change prices: the product cannot guarantee the external invoice.

### Retention

Do not persist prompts, bundles or responses by default. Audit only minimum metadata: feature, actor, provider/model identifier, outcome, duration, token usage when available and reserved/reconciled cost; no names, evidence IDs, prompt or model text. Apply the existing audit retention and access controls unless a future reviewed design changes them. No content-debug mode is authorized; design it separately if needed. Reproduction is possible only while the relevant evidence, configuration and prompt version are still available; metadata alone is not a replay.

## Alternatives

A global on switch alone grants more than the selected feature needs. Sending the internal evidence object directly risks disclosing links, names or future fields. Persisting all conversations improves debugging but retains sensitive content. Allowing unknown cost defeats a budget cap. A browser-side provider call exposes credentials and bypasses server-side egress controls.

## Consequences

This decision adds no provider, endpoint, persistence, permission or UI today. Provider-specific network and accounting designs, validation, consent UX and operational tests are prerequisites, not implicitly approved capabilities. [ADR 0031](0031-evidence-evaluation.md) specifies synthetic evaluation; it cannot guarantee safety against all attacks.
