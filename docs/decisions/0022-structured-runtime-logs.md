# 0022: Structured runtime logs

Status: Accepted

## Context

During a long outage of the monitor (issue #201) the backend log held a single line, so the cause
could not be found. The API swallowed errors (the 5xx handler dropped the original error and dozens
of `catch` blocks were silent), the monitor stored only a public reason, and nothing told "the
application is up" from "the monitor stopped".

## Decision

- **Format.** One JSON object per line on stdout, written by the Fastify logger (pino). The Docker
  or Coolify log driver collects it; Homora writes no log files and keeps no rotation of its own.
  Fields: `level` (numeric), ISO `time`, `msg`, plus structured context. Request lines carry
  `reqId`, method and path.
- **Level.** `HOMORA_LOG_LEVEL`: `debug`, `info` (default), `warn`, `error`, `fatal`, `silent`.
  Tests run with no logger at all.
- **One logger per process.** `server.ts` creates it before the database opens, so migrations and
  configuration failures are logged, and hands the same instance to the application. Modules take an
  optional logger and default to a no-op, so they stay testable.
- **What is logged.** Startup identity (version, commit, migrations applied, bind, flags); the
  original error, route, method and request id for every 5xx; fatal and unhandled errors before a
  controlled exit; failed notification deliveries and integration queries; service **state
  changes** with the raw failure (`code`, message); a per-cycle summary at `debug`; a `warn` when
  most monitored services fail for the same reason; incident opened and closed.
- **What never enters a log.** Request and response bodies, `Authorization`, cookies and
  `Set-Cookie`, passwords, tokens, API keys, session, vault and integration secrets, query strings
  (paths are logged without them), notification destinations, and service or integration URLs
  (a name or id is logged instead). Serializers drop bodies and query strings; a redaction list
  covers the sensitive keys wherever a future log call attaches them. A test asserts it.
- **Silent `catch`.** A `catch` either logs, rethrows, converts to a typed API error, or carries a
  comment saying why the failure is expected (parse fallbacks, schema refinements).
- **Public reasons are unchanged.** The raw failure is logged and kept in memory by the monitor;
  the API, the status page and MCP still show only the existing `reason` values.
- **Health.** `GET /api/health` is public and read-only: `status`, `version`, `commit`,
  `schemaVersion`, `database` and the age of the monitor's last cycle. It returns 503 when the
  database cannot be read or no monitor cycle finished for two minutes. The container healthcheck
  uses it. It is excluded from request logging.

## Consequences

Logs are useful for diagnosis without extra tooling and cost one line per state change instead of
one per check. Anything printed to stdout is visible to whoever can read container logs, which is why
the exclusion list above is a contract: adding a field to a log call needs the same review as adding
one to an API response. The health body exposes the version and commit to anyone who can reach the
API, which is acceptable for a local application and should be revisited if the API is ever exposed
publicly. Remote log shipping, metrics and tracing are out of scope.
