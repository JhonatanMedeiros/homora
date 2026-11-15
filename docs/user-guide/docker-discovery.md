# Docker discovery

Docker discovery suggests cards from running containers, so you do not have to type every service by hand. It is off by
default and adds nothing until you review and confirm on the **Integrations** page.

Discovery reads only running containers from one configured Docker daemon (or from remote agents). It scans on demand,
never periodically, and never updates existing cards.

## Label your containers

Add labels to the containers you want suggested:

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

The Homepage labels `homepage.href`, `homepage.name`, `homepage.group`, `homepage.description` and `homepage.icon`
also work, and `homora.*` wins when both are set. Labels never turn on monitoring of private addresses; you choose that
for the cards you add.

Running containers without a `homora.url` or `homepage.href` label are not suggested. A collapsed list under the
suggestions names them (up to 100) so you can see why. Homora does not guess addresses or ports: add the label or
create the card by hand.

## Enable discovery

::: warning The Docker socket is privileged
Even a read-only socket mount does not make the Docker API read-only. Use these options only on a trusted host. Keep
the proxy on a trusted private network with no published port: anyone who can reach it can read container metadata and
labels and export container filesystems (`GET /containers/{id}/export`), potentially exposing application data.
:::

### Docker Compose

Start the restricted proxy with the override:

```bash
docker compose -f compose.yml -f compose.docker-discovery.yml up -d --build
```

This starts `tecnativa/docker-socket-proxy` and sets `HOMORA_DOCKER_HOST=http://docker-proxy:2375` on the backend. The
proxy permits container GET endpoints, blocks writes and does not publish a port.

### Coolify or another single-Compose platform

A platform that reads only one Compose file cannot combine the override. On the Docker host running the Homora backend:

1. Find the Docker network attached to the backend, for example with `docker network ls` and
   `docker inspect <backend-container>`. Use that name for `<project-network>` below; it is often the app UUID, but do
   not assume so.
2. Start the proxy on that network, with the same pinned image as the override:

   ```bash
   docker run -d --name homora-docker-proxy --restart unless-stopped \
     --network <project-network> --network-alias docker-proxy \
     -e CONTAINERS=1 -e POST=0 \
     -v /var/run/docker.sock:/var/run/docker.sock:ro \
     tecnativa/docker-socket-proxy:0.3.0@sha256:9e4b9e7517a6b660f2cc903a19b257b1852d5b3344794e3ea334ff00ae677ac2
   ```

3. Set `HOMORA_DOCKER_HOST=http://docker-proxy:2375` as a runtime environment variable on the **backend** service and
   redeploy. If the platform only supplies Compose interpolation variables, add
   `HOMORA_DOCKER_HOST: ${HOMORA_DOCKER_HOST}` to the backend's `environment` in its Compose definition. If
   redeployment recreates the network, check the attachment and alias again.
