# Integrations: Direction for Homora

This document describes integration design, current capabilities and validation limits.
Proposed designs are identified as such; the implementation and tests are the ground truth.

## Built-in integration SDK coverage

The following existing integrations use the same static SDK catalog for definitions, forms and
widgets. Declarative integrations use the shared manifest interpreter; the two code adapters
provide registered backend and presentation factories. Each has a contract test with mocked
transport and sanitized fixtures. This describes the implementation, not live-service validation.

| Integration       | Adapter      |
| ----------------- | ------------ |
| Jellyfin          | Manifest     |
| Home Assistant    | Manifest     |
| Uptime Kuma       | Manifest     |
| AdGuard Home      | Manifest     |
| Speedtest Tracker | Manifest     |
| Portainer         | Manifest     |
| NetBird           | Manifest     |
| Tailscale         | Manifest     |
| Cloudflare        | Manifest     |
| Healthchecks      | Manifest     |
| Coolify           | Code adapter |
| Proxmox           | Code adapter |

Brand logos used by integrations and service cards live in `packages/icons`; they remain local
assets and keep their existing URLs. See [the adapter guide](adapters.md) for contribution steps
and the sections below for feature and live-validation limitations.

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

Consult the [evolution plan](evolution.md)
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
  the raw socket directly. See log in [evolution.md](evolution.md).

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
- Reads `GET /api/status-page/heartbeat/<slug>` and `GET /api/status-page/<slug>` without an API key. The existing aggregate counts the latest heartbeat per entry. The status data also includes up to 50 published monitors with id, untrusted name, group and latest state. Missing heartbeats are `unknown`; the public data does not establish whether a monitor is paused. Duplicates use the first group. The list and aggregate can differ because their source sets differ. More than 50 distinct monitors fails with `integration-rows-limit`; either request failing prevents the observation, including the widget summary. This does not replace authenticated inventory or Prometheus metrics.
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

## Reference integrations (issue #98)

