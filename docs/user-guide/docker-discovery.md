# Docker discovery

Docker discovery suggests cards from running containers so you do not have to type every service by
hand. It is off by default and never adds anything without your review.

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

Keep the token file private and readable by the selected user. For a private CA, mount its public certificate and set `HOMORA_AGENT_CA_FILE` to its path in the container. HTTPS certificate and hostname validation remain enabled. Configure a private HTTPS reverse proxy as described in [Deployment scenarios](deployment.md#deployment-scenarios); this does not make public exposure supported. The agent sends to `/docker-push/inventory`, so the proxy must forward this path. The bundled nginx forwards it. `HOMORA_AGENT_INTERVAL` is 30–240 seconds (default 60), leaving a nominal one-minute margin before the five-minute freshness deadline (network delays reduce it); `HOMORA_AGENT_DOCKER_SOCKET` optionally changes the in-container Unix socket path.

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
