# Maintaining continuous integration

Pull requests to `main` run the workflow in `.github/workflows/ci.yml`. This page explains how it is organized and how its caches work.

## Jobs

| Job          | Runs                                                            |
| ------------ | --------------------------------------------------------------- |
| `lint`       | `pnpm lint`                                                     |
| `format`     | `pnpm format:check`                                             |
| `type-check` | `pnpm type-check` (builds the workspace packages first)         |
| `test`       | `pnpm build`, then `pnpm test` (the tests import `dist`)        |
| `build`      | `pnpm build` and `pnpm docs:build`                              |
| `docker`     | Builds the `homora` and `discovery-agent` image targets         |
| `validate`   | Passes only when `lint`, `format`, `type-check` and `test` pass |

The first four run in parallel instead of one long `pnpm check`. `validate` only aggregates them, so a branch protection rule that requires `validate` keeps working; if you require checks by name, require `validate`, `build` and `docker`. `pnpm check` still runs everything locally and in the release workflow.

The shared setup (Node, pnpm, dependencies and the Turborepo cache) lives in `.github/actions/setup`. The release workflow checks out a tag and does not use it, so that re-running the release of an older tag keeps working.

## Turborepo cache

Turborepo skips tasks whose inputs did not change. A GitHub runner is discarded after each run, so the cache has to be stored somewhere:

- **Remote Cache (recommended).** When `TURBO_TOKEN` and `TURBO_TEAM` are set, Turborepo shares results across branches, CI runs and your machine.
- **GitHub cache (fallback).** Without a token (for example in pull requests from forks, which cannot read secrets), the setup action keeps `.turbo/cache` between runs of the same branch.

### Configure the Remote Cache

1. Create a token in the Vercel dashboard under **Account Settings → Tokens**. Give it the shortest expiry you are comfortable renewing. A token created on a personal account can access everything in that account, not only the cache, so treat it as a sensitive secret.
2. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:
   - the **secret** `TURBO_TOKEN` with the token;
   - the **variable** `TURBO_TEAM` with the team slug (for a personal account, the account slug).
3. Open a pull request and check that the Turborepo output says `Remote caching enabled` and that a second run shows `cache hit` lines.

To authenticate artifacts, you can also set a `TURBO_REMOTE_CACHE_SIGNATURE_KEY` secret and `remoteCache.signature: true` in `turbo.json`; Turborepo then rejects cache entries that were not signed with the key.

## Docker layer cache

The `docker` job reads and writes a GitHub Actions cache per image target. Pushes to `main` run only this job, to refresh the cache that pull requests can read: a cache is visible to its own branch and to the default branch, not to other branches. `.dockerignore` excludes documentation, workflows and agent files so that editing them does not invalidate the build layers.
