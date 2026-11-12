# Contributing

Homora is in active development and does not have a finalized license yet. Until
maintainers choose and publish a license, do not assume permission to redistribute
the project. See also [security](SECURITY.md) before reporting a vulnerability.

## Setup and Validation

Adding an integration? Read [docs/adapters.md](docs/adapters.md). Follow the [engineering standards](docs/padroes.md) and review current
[architecture](docs/arquitetura.md) before making changes across modules,
persistence, or integrations.

Use Bun 1.4.4 (`packageManager`):

```sh
bun install --frozen-lockfile
bun run check
bun run build
```

For local development, copy `.env.example` to `.env` if you need to customize
ports or database path, then run `bun run dev`. Backup tests use temporary files;
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

Pull requests should explain the problem, summarize the solution, and list
the checks executed along with known limitations. There is no guaranteed review
turnaround while the project is in early development.
