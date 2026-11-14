# 0024 — Incidents, alert thresholds and the degraded state

**Status:** Accepted

## Context

Uptime bars show that a service failed, not when, for how long or why, and a single failed check
alerts at once. The uptime redesign (mockup reviewed 2026-11-12) asks for an incident log, recovery
time, an availability target, a "degraded" state and alerts that ignore isolated failures.

## Decision

- **Incidents are derived from checks.** `service_incidents` holds periods of consecutive failed
  checks. One opens when a service fails `failure_threshold` times in a row (its `started_at` is the
  first failure of the streak) and closes at the first success of a run of `recovery_threshold`
  successes. `unknown` checks change nothing. When the table is empty at start-up it is rebuilt from
  the stored history, so existing failures appear the first time.
- **Settings live apart from the card.** `service_monitor_settings` (failure threshold, recovery
  threshold, degraded latency) is outside the service signature, so changing it never invalidates
  history, and, like `is_public`, it is written only by the web UI (`PUT /api/services/:id/monitoring`),
  never by imports or agent proposals. No row means the defaults (1, 1, off), which keeps the
  behaviour of existing installations.
- **Alerts use the same thresholds.** The notification transitions count consecutive failures and
  successes; only the check that reaches the threshold alerts, so a long outage alerts once. State
  saved before thresholds existed counts an open outage as already past its threshold, so an
  upgrade never repeats an alert.
- **"Degraded" is derived, not probed.** An online service slower than its limit reads Degraded
  (amber). It is computed from the latency already stored, per bar and for the current state.
- **Banner numbers** (incidents per week, mean recovery time, longest stretch without an outage,
  availability against a 99.9% target over 30 days) come from `GET /api/status-overview`, cached for
  ten seconds. The target's remaining "error budget" is shown instead of minutes.
- **Failure reasons stay in the monitor's vocabulary** (`no-response`, `error-status` + HTTP code…).
  Response bodies are never stored or shown. The public status page is unchanged and still exposes
  none of this.

## Alternatives

Per-service columns on `services` would have touched every raw insert/update, import and proposal
and exposed the thresholds to agents. Storing incidents only as a view over history would lose them
after the 30-day retention and could not record how many checks failed.

## Consequences

The uptime summary reads the mean latency and the last failure of each period (about 25% more
work per request, within the existing budget). The comparison with the previous period and the
90-day heatmap need hourly/daily rollups and are planned separately.
