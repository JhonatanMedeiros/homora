# 0004 — Better Auth for web authentication

**Status:** Accepted

Recorded retroactively on 2026-11-12 from the implementation logs.

## Context

The administrator account previously lived in a `.auth` file and sessions were
in memory. Homora needs web authentication and remains a single-administrator
application. First-run setup was already open to clients that can reach it.

## Decision

Use Better Auth with email and password on the application SQLite database.
Pin version 1.7.19: 1.7.20 was younger than the project's minimum package age.
Disable telemetry. A database hook refuses a second user; first-run setup remains
open to any client reaching the UI from an allowed origin until an account exists.

Sessions last eight hours and survive restarts. Sign-in is limited to ten
attempts per client per 15 minutes in an in-process store. The API supplies the
client address resolved by Fastify, honoring `HOMORA_TRUST_PROXY`. Cookies are
HttpOnly and SameSite=Strict; Secure follows the request origin. Only
`sign-in/email`, `sign-out` and `get-session` are exposed from Better Auth.
Homora's authenticated routes manage the account, password and sessions.
Recover an account locally with `pnpm auth:reset`.

## Alternatives and consequences

The replaced implementation used a file-based account and in-memory sessions.
The old `.auth` file is ignored: loss of the old account data was accepted at
this early stage. Setup remains claimable by a reachable client before the first
account is created. The rate limit is per process and an untrusted proxy can
aggregate clients under its address.

Rationale not documented; maintainer to confirm: why Better Auth was selected
and why the session duration and sign-in thresholds were chosen.

## Validation required

The authentication log records automated, compiled-backend, container and
headless Chromium checks. At that time a real HTTPS proxy and concurrent load
were not validated. A later log records a local Docker/nginx HTTPS proxy test,
including per-client limiting; production proxy products, multi-hop forwarding,
concurrent load, Safari and Firefox remain unvalidated.
