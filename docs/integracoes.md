# Integrations: Reference Projects and Direction for Homora

This analysis compares documentation and repositories from reference projects;
it is not a comprehensive code audit or a complete suite test against all software.
Capabilities may evolve between releases. The architectural design below is a proposal;
the code and test suite serve as the ground truth for what is currently implemented.

## Reference Projects

| Project                                                                                                                                                | Observed Approach                                                                                                                                                                                                                                | Key Takeaway                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [Homepage](https://gethomepage.dev/configs/services/)                                                                                                  | Services and widgets configured together; [Proxmox](https://github.com/gethomepage/homepage/blob/dev/docs/configs/proxmox.md) uses token connections and resource bindings; [Docker](https://gethomepage.dev/configs/docker/) enables discovery. | Separate connections, services, and display; document each integration thoroughly.        |
| [Homarr](https://github.com/homarr-labs/homarr)                                                                                                        | Visual configuration of apps and integrations; [certificate management](https://homarr.dev/docs/management/certificates/) allows custom CA imports.                                                                                              | Make configuration and TLS certificates accessible via UI.                                |
| [Dashy](https://dashy.to/docs/widgets/)                                                                                                                | Configurable widgets with proxying; allows explicit per-widget opt-in to ignore TLS validation.                                                                                                                                                  | Isolate options and failures per widget; keep strict TLS validation active in Homora.     |
| [Glance](https://github.com/glanceapp/glance)                                                                                                          | YAML-driven widgets and feeds with caching; provides [custom API](https://github.com/glanceapp/glance/blob/main/docs/custom-api.md) and [extensions](https://github.com/glanceapp/glance/blob/main/docs/extensions.md).                          | Tightly control caching and evaluate plugin extensions only after core adapters mature.   |
| [Heimdall](https://github.com/linuxserver/Heimdall)                                                                                                    | Simple links and enhanced application tiles pulling API data.                                                                                                                                                                                    | Shortcuts remain fully functional and clickable without a working API connection.         |
| [Flame](https://github.com/pawelmalak/flame)                                                                                                           | Visual link editor and optional Docker label discovery.                                                                                                                                                                                          | Streamline onboarding and ensure discovery outputs are human-reviewable.                  |
| [Homer](https://github.com/bastienwirtz/homer), [Mafl](https://github.com/hywax/mafl)                                                                  | Minimalist, link-oriented homepages.                                                                                                                                                                                                             | Maintain a lightweight, fast, and functional page even without widgets enabled.           |
| [Dynacat](https://github.com/Panonim/dynacat)                                                                                                          | Emphasizes dynamic hot-reloading and external integrations.                                                                                                                                                                                      | Consider seamless config reloads; implementation internals unverified in this study.      |
| [LinkStack](https://github.com/LinkStackOrg/LinkStack), [NodeBB](https://github.com/NodeBB/NodeBB), [Rackula](https://github.com/RackulaLives/Rackula) | Link directory, community forum, and rack visualization projects respectively.                                                                                                                                                                   | Indirect design references for layout, community ergonomics, and physical layout visuals. |

## Proposed Domain Model

- **Application / Service:** a shortcut with name, URL, and display options; operates
  independently of integrations, even when the target service or its API is offline.
- **Integration / Connection:** connection configuration to an external system, adapter kind,
  options, secret reference, and certificate policy. A single connection can power multiple widgets.
- **Widget:** a visual element on the dashboard referencing an integration connection and its capabilities.
- **Trusted Certificate:** a public PEM CA certificate obtained from a trusted channel with an
  explicit scope. A custom CA does not bypass hostname validation mismatches.
- **Observation:** query result, timestamp, error or staleness state, and cache TTL.

Adapters describe configuration schemas, capabilities, health check tests, and data fetching;
they encapsulate authentication and response parsing for each API. A shared network client
enforces limits and validates destinations. Authenticated requests execute solely on the backend;
secrets are never exposed to the frontend, MCP tools, or application logs. External data is untrusted.

## Evolution Sequence and Criteria

1. Extract Proxmox adapter while maintaining backwards compatibility; test migrations
   and preservation of existing tokens and CA certs.
2. Separate integration connections from widgets, allowing connection reuse while keeping
   shortcuts independent. Test creation, editing, deletion, and restart survival.
3. Implement shared network transport policy: authorized destinations, DNS and redirect
   validation, TLS, timeouts, payload limits, and cache with timestamp indicators; test
   isolated widget failures.
4. Generalize certificates and secrets with clear scopes; test backup, restore, rotation,
   and removal without credential leaks.
5. Add a second integration and validate shared contracts against real-world workflows.
   A basic HTTP health check validates simple transport and rendering, but does not replace
   verifying a second authenticated API.
6. Create an integrations catalog and configuration forms with field descriptions, permission
   requirements, and clear error diagnostics.
7. Evaluate Docker discovery, producing human-reviewable proposals under strict socket access.
   Third-party plugins and generic APIs remain deferred until trust and maintenance boundaries are proven.

### Status of Current Implementation

- Authenticated connections and widgets use separate database tables. The UI supports
  creating, querying, and removing multiple named widgets per connection, and linking each
  widget to a service card (`service_id`, null when only displayed on the Connections page;
  deleting a card unlinks the widget without destroying it). Data renders inside cards with
  loading, error, and invalid data indicators per widget. Per-widget custom config parameters
  do not exist yet. Queries utilize connection-level caching without dedicated per-widget caches;
  cards query each connection once per minute, even when multiple widgets share it.
- Proxmox is a regular named connection: several independent clusters or servers may be
  configured. A connection addresses one Proxmox API endpoint; its cluster inventory can
  include multiple nodes. Widgets report aggregate counts and resource usage, not individual
  node selection. The top bar can select a connection in Settings, independently of widgets.
- At backend startup, a legacy Proxmox configuration is copied into the encrypted
  connection store. An existing bridge row keeps its ID and widget references. This migration
  is automatic, transactional and recorded once, including when the connection is later deleted.
  A missing key or unreadable file does not stop startup; it is logged without secrets and
  retried on the next start. The old `.proxmox` file remains as a sensitive backup and the
  legacy HTTP routes no longer exist. Existing legacy connections retain private-network access, while
  new connections require explicit opt-in. The shared destination policy can reject destinations
  previously allowed by the legacy transport. Jellyfin, Home Assistant, Uptime Kuma, and
  AdGuard Home also have read-only adapters; real-world validation remains incomplete.
- Authenticated integrations enforce shared network policy and explicit private network
  authorization per connection. Shortcut monitoring shares the same destination policy;
  private network monitoring requires explicit per-service opt-in (disabled by default).
  This setup has been verified with integration test mocks and awaits real-world LAN testing.

Consult the [evolution plan](evolucao.md)
and codebase for live status. Private network access is essential for homelabs and must
be explicitly authorized; discovery never grants permission to execute arbitrary commands,
probe arbitrary network addresses, or mutate infrastructure.

## Limitations and Risks

- Web session cookies do not protect the local stdio MCP server. Agent identity and permission boundaries remain active priorities.
- Connection secrets are encrypted in the database using a separate key file; a legacy `.proxmox` file may also contain old credentials. Protect the database, key and legacy file together.
- Caching does not prove real-time availability: UI must distinguish between last successful
  fetch, latest error, and stale data.
- Redirects, DNS rebinding, private ranges, and sensitive ports require SSRF policy enforced
  at connection time. Never grant unrestricted network access based on user- or agent-supplied URLs.
- APIs evolve: validate API versions, auth mechanisms, and response shapes before declaring
  production support. Mocked tests do not replace live validation against production servers.
- The Docker socket grants root-equivalent daemon control. Discovery is optional
  (`HOMORA_DOCKER_HOST`), restricted to container listing, and architected for a
  read-only unprivileged proxy (`compose.docker-discovery.yml`); Homora never mounts
  the raw socket directly. See log in [evolucao.md](evolucao.md).

## Experimental Connections Guide

These connections perform read-only queries from the backend server. They have not been
verified against all server versions; verify successful setup and permissions in your own
environment. External data returned is untrusted input, not instructions for AI agents.

Query results are cached in memory for 30 seconds per connection. Manual refresh in the UI
forces an immediate update; the API also accepts `GET /api/connections/:id/data?refresh=true`.
The connection test button queries the external service directly and bypasses cache. Failures
are never cached as successful states.

Configure a name and URL for each connection, complete specific fields below, test the
connection, and save. Explicitly enable private network access if the destination resides
on an internal LAN address. The destination must be reachable from the backend process:
`localhost` inside a container resolves to that container itself. Special IP ranges are
blocked by network policy. Redirects are not followed.

For private CAs, paste the public PEM CA certificate obtained from a trusted source.
Never supply private keys. TLS validation remains strictly active and the URL hostname
or IP must be covered by the certificate Subject Alternative Name (SAN). Authenticated
connections require HTTPS. The CA certificate is pinned to the connection and does not
grant trust to other endpoints.

### Proxmox VE

- Create a named connection with an HTTPS origin, API token ID and token secret. Enable
  private network access when needed and provide the public CA certificate when applicable.
- Save, then use **Test** on the connection. A single endpoint may return inventory across
  its cluster, subject to token permissions. Separate clusters require separate connections.
- Besides the aggregates, the same read of `/api2/json/cluster/resources` feeds the guest picker
  and the Host view (node and guest names, ids, state); no other endpoint is called.
  The UI does not yet filter individual nodes in the widget. Suggested hosts also read, with GET
  only, `/nodes/{node}/{lxc|qemu}/{vmid}/config` and, for running VMs,
  `/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces`; the latter may be refused by a
  read-only token, which only removes that signal. Connections
  are read-only. Use least-privilege tokens and verify behavior against your own environment.

### Jellyfin

- Provide the HTTP or HTTPS base URL of the Jellyfin server (e.g. `https://jellyfin.example/jellyfin`).
- The adapter calls `GET /System/Info/Public` and returns server name and version. Does not
  require an API key; does not read library contents, user sessions, or playback metrics.
- Endpoint based on the [Jellyfin TypeScript SDK](https://typescript-sdk.jellyfin.org/);
  compatible versions pending verification on live servers.

### Home Assistant

- Provide an HTTPS origin, a Long-Lived Access Token, and a target entity ID (e.g. `sensor.temperature`).
  The query returns the state and last updated timestamp for that entity without modifying state.
- The entity must exist and the token should belong to a dedicated service account with minimal
  permissions. Do not share the token or use real secrets in documentation examples.
- Uses `GET /api/states/<entity_id>` per the [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/).
  Version compatibility must be confirmed on real instances.

### Uptime Kuma

- Provide an HTTP or HTTPS origin and the slug of a **published** status page (e.g. `homelab`).
  Only monitors included on this public status page are read; private monitors are not exposed.
- Reads `GET /api/status-page/heartbeat/<slug>` without requiring an API key. Summarizes
  the latest heartbeat for each monitor; does not replace authenticated inventory or Prometheus metrics.
  Uptime Kuma caches status pages internally; empty results do not imply all systems are operational.
- Leverages the [documented internal API](https://github.com/louislam/uptime-kuma/wiki/Internal-API/6f150dae98532c8b4e2228990505e45cbd5d34e8),
  which is subject to upstream breaking changes; real-world behavior pending validation.

### AdGuard Home

- Provide an HTTPS origin, username, and password for the administrative dashboard.
  The adapter calls `GET /control/status` to read execution status, protection status, and version;
  it does not modify settings or query DNS statistics.
- Uses HTTP Basic Authentication. The account may have full administrative access: protect the
  password and use the most restricted user account your version supports. No dedicated read-only
  role or API key is currently assumed.
- Implemented against the [official OpenAPI specification](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/openapi.yaml)
  tagging API version `0.107`. Does not guarantee compatibility with all product releases;
  validation on live instances is required.

## Additional API Research Notes

The sections below document upstream compatibility findings. Not all researched endpoints
are currently used by Homora; consult the guide above for active functionality.

### Uptime Kuma

- The [internal API wiki](https://github.com/louislam/uptime-kuma/wiki/Internal-API/6f150dae98532c8b4e2228990505e45cbd5d34e8)
  explicitly notes it is unsupported for external integrations and may introduce breaking
  changes. The web UI relies on Socket.IO; documentation also covers HTTP metric and status page endpoints.
- `GET /metrics` exports Prometheus metrics, including monitor status and ping response times.
  The [API Keys documentation](https://github.com/louislam/uptime-kuma/wiki/API-Keys/705b78e014714ef7fe108e90b80db51beac05db5)
  notes API key support starting in version 1.21.0, using Basic Auth with the key as password
  and an empty username. Creating an API key permanently modifies username/password fallback behavior.
  Keys can expire or be disabled.
- `GET /api/status-page/<slug>` provides data for published status pages, limited to that page's
  scope. The [status page wiki](https://github.com/louislam/uptime-kuma/wiki/Status-Page) indicates
  a default 5-minute cache.
- The internal API and API keys wikis describe password fallback behavior differently under
  certain edge cases. Confirm exact target version behavior before coding; do not assume
  a read-only API key exists. Also check if metrics are enabled, label formats, version support,
  payload limits, and what data subset should be exposed.

### AdGuard Home

- The [official OpenAPI specification](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/openapi.yaml)
  identifies the API as `0.107`, base `/control`, with global Basic Auth. This defines the
  spec version, not universal compatibility across all releases. The API powers the admin UI.
- `GET /control/status` returns operational state and general settings; `GET /control/stats`
  returns query statistics. The [API changelog](https://github.com/AdguardTeam/AdGuardHome/blob/master/openapi/CHANGELOG.md)
  describes Basic Auth for protected web users and lists metrics like DNS queries and blocked domains.
  Statistics may be disabled on the server and must not be assumed to be zero without inspection.
- Basic Auth credentials must remain securely in the backend, protected in transit and at rest;
  they may carry full administrative privileges. Do not assume token-based or read-only account
  support without version-specific confirmation.
- The OpenAPI spec defines mutation operations; the initial adapter is strictly limited to approved
  read queries. Verify server versions, payload schemas, retention limits, rate limits, and
  behavior when statistics are disabled. Endpoints and fields must be verified in tests and
  against real installations before declaring compatibility.
