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

For local development, copy `.env.example` to `.env` if you need to customize
ports or database path, then run `pnpm dev`. Backup tests use temporary files;
do not use personal data or production databases in tests.

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
- Use `deps:` for dependency updates and `security:` for security changes so
  they appear in the corresponding release notes.

Pull requests should explain the problem, summarize the solution, and list
the checks executed along with known limitations. There is no guaranteed review
turnaround while the project is in early development.

Maintainers can find the versioning and publication workflow in [the release guide](docs/maintainers/releases.md).
