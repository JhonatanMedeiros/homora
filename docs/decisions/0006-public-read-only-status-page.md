# 0006 — Public read-only status page

**Status:** Accepted

Recorded retroactively on 2026-11-12 from the implementation logs.

## Context

Sharing service status previously required a screenshot or access to the
signed-in dashboard. Issue #63 requested a read-only page with explicit consent
for each service and a minimal anonymous response.

## Decision

The page is disabled by default. `GET /api/public/status` is the only anonymous
API path: the authentication hook allows the exact path and GET only. It returns
404 when disabled or when no services are public. `services.is_public` defaults
to false; an administrator opts each service in.

Limit requests to 60 per minute per client IP and cache the response for 15
seconds. The response contains a configured title and optional description,
and for each public service only name, category, status, `checkedAt`, 24-hour
uptime and hourly bars. It excludes service URLs, hosts, descriptions, latency
and internal IDs. The configured page description is intentionally public.

Only authenticated, audited endpoints change visibility. It is outside
`ServiceInput`, so imports, exports, agent proposals and MCP cannot change it;
MCP exposes the global enabled state read-only.

## Alternatives and consequences

Issue #63 proposed either no-store or a short cache; the implementation uses a
15-second cache, so visitors can see a short-lived stale result. The in-memory
rate limit is per backend process. A gateway such as Cloudflare Access needs a
separate hostname or bypass for the public paths.

Rationale not documented; maintainer to confirm: why the 60-request limit and
15-second cache were selected.

## Validation required

The public-status log records `pnpm check` and backend tests for the default,
privacy, authorization, auditing, rate limit and exact-path allowlist. The UI
was not manually exercised in a browser, and a real Cloudflare Access hostname
was not validated. The later title and description UI was also not browser
reviewed.
