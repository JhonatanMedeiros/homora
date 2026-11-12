# 0005 — Status transition notifications

**Status:** Accepted

Recorded retroactively on 2026-11-12 from the implementation logs.

## Context

The monitor detected service outages, but the result was visible only to someone
opening the dashboard. Issue #61 proposed notifications when a service changes
state, without delaying monitoring when delivery fails.

## Decision

Support webhook and Telegram channels. Encrypt destinations and credentials
with the same vault key as integration connections. Webhook private-network
access requires per-channel opt-in; Telegram does not use that permission.
The shared outbound destination policy resolves and pins an authorized address,
validates TLS and forbids redirects.

Persist transition state separately from the startup-cleared observation cache.
Unknown checks retain the last known state. A five-minute cooldown suppresses a
repeated outage and its recovery. Deliver asynchronously through a bounded
in-memory queue so delivery does not block the monitor.

## Alternatives and consequences

Issue #61 also proposed optional consecutive-check confirmation, daily digests
and per-group or per-service silencing; these are not part of this decision.
Delivery is best effort: retries can duplicate messages and queued messages are
lost on restart.

Rationale not documented; maintainer to confirm: why these two channels, the
in-memory queue and the five-minute cooldown were selected over other choices.

## Validation required

The notification log records build, lint, formatting, type checks and tests;
two unrestricted full checks timed out in the existing load-sensitive uptime
benchmark, which passed in isolation. Telegram and webhook delivery were mocked,
and the UI was not visually reviewed in a browser. Validate real delivery and
visually review the UI when an authorized environment is available.
