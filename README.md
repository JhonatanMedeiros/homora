# Homora

**English** · [Português (Brasil)](README.pt-BR.md)

A self-hosted home page to organize your services and keep an eye on your homelab. It is useful on its own, without Proxmox or any AI agent. Optional integrations and AI agents can add more, and agents can only _propose_ changes: you review each proposal before it takes effect.

**Status:** early, local-first development. This README separates what exists today from what is only planned.

![Homora services page](docs/screenshots/services-dark.png)

## What works today

- A dashboard of service cards with groups, drag-and-drop ordering (Organize mode), a column count per group (1 to 6, kept in exports), search (`Ctrl K` or `/`) and a status per service (available, login required, redirect, not found, no response or not checked) with the HTTP code and latency.
- Card icons as an emoji, a built-in icon name (`lucide:server`), a bundled brand logo (`brand:plex`, 163 homelab and self-hosted apps, served locally with no external requests) or an image URL. The service form suggests the logo that matches the service name.
- English and Portuguese (Brazil) interface. The language follows your browser and can be switched with the language button.
- Export your groups and cards to YAML or JSON, and import from Homora, [Homepage](https://github.com/gethomepage/homepage) (`services.yaml`, `bookmarks.yaml`) or [Dashy](https://github.com/Lissy93/dashy) (`conf.yml`), always with a preview. See [Import and export](#import-and-export).
- A check method per service (HTTP request or ping) and a check interval per service (30 to 3600 seconds), also kept in exports.
- Local administrator account, SQLite storage with migrations, backup and restore scripts.
- Widgets inside cards: attach a widget (Proxmox, Jellyfin, Home Assistant, Uptime Kuma or AdGuard Home data) to a card on the Integrations page. Each widget shows its own loading or error state, and a failing connection does not affect the other cards.
- An optional top bar (turn it on in Settings) with the date, the time and CPU, memory and disk usage from the Proxmox widget.
- Experimental read-only integrations (Proxmox, Jellyfin, Home Assistant, Uptime Kuma, AdGuard Home) and a local MCP server where AI agents get scoped, revocable tokens and can propose card changes that you approve in the interface.

Not available yet: Docker label discovery, OIDC or multi-user access, custom CSS and themes, and a validated setup for exposing Homora beyond your own machine. The plan lives in [docs/estrategia.md](docs/estrategia.md) and [docs/evolucao.md](docs/evolucao.md) (in Portuguese).

## Install with Docker

Requirements: Docker with Compose.

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Open <http://localhost:8080> and create an administrator password (at least 8 characters). The port is bound to `127.0.0.1` and your data lives in the `homora-data` volume.

The bind address comes from `HOMORA_BIND_IP` (default `127.0.0.1`). Override it, for example `HOMORA_BIND_IP=0.0.0.0`, only when a reverse proxy on the same private network terminates HTTPS — see the note below.

Once release images are published, you can skip the build:

```bash
HOMORA_VERSION=<version> docker compose -f compose.release.yml up -d
```

Images are built for `linux/amd64` and `linux/arm64` from base images pinned by digest.

> **Do not expose Homora to a network yet.** It is designed for local access. Compose provides no HTTPS, and the first administrator setup must be done from the machine itself. A reverse proxy with HTTPS needs `HOMORA_ALLOWED_ORIGINS` set to the public origin (comma-separated list), must forward `Host` and `X-Real-IP`, must keep the API unreachable directly, and must not disable origin validation. That mode needs its own operational validation and does not make public exposure safe by itself.

## Upgrade

1. Back up first (see [Backup and restore](#backup-and-restore)).
2. Update your checkout (`git pull`) or pick the new `HOMORA_VERSION`.
3. Run `docker compose up -d --build` (or `docker compose -f compose.release.yml pull && docker compose -f compose.release.yml up -d`).

The `homora-data` volume is preserved and database migrations run on startup inside a transaction. There is no automated downgrade: if a migration fails, keep the original volume and restore a backup into a working copy before resuming. Try the upgrade on a copy of your data if the installation holds anything important.

## Import and export

Open **Settings**. Download your groups, cards and their order as YAML or JSON (`GET /api/config/export`). The file never contains passwords, tokens, connections or IDs, so it is safe to keep in version control.

To import, pick the file format (Homora, Homepage or Dashy) and a file. Homora shows a preview of what will be added, what already exists and what was ignored, and writes nothing until you confirm. Import only adds: nothing is overwritten or removed. Imported cards are not allowed to monitor your private network unless you tick that option for a Homora file you trust.

Icons from other dashboards are kept only when Homora has an equivalent (an image URL, an emoji, a brand logo or one of the built-in icons); the others are left empty with a warning. Widgets, monitoring settings and Docker links from Homepage and Dashy are not imported. The formats were checked against those projects' documentation; real files may vary.

## Backup and restore

Create a consistent copy of the database (existing files are never overwritten):

```bash
pnpm backup data/homora.sqlite backups/homora.sqlite
```

The database holds your cards and encrypted connection credentials. The encryption key and the administrator account live in `.key` and `.auth` files next to the database, and the original Proxmox integration also uses `.proxmox`. Copy those separately into a protected backup and restore them with the same derived names. Without the key you must configure credentials again; without `.auth` the account cannot be recovered. To restore, stop Homora, keep the current database and use the backup as the source of a new file, for example `pnpm backup backups/homora.sqlite data/restored.sqlite`. Point `HOMORA_DATABASE_PATH` at it and restart.

With Docker Compose, use a new protected directory on the host (the commands do not overwrite backups):

```bash
mkdir -p backups/backup-2026-11-10
docker compose exec backend node scripts/backup.mjs /app/data/homora.sqlite /app/data/backup.sqlite
docker compose cp backend:/app/data/backup.sqlite backups/backup-2026-11-10/homora.sqlite
docker compose cp backend:/app/data/homora.sqlite.auth backups/backup-2026-11-10/homora.sqlite.auth
docker compose cp backend:/app/data/homora.sqlite.key backups/backup-2026-11-10/homora.sqlite.key
docker compose cp backend:/app/data/homora.sqlite.proxmox backups/backup-2026-11-10/homora.sqlite.proxmox
```

`.auth` and `.proxmox` may not exist on every installation; skip a copy if the file is missing. Keep the key as protected as the database, and do a test restore before relying on a backup.

## Proxmox and other integrations

Set up Proxmox on the Integrations page with an account and token that have read-only access. Credentials are encrypted at rest with a key stored separately in the same directory; this does not protect against someone who can read both files. For a private CA, import the CA's public certificate (PEM) in the form and use **Test connection** before saving; TLS validation stays on. Service limits and requirements are in [docs/integracoes.md](docs/integracoes.md). The adapters were validated with mocks, not against real Jellyfin, Home Assistant, Uptime Kuma or AdGuard Home instances.

## MCP and AI agents

After `pnpm build`, start the local MCP server with `node apps/backend/dist/mcp-server.js`. It uses stdio and offers `list_services`, `list_proxmox_resources` and `propose_service_card`. Set `HOMORA_AGENT_TOKEN` for the MCP process to a token issued in the Agents page, with the minimum scopes needed (`services:read`, `proxmox:read`, `proposals:create`). The MCP process reads the local database and vault directly and is not protected by the web session, so run it only with a client and system user you trust. Proposals need an authenticated human review in the interface. Agents must treat names and other returned data as untrusted.

## Development

Requirements: Node.js 24 (see `.nvmrc`) and pnpm 12.4.2.

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Sign-in uses `/login` and returns to the requested local route after authentication. The dashboard uses `/`; management sections use `/manage/services`, `/manage/integrations`, `/manage/agents`, and `/manage/settings`, with browser history support. Service forms use `/manage/services/new` and `/manage/services/:id/edit`; unknown routes show a not-found page. When hosting the frontend separately, configure the server to return `index.html` for these routes.

Open <http://localhost:5173>. Vite forwards `/api` to the local Fastify backend on port 3000. `pnpm dev` uses the isolated `data/homora-dev.sqlite` database and seeds example services on first creation. Changes persist between runs; deleted examples are not recreated. Example addresses are illustrative and private-network monitoring is not enabled. The first run still requires creating an administrator password. Outside development, the default database is `data/homora.sqlite` and can be configured with `HOMORA_DATABASE_PATH`; `pnpm dev` always uses its isolated database.

The monorepo uses pnpm and Turborepo: React, Vite, Tailwind CSS and shadcn/ui on the frontend; Node.js, TypeScript and Fastify on the backend; shared contracts; Drizzle ORM with SQLite. Run `pnpm check` (lint, format, types and tests) and `pnpm build` before sending changes. Commits follow Conventional Commits (`feat: ...`), enforced by Husky and Commitlint. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/padroes.md](docs/padroes.md).

## Documentation

Most engineering documents are in Portuguese.

- [Glossary](GLOSSARY.md) · [Product](docs/produto.md) · [Architecture and security](docs/arquitetura.md) · [Engineering standards](docs/padroes.md)
- [Integrations](docs/integracoes.md) · [Strategy versus Homepage and Dashy](docs/estrategia.md)
- [Delivery plan](docs/plano.md) · [Evolution plan and progress](docs/evolucao.md)
- [Guidance for AI agents](AGENTS.md) · [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## License

[MIT](LICENSE). Third-party licenses are summarized in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
