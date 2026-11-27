# Contributing

Homora is in active development and is available under the [MIT license](LICENSE).
Please follow the [code of conduct](CODE_OF_CONDUCT.md) and see [security](SECURITY.md) before reporting a vulnerability.

## Setup and Validation

Adding an integration? Read [docs/adapters.md](docs/adapters.md). Follow the [engineering standards](docs/standards.md) and review current
[architecture](docs/architecture.md) before making changes across modules,
persistence, or integrations.

Use Node.js 24 (`.nvmrc`) and pnpm 12.4.2 (`packageManager`):

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`pnpm check` runs lint (oxlint), formatting (oxfmt) and types (TypeScript 7) in parallel, then the tests. Git
hooks (installed by `pnpm install`) format and lint staged files on commit and check what you push in a few seconds
before `git push`; see [maintaining CI](docs/maintainers/ci.md) for the checks the pull request runs.

For local development, copy `.env.example` to `.env` if you need to customize
ports or database path, then run `pnpm dev`. Backup tests use temporary files;
do not use personal data or production databases in tests.

## AI agent skills

The repository ships skills for coding agents in `.agents/skills/`, also linked from `.claude/skills/`
and `.hermes/skills/`. They are optional: they order the steps of common tasks and point to the
documentation, which remains the source of truth.

| Skill                | Use it to                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `homora-pr`          | Validate a change and open a pull request                        |
| `homora-integration` | Create or change a service integration                           |
| `homora-widget`      | Create or change a local widget                                  |
| `homora-migration`   | Change the database schema without losing data                   |
| `homora-release`     | Prepare and verify a release (maintainers; invoke it explicitly) |

In Claude Code, type `/homora-pr`, for example. With other agents, ask for the skill by name or
point the agent to its `SKILL.md`. When a documented process changes, update the matching skill.

## Submitting Changes

- Open an issue or discussion for large changes before implementing them.
- Keep each proposal focused, include tests for behavioral changes, and update
  documentation when installation, configuration, or security changes.
- Schema changes require an additive migration and tests demonstrating that
  existing data is preserved.
- Do not include secrets, databases, backups, or personal data. Check `git status`
  before submitting.
- Use commit messages following Conventional Commits, for example
  `fix: preserve data on migration`.
- Give pull requests a clear Conventional Commit title, such as `feat: add service alerts`,
  `fix: preserve data on migration`, or `docs: clarify setup`. The merged commit message
  determines the changelog; make sure it remains suitable for the chosen merge method.
- Use `deps:` for dependency updates and `security:` for security changes so
  they appear in the corresponding release notes.

Pull requests should explain the problem, summarize the solution, and list
the checks executed along with known limitations. There is no guaranteed review
turnaround while the project is in early development.

Maintainers can find the versioning and publication workflow in [the release guide](docs/maintainers/releases.md).

## Local widget contributions

Use `pnpm widget:create <type>` and follow the [widget creation guide](docs/create-widget.md). Keep definition, logic, translations, tests and UI in the module; do not add widget-specific host branches. Future widget issues must account for the scaffold, module structure, compatibility and validation.
