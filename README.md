# Homora

**English** · [Português (Brasil)](README.pt-BR.md)

A self-hosted home page to organize your services and keep an eye on your homelab. It is useful on its own, without Proxmox or any AI agent. Optional integrations and AI agents can add more, and agents can only _propose_ changes: you review each proposal before it takes effect.

**Status:** early, local-first development. This README separates what exists today from what is only planned.

![Homora services page](docs/screenshots/services-dark.png)

## What works today

- A dashboard of service cards with groups, drag-and-drop ordering (Organize mode), a column count per group (1 to 6, kept in exports), search (`Ctrl K` or `/`), single-key shortcuts (`?` lists them; they can be turned off in Settings), an optional web search from the palette (off by default) and a status per service shown as Online, Offline or Waiting with its latency. Redirects and login prompts count as Online, and a failing card explains why (not found, server error, no response) and opens a Details panel with the recent checks.
- Card icons as an emoji, a built-in icon name (`lucide:server`), a bundled brand logo (`brand:plex`, 164 homelab and self-hosted apps, served locally with no external requests) or an image URL. The service form suggests the logo that matches the service name.
- English and Portuguese (Brazil) interface. The language follows your browser and can be switched with the language button.
- Export your groups and cards to YAML or JSON, and import from Homora, [Homepage](https://github.com/gethomepage/homepage) (`services.yaml`, `bookmarks.yaml`) or [Dashy](https://github.com/Lissy93/dashy) (`conf.yml`), always with a preview. See [Import and export](#import-and-export).
- A check method per service (HTTP request or ping) and a check interval per service (30 to 3600 seconds), also kept in exports.
- Optional Docker discovery: suggests cards from local or remote agent inventories using container labels (`homora.url`, or Homepage's `homepage.href`), with a review step. See [Docker discovery](#docker-discovery).
- Local administrator account, SQLite storage with migrations, backup and restore scripts.
- Widgets inside cards: attach a widget (Proxmox, Jellyfin, Home Assistant, Uptime Kuma, AdGuard Home, Speedtest Tracker, Portainer, NetBird, Tailscale, Cloudflare or Coolify data) to a card on the Integrations page. Each widget shows its own loading or error state, and a failing connection does not affect the other cards.
- An optional top bar (turn it on in Settings → Top bar and shortcuts) with the date, the time and CPU, memory and disk usage from a selected Proxmox connection. The clock can show seconds, use a 12 or 24 hour format and follow another time zone. Appearance and Home and pages hold the theme, language and home page layout; all of it is saved in the browser only.
- Experimental read-only integrations (Proxmox, Jellyfin, Home Assistant, Uptime Kuma, AdGuard Home, Speedtest Tracker, Portainer, NetBird, Tailscale, Cloudflare, Coolify) and an MCP server (local stdio or Streamable HTTP) where AI agents get scoped, revocable tokens and can propose card changes that you approve in the interface.

- Personalization: accent color, gradients, card translucency, an optional background image and custom CSS (Settings → Appearance), shared by every device. If custom CSS makes the interface unusable, open any page with `?safe=1` or run `pnpm css:reset` (with Compose: `docker compose exec backend node scripts/css-reset.mjs`) to turn it off without losing the text. The background image is processed on the server and is stored next to the database as `<database>.background`.
- Pages: group your cards into tabs on the Home (Settings → Home and pages); keys `1` to `9` switch pages.

Not available yet: OIDC or multi-user access, and a validated setup for exposing Homora beyond your own machine. The plan lives in [docs/estrategia.md](docs/estrategia.md) and [docs/evolucao.md](docs/evolucao.md).

## Install with Docker

Requirements: Docker with Compose.

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Open <http://localhost:8080> and create the administrator account: a name, an email and a password of at least 8 characters. The email is only your sign-in name; Homora never sends email. The port is bound to `127.0.0.1` and your data lives in the `homora-data` volume.

The bind address comes from `HOMORA_BIND_IP` (default `127.0.0.1`). Override it, for example `HOMORA_BIND_IP=0.0.0.0`, only when a reverse proxy on the same private network terminates HTTPS — see the note below.

Once release images are published, you can skip the build:

```bash
HOMORA_VERSION=<version> docker compose -f compose.release.yml up -d
```

Images are built for `linux/amd64` and `linux/arm64` from base images pinned by digest.

> **Do not expose Homora to a network you do not control.** It is designed for local use. Until the first administrator account exists, anyone who can reach the port can create it, so do the first setup from the machine itself, before exposing anything. Compose provides no HTTPS by itself. See [Deployment scenarios](#deployment-scenarios) for what was tested; it does not make public exposure safe by itself.

## Deployment scenarios

| Scenario                                        | How                                                                                                                                    | Status                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| This machine only                               | `docker compose up -d --build`; the port stays on `127.0.0.1`.                                                                         | Default and best tested.                                               |
| Private network, plain HTTP                     | Not supported by design: only `localhost` may use HTTP, so changes made from other machines over HTTP are refused by the origin check. | Use the HTTPS proxy below.                                             |
| HTTPS reverse proxy on the same private network | See below.                                                                                                                             | Validated once with a local nginx proxy and a self-signed certificate. |
| Public internet                                 | Not supported.                                                                                                                         | Do not do this.                                                        |

With a reverse proxy that terminates HTTPS in front of Homora:

1. Keep the Homora port on a private network and publish only the proxy. Do not publish the backend (port 3000); in Compose it is not published.
2. Set `HOMORA_ALLOWED_ORIGINS` to the public origin, for example `https://homora.example.home` (a comma-separated list; HTTPS only, plus `localhost`).
3. Make the proxy forward `Host` and send the real client address in `X-Forwarded-For` (for example `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in nginx).
4. Set `HOMORA_TRUSTED_PROXY` to the proxy's address or network, for example `172.18.0.0/16` for a proxy container on the Compose network. This lets the per-client login limit (10 sign-in attempts per client in 15 minutes) tell clients apart. Without it, every client behind your proxy shares one counter, so someone else's failed attempts can lock you out.
5. Do not disable origin validation. The session cookie is `HttpOnly`, `SameSite=Strict` and gets `Secure` when you sign in from an HTTPS origin.

`HOMORA_TRUST_PROXY=true` (already set in the Compose files) makes the backend read the client address from `X-Forwarded-For`; set it only if every request reaches the backend through a proxy that overwrites that header, as the bundled nginx does.

## Upgrade

1. Back up first (see [Backup and restore](#backup-and-restore)).
2. Update your checkout (`git pull`) or pick the new `HOMORA_VERSION`.
3. Run `docker compose up -d --build` (or `docker compose -f compose.release.yml pull && docker compose -f compose.release.yml up -d`).

The `homora-data` volume is preserved and database migrations run on startup inside a transaction. There is no automated downgrade: if a migration fails, keep the original volume and restore a backup into a working copy before resuming. Try the upgrade on a copy of your data if the installation holds anything important.

The upgrade that shortened the monitoring signature (migration `0019`) rewrites existing history rows but does not shrink the database file by itself; space is reused as the 30-day retention deletes old rows. To reclaim it immediately, stop Homora and run `VACUUM` on a copy or after a backup (`sqlite3 data/homora.sqlite 'VACUUM'`); it needs free disk space about equal to the database size. Homora never runs it automatically.

## Public status page (optional, read-only)

Homora can publish a minimal, read-only page at `/status` so others can see what is up without signing in. It is **closed by default**: nothing is public until an administrator enables it in **Settings** and marks each service with "Show on the public status page" in its form.

- The page calls only `GET /api/public/status`, the one anonymous API path (exact match, never a prefix). It is limited to 60 requests per minute per client address and is cached for 15 seconds.
- Anonymous visitors receive only: service name, group, online/offline/unknown state, last check time, 24 hourly bars and the 24-hour uptime percentage. Never URLs, descriptions, addresses, latency, HTTP codes, failure reasons or internal ids.
- With the page disabled or no public service, the endpoint answers `404 not-found`, the same as a route that does not exist.
- Settings shows the page address (with copy and open buttons), an optional short description under the title (up to 160 characters, visible to anyone with the link) and a preview of exactly what visitors will see. Enabling or disabling the page, changing its title or description and marking a service are recorded in the activity feed. Importing a configuration and agent proposals never make a service public; the MCP only reports `publicStatusEnabled`.
- The per-client limit needs the real client address: keep `HOMORA_TRUST_PROXY=true` behind a proxy that overwrites `X-Forwarded-For` (see above), or every visitor shares one limit.
- If Homora sits behind Cloudflare Access (or a similar gateway), `/status` and `/api/public/status` must use a separate hostname or a bypass policy, otherwise visitors are still asked to sign in. Exposing it to the internet is your decision: review what is marked public first.

## Import and export

Open **Settings**. Download your groups, cards and their order as YAML or JSON (`GET /api/config/export`). The file never contains passwords, tokens, connections or IDs, so it is safe to keep in version control.

To import, pick the file format (Homora, Homepage or Dashy) and a file. Homora shows a preview of what will be added, what already exists and what was ignored, and writes nothing until you confirm. Import only adds: nothing is overwritten or removed. Imported cards are not allowed to monitor your private network unless you tick that option for a Homora file you trust.

Icons from other dashboards are kept only when Homora has an equivalent (an image URL, an emoji, a brand logo or one of the built-in icons); the others are left empty with a warning. Widgets, monitoring settings and Docker links from Homepage and Dashy are not imported. The formats were checked against those projects' documentation; real files may vary.

## Backup and restore

Create a consistent copy of the database (existing files are never overwritten):

```bash
pnpm backup data/homora.sqlite backups/homora.sqlite
```

The database holds your cards, the administrator account (and its sessions) and encrypted connection credentials, so a database backup already includes the account. The encryption key lives in a `.key` file next to the database, and the original Proxmox integration also uses `.proxmox`. Copy those separately into a protected backup and restore them with the same derived names. Without the key you must configure credentials again. A `.auth` file left by earlier versions is no longer read and can be deleted. To restore, stop Homora, keep the current database and use the backup as the source of a new file, for example `pnpm backup backups/homora.sqlite data/restored.sqlite`. Point `HOMORA_DATABASE_PATH` at it and restart.

With Docker Compose, use a new protected directory on the host (the commands do not overwrite backups):

```bash
mkdir -p backups/backup-2026-11-10
docker compose exec backend node scripts/backup.mjs /app/data/homora.sqlite /app/data/backup.sqlite
docker compose cp backend:/app/data/backup.sqlite backups/backup-2026-11-10/homora.sqlite
docker compose cp backend:/app/data/homora.sqlite.key backups/backup-2026-11-10/homora.sqlite.key
docker compose cp backend:/app/data/homora.sqlite.session-secret backups/backup-2026-11-10/homora.sqlite.session-secret
docker compose cp backend:/app/data/homora.sqlite.proxmox backups/backup-2026-11-10/homora.sqlite.proxmox
```

`.session-secret` exists unless you set `HOMORA_SESSION_SECRET` (keep that value in your backup instead); it is required to restore two-step verification. `.proxmox` and `.background` (the background image) may not exist on every installation; skip the copy if a file is missing. `pnpm backup` already copies `.background` next to the database copy. With Compose, copy `homora.sqlite.background` the same way. Keep the key as protected as the database, and do a test restore before relying on a backup.

## Sessions, password reset and secret rotation

- **Sessions** are stored in the database and survive a backend restart. Normal sign-in lasts up to eight hours and uses a browser-session cookie. “Keep me signed in” uses a persistent cookie and lasts up to 30 days. Neither session renews automatically; sign in again after expiry. Browser session restoration may preserve session cookies after closing the browser. The cookie (`homora.session_token`) is `HttpOnly`, `SameSite=Strict` and, when you sign in from an HTTPS origin, `Secure`. It is signed with a secret kept in `<database>.session-secret` (created automatically, mode 0600) or taken from `HOMORA_SESSION_SECRET` (at least 32 characters). Changing or losing that secret signs everyone out and, if you turned on two-step verification, makes its stored secret and recovery codes unreadable (see below), so back it up with the database. State-changing requests are accepted only from an allowed origin. Ten sign-in attempts from one client address in 15 minutes block that address until the window ends (the counter is in memory and resets on restart).
- **Forgot the password:** run `pnpm auth:reset` to see the account, then `pnpm auth:reset --yes` to remove the account and every session (with Compose: `docker compose exec backend node scripts/auth-reset.mjs --yes`). Open Homora to create a new account; cards and encrypted connections are kept. Until the first account is created, anyone who can reach the interface from an allowed origin can claim it, so do this on a private network.
- **Two-step verification** is optional and off by default. In **Account**, turn it on with your password, scan the QR code (or type the key) in an authenticator app and confirm a code; you then get ten one-time recovery codes, shown once. Sign-in then asks for a code after the password; five wrong codes end the attempt and ten in a row block it for 15 minutes. Turning it on or off signs out your other devices, and turning it off or generating new recovery codes asks for the password again. Trusted devices, e-mail and SMS are not supported. The authenticator secret and recovery codes are encrypted with the session secret, so keep `<database>.session-secret` (or `HOMORA_SESSION_SECRET`) in the same backup set as the database: a restore without it cannot pass the second step. **Lost the app and the recovery codes, or the secret?** On the server run `pnpm auth:reset --two-factor-only` and then `--yes` (with Compose: `docker compose exec backend node scripts/auth-reset.mjs --two-factor-only --yes`): the account and password stay, the second step is removed and every session ends. There is no remote bypass. Details: [ADR 0016](docs/decisoes/0016-two-factor-authentication.md).
- **Rotating connection secrets:** rotating the encryption key itself is not supported, and removing `<database>.key` while encrypted connections exist makes them unreadable (Homora will not create a new key over them). To rotate what matters in practice, create a new token at the source (Proxmox, Home Assistant, and so on), enter it again on the connection in Integrations, then revoke the old token. Agent tokens can be replaced in the Agents page ("Generate new token") or revoked. Revoked agents remain available in a collapsed section for reference; the main list and count show active agents.
- Treat the database, `.key` and backups as one secret set: anyone holding the key and the database can read the stored credentials.

## Docker discovery

Off by default. It suggests cards from labels on running containers and adds nothing until you review and confirm on the **Settings** page.

```yaml
services:
  jellyfin:
    labels:
      homora.url: http://192.168.1.10:8096
      homora.name: Jellyfin # optional, defaults to the container name
      homora.group: Media # optional, defaults to "Docker"
      homora.description: Movies and shows # optional
      homora.icon: brand:jellyfin # optional
```

The Homepage labels `homepage.href`, `homepage.name`, `homepage.group`, `homepage.description` and `homepage.icon` also work, and `homora.*` wins when both are set. Labels never turn on monitoring of private addresses; you choose that for the cards you add.

### Remote Docker agents

Remote agents complement the existing local source; neither mode creates cards without review. In **Integrations → Docker discovery → Remote agents**, create a named source and copy its token immediately. It is shown only once; generate a replacement if lost. Homora stores a hash, and revocation permanently invalidates the source. To use that host again, remove the revoked source and create a new one. There is a maximum of ten remote sources, including revoked sources until removed. Rotating a token discards that source's last inventory. Removing a source deletes its inventory, not cards already imported.

On each trusted Docker host, build the agent from this checkout:

```bash
docker build --target discovery-agent -t homora-discovery-agent:local .
```

Place the token in a protected file on that host. Run the agent as an account that can read that file and the Docker socket; for example, on Linux, substitute your own paths and the HTTPS origin of Homora:

```bash
docker run -d --name homora-discovery-agent --restart unless-stopped \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  -e HOMORA_AGENT_ORIGIN=https://homora.example.home \
  -e HOMORA_AGENT_TOKEN_FILE=/run/secrets/homora-token \
  -v /path/to/protected-token:/run/secrets/homora-token:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  homora-discovery-agent:local
```

Keep the token file private and readable by the selected user. For a private CA, mount its public certificate and set `HOMORA_AGENT_CA_FILE` to its path in the container. HTTPS certificate and hostname validation remain enabled. Configure a private HTTPS reverse proxy as described in [Deployment scenarios](#deployment-scenarios); this does not make public exposure supported. The agent sends to `/docker-push/inventory`, so the proxy must forward this path. The bundled nginx forwards it. `HOMORA_AGENT_INTERVAL` is 30–240 seconds (default 60), leaving a nominal one-minute margin before the five-minute freshness deadline (network delays reduce it); `HOMORA_AGENT_DOCKER_SOCKET` optionally changes the in-container Unix socket path.

**Socket access is privileged:** a read-only mount does not make Docker's API read-only. The agent only calls `GET /containers/json`, but a compromised agent with socket access could control the daemon. Run only trusted images on trusted hosts. Do not publish the Docker socket or proxy port. The agent sends only container IDs, first name and supported discovery labels; labels can contain sensitive information, so do not put secrets in them. It sends at most 1,000 containers, reads at most 4 MiB from Docker and publishes at most 1 MiB. Oversized or invalid inventories fail as a whole and retain the previous one.

Settings shows the last receipt time. An inventory older than five minutes cannot be reviewed or imported. Preview selects one source at a time; if its data, authorization, or the dashboard configuration changes before confirmation, review again. A card remains after the source is revoked. Monitoring private destinations still requires your explicit choice. For MCP, `list_docker_push_sources` and `list_docker_push_suggestions` require `discovery:read`; `propose_docker_push_card` also requires `proposals:create` and still creates a human-reviewable proposal. Both MCP transports read the same stored inventories. A proposal already created by MCP is independent of the source: revoking the source does not cancel it, and a human can still review and approve the exact saved proposal.

### Enable discovery

The Docker socket grants privileged access to the daemon; even a read-only socket mount does not make the Docker API read-only. Use these options only on a trusted host. Keep the proxy on a trusted private network, with no published port: anyone who can reach it can read container metadata and labels and export container filesystems (`GET /containers/{id}/export`), potentially exposing application data. Treat access to it as privileged.

**Docker Compose:** start the restricted proxy with the override:

```bash
docker compose -f compose.yml -f compose.docker-discovery.yml up -d --build
```

This starts `tecnativa/docker-socket-proxy` and sets `HOMORA_DOCKER_HOST=http://docker-proxy:2375` on the backend. The proxy permits container GET endpoints, blocks writes and does not publish a port.

**Coolify or another single-Compose PaaS:** the override above cannot be combined by a platform that reads only one Compose file. On the Docker host running the Homora backend:

1. Find the actual Docker network attached to the backend, for example with `docker network ls` and `docker inspect <backend-container>`. Replace `<project-network>` below with that network name (often the app UUID); do not assume the UUID is always the network name.
2. Start the proxy on that network, using the same pinned image as the override:

   ```bash
   docker run -d --name homora-docker-proxy --restart unless-stopped \
     --network <project-network> --network-alias docker-proxy \
     -e CONTAINERS=1 -e POST=0 \
     -v /var/run/docker.sock:/var/run/docker.sock:ro \
     tecnativa/docker-socket-proxy:0.3.0@sha256:9e4b9e7517a6b660f2cc903a19b257b1852d5b3344794e3ea334ff00ae677ac2
   ```

3. Set `HOMORA_DOCKER_HOST=http://docker-proxy:2375` as a runtime environment variable on the **backend** service in the platform, then redeploy the application. If the platform only supplies Compose interpolation variables, add `HOMORA_DOCKER_HOST: ${HOMORA_DOCKER_HOST}` to the backend service’s `environment` in its single Compose definition. Check the network attachment and alias again if redeployment recreates the network.
4. Verify as described below. The proxy is managed separately from the app stack: maintain and update it yourself, and reconnect it if the platform replaces the network.

**Direct Unix socket:** outside the supplied Compose setup, the backend can use `HOMORA_DOCKER_HOST=unix:///var/run/docker.sock` if that socket is accessible to its process. This gives the backend direct privileged daemon access; prefer the restricted proxy. The bundled Compose files do not mount the socket into the backend.

A custom proxy must allow `GET /containers/json` and return a JSON array with HTTP 200. Homora uses a 5-second timeout, accepts at most 4 MiB per response and processes only the first 1,000 containers. HTTP proxy connections are unencrypted; keep them on a trusted private network. The proxy's container GET ACL is broader than this one endpoint.

### Verify and troubleshoot

In **Integrations**, the Docker discovery section reports the number of running containers read after a successful scan, even when there are no suggestions. In MCP, `get_homora_capabilities` reports `discoveryEnabled: true` when configured; `list_discovery_suggestions` (requires `discovery:read`) actually scans and returns `enabled` and `scanned`. For stdio, configure `HOMORA_DOCKER_HOST` in the MCP process itself; HTTP uses the backend setting. Configuration alone does not prove the proxy is reachable.

Discovery reads only running containers from one configured Docker daemon. It scans on demand, does not periodically scan or automatically update cards, and requires review and confirmation before adding them. Container labels and names are untrusted data; labels alone never authorize monitoring private addresses.

| Symptom                   | Check and remedy                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No suggestions            | Ensure a running container on that daemon has a valid `homora.url` or `homepage.href` label; review any validation warnings.                                                                  |
| `discovery-disabled`      | Set `HOMORA_DOCKER_HOST` in the backend runtime environment (or the stdio MCP process) and restart it.                                                                                        |
| `docker-unavailable`      | Check the proxy is running, reachable on the backend network and permits `GET /containers/json`; check socket access and daemon health. Non-200 responses and timeouts also cause this error. |
| `docker-invalid-response` | Ensure the proxy returns a JSON array and the response is no larger than 4 MiB; reduce container metadata or labels if needed.                                                                |

The UI shows friendly messages for these errors; MCP may return a generic failure for a failed scan.

## Proxmox and other integrations

Set up Proxmox on the Integrations page with an account and token that have read-only access. Credentials are encrypted at rest with a key stored separately in the same directory; this does not protect against someone who can read both files. Add separate named connections for independent clusters or servers. For a private CA, import the CA's public certificate (PEM); save the connection and choose **Test connection** in the row's **⋯** menu. TLS validation stays on. The top bar source can be selected in Settings. Service limits and requirements are in [docs/integracoes.md](docs/integracoes.md). A Proxmox connection can optionally show only one node. A Coolify connection (read-only token) can also list applications and services, link them to cards and propose cards for you to review; see [Coolify](docs/integracoes.md#coolify). The adapters were validated with mocks and documented sample responses, not against real instances; see the [integration status table](docs/integracoes.md#integration-status) and [how to add one](docs/adapters.md).

## MCP and AI agents

New to this? [A ten-minute walkthrough](docs/agent-demo.md) shows scopes, proposals, review, audit, revocation and a denied action with synthetic data, and says which parts are mocked. What each tool does is in the [capability inventory](docs/agent-capabilities.md). In short: agents read what their scopes allow and propose changes; you approve each one; they never receive credentials and cannot write to external infrastructure.

The Agents page shows how long each proposal has left. The review period defaults to 15 minutes and can be changed there to 1–120 minutes for new proposals; existing deadlines do not change. Expired proposals remain visible and an administrator can recreate them for another review. Expired batches are recreated together. Re-creation validates the original diff against the current configuration and may fail when it no longer matches; it never applies a change.

Homora supports local stdio and stateless Streamable HTTP. Both use the same agent tokens, scopes and human approval rules. Create an agent on **Agents**, then choose the connection method under **Connect**.

For HTTP, point a compatible client at `http://localhost:8080/mcp` with `Authorization: Bearer <agent-token>` (development: `http://localhost:5173/mcp`). The backend authenticates every request; revocation and rotation take effect immediately. The endpoint accepts the configured web hosts and origins from `HOMORA_ALLOWED_ORIGINS` and limits requests per client. For another machine, use the documented private-network HTTPS reverse proxy and its allowed HTTPS origin. Do not expose Homora publicly. Client configuration formats differ; the interface provides the URL and header. Protect the token as a password.

For stdio, after `pnpm build`, configure a trusted MCP client to run `node /absolute/path/to/homora/apps/backend/dist/mcp-server.js` over stdio. Create an agent on the **Agents** page and pass its one-time token as `HOMORA_AGENT_TOKEN`; the **Connect** button there shows ready-to-copy setup for Claude Code, Codex, Claude Desktop, Cursor, VS Code, and generic JSON. Set `HOMORA_DATABASE_PATH` to the **same absolute database path** used by Homora; `pnpm dev` uses `data/homora-dev.sqlite`, whereas the normal default is `data/homora.sqlite`. The MCP process needs the matching `.key` file. A legacy Proxmox configuration is migrated when the backend starts, so start the backend at least once before relying on the stdio MCP for Proxmox data; the MCP never reads `.proxmox` directly. With Docker, it needs access to the same volume; a host-side process with a different database is a different instance.

| Scope                                      | Tools                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services:read`                            | Services, groups, current status, `list_status_history`, `list_service_dependencies`                                                                                               |
| `agents:read`, `audit:read`                | Agent identities and paginated audit events, respectively                                                                                                                          |
| `agents:propose`                           | Propose agent creation, scope changes, revocation or token rotation                                                                                                                |
| `proxmox:read`                             | `list_proxmox_resources`                                                                                                                                                           |
| `proposals:create`                         | `propose_service_card`, `propose_card_order`                                                                                                                                       |
| `groups:propose`                           | `propose_group_change`                                                                                                                                                             |
| `widgets:read`, `widgets:propose`          | `list_widgets`, `propose_widget_change` respectively                                                                                                                               |
| `integrations:read`, `connections:propose` | `list_integrations`, `get_integration_status`; `propose_connection_setup` respectively                                                                                             |
| `discovery:read`                           | `list_discovery_suggestions`, `list_docker_push_sources`, `list_docker_push_suggestions`; `propose_discovered_card` and `propose_docker_push_card` also require `proposals:create` |
| `hosts:read`, `hosts:propose`              | `list_host_suggestions`, `propose_host_link` respectively (guest names are sensitive)                                                                                              |

`list_proxmox_resources` returns aggregate data when exactly one Proxmox connection exists. With multiple connections, use `list_integrations` and `get_integration_status` with `integrations:read` to select one. `get_homora_capabilities` reports the token's scopes and available tools. Any proposal scope permits `list_proposals` and `get_proposal` for that identity's own proposals. Every proposal (cards, groups, order, widgets, host links, connection setup suggestions and agent identity changes) needs authenticated human approval and expires after the review period (15 minutes by default, see above); it is rejected if the relevant configuration has changed. Approving a connection setup suggestion **does not create a connection**: open its form from the approved proposal and enter credentials, private-network permission and any CA yourself. The agent never supplies credentials. Integration status queries perform read-only network requests using the configured destination policy. For Docker discovery, set `HOMORA_DOCKER_HOST` on the backend for HTTP and on the MCP process for stdio, preferably to the same restricted read-only proxy; it is disabled by default.

The web monitor shares its last observations with MCP through SQLite. Changed service settings invalidate old results, and old observations are reported as unknown with `stale: true`. Starting the backend clears old observations. URL queries and fragments are omitted from service, integration and discovery results and from discovered card suggestions. Returned names, labels and external data are untrusted, not instructions.

`get_group`, `list_group_services` and `get_service_status` require `services:read`. The separately granted `agents:read` scope allows listing agent identities without tokens or hashes; `audit:read` allows paginated audit history filtered by time or proposal, without IP addresses or event details. Existing tokens do not gain these scopes automatically. An agent with a proposal scope may withdraw its own unexpired pending proposals with `withdraw_proposal`; withdrawal is recorded in the audit log.

`list_status_history` queries persisted observations for a service within a requested Unix-millisecond window; records are retained for 30 days, deduplicated by service, settings and observation time, and cleaned during monitor publication. Deleting a service removes its history. `propose_batch` creates 1–20 proposals atomically, with a shared batch ID; each still needs individual review. Approval can make other proposals stale, requiring a new proposal. Each identity is limited to 100 unexpired pending proposals.

With `agents:propose`, an agent may suggest creating an identity or changing another agent's scopes, revocation or rotation. Proposed scopes must be a subset of the proposer's scopes. A human reviews each change; a new or rotated token is returned only in the authenticated approval response and shown once. If lost, use **Generate new token** on the Agents page. Revocation and rotation do not cancel other agents' pending proposals, which expire normally.

The stdio MCP process reads the local database and vault directly. Neither transport is protected by the web session; run it only with a trusted client and system user, protect the token, and grant minimum scopes. It does not offer infrastructure actions or integration writes.

## Development

Requirements: Node.js 24 (see `.nvmrc`) and pnpm 12.4.2.

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Sign-in uses `/login` and returns to the requested local route after authentication. The dashboard uses `/`; management sections use `/manage/services`, `/manage/integrations`, `/manage/agents`, and `/manage/settings`, with browser history support. Service forms use `/manage/services/new` and `/manage/services/:id/edit`; unknown routes show a not-found page. When hosting the frontend separately, configure the server to return `index.html` for these routes.

Open <http://localhost:5173>. Vite forwards `/api` to the local Fastify backend on port 3000. `pnpm dev` uses the isolated `data/homora-dev.sqlite` database and seeds example services on first creation. Changes persist between runs; deleted examples are not recreated. Example addresses are illustrative and private-network monitoring is not enabled. The first run still requires creating an administrator account. Outside development, the default database is `data/homora.sqlite` and can be configured with `HOMORA_DATABASE_PATH`; `pnpm dev` always uses its isolated database.

The monorepo uses pnpm and Turborepo: React, Vite, Tailwind CSS and shadcn/ui on the frontend; Node.js, TypeScript and Fastify on the backend; shared contracts; Drizzle ORM with SQLite. Run `pnpm check` (lint, format, types and tests) and `pnpm build` before sending changes. Commits follow Conventional Commits (`feat: ...`), enforced by Husky and Commitlint. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/padroes.md](docs/padroes.md).

## Documentation

- [Glossary](GLOSSARY.md) · [Product](docs/produto.md) · [Architecture and security](docs/arquitetura.md) · [Engineering standards](docs/padroes.md)
- [Integrations](docs/integracoes.md) · [Strategy versus Homepage and Dashy](docs/estrategia.md) · [Writing an integration adapter](docs/adapters.md)
- [Delivery plan](docs/plano.md) · [Evolution plan and progress](docs/evolucao.md)
- [Guidance for AI agents](AGENTS.md) · [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## License

[MIT](LICENSE). Third-party licenses are summarized in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### HTTP monitoring options

By default, monitoring does not probe private network addresses (such as `192.168.x.x`) until each service allows it. To save that step for services you add yourself, turn on **Settings → Alerts → New services allow private network**: it only sets the starting value of the checkbox in the new-service form. Existing services, imports, Docker discovery and agent proposals are unaffected, and loopback, link-local and other special ranges stay blocked.

In a service's advanced settings, **Check path** optionally replaces the path and query of the card URL for the HTTP probe, while keeping its origin. For example, use `/health` to check an endpoint while the card opens `/dashboard`. Leave it empty to check the full card URL. The path must start with a single `/`; a query string is allowed. The destination policy and the service's private-network permission still apply.

**Expected HTTP status** accepts an exact code such as `200` or `302`, or `2xx` / `3xx`. A different response is reported as unavailable with the received and expected codes. Leave it empty to keep the default classification. Both settings are retained when using ping but only apply to HTTP checks, and are included in Homora exports. Checks are anonymous and do not follow redirects: a login page or an access proxy can respond successfully even when the underlying service is down. Use a suitable anonymous health endpoint if one is available.

## Notifications

Telegram, ntfy and Discord messages use the language selected for each channel. New channels initially use the interface language; existing channels retain English after upgrade. Webhook JSON fields and values are unchanged.

In **Settings → Alerts**, add an HTTPS webhook or a Telegram channel and use **Send test** to verify delivery. For Telegram, create a bot with BotFather, start a conversation with it (or add it to a group), obtain the bot token and numeric chat ID, then enter both in Homora. After sending the bot a message, call `https://api.telegram.org/bot<TOKEN>/getUpdates` and use the message’s `chat.id`; protect the token and avoid saving the URL in shell history or logs. The webhook URL, bot token and chat ID are encrypted with the integration vault key; saved values cannot be viewed again. Keep the database and its `.key` backup together. Webhook destinations on private networks require explicit opt-in; loopback, link-local and other forbidden ranges remain blocked. TLS certificates are validated and redirects are not followed.

A webhook receives a JSON POST with `event` (`down` or `up`), `service` (`id`, `name`, `category`), `status`, `reason`, `httpStatus`, `latencyMs` and `at`. The service URL is included only when explicitly enabled. An initial failed check emits `down`; an unknown result alone emits nothing and does not erase the last known state. Recovery after a notified outage emits `up`. Repeated outages within five minutes are suppressed, and their recoveries are also suppressed. Changing a service's monitoring configuration starts a new baseline. Transition state survives restarts, but the bounded in-memory delivery queue does not: queued messages may be lost during shutdown. Each delivery gets up to three attempts and a five-second timeout. Retries can result in duplicate messages when the destination receives a request but its response is lost. A test sends a real message; the channel displays its last successful send, last error and consecutive failed attempts.
