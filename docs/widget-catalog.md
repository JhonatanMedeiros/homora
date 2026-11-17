# Widget catalog and roadmap

This is a living inventory and a list of product hypotheses, not an implementation commitment.
Last reviewed: 2026-11-16. Priorities express product judgment, not measured user demand; revisit
them with maintainer feedback. A candidate may be split, combined, deferred, or rejected. Do not
implement this catalog wholesale: create and scope a separate issue before starting each item.
Tracking epic: [issue #177](https://github.com/JhonatanMedeiros/homora/issues/177).
Source and connection candidates are tracked separately in [integration catalog](integration-catalog.md).

## Existing capabilities

The internal widget SDK supports page instances with validated configuration and explicit source
contracts. A clock is available on pages and in the top bar, with time zone and format options.
The top bar supports CPU, memory, and disk from a compatible telemetry source; Proxmox currently
provides it. Integration presentations can be placed on a page or a service card; the Integrations
screen also lists legacy instances. Page widgets read connections in batches, with failures isolated
per instance. See [ADR 0019](decisions/0019-widget-sdk.md) for placement and transfer limitations.

| Existing integration presentation | Current information                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Proxmox VE                        | Running and total VMs and containers; CPU, memory and disk where available; cluster or selected node. |
| Pi-hole v6                        | DNS queries, blocked queries, percentage, gravity domains and protection state.                       |
| AdGuard Home                      | Service, protection and version.                                                                      |
| Uptime Kuma                       | Up, down, pending, maintenance and unknown counts from a status page.                                 |
| Coolify                           | Total and running resources; degraded, stopped and unknown when nonzero.                              |
| Home Assistant                    | State of a configured entity.                                                                         |
| Jellyfin                          | Server name and version.                                                                              |
| Speedtest Tracker                 | Download, upload and ping.                                                                            |
| Portainer                         | Environment counts and availability.                                                                  |
| NetBird                           | Peer and connected counts.                                                                            |
| Tailscale                         | Device and online counts, available updates when nonzero.                                             |
| Cloudflare                        | Zone and active counts.                                                                               |

See [integration reference](integrations.md) for credentials, scope, versions and live-validation
status. Most integrations remain unvalidated against real instances; Coolify and Pi-hole have
only the partial evidence recorded there. A widget rendering does not establish live compatibility.

## Tracking conventions

IDs below are stable catalog identifiers, not promised API names. Status starts as **idea**, unless
otherwise stated. `H`/`M`/`L` indicates suggested priority, not a delivery date or complexity.
Link an individual issue in the row when created; update status to `scoped`, `in progress`,
`implemented`, `deferred`, or `rejected` with evidence and an explanation where appropriate.
An implemented item must link code, tests and any remaining validation gaps. Keep this catalog and
the epic synchronized; do not check off implementation based only on a proposal or mock.

| ID       | Candidate / initial slice                                    | Source and dependency                                                                                 | Priority | Status / issue                                                                                                      |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| MON-01   | Homelab summary: counts by monitor state.                    | Internal monitoring; groups, pages and unmeasured states.                                             | H        | Implemented; validation in progress — [#259](https://github.com/JhonatanMedeiros/homora/issues/259)                 |
| MON-02   | Problems: bounded list of offline and degraded services.     | Internal monitoring; scoped, oldest offline first, stale data.                                        | H        | Implemented; observed degraded age — [#260](https://github.com/JhonatanMedeiros/homora/issues/260)                  |
| MON-03   | Recent incidents: start, resolution and duration.            | Internal incident history; permissions and retention.                                                 | H        | Implemented — [#261](https://github.com/JhonatanMedeiros/homora/issues/261)                                         |
| MON-04   | Availability for a chosen service and period.                | Internal uptime history; define insufficient data and maintenance.                                    | M        | Implemented; live validation pending — [#296](https://github.com/JhonatanMedeiros/homora/issues/296)                |
| MON-05   | Latency and historical trend for a service.                  | Internal checks; sampling, missing data and units.                                                    | M        | Implemented; live validation pending — [#300](https://github.com/JhonatanMedeiros/homora/issues/300)                |
| MON-06   | Active and upcoming maintenance windows.                     | Internal maintenance data; time zones and empty states.                                               | M        | Idea — —                                                                                                            |
| MON-07   | Certificate expiration for selected monitored services.      | Existing TLS check; unknown versus expired, date and threshold.                                       | M        | Idea — —                                                                                                            |
| MON-08   | Dependency impact summary for selected service or host.      | Existing dependency model; distinguish inferred impact from measured failure.                         | L        | Idea — —                                                                                                            |
| LOCAL-01 | Monthly calendar, locale and first day of week.              | Device clock; no external source.                                                                     | H        | Implemented — [#257](https://github.com/JhonatanMedeiros/homora/issues/257)                                         |
| LOCAL-02 | Countdown to a named date and time.                          | Device clock; explicit time zone and past-event behavior.                                             | H        | Implemented — [#258](https://github.com/JhonatanMedeiros/homora/issues/258)                                         |
| LOCAL-03 | Short note or instructions with basic Markdown.              | Local configuration; safe rendering and 4,000-character limit.                                        | M        | Implemented — [#263](https://github.com/JhonatanMedeiros/homora/issues/263)                                         |
| LOCAL-04 | Image with alt text.                                         | Prefer local asset; storage, size, transfer and remote privacy need design.                           | L        | Idea — —                                                                                                            |
| LOCAL-05 | Quick links: up to 12 custom HTTP(S) links.                  | Local, portable page widget; normal and wide sizes.                                                   | L        | Implemented — [#297](https://github.com/JhonatanMedeiros/homora/issues/297); browser review pending                 |
| EXT-01   | Current weather and short forecast.                          | External provider (`homora:weather` v1); location privacy, credentials, quotas and cache.             | M        | Implemented — [#285](https://github.com/JhonatanMedeiros/homora/issues/285)                                         |
| EXT-02   | Recent entries from a feed.                                  | RSS/Atom source; network policy, bounded parsing, safe links and untrusted content.                   | M        | Implemented — [#282](https://github.com/JhonatanMedeiros/homora/issues/282)                                         |
| EXT-03   | Public holidays for a selected region.                       | Versioned local dataset or provider; coverage, updates and privacy.                                   | L        | Idea — —                                                                                                            |
| EXT-04   | Public IP address.                                           | External endpoint (`public-ip` source); built-in HTTPS providers, address family and explicit opt-in. | L        | Implemented; live provider validation pending — [#292](https://github.com/JhonatanMedeiros/homora/issues/292)       |
| EXT-05   | Domain registration expiration.                              | Provider/source reliability, privacy, rate limits and ownership; distinct from TLS expiry.            | L        | Implemented; live RDAP & browser validation pending — [#293](https://github.com/JhonatanMedeiros/homora/issues/293) |
| INT-01   | Proxmox node resource history.                               | Existing connection; verify API, permissions, aggregation and history.                                | M        | Idea — —                                                                                                            |
| INT-02   | DNS queries and blocking trends for Pi-hole or AdGuard Home. | Existing integrations; verify each API, time window and permission separately.                        | M        | Idea — —                                                                                                            |
| INT-03   | Individual Uptime Kuma monitor states.                       | Existing status-page data; verify available fields and visibility.                                    | M        | Idea — —                                                                                                            |
| INT-04   | Coolify resource list and reported state.                    | Existing inventory; keep external state distinct from Homora checks and protect names/addresses.      | M        | Idea — —                                                                                                            |
| INT-05   | Home Assistant multiple selected entity states.              | Existing connection; check request volume and entity authorization.                                   | M        | Idea — —                                                                                                            |
| INT-06   | Speedtest history.                                           | Existing connection; verify historical endpoint and limits.                                           | L        | Idea — —                                                                                                            |
| NEW-01   | Scheduled job and backup check status, e.g. Healthchecks.    | New integration; validate API, credentials and read-only scope.                                       | M        | Implemented, unvalidated — —                                                                                        |
| NEW-02   | Host resource summary, e.g. Beszel.                          | New integration; authentication and permissions need assessment under current session capability.     | M        | Idea — —                                                                                                            |
| NEW-03   | Storage pool health and capacity, e.g. TrueNAS.              | New integration; documented current WebSocket requirement needs a separate capability decision.       | M        | Deferred — transport not supported                                                                                  |
| NEW-04   | File cloud usage and server summary, e.g. Nextcloud.         | New integration; validate least-privilege endpoint and version.                                       | L        | Idea — —                                                                                                            |
| NEW-05   | Bookmark count and recent entries, e.g. Linkding.            | New integration; assess private data and API permissions.                                             | L        | Idea — —                                                                                                            |
| NEW-06   | VPN connection state, e.g. Gluetun.                          | New integration; verify API and avoid treating missing data as disconnected.                          | L        | Idea — —                                                                                                            |
| ADV-01   | Generic structured API result.                               | Arbitrary destinations, credentials and response mapping require a separate capability design.        | L        | Deferred — security design                                                                                          |
| ADV-02   | Embedded page.                                               | Framing restrictions, isolation and privacy require separate design; normal link fallback.            | L        | Deferred — product and security design                                                                              |
| ADV-03   | User-provided HTML or scripts.                               | Arbitrary execution conflicts with current boundaries; no implementation authorized.                  | L        | Deferred — security design                                                                                          |

## Foundations

Work shared by several candidates, tracked under the same epic. Candidates depend on these
as noted in each issue; execution order is in the epic.

| Issue                                                         | Scope                                                                          | Status                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [#265](https://github.com/JhonatanMedeiros/homora/issues/265) | Move the shadcn primitives to a shared `@homora/ui` package.                   | Delivered                                              |
| [#266](https://github.com/JhonatanMedeiros/homora/issues/266) | Widget modules: contract, registry and UI isolated per widget.                 | Implemented                                            |
| [#267](https://github.com/JhonatanMedeiros/homora/issues/267) | `pnpm widget:create` scaffold and automated boundary rules for widget modules. | Scoped                                                 |
| [#255](https://github.com/JhonatanMedeiros/homora/issues/255) | Normal and wide sizes for page widgets.                                        | Implemented; validation in progress                    |
| [#256](https://github.com/JhonatanMedeiros/homora/issues/256) | Contract for an internal monitoring source used by widgets.                    | Implemented; automated checks passed; live use pending |

## Requirements for each future issue

1. State the user problem, the smallest useful output, where it appears, source, refresh and time
   semantics, configuration, empty/loading/error/stale states, accessibility, and responsive behavior.
   Include representative data, demand evidence when available, and explicitly mark assumptions.
2. Inventory existing APIs and contracts before adding a capability. Identify configuration version,
   source compatibility, persistence, migration, ordering, localization, import/export and backup
   implications. Define behavior for deletion of a source or page, and for old data and versions.
3. For networked sources, document current official API/version, endpoints, minimal permissions,
   destination/DNS/redirect policy, TLS, timeouts, response sizes, rate limits, caching, privacy,
   and failure isolation. External content is untrusted. Never expose credentials to the browser,
   logs or MCP. New methods, headers, permissions or network capabilities need separate design and
   review; an item here does not authorize expanding them.
4. Follow [integration SDK guide](adapters.md), [integration reference](integrations.md),
   [ADR 0011](decisions/0011-integration-sdk.md), and [ADR 0019](decisions/0019-widget-sdk.md).
   Integration-specific code, fixtures, translations and tests belong with the integration. The
   host owns transport, credentials and authorization; integrations remain read-only.
5. Specify meaningful contract, persistence and interface tests appropriate to the slice, run
   required project checks and document results. For integrations, run contract tests, `pnpm check`
   and `pnpm build`; fixtures are not live validation. Record real-service version and scenarios only
   when tested with an authorized instance, otherwise record the gap.
6. Update the row and epic with the issue link, final scope, evidence, status and remaining work.
   Local calculations alone do not make the application available offline; offline support needs a
   separate design for cached data, authentication and privacy.

Related evaluation: [issue #163](https://github.com/JhonatanMedeiros/homora/issues/163) covers a
bounded integration-selection and validation round. Its historical inventory can be stale; the
integration reference and code are authoritative for current implementation and validation.

## Local widget contributions

Use `pnpm widget:create <type>` and follow the [widget creation guide](create-widget.md). Keep definition, logic, translations, tests and UI in the module; do not add widget-specific host branches. Future widget issues must account for the scaffold, module structure, compatibility and validation.
