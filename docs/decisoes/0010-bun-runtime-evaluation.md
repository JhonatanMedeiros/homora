# 0010 — Bun as runtime, package manager and toolchain

**Status:** Proposed. Implemented on branch `feature/bun` as a proof of concept; not merged and not
yet validated in CI.

## Context

Homora is early, so switching the runtime is cheap now and expensive later. The goal is to use the
Bun ecosystem end to end while keeping Fastify as the API framework. Bun 1.4.4 on Linux x64
(WSL2); numbers are from one machine and are orders of magnitude, not benchmarks. Guidance was
checked against the Bun docs for workspaces, watch mode and Docker.

## What changed in the POC

- `package.json`: `workspaces`, `packageManager: bun@1.4.4`, `trustedDependencies: [esbuild]`
  (Bun does not read `pnpm-workspace.yaml`). `pnpm-lock.yaml` and `pnpm-workspace.yaml` removed;
  `bun.lock` added. Turborepo is kept and works on Bun.
- Scripts: `bun run check|build|dev|backup|auth:reset`; backend `dev` is `bun --watch`, `start`
  and `mcp` run `dist` with `bun`; frontend uses `bun --bun vite`. `tsx` was dropped.
- `Dockerfile` on `oven/bun:1.4.4-slim` (pinned by digest), non-root `bun` user, `bun install
--frozen-lockfile`, production-only install with `--filter @homora/backend`. nginx frontend
  stage unchanged. The discovery agent also runs on Bun.
- CI and release workflows use `oven-sh/setup-bun`; Dependabot gained the `bun` ecosystem; Husky
  hooks use `bunx --bun`; docs updated.
- `vitest.backend.config.ts` (no DOM setup), `bench` can pick the server runtime with
  `HOMORA_BENCH_RUNTIME=node|bun`.
- Two real findings fixed: `navigator.language` is undefined in Bun (`i18n/index.ts`), and an
  `App.test.tsx` stub returned an invalid public-status payload for a render the test never
  awaited. Node hid the race; Bun surfaced it.

## Validated locally

| Flow                                                                  | Result                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun install` / `--frozen-lockfile`                                   | 533 packages in about 1.4 s.                                                               |
| `bun run check` (lint, format, types, tests), `bun run build`         | Pass: 561 Vitest tests (on Bun's runtime) plus 9 script tests via `bun test`.              |
| `bun run dev` (Turbo: db/shared build, `bun --watch` API, Vite)       | API and Vite up, `/api` proxied, backend restarts gracefully (SIGTERM) on a source edit.   |
| Docker `backend`, `frontend`, `discovery-agent` targets               | Build and run; backend healthy, non-root, `ping` present, clean stop (exit 0).             |
| Compose stack (`-p` throwaway project)                                | First-run setup, sign-in, create card, restart backend, data persisted.                    |
| `bun run db:generate`, `backup`, `auth:reset`, MCP stdio `initialize` | Work; drizzle-kit reports no schema change.                                                |
| Idle memory of the backend container                                  | Bun about 70 MiB; Node about 258 MiB.                                                      |
| Image size                                                            | Bun 539 MB; Node 415 MB (the `oven/bun` slim base is larger).                              |
| Bench `quick`, `http,write`, `/api/services` at 64 connections        | Bun 798 req/s, p99 157 ms, RSS about 200 MB; Node 374 req/s, p99 842 ms, RSS about 400 MB. |
| Bench writes                                                          | Equivalent: bound by SQLite and `monitor.invalidate()`, not the runtime.                   |

## Caveats and not verified

- `bun test` is not a drop-in for Vitest (`vi.mocked`, `vi.waitFor`, `vi.mock` gaps), so Vitest
  stays and runs on Bun with `bun --bun`.
- `bun build --compile` (`bun run --filter @homora/backend compile`, also `compile:mcp`) works:
  about 108 MB with `--minify`; it starts, migrates, serves and stops cleanly, and it opens a
  database created before the change (23 migrations accepted). It first failed because
  migrations were read from disk. `packages/db/scripts/embed-migrations.mjs` now generates
  `src/migrations.generated.ts` (run by `build` and `db:generate`), `loadMigrations()` reproduces
  Drizzle's hashes, and a test fails if the generated file is stale. The Docker image no longer
  copies `migrations/`. The binary still needs `ping` on the host for ICMP checks. `sharp` (background image
  processing) is a native addon that `--compile` cannot embed, so it is loaded lazily: the
  binary starts, but uploading a background image fails there. The Docker image (verified with
  `sharp`) has no such limit.
- Bun has no V8 heap flag, so the bench's `--max-old-space-size` is skipped; only the RSS guard
  applies.
- Not verified: the GitHub Actions workflows (including `bun-version-file: package.json`) since
  they only run on GitHub; `linux/arm64` image builds; the `heavy`/`extreme`/`soak` bench
  profiles; Windows and macOS contributors; `.nvmrc` is now unused and was left in place.
- Bun is a younger runtime for an app that holds credentials (vault) and probes internal
  targets: re-check Node-compat on each dependency upgrade.

## Recommendation

Adopt the branch after a green CI run on GitHub and an arm64 image build. Roll back is a revert:
the Node Dockerfile and pnpm lockfile are in git history. The compiled binary is optional;
the Docker image remains the supported deployment.
