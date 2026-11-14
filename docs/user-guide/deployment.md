# Deployment and upgrades

How to run Homora with Docker, which network setups were tested, and how to upgrade safely. Homora is
designed for use on a machine or network you control; read the warning below before exposing it.

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

> **Do not expose Homora to a network you do not control.** It is designed for local use. Until the first administrator account exists, anyone who can reach the port can create it, so do the first setup from the machine itself, before exposing anything. Compose provides no HTTPS by itself. See [Deployment scenarios](deployment.md#deployment-scenarios) for what was tested; it does not make public exposure safe by itself.

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

Runtime logs are JSON lines on the container's output; set `HOMORA_LOG_LEVEL` to change their detail. See [Logs and health checks](logs.md), which also describes `/api/health`, the endpoint the backend container's healthcheck uses.

`HOMORA_TRUST_PROXY=true` (already set in the Compose files) makes the backend read the client address from `X-Forwarded-For`; set it only if every request reaches the backend through a proxy that overwrites that header, as the bundled nginx does.

## Upgrade

1. Back up first (see [Backup and restore](import-export-backup.md#backup-and-restore)).
2. Update your checkout (`git pull`) or pick the new `HOMORA_VERSION`.
3. Run `docker compose up -d --build` (or `docker compose -f compose.release.yml pull && docker compose -f compose.release.yml up -d`).

The `homora-data` volume is preserved and database migrations run on startup inside a transaction. There is no automated downgrade: if a migration fails, keep the original volume and restore a backup into a working copy before resuming. Try the upgrade on a copy of your data if the installation holds anything important.

The upgrade that shortened the monitoring signature (migration `0019`) rewrites existing history rows but does not shrink the database file by itself; space is reused as the 30-day retention deletes old rows. To reclaim it immediately, stop Homora and run `VACUUM` on a copy or after a backup (`sqlite3 data/homora.sqlite 'VACUUM'`); it needs free disk space about equal to the database size. Homora never runs it automatically.
