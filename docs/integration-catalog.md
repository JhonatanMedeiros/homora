# Integration catalog and roadmap

Last reviewed: 2026-11-13. This is a local planning inventory, not a commitment, a verified API
compatibility matrix, or authorization to implement, contact services, or widen network access.
Priorities are product hypotheses, not measured demand. Verify code, current vendor documentation,
versions, permissions and user demand before scoping each candidate. Do not assume an endpoint,
authentication method, least-privilege credential, or SDK compatibility from its presence here.

## Scope and tracking

An integration connects a service and collects data through the host; a widget presents data.
One integration can serve several presentations. [Widget catalog](widget-catalog.md) owns widget
ideas and display tracking; this document owns source, connection, collection and validation.
An existing connection does not imply every proposed metric is collected. Track shared work in
one issue or link separate issues where independently useful; do not count it twice.

Stable IDs are planning identifiers, not API names. Priority H/M/L is relative product value, not
implementation effort or promised order. `Idea` means unscoped; `Deferred` identifies a known
decision or limitation. On creation record the issue link and update status to `Scoped`, `In
progress`, `Implemented`, `Deferred`, or `Rejected`, with evidence and outstanding validation.
The [tracking epic #178](https://github.com/JhonatanMedeiros/homora/issues/178) describes the issue workflow. Existing
[#163](https://github.com/JhonatanMedeiros/homora/issues/163) is a bounded evaluation and
validation round, while [#177](https://github.com/JhonatanMedeiros/homora/issues/177) tracks
widgets. Neither is replaced automatically.

## Existing integrations and validation priorities

The authoritative status, version details and validation evidence are in
[integrations](integrations.md); definitions, descriptors, fixtures and tests reside under
`packages/integrations/src/integrations/<type>`. This snapshot does not replace those sources.
Most existing integrations are unvalidated on a live service; Coolify and Pi-hole have partial
live evidence with explicit gaps. Fixtures and successful compilation do not prove compatibility.

| Integration       | Current read-only slice                                                 | Potential follow-up, subject to assessment                                                               | Widget link |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| Proxmox VE        | VM/container counts and CPU, memory and disk; inventory and node scope. | Validate live permissions, node behavior and history before expanding.                                   | INT-01      |
| Pi-hole v6        | DNS summary and protection state via host-managed session.              | Validate app-password privileges, sessions, payloads and query window; assess trends.                    | INT-02      |
| AdGuard Home      | Service, protection and version.                                        | Validate real credentials and data; assess DNS statistics and time windows.                              | INT-02      |
| Uptime Kuma       | Counts derived from a status page.                                      | Validate real status-page data; assess individual monitors and visibility.                               | INT-03      |
| Coolify           | Resource summary, inventory and reviewable discovery.                   | Complete limited-token and error-state validation; assess resource list presentation.                    | INT-04      |
| Home Assistant    | Selected entity state.                                                  | Validate real API and entity access; assess multiple entities and request volume.                        | INT-05      |
| Speedtest Tracker | Latest download, upload and latency.                                    | Validate real versions and permissions; assess history and retention.                                    | INT-06      |
| Jellyfin          | Public server name and version.                                         | Validate real endpoint and consider useful metrics only with appropriate permissions.                    | —           |
| Portainer         | Environment counts and availability.                                    | Validate real token scope and environment visibility.                                                    | —           |
| NetBird           | Peer and connected counts.                                              | Validate real API permissions and versions.                                                              | —           |
| Tailscale         | Device, online and update counts.                                       | Validate real token scope and version behavior.                                                          | —           |
| Cloudflare        | Zone and active counts.                                                 | Validate read-only scope and zone visibility. Tunnel management or public exposure is a separate design. | —           |

First consider a real-service validation issue for a connection the maintainer can test with
authorization and least privilege. If none is available, record that blocker and specific scenarios;
do not connect to actual infrastructure or claim validation. General improvements also need review
of pagination, incomplete data, version drift, stale results, errors and credential lifecycle.

## Candidate sources

All rows are research hypotheses. Initial information describes a possible outcome, not an API
contract; suitability for the existing transport and authentication capabilities is unknown until
reviewed. Identifiers in the last column refer to the widget catalog where applicable.

| ID     | Candidate                 | Possible read-only outcome                             | Questions and dependencies                                                                                              | Priority | Status / issue           | Widget |
| ------ | ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ | ------ |
| SRC-01 | Healthchecks              | Expected, late and failed scheduled jobs.              | Verify API, project visibility, key scope and privacy of job names.                                                     | H        | Implemented, unvalidated | NEW-01 |
| SRC-02 | Beszel                    | Host resource and availability summary.                | Reassess session login against ADR 0018; assess credential privilege and versions.                                      | H        | Idea — no issue          | NEW-02 |
| SRC-03 | TrueNAS                   | Pool health and capacity.                              | Current documented API uses WebSocket/JSON-RPC; transport capability and version support require a separate decision.   | H        | Deferred — transport     | NEW-03 |
| SRC-04 | Nextcloud                 | Storage usage and server summary.                      | Separate user and admin APIs; verify minimal privilege, versions and personal data.                                     | M        | Idea — no issue          | NEW-04 |
| SRC-05 | Linkding                  | Bookmark count and recent items.                       | Verify API and permissions; titles and URLs may be sensitive.                                                           | M        | Idea — no issue          | NEW-05 |
| SRC-06 | Gluetun                   | VPN connection state.                                  | Verify supported API, authentication and container exposure; unknown is not disconnected.                               | M        | Idea — no issue          | NEW-06 |
| SRC-07 | Prometheus                | Selected time-series metrics.                          | Query scope, cost, response limits, arbitrary query and network policy require review.                                  | M        | Idea — no issue          | —      |
| SRC-08 | ntfy                      | Notification or topic activity.                        | Homora already sends notifications; reading is a distinct capability. Verify privacy and whether streaming is required. | L        | Idea — no issue          | —      |
| SRC-09 | SABnzbd                   | Queue and recent download summary.                     | Verify API key privileges; avoid exposing download names by default.                                                    | L        | Idea — no issue          | —      |
| SRC-10 | Synology Download Station | Download queue summary.                                | Verify supported versions and session authentication; check least privilege and private data.                           | L        | Idea — no issue          | —      |
| SRC-11 | Drone CI                  | Recent build state.                                    | Verify API versions and least-privilege access; avoid exposing repository or log details.                               | L        | Idea — no issue          | —      |
| SRC-12 | File Browser              | Service or storage summary.                            | Determine whether a stable read-only API and narrowly scoped credential exist.                                          | L        | Idea — no issue          | —      |
| SRC-13 | Tactical RMM              | Managed host health counts.                            | Assess API and tenant scope; avoid sensitive inventory and operational actions.                                         | L        | Idea — no issue          | —      |
| SRC-14 | Minecraft server          | Server availability and player count.                  | Determine protocol, destination policy and whether host capability change is required.                                  | L        | Idea — no issue          | —      |
| SRC-15 | Weather provider          | Current conditions and forecast for a chosen location. | Choose provider after reviewing location disclosure, credentials, terms, quotas and transport.                          | L        | Idea — no issue          | EXT-01 |
| SRC-16 | RSS/Atom feed             | Recent feed items.                                     | Generic sources and XML parsing need destination controls, limits and untrusted-content handling.                       | L        | Idea — no issue          | EXT-02 |
| SRC-17 | GitHub                    | Selected repository or release status.                 | Define user problem and authentication scope; protect private repository data and rate limits.                          | L        | Idea — no issue          | —      |

Candidate order should be revisited using evidence of demand, utility, API maturity, least privilege,
fit with existing transport, availability of authorized test environments and maintenance cost.
Do not infer usage or popularity from this list. Generic API collectors, arbitrary URLs, streaming,
new protocols, extra headers, public tunnel management, and writes are separate capability designs,
not implicit permissions. Notification delivery is not evidence that notification reading exists.

## Issue readiness and completion

Before implementation, a future contributor or agent must:

1. Read [AGENTS.md](../AGENTS.md), [adapters](adapters.md), [integrations](integrations.md),
   [ADR 0011](decisions/0011-integration-sdk.md), and relevant existing definitions, descriptors,
   tests and fixtures. Recheck the current transport and session-authentication decisions.
2. Record the user problem, source versions, official current documentation and dated links,
   selected fields and endpoints, authentication, least privilege, pagination, rate limits,
   failure behavior, cache and concrete demand or its absence. Explain unknowns and expected
   widget use without promising a presentation outside the issue's scope.
3. Review private destination opt-in, DNS and redirects, TLS validation, timeouts, payload limits,
   untrusted data, secret lifecycle and logging. A new network method, header, permission or
   protocol requires separate design and review. Integration writes are not authorized.
4. Define fixtures with provenance, contract and failure tests, translations, descriptor/catalog,
   compatibility, documentation and update behavior. Keep service-specific implementation within
   its package directory, using bundled brand icons. Follow scaffold and catalog generation guidance.
5. Run relevant contract tests, `pnpm check` and `pnpm build`. Record exact service version,
   permissions and outcomes for authorized live checks; otherwise explicitly mark them pending.
   Update this catalog, the integration reference, relevant widget rows and the tracking issue with
   links and evidence. Never mark implementation or live validation complete based on planning.
