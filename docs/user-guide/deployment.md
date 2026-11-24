---
description: 'Run Homora with Docker, put it behind an HTTPS reverse proxy and upgrade safely.'
---

# Deployment and upgrades

How to run Homora with Docker, which network setups were tested, and how to upgrade safely.

::: danger Do not expose Homora to a network you do not control
Homora is designed for local use. Until the first administrator account exists, anyone who can reach the port can
create it, so do the first setup from the machine itself, before exposing anything. Compose provides no HTTPS by
itself. [Deployment scenarios](#deployment-scenarios) lists what was tested; it does not make public exposure safe.
:::

## Install with Docker

Requirements: Docker with Compose.

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Open <http://localhost:8080> and create the administrator account: a name, an email and a password of at least 8
characters. The email is only your sign-in name; Homora never sends email. The port is bound to `127.0.0.1` and your
data lives in the `homora-data` volume.

The bind address comes from `HOMORA_BIND_IP` (default `127.0.0.1`). Override it, for example with
`HOMORA_BIND_IP=0.0.0.0`, only when a reverse proxy on the same private network terminates HTTPS.

### Map a LAN-only name

An appliance with a certificate name that only your LAN resolves (for example a TP-Link Omada Controller) may not
resolve from the backend container. Map it with the optional override, using a synthetic value like this one:

```bash
HOMORA_EXTRA_HOST=controller.example.lan:192.0.2.10 \
  docker compose -f compose.yml -f compose.extra-hosts.yml up -d --build
```

Certificate verification stays on: the name must appear in the certificate, and a private CA is attached to the
connection.

### Run the release image

Release images are published to GHCR for amd64 and arm64, so you can run Homora without cloning or building it:

```bash
docker run -d \
  --name homora \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v homora-data:/app/data \
  ghcr.io/jhonatanmedeiros/homora:latest
```

Or use Compose with the published image:

```bash
HOMORA_VERSION=<version> docker compose -f compose.release.yml up -d
```

- The image contains the web interface and backend, and keeps the API on container loopback.
- The named volume holds the database and its encryption and session keys. For a host directory, make it writable by
  the container's unprivileged user (UID 1000) and never public.
- Images are built for `linux/amd64` and `linux/arm64` from base images pinned by digest.
- The optional remote Docker discovery agent is a separate image.

## Deployment scenarios

| Scenario                                        | How                                                                                                                                    | Status                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| This machine only                               | `docker compose up -d --build`; the port stays on `127.0.0.1`.                                                                         | Default and best tested.                                               |
| Private network, plain HTTP                     | Not supported by design: only `localhost` may use HTTP, so changes made from other machines over HTTP are refused by the origin check. | Use the HTTPS proxy below.                                             |
| HTTPS reverse proxy on the same private network | See below.                                                                                                                             | Validated once with a local nginx proxy and a self-signed certificate. |
| Public internet                                 | Not supported.                                                                                                                         | Do not do this.                                                        |

### Behind an HTTPS reverse proxy

1. Keep the Homora port on a private network and publish only the proxy. The backend listens on container loopback
   (port 3000) and is not published.
2. Set `HOMORA_ALLOWED_ORIGINS` to the public origin, for example `https://homora.example.home`. It is a
   comma-separated list, HTTPS only, plus `localhost`.
3. Make the proxy forward `Host` and send the real client address in `X-Forwarded-For` (in nginx:
   `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
4. Set `HOMORA_TRUSTED_PROXY` to the proxy's address or network, for example `172.18.0.0/16` for a proxy container on
   the Compose network. This lets the per-client login limit (10 sign-in attempts per client in 15 minutes) tell
   clients apart. Without it, every client behind the proxy shares one counter, so someone else's failed attempts can
   lock you out.
5. Do not disable origin validation. The session cookie is `HttpOnly` and `SameSite=Strict`, and gets `Secure` when you
   sign in from an HTTPS origin.

The combined image runs the backend with `HOMORA_TRUST_PROXY=true` behind its bundled nginx, which overwrites
`X-Forwarded-For`. The backend is bound to container loopback so other containers cannot bypass that proxy.

Runtime logs are JSON lines on the container's output; `HOMORA_LOG_LEVEL` changes their detail. See
[Logs and health checks](logs.md), which also describes `/api/health`, used by the backend container's healthcheck.

## Upgrade

1. Back up first (see [Backup and restore](import-export-backup.md#backup-and-restore)).
2. Update your checkout (`git pull`) or choose the new `HOMORA_VERSION`.
3. Run `docker compose up -d --build`, or for the release image
   `docker compose -f compose.release.yml pull && docker compose -f compose.release.yml up -d`.

The `homora-data` volume is preserved and database migrations run on startup inside a transaction. There is no
automated downgrade: if a migration fails, keep the original volume and restore a backup into a working copy before
resuming. If the installation holds anything important, try the upgrade on a copy of your data first.

### From the two-container setup

The old `frontend` container can still occupy port 8080. After backing up, run
`docker compose up -d --build --remove-orphans` (or add `--remove-orphans` to the release Compose `up` command).
Include any overrides you still use, such as `compose.docker-discovery.yml`, so their services are not treated as
orphans. Keep the same Compose project name and volume, and do not remove the volume.

### Reclaiming database space

The upgrade that shortened the monitoring signature (migration `0019`) rewrites existing history rows but does not
shrink the database file; space is reused as the 30-day retention deletes old rows. To reclaim it immediately, stop
Homora and run `VACUUM` on a copy or after a backup (`sqlite3 data/homora.sqlite 'VACUUM'`). It needs free disk space
about equal to the database size. Homora never runs it automatically.