4. [Verify](#verify-and-troubleshoot). The proxy lives outside the app stack: update it yourself and reconnect it if
   the platform replaces the network.

### Direct Unix socket

Outside the supplied Compose setup, the backend can use `HOMORA_DOCKER_HOST=unix:///var/run/docker.sock` if its process
can access the socket. This gives the backend direct privileged access to the daemon, so prefer the restricted proxy.
The bundled Compose files do not mount the socket into the backend.

### Custom proxies

A custom proxy must allow `GET /containers/json` and return a JSON array with HTTP 200. Homora uses a 5-second
timeout, accepts at most 4 MiB per response and processes only the first 1,000 containers. HTTP proxy connections are
unencrypted, so keep them on a trusted private network. The proxy's container GET rules are broader than this one
endpoint.

## Review before adding

Select the suggestions you want and choose **Review and add**. Nothing is created until you confirm in the dialog.

- Adjust the **name**, **group** or **address** of each card. The server checks your edits with the same rules as
  labels (name up to 80 characters, group up to 40, an `http` or `https` address without credentials). Each row shows
  whether it will be created, already exists, or is not valid and why.
- Rows that would duplicate an existing card show _already exists_ and are not created. If you edit an address to match
  another card, the row changes to _already exists_.
- The address is only a suggestion; Homora does not check that your browser can open it. `localhost`, `127.x` and names
  without a dot (such as `http://web:8080`, which often resolve only inside Docker) are flagged, not blocked.
- Allowing monitoring on a private network is a separate choice made in this dialog. Labels and edits never grant it.
- After you confirm, the dialog lists the result for every selected container: created, already exists, not valid or
  no longer found. Nothing is partially applied silently.

If the cards, the labels or the remote inventory change while you review (or the inventory becomes stale or its source
is revoked), the confirmation is rejected, nothing is created, and you review again. Edits only change the name, group
and address of the containers you selected; the browser never submits arbitrary card data.

## Remote Docker agents

Remote agents complement the local source, and neither creates cards without review.

### Create a source

In **Integrations → Docker discovery → Remote agents**, create a named source and copy its token immediately: it is
shown once, and you generate a replacement if you lose it. Homora stores only a hash.

- There is a maximum of ten sources, including revoked ones until removed.
- Revoking a source permanently invalidates it. To use that host again, remove the revoked source and create a new one.
- Rotating a token discards that source's last inventory. Removing a source deletes its inventory, not cards already
  imported.

### Run the agent

On each trusted Docker host, build the agent from this checkout:

```bash
docker build --target discovery-agent -t homora-discovery-agent:local .
```

Place the token in a protected file on that host, readable by the account that runs the agent. That account also needs
access to the Docker socket. For example, on Linux (substitute your own paths and Homora's HTTPS origin):

```bash
docker run -d --name homora-discovery-agent --restart unless-stopped \
  --user "$(id -u):$(id -g)" --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  -e HOMORA_AGENT_ORIGIN=https://homora.example.home \
  -e HOMORA_AGENT_TOKEN_FILE=/run/secrets/homora-token \
  -v /path/to/protected-token:/run/secrets/homora-token:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  homora-discovery-agent:local
```

| Variable                     | Purpose                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `HOMORA_AGENT_ORIGIN`        | The HTTPS origin of Homora.                                                                      |
| `HOMORA_AGENT_TOKEN_FILE`    | Path to the token file inside the container.                                                     |
| `HOMORA_AGENT_CA_FILE`       | For a private CA: path to its public certificate (mount it). Certificate validation stays on.    |
| `HOMORA_AGENT_INTERVAL`      | 30–240 seconds (default 60). This leaves a nominal one-minute margin before the freshness limit. |
| `HOMORA_AGENT_DOCKER_SOCKET` | Optional path of the Unix socket inside the container.                                           |

The agent posts to `/docker-push/inventory`, so a reverse proxy must forward that path (the bundled nginx does). Set up
a private HTTPS reverse proxy as described in [Deployment scenarios](deployment.md#deployment-scenarios); this does not
make public exposure supported.

::: warning Socket access is privileged
A read-only mount does not make Docker's API read-only. The agent only calls `GET /containers/json`, but a compromised
agent with socket access could control the daemon. Run only trusted images on trusted hosts, and never publish the
Docker socket or proxy port.
:::

What the agent sends:

- Only container IDs, the first name and the supported discovery labels. Labels can contain sensitive information, so
  keep secrets out of them.
- At most 1,000 containers. It reads at most 4 MiB from Docker and publishes at most 1 MiB. An oversized or invalid
  inventory fails as a whole and the previous one is kept.

### Review remote inventories

Settings shows the last receipt time. An inventory older than five minutes cannot be reviewed or imported. A preview
covers one source at a time; if its data, authorization or the dashboard configuration changes before you confirm,
review again. A card stays after its source is revoked, and monitoring private destinations still requires your
explicit choice.

### MCP

`list_docker_push_sources` and `list_docker_push_suggestions` require `discovery:read`. `propose_docker_push_card`
also requires `proposals:create` and still creates a proposal for human review. Both MCP transports read the same
stored inventories. Revoking a source does not cancel a proposal already created from it; a human can still review and
approve that exact proposal.

## Verify and troubleshoot

In **Integrations**, the Docker discovery section reports how many running containers a successful scan read, even when
there are no suggestions. Configuration alone does not prove the proxy is reachable.

In MCP, `get_homora_capabilities` reports `discoveryEnabled: true` when configured, and `list_discovery_suggestions`
(requires `discovery:read`) actually scans and returns `enabled` and `scanned`. For stdio, set `HOMORA_DOCKER_HOST` in
the MCP process itself; HTTP uses the backend setting.

Container labels and names are untrusted data, and labels alone never authorize monitoring private addresses.

| Symptom                   | Check and remedy                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No suggestions            | Ensure a running container on that daemon has a valid `homora.url` or `homepage.href` label; review any validation warnings.                                                                  |
| `discovery-disabled`      | Set `HOMORA_DOCKER_HOST` in the backend runtime environment (or the stdio MCP process) and restart it.                                                                                        |
| `docker-unavailable`      | Check the proxy is running, reachable on the backend network and permits `GET /containers/json`; check socket access and daemon health. Non-200 responses and timeouts also cause this error. |
| `docker-invalid-response` | Ensure the proxy returns a JSON array no larger than 4 MiB; reduce container metadata or labels if needed.                                                                                    |

The UI shows friendly messages for these errors; MCP may return a generic failure for a failed scan.
