---
description: 'Structured JSON runtime logs, log levels and the health check endpoint.'
---

# Logs and health checks

Homora's backend writes **one JSON object per line to standard output**; your container runtime keeps and rotates them.

## Reading the logs

```sh
docker compose logs -f backend              # follow
docker compose logs --since 1h backend      # the last hour
docker compose logs backend | jq 'select(.level >= 40)'   # warnings and errors only
```

In Coolify, open the backend resource's **Logs** tab. Each line looks like this:

```json
{
  "level": 40,
  "time": "2026-11-14T13:51:07.120Z",
  "service": 4,
  "name": "Jellyfin",
  "checkType": "http",
  "from": "available",
  "to": "unavailable",
  "reason": "no-response",
  "errorCode": "ECONNREFUSED",
  "errorMessage": "Connection failed.",
  "msg": "service available -> unavailable: no-response"
}
```

`level` is numeric: 20 debug, 30 info, 40 warn, 50 error, 60 fatal.

## Level and variables

| Variable              | Default | Meaning                                                            |
| --------------------- | ------- | ------------------------------------------------------------------ |
| `HOMORA_LOG_LEVEL`    | `info`  | `debug`, `info`, `warn`, `error`, `fatal` or `silent` (no output). |
| `HOMORA_BUILD_COMMIT` | unknown | Set by the image build; reported at startup and by `/api/health`.  |

An invalid level stops the backend at startup with a clear message. Restart after changing it.

## What you will see

- **Startup (`info`)**: version and commit, database path, migrations applied, bind address and ports, and enabled
  features. A database written by a **newer** build logs a `fatal` line and the backend refuses to start.
- **Requests (`info`)**: one line on arrival and one on completion (`/api/health` is not logged). Use `warn` to hide
  them.
- **Errors (`error`)**: every unexpected 5xx logs the error with stack, route, method and request id; the browser only
  sees `internal-error`.
- **Monitoring**: a line when a service changes state (`warn` when unavailable, `info` on recovery) with the raw failure
  (`errorCode`, `errorMessage`), not repeated on every check. A `warn` reading `systemic monitoring failure: N of M
  services fail with <reason>` means most services fail for the same reason, which usually points at Homora's own
  network, DNS or policy. Incidents opening and closing are logged; `debug` adds a summary per cycle.
- **Notifications and integrations**: failed deliveries and queries, with the channel or connection id and type, never the
  address or credentials.
- **Crashes**: an uncaught exception logs a `fatal` line and the process exits cleanly with a non-zero code, so the
  restart policy brings it back.

## What is never logged

Request and response bodies, passwords, `Authorization` headers, cookies, tokens, API keys, the
session secret and vault key, integration credentials, notification addresses, query strings, and
service or integration URLs. If you find one of these in a log, treat it as a bug and report it
without pasting the value.

## Health check

`GET /api/health` needs no sign-in and reveals nothing about your services:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "commit": "9f2c1ab…",
  "schemaVersion": 43,
  "database": "ok",
  "monitor": { "status": "ok", "lastCycleAgeSeconds": 4 }
}
```

It answers `503` with `"status": "unhealthy"` when the database cannot be read or the monitor has not finished a cycle for
two minutes (`"monitor": {"status": "stalled"}`); right after startup it reads `starting`. The backend image's Docker
`HEALTHCHECK` uses this endpoint, so `docker ps` shows the container as unhealthy.

The design and the redaction rules are recorded in
[ADR 0022](../decisions/0022-structured-runtime-logs.md).
