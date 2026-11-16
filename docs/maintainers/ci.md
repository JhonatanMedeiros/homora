# Maintaining continuous integration

Pull requests to `main` (and the merge queue, if one is enabled) run the workflow in `.github/workflows/ci.yml`. This page explains how it is organized, what each time budget means and how its caches work.

## Jobs

| Job        | Runs                                                                                                                                                                     | Budget per step   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `static`   | `pnpm lint` (oxlint), `pnpm format:check` (oxfmt), `pnpm type-check` (TypeScript 7) and `node --test scripts/test/*.test.mjs`, in one job so that the setup is paid once | 10 s, 10 s, 20 s  |
| `test`     | Three parallel shards: compile the workspace packages (`scripts/ci/build-packages.mjs`), then `scripts/ci/run-tests.mjs N/3`                                             | 20 s, 120 s, 30 s |
| `build`    | `pnpm build` and `pnpm docs:build`                                                                                                                                       | 60 s, 40 s        |
| `docker`   | Builds the `homora` and `discovery-agent` image targets, in parallel                                                                                                     | job limit: 8 min  |
| `validate` | Passes only when `static`, every `test` shard, `build` and every `docker` job pass                                                                                       | -                 |

The `main` ruleset requires a pull request and **only `validate`**. It aggregates everything else, so adding, splitting or renaming a job does not change the rule. `pnpm check` still runs lint, formatting and types in parallel, then the tests, locally and in the release workflow.

The shared setup (Node, pnpm, dependencies and the Turborepo cache) lives in `.github/actions/setup`. The release workflow checks out a tag and does not use it, so that re-running the release of an older tag keeps working.

## Time budgets

Every project command in the workflow runs through `scripts/ci/budget.mjs`, which fails the step when it exceeds its budget (and kills it at three times the budget if it hangs). The budgets are regression guards, set above what the hosted runners measure today so that only a real slowdown turns the build red. Do not raise a budget to make a build pass: find out what got slower. The job limits (`timeout-minutes`) bound the whole job, setup included.

Locally, the pre-push hook (`.husky/pre-push`, `scripts/pre-push.mjs`) runs formatting, lint and types on what the push changes. It reports its time and aims at 9 seconds; it does not fail on time. Use `git push --no-verify` to skip it for one push; CI runs the same checks.

## Which tests run

- **Pushes to `main` (and the merge queue, if enabled): the whole suite.** The workflow has a `merge_group` trigger so a merge queue would test the exact commit that will land. GitHub does not offer the merge queue for repositories owned by a personal account, so today the ruleset only requires `validate` on the pull request, and a pull request is tested against the `main` it was last updated with. Move the repository to an organization and add the queue rule to use it.
- **Pull requests: only what the diff can reach**, to narrow feedback. `scripts/ci/select-tests.mjs` combines three layers: files that tests do not import but that can change any result (lockfile, manifests, tsconfig, Vitest config and setup, migrations, CI files) run everything; Vitest's own import graph (`--changed`); and the workspace graph, because the tests import the compiled `dist` of sibling packages, so a change in `packages/widgets` also selects the tests of every package and app that depends on it. A documentation-only change selects no test.
- Selection was checked by hiding real changes on purpose: breaking `packages/shared` or `packages/widgets` is invisible to the import graph alone (3 and 1 files selected) and turns the selected run red with the workspace layer (190 and 212 files). `scripts/test/select-tests.test.mjs` keeps these rules from regressing. A change that no test covers still passes in both modes; that is a coverage gap, not a selection one.

Test files run in random order, and each run prints its seed (`Sequence seed: N`). To reproduce a failure, run `pnpm exec vitest run --sequence.shuffle.files --sequence.seed=N` after `pnpm type-check` (which compiles the packages the tests import).

## Why the tests share a worker

`vitest.config.ts` runs most test files with `isolate: false`, so the application is not reloaded for every file (about 15% faster per shard). Files that use `vi.mock` run in a second, isolated project, because a mock cannot reach a module that an earlier file already loaded; the split is detected from the sources. `vitest.setup.ts` resets, after every file, everything that outlives it: mocks, stubs, fake timers, environment variables, module state, the DOM, storage, the locale and the viewport. The rules for writing tests that stay compatible are in [engineering standards](../standards.md#testing-and-documentation).

## Lint, formatting and types

- **Lint: oxlint.** `oxlint.config.ts` (found automatically; JavaScript configs are still experimental in oxlint) turns on the `correctness`, `suspicious`, `perf` and `pedantic` categories. Rules that the code does not satisfy yet are listed in `ratchet` as warnings, so they stay visible without blocking CI; delete an entry once the code is clean and the rule starts failing builds. The `no-restricted-imports` overrides enforce the package and capability boundaries described in the [architecture](../architecture.md). oxlint's regular expressions have no lookahead, which is why the "import through `index.ts`" rules use negated glob groups; `scripts/test/oxlint-integration-boundaries.test.mjs` proves each boundary still fails on a violating probe.
- **Format: oxfmt**, configured in `.oxfmtrc.json` with the former Prettier options. The integration catalog generator formats its output with the same formatter, so `pnpm build` and `pnpm format:check` agree.
- **Types: TypeScript 7** (`tsc` is the native compiler). `pnpm type-check` (`scripts/ci/typecheck.mjs`) compiles the workspace packages, then checks every app and `tsconfig.tests.json` project in parallel. TypeScript 7 has no JavaScript API, so the two scripts that parse TypeScript import `typescript6`, an alias of `typescript@6`, which TypeScript documents as the way to run both side by side. Remove the alias when those scripts stop needing the API.

## Turborepo cache

Turborepo skips tasks whose inputs did not change. A GitHub runner is discarded after each run, so the cache has to be stored somewhere:

- **Remote Cache (recommended).** When `TURBO_TOKEN` and `TURBO_TEAM` are set, Turborepo shares results across branches, CI runs and your machine.
- **GitHub cache (fallback).** Without a token or team (for example in pull requests from forks, which cannot read secrets), the setup action keeps `.turbo/cache` between runs of the same branch.

### Configure the Remote Cache

1. Create a token in the Vercel dashboard under **Account Settings → Tokens**. Give it the shortest expiry you are comfortable renewing. A token created on a personal account can access everything in that account, not only the cache, so treat it as a sensitive secret.
2. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:
   - the **secret** `TURBO_TOKEN` with the token;
   - the **variable** `TURBO_TEAM` with the team slug (for a personal account, the account slug). The workflow also accepts it as a secret.
3. Open a pull request and check that the Turborepo output says `Remote caching enabled` and that a second run shows `cache hit` lines.

To authenticate artifacts, you can also set a `TURBO_REMOTE_CACHE_SIGNATURE_KEY` secret and `remoteCache.signature: true` in `turbo.json`; Turborepo then rejects cache entries that were not signed with the key.

## Docker layer cache

The `docker` jobs read and write a GitHub Actions cache per image target. Pushes to `main` run only these jobs, to refresh the cache that pull requests can read: a cache is visible to its own branch and to the default branch, not to other branches. `.dockerignore` excludes documentation, workflows and agent files so that editing them does not invalidate the build layers.