Every integration below is **implemented, unvalidated**: it passes the adapter contract harness
(`packages/integrations/src/adapter-contract.test.ts`) against fixtures that follow the vendor's published API
documentation or source, and none has been tried against a live service. The fixtures say which. Fill
in the [live validation template](adapters.md#live-validation-template) before calling one validated.
All use the shared transport: GET only, destination policy, TLS validation, a 2 MB response cap, and
credentials sent only over HTTPS (a plain-HTTP address cannot be used with a token).

### Speedtest Tracker

- **Reads:** `GET /api/v1/results/latest` with `Authorization: Bearer <token>`; shows the last
  download, upload and ping. Source: [API docs](https://docs.speedtest-tracker.dev/api/responses/results),
  read 2026-11-12.
- **Least privilege:** create the token at `/admin/api-tokens` with only the **Read Results** ability
  (`results:read`).
- **Network:** your own instance; an HTTPS address is required. Use "allow private network" for a LAN
  address.
- **Live validation checklist:** the response is the Result object itself (not wrapped in `data`); a
  fresh install with no result yields the "no result yet" message; a token without the ability is
  refused with the generic access message.

### Portainer

- **Reads:** `GET /api/endpoints?excludeSnapshots=true` with the `X-API-Key` header; shows how many
  environments exist and how many are up (`Status` 1) or down (`Status` 2). Sources: [access tokens](https://docs.portainer.io/api/access)
  and the Portainer source annotations (`api/portainer.go`, `endpoint_list.go`), read 2026-11-12.
- **Least privilege:** the list is filtered by what the token's user may see. Create the token for a
  standard (non-administrator) user with access to only the environments to show.
- **Network:** your own instance; HTTPS is required for the token. The response is limited to 1 MB.
- **Live validation checklist:** the header name is accepted (`X-API-Key`); `Status` values on a stopped
  environment; behaviour with a very large number of environments (the count stops at 10,000 and is
  then reported as an invalid response).

### Healthchecks

- **Reads:** `GET /api/v3/checks/` with the `X-Api-Key` header; shows how many checks exist and how many
  are `up`, `grace` (late), `down`, `paused` or `new`. Source: [Healthchecks API](https://healthchecks.io/docs/api/),
  read 2026-11-15. Only the status of each check is read; names, tags and ping URLs are not shown.
- **Least privilege:** use the project's read-only API key (Project Settings, API Access). The
  documentation says it works with this endpoint and omits ping and management URLs from the response.
- **Network:** the hosted service (`https://healthchecks.io`) or your own instance; HTTPS is required for
  the key. The API asks clients to stay under 100 requests per minute; results are cached. The
  response is limited to 1 MB and the count stops at 10,000 checks (reported as an invalid response).
- **Live validation checklist:** the read-only key is accepted; `status` values for a check that has
  never pinged and for a paused one; a project with many checks stays under 1 MB.

### NetBird

- **Reads:** `GET /api/peers` with `Authorization: Token <token>`; shows how many peers exist and how
  many report `connected`. Sources: [peers API](https://docs.netbird.io/api/resources/peers),
  [authentication](https://docs.netbird.io/api/guides/authentication) and the official OpenAPI file in
  the NetBird repository, read 2026-11-12.
- **Least privilege:** the documentation recommends service users for API calls and does not describe
  a read-only token. Use a service user with the lowest role that can list peers, and confirm that when
  validating.
- **Network:** NetBird Cloud is the public `https://api.netbird.io` (prefilled): an administrator must
  allow outbound HTTPS to it and no private-network option is needed. For a self-hosted server use its
  management address. The cloud API is rate limited (120 requests per minute); results are cached 30 seconds.
- **Live validation checklist:** the `Token` scheme is accepted; a service user with the lowest role can
  list peers; the response size with many peers stays under 2 MB.

### Tailscale

- **Reads:** `GET /api/v2/tailnet/{tailnet}/devices` with HTTP Basic (the API key as user name, empty
  password); shows how many devices exist, how many are connected to the control server and how many
  have an update available. Source: the official Go client ([tailscale-client-go-v2](https://github.com/tailscale/tailscale-client-go-v2),
  `devices.go`, `client.go`), read 2026-11-12. The public API reference pages did not render for the
  tool used, so field names and the auth scheme come from that source, not from the reference pages.
- **Least privilege:** create the narrowest access token the admin console offers for reading devices.
  The scope names were **not verified** here; check them when validating. API access tokens expire
  (the console limits them to 90 days).
- **Network:** `https://api.tailscale.com` is public (prefilled): an administrator must allow outbound
  HTTPS to it; no private-network option is needed. The default tailnet is `-`.
- **Live validation checklist:** Basic auth with an empty password is accepted for the token type you
  use; `connectedToControl` and `updateAvailable` are present in the default field set; the response
  size for a large tailnet stays under 2 MB.

### Cloudflare

- **Reads:** `GET /client/v4/zones?per_page=5` and `GET /client/v4/zones?status=active&per_page=5` with
  `Authorization: Bearer <API token>`; shows the number of zones and of active zones from
  `result_info.total_count` (only the first small page is transferred). Source: [List Zones](https://developers.cloudflare.com/api/resources/zones/methods/list/),
  read 2026-11-12.
- **Least privilege:** an API token with only **Zone > Zone > Read**. Do not use the Global API key.
- **Network:** `https://api.cloudflare.com` is public (prefilled): an administrator must allow outbound
  HTTPS to it; no private-network option is needed.
- **Live validation checklist:** both queries return `success: true`; the counts match the dashboard; a
  token without Zone Read is refused with the generic access message.

### Coolify

Read-only, with resource inventory, card links and reviewed discovery (issue #102). **Partly
validated** against a live instance (see the record at the end of this section); the items not
covered there remain unvalidated.

- **Reads:** `GET /api/v1/resources` (applications and services; databases and other types are
  ignored) and `GET /api/v1/applications` (only the `fqdn` field, for addresses), with
  `Authorization: Bearer <token>`. If `/applications` is refused the inventory still loads, only
  without addresses. Services have no documented domain field, so a service card needs a URL typed
  by hand. `GET /services/{uuid}` is **never** called: it returns Compose content. Sources:
  [overview](https://coolify.io/docs/api/overview), [authorization](https://coolify.io/docs/api/authorization),
  [permissions](https://coolify.io/docs/api/permissions), [rate limits](https://coolify.io/docs/api/rate-limits),
  [list resources](https://coolify.io/docs/api/endpoints/resources/list-resources) and
  [list applications](https://coolify.io/docs/api/endpoints/applications/list-applications), read 2026-11-12.
  Fixtures are hand-written from those pages, not recorded from a live instance.
- **Set-up in Coolify:** on a self-hosted instance an administrator enables **API Access** in
  Settings, Advanced (Coolify Cloud already has it). Set **Allowed IPs** if you use that list (it must
  include the address Homora connects from). Select the team, then create a token in **Keys & Tokens,
  API Tokens** with **only `read`**, limited to the resources you want to show. Copy the full token
  (it contains a `|`) into the connection in Homora, with the address of the instance
  (`https://coolify.example`, or `https://app.coolify.io` for Cloud), then **Test connection**.
  The Coolify screens vary by version. Use one token per team and connection.
- **Least privilege:** only `read`. Never use `read:sensitive`, `write`, `deploy`, `delete` or `root`;
  Homora does not need them and does not collect secrets, environment variables, Compose or logs.
  A limited token works: the connection test and the summary use `/resources`, never the team
  endpoint (which answers 403 to a limited token). What you see depends on the token's scope.
- **What the widget shows:** counts of applications and services by state (running, degraded,
  stopped, unknown) and the time of the last update. Coolify's composite status (`running:healthy`)
  is normalized; anything unrecognized is **unknown**. A missing or unreadable answer is shown as
  unavailable, never as offline.
- **Inventory and links:** on the connection's **Resources** action you can search and filter the
  inventory, link a resource to an existing card (by connection and resource UUID, never by name) and
  see Coolify's state next to, and separate from, Homora's HTTP check. The inventory (names, UUIDs,
  addresses) is for authenticated sessions only: it is not on the public status page and not exposed
  through MCP. Coolify's list endpoints expose only a numeric environment id, so project and
  environment names are not shown.
- **Discovery with review:** select resources and review each proposed card (name, address among
  several domains or typed by hand, group, description, icon). Nothing is created until you confirm;
  a resource without an address needs a typed URL or is skipped; likely duplicates are flagged and can
  be linked to the existing card. Cards created this way never get private-network monitoring unless
  you tick it on that card. Later changes in Coolify (a renamed resource, a new domain, a removed
  resource) only mark the card **Needs review**: you can keep it, update the card yourself or remove the
  link. Cards are never changed or deleted automatically.
- **Network and TLS:** HTTPS is required for the token. Use "allow private network" for a LAN
  address. For a private CA paste its public PEM; validation stays on and redirects are not followed.
- **Limits and failures:** responses are capped (2 MB, 1000 resources), results are cached 30 seconds
  per connection and one connection failing never affects another. Coolify allows 200 requests per
  minute and blocks a client that causes 30 failed requests per minute (1, then 5, then 15 minutes,
  and it notifies the team). After a 401, 403 or 429 Homora therefore pauses automatic queries for that
  connection for the `Retry-After` time (at least 60 seconds, at most 15 minutes) and shows the same
  generic error; editing the connection clears the pause and **Test connection** always tries.
- **Troubleshooting:** "access denied" is 401 (token wrong, expired, paused or revoked, or its owner
  left the team) or 403 (API Access disabled, the address is not in Allowed IPs, or the token lacks
  `read` or access to the resource). "Try again later" is 429: wait, and fix the token first. An empty
  list with a limited token usually means the token's scope excludes the resources. "Connection
  failed": check the address, HTTPS and the private-network option from the Homora backend (inside a
  container `localhost` is the container itself).
- **Live validation record (2026-11-12, maintainer, Coolify v4.7.5, Homora branch of PR #115):**

  ```text
  Integration: Coolify     Service version: v4.7.5     Date: 2026-11-12
  Validated by: maintainer (manual run in a local development instance)
  - [x] Connection saved with a read-only credential (a `read`-only team token)
  - [x] Widget shows the expected values (6 resources, 6 running)
  - [x] Wrong credential gives a generic error (invalid token tried; pause behaved as designed)
  - [ ] Unreachable host gives a generic error (not tried)
  - [ ] Private or public destination policy behaved as documented (a LAN address was used; not
        otherwise exercised)
  - [x] No credential visible in the UI (not inspected in logs or API responses)
  Also seen working: inventory with addresses, applications without an address, several domains on
  one application (it appeared to work; the exact `fqdn` separator was not inspected), link and
  discovery review dialogs.
  Not covered: a token limited to selected resources (the token was the team token, believed to be
  unrestricted), a service without an address in detail, `/applications` with a token that lacks it,
  environments with several teams, and the 429 path against the real server.
  Notes / deviations: the review dialog's list did not scroll (fixed in 7a9d1a9).
  ```

  Still to confirm: the behavior of a **limited** token (the issue requires it to work without
  team-level permissions), and the `status` strings other than the running state.

### Skipped (follow-up issues)

Both were evaluated against the declarative format and the shared transport; neither fits without
widening the transport, so they were not implemented (decision recorded in
[ADR 0009](decisions/0009-declarative-integration-adapters.md)).

- **Beszel:** the hub API is PocketBase's. A client logs in with `POST /api/collections/users/auth-with-password`
  and then sends the returned token. The later session capability in ADR 0018 supports some additional JSON login shapes, but
  Beszel has not been assessed or implemented against that capability. Its login and permissions
  require integration-specific design, tests and review.
  Source: [Beszel REST API guide](https://beszel.dev/guide/rest-api), read 2026-11-12.
- **TrueNAS:** the current API (25.04 and later) is JSON-RPC 2.0 over WebSocket, and the vendor
  deprecated the REST `/api/v2.0` API. WebSocket-only. Source: [TrueNAS API 25.04](https://api.truenas.com/v25.04/),
  read 2026-11-12.

## Integration status

| Integration       | Kind     | Status                                                   | Needs                                |
| ----------------- | -------- | -------------------------------------------------------- | ------------------------------------ |
| Proxmox VE        | code     | Implemented, unvalidated (mocks); optional node scope    | Read-only API token, HTTPS           |
| Jellyfin          | manifest | Implemented, unvalidated                                 | Public info endpoint, no credentials |
| Home Assistant    | manifest | Implemented, unvalidated                                 | Long-lived token, HTTPS              |
| Uptime Kuma       | manifest | Implemented, unvalidated                                 | A published status page              |
| AdGuard Home      | manifest | Implemented, unvalidated                                 | Basic auth user, HTTPS               |
| Speedtest Tracker | manifest | Implemented, unvalidated                                 | Token with Read Results, HTTPS       |
| Portainer         | manifest | Implemented, unvalidated                                 | Access token, HTTPS                  |
| NetBird           | manifest | Implemented, unvalidated                                 | Personal access token, HTTPS         |
| Tailscale         | manifest | Implemented, unvalidated                                 | API access token, HTTPS              |
| Cloudflare        | manifest | Implemented, unvalidated                                 | Token with Zone Read, HTTPS          |
| Healthchecks      | manifest | Implemented, unvalidated                                 | Read-only project API key, HTTPS     |
| Coolify           | code     | Partly validated on v4.7.5 (inventory, links, discovery) | Token with `read` only, HTTPS        |
| Pi-hole v6        | code     | Partially validated (user reports it works)              | Application password, HTTPS          |
| Beszel, TrueNAS   | —        | Skipped (see above)                                      | —                                    |

"Unvalidated" means no one has tried it against a live service yet. Adding one is documented in
[adapters](adapters.md); the manifest vocabulary and its limits are in
[ADR 0009](decisions/0009-declarative-integration-adapters.md).

### Proxmox node selection

By default Proxmox widgets and the top bar show cluster totals. Edit a saved Proxmox connection and
choose a **Node** (listed from the connection's inventory) to scope VMs, containers and CPU, memory and
disk to that node. If the node disappears or is offline, the widget and the top bar say so; they never
fall back to cluster totals. The node name is stored with the connection and is never part of the
public status page. Choose "Whole cluster" to clear it.

### Pi-hole v6

**Partially validated:** on 2026-11-13 a user reported testing the integration successfully.
The service version, environment and individual checks were not provided. The adapter logs in with an application
password and reads `GET /api/stats/summary` for total DNS queries, blocked queries, percentage and
number of domains in gravity. It also reads `GET /api/dns/blocking` for protection state; a
failed or unrecognized response is shown as unknown. The fixture follows the [Pi-hole FTL OpenAPI specification](https://github.com/pi-hole/FTL/blob/master/src/api/docs/content/specs/stats.yaml);
it is hand-written, not recorded from a live server. The query window follows the instance's
in-memory statistics and must be verified against the target version.

1. On Pi-hole v6, create an application password in the web interface's API settings. Leave
   `webserver.api.app_sudo` disabled; the API can still grant more access than the widget needs,
   so protect this password. Pi-hole v5 and passwordless instances are not supported.
2. In Homora, add a Pi-hole connection with its HTTPS origin and application password. For a LAN
   address explicitly allow the private network. Pi-hole must present a trusted certificate for
   that address; a private CA may be supplied in the connection. Attach the widget to a card.
3. Test the connection. Authentication errors and unreachable services return generic errors;
   automatic retries pause for at least 60 seconds after a failed summary or initial login. An explicit connection test
   bypasses the pause; editing the connection clears it.

The password remains encrypted in the vault. The host sends it only in the fixed `POST /api/auth`
body and sends the session in `X-FTL-SID` over HTTPS. Sessions are kept in memory per connection,
reused and renewed on expiry or once after a 401. Concurrent logins are deduplicated. They are
removed locally on edits and deletion, but not explicitly logged out remotely; Pi-hole expires them.
Pi-hole limits concurrent sessions. There are no integration write operations. See
[ADR 0018](decisions/0018-integration-session-auth.md) and the [official authentication documentation](https://docs.pi-hole.net/api/auth/).

Live validation still needs to cover the app password with `app_sudo` off, real v6 payloads and
counts, expired credentials, session limits, private destination policy, certificate validation,
and absence of secrets in logs and responses. The user report does not establish which of these
checks were performed; a detailed validation record is still pending.

## Home page widgets

Integration presentations can also be placed on pages, using an existing connection chosen by the administrator. The source is verified against the type contract and continues using host transport and caching. Exports include neither connections nor credentials: the preview indicates that these widgets will be ignored and need to be recreated. Legacy rows without a card remain on the Integrations screen. See [ADR 0019](decisions/0019-widget-sdk.md).
