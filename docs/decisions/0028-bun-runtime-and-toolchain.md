# ADR 0028: Bun as runtime, package manager and toolchain

Status: Proposed — implemented on branch `feature/bun`; not merged. Supersedes the Node and pnpm assumptions in earlier ADRs, whose historical commands are left as written.

## Context

Homora is early, so changing the runtime is cheap now and expensive later. The goal is to use the Bun ecosystem end to end while keeping Fastify as the API framework. The evaluation used Bun 1.4.5 on Linux x64 (WSL2) and was checked against the Bun documentation for workspaces, watch mode and Docker. Numbers come from one machine and are orders of magnitude, not benchmarks.

## Decisions

1. **Bun runs the API, the scripts and the tests.** `packageManager` is `bun@1.4.5`; `package.json` declares `workspaces`, `trustedDependencies` (`esbuild`) and the two `overrides` that were in `pnpm-workspace.yaml`. `bun.lock` replaces `pnpm-lock.yaml`. Turborepo stays. The default isolated linker is kept, so packages cannot import what they do not declare.
2. **Scripts.** `bun run` for every command; backend `dev` uses `bun --watch`, `start` and `mcp` run `dist` with `bun`; the CI helpers in `scripts/ci` spawn `process.execPath` instead of `node`. `tsx` is removed.
3. **Docker.** Every image target builds on `oven/bun:1.4.5-slim` (pinned by digest) and runs as the non-root `bun` user. `bun install --frozen-lockfile --production --filter @homora/backend` produces the runtime dependencies and a `prod-tree` stage copies only the manifest, `dist` and `assets` of each workspace package. nginx stays the frontend server.
4. **Migrations are embedded.** `packages/db/scripts/embed-migrations.mjs` writes `src/migrations.generated.ts` (run by `build` and `db:generate`); `loadMigrations()` reproduces Drizzle's hashes so existing databases are adopted unchanged, and a test fails if the generated file is stale. This removes the dependence on files next to `dist`, which is what lets `bun build --compile` work (`compile`, `compile:mcp`).
5. **`sharp` loads on first use.** It is a native addon that `--compile` cannot embed; loading it lazily lets the compiled binary start, and only the background image upload fails there. The Docker image is unaffected.
6. **Test pool.** Vitest 5's `forks` pool calls `child.channel.unref()`, which Bun does not implement, and many worker threads starve each other on Bun. `vitest.config.ts` therefore selects `threads` with 4 workers when it runs on Bun; Node behaviour is unchanged.
7. **CPU budget test.** `uptime.test.ts` measures `process.threadCpuUsage()` instead of `process.cpuUsage()`, because the latter also counts the other workers of a thread pool and made the budget flaky on Bun.
8. **Vite config.** `import.meta.resolve` became `createRequire(...).resolve`: Vite rewrites the former into a module only Node's loader resolves.
9. **Stays on Node.** VitePress (`docs:*`) uses its Node shebang: under `bun --bun` it fails to resolve `vue`'s peers with the isolated linker. It builds documentation only and is not part of the application runtime.

## Validated locally

| Flow                                          | Result                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `bun install` / `--frozen-lockfile`           | 640 packages in a few seconds; VitePress still resolves `vite 6.4.6` while the app uses 8.3.8.                                      |
| `bun run check`, `bun run build`              | Pass: lint, format, types, 2243 Vitest tests on Bun, 48 script tests (`bun test scripts/test`).                                     |
| `scripts/ci/*`                                | `build-packages`, `select-tests`, `budget` and a test shard run on Bun (shard 1: 625 tests in 16 s).                                |
| `bun run dev`                                 | API and Vite up, `/api` proxied, `/api/health` ok at schema 51, `--watch` restarts the API gracefully.                              |
| `bun run db:generate`, `integration:catalog`  | No diff.                                                                                                                            |
| Docker `homora` and `discovery-agent` targets | Build and run: healthy, non-root, `ping` and nginx present, `sharp` loads, backup script works, first-run setup, sign-in, API call. |
| Compiled binary and compiled MCP              | Start, migrate 51 migrations, serve `/api/health`, answer MCP `initialize`; about 110 MB.                                           |
| Idle memory of the `homora` image             | Bun about 104 MiB; Node (`main` before this change) about 278 MiB.                                                                  |
| Image size                                    | Bun 646 MB; Node 491 MB. The `oven/bun` slim base is larger.                                                                        |

## Caveats and not verified

- The GitHub Actions workflows (including `bun-version-file: package.json`, `docs:build` on the runner's Node and the arm64 image build) can only be verified on GitHub. A previous revision of this branch passed the CI jobs.
- The compiled binary reports `version: unknown` (it reads `package.json` from disk) and needs `ping` on the host for ICMP checks.
- Bun has no V8 heap flag, so the bench skips `--max-old-space-size`; `HOMORA_BENCH_RUNTIME=node|bun` selects the server runtime. The heavy bench profiles were not re-run on this revision.
- Windows and macOS contributors were not tested.
- Bun is a younger runtime for an app that holds credentials and probes internal targets: re-check Node compatibility on each dependency upgrade. Rolling back is a revert; the Node Dockerfile and `pnpm-lock.yaml` stay in git history.
