# 0013 — Monitoring as an in-app capability boundary

Status: accepted (2026-11-13, issue #135)

## Context

Check scheduling, probes, observations, rollups, uptime, incidents and maintenance sat as
`service-*.ts` files next to unrelated backend modules, and consumers (app composition, routes,
notifications, public status, MCP tools, benchmarks) imported them file by file.

## Decision

- Move the modules to `apps/backend/src/monitoring/` and expose `monitoring/index.ts` as the only
  public interface. Behaviour, file contents, schema and HTTP/MCP contracts are unchanged; no migration.
- Enforce the boundary with an ESLint `no-restricted-imports` rule instead of a framework.
- Keep server composition (`app.ts`), schema/migrations and destination authorization
  (`network-policy.ts`, `network-request.ts`) where they are; probes keep calling the shared policy.
- **No workspace package.** The only consumers are the web server and the MCP process, both inside
  `apps/backend`, and both already share the code. A package would add build and versioning cost and
  would pull the database and network policy (backend-only) or force duplicating them. Revisit if a
  consumer outside the backend needs the pure calculations.

## Consequences

- Tests moved with their modules; tests of consumers mock `monitoring/monitor.js` where they replaced
  `service-monitor.js`.
- `notification-transitions.ts` uses `serviceSignature` and the status types via the index; the
  notification and frontend work are unaffected.
