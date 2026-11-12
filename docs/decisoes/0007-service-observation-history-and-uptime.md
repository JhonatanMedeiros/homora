# 0007 — Service observation history and uptime

**Status:** Accepted

Recorded retroactively on 2026-11-12 from the implementation logs.

## Context

The latest status alone does not show availability or latency over time. Issue
#62 builds on the existing per-check history and requests bounded summaries
without loading 30 days of observations into memory.

## Decision

Keep one history row per check, deduplicated by service, signature and
observation time, with 30-day retention. A signature captures check-relevant
configuration; uptime counts only the current signature and flags
`reconfigured` when other signatures occur in the selected period.

Exclude unknown checks from the uptime denominator and show no percentage
until five up/down checks exist. Empty buckets are unknown. Cap summaries at
120 buckets: 30 minutes for 24 hours, two hours for seven days and six hours
for 30 days. Calculate p95 latency only for a single service because sorting
every latency is costly.

Migration 0016 adds virtual status and latency columns extracted from observation
JSON and a covering index. Aggregation runs in SQL against the index, without
parsing every JSON observation in application memory or rewriting old rows.

## Alternatives and consequences

Issue #62 suggested one-hour buckets for seven days; two-hour buckets honor the
120-point cap. The implementation log identifies rollups as a possible next
step for slower long-range queries. Per-check history grows with every check:
the measurement reported in issue #88 on 2026-11-12 was about 590 bytes per row,
or roughly 25 MB per service per month at a 60-second interval. Reducing this
cost is tracked in issue #88.

Rationale not documented; maintainer to confirm: why 30 days of retention and a
minimum of five checks were selected.

## Validation required

The uptime log records tests, `pnpm check` and `pnpm build`. Its synthetic
benchmark used 200 services at a 15-minute interval: 24-hour and seven-day
queries met 300 ms; 30-day queries ran close to or above it depending on load.
The default 60-second interval produces roughly 15 times as many rows and was
expected to be slower. The feature was not checked in a browser or against real
infrastructure.
