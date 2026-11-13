# 0014 — Configuration transfer boundary

Status: accepted (2026-11-13)

## Context

Configuration import and export grew from one file into several: format contracts and parse budgets,
the Homora parser, Homepage and Dashy parsers, icon mapping, a shared collector, the additive planner
and the serializer. Docker discovery reuses the collector and the parsed-import types, and group
configuration imported `MAX_GROUP_COLUMNS` from the transfer facade (a reverse dependency).

## Inventory

| Responsibility                                                                       | Owner                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Format contracts, issue codes, parse budgets (chars, groups, services, flow openers) | `transfer/types.ts`                                                           |
| Homora YAML/JSON parsing and per-service validation                                  | `transfer/parser.ts`                                                          |
| Homepage / Dashy parsing, icon mapping, collector                                    | `transfer/importer-*.ts`, `transfer/importers.ts`                             |
| Additive plan (preview) from a parsed document and existing names                    | `transfer/planner.ts`                                                         |
| Export document (no credentials, connections or IDs)                                 | `transfer/serializer.ts`                                                      |
| Public interface of the above                                                        | `transfer/index.ts`                                                           |
| Group column limit                                                                   | `group-limits.ts` (used by group configuration, input schemas and the parser) |
| Reading rows, transaction, optimistic version, applying a plan, audit                | `service-configuration-transfer.ts`                                           |
| HTTP, session authorization, confirmation, size limits                               | `routes/config-transfer.ts`                                                   |
| Docker suggestions                                                                   | `docker-discovery.ts` (consumes the `transfer` collector)                     |

## Decision

- The pure format, parsing and planning code lives in `apps/backend/src/transfer/` behind
  `transfer/index.ts`. It imports no routes, SQLite, authorization or confirmation; those stay in the
  backend application service and routes. Modules inside the directory import each other directly, and
  everything outside imports only `transfer/index.js`.
- Limits go to the module that owns the concept. `MAX_GROUP_COLUMNS` moved to `group-limits.ts`, so
  transfer depends on group configuration limits and never the reverse. Parse budgets stay with the
  transfer types.
- No workspace package for now. The only consumers are the backend service, its routes, Docker
  discovery and a benchmark, all in the same process. The frontend consumes the HTTP contract (stable
  issue codes), not this code. A package would add a build and Docker manifest step without isolating
  anything. Revisit if a second runtime (a CLI or another app) needs to parse or serialize files; the
  directory has no backend-only imports apart from `group-limits.ts`, a constant, so extraction is
  mechanical.

## Compatibility

No format, limit, issue code, route or data change. Homora YAML/JSON, Homepage and Dashy imports,
preview, additive-only apply, ordering, supported icons, parse limits, credential-free export and the
explicit private-network opt-in are unchanged. No unresolved compatibility questions.
