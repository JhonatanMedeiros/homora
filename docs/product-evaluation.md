# Product Evaluation

**Date:** 2026-11-10  
**Scope:** features present in branch `feat/roadmap-completion` at commit
`d98e52c` and Homora documentation.

> **Historical snapshot (2026-11-10).** Several gaps described here, such as the 25-service
> check limit and non-semantic status, were addressed in phase R1; see
> [evolution.md](evolution.md) for current state.

This is a historical evaluation of Homora, not a benchmark of performance, security,
or user satisfaction. Visual review was conducted via inspection of JSX and CSS files,
without browser rendering. The recommendation below is a hypothesis, not a binding decision.

## Conclusion

At the time of this evaluation, Homora organized links, groups, and basic health checks, but
its unique homelab value—integration metrics, infrastructure status, and linking
applications to host machines—remains either unexposed or unimplemented on the
primary dashboard. The UI also prominently highlights "Agents" despite the agent
only reading data and submitting card proposals, without being an essential part
of everyday use.

There is a promising technical foundation: web UI configuration, local execution,
read-only Proxmox integration, explicit opt-in for private network targets, and
human-reviewed MCP proposals. However, this does not yet form a distinctive product
experience. The recommendation is to position Homora as an **operational map of the
homelab**: a single place to launch services, check responsiveness, and identify where
they are hosted. Proxmox and AI agents remain optional; the links dashboard must
remain useful without either.

## Confirmed Gaps in Code

1. **The homepage is not an operational view.** The Services tab shows shortcuts and
   HTTP status per service. Proxmox, connections, and integration query results live
   in the Connections tab; there is no link between a service card and its VM or container.
2. **Widgets are nominal records.** A widget record stores connection ID and name, but
   no configuration, layout coordinates, or queried fields. Data querying ignores widget
   ID and calls the generic connection endpoint. Multiple widgets pointing to the same
   connection return identical data; none appeared on the homepage.
3. **Availability indicator is simplistic.** Only HTTP 2xx counts as "Available".
   401/403, 404, redirects, and network timeouts result in "Unavailable", even though
   several of these indicate the server is running and reachable (e.g. requires login).
   The monitor checks only the first 25 services per cycle; remaining services sit
   in unknown state without explicit UI notification.
4. **Adapters are not full product widgets.** Jellyfin returns name and version; Home
   Assistant queries one entity; Uptime Kuma returns counts; AdGuard Home returns
   protection state and version. The catalog lists these types, but results were queried
   in an isolated management screen rather than rendered onto cards. None had been
   validated against real services.
5. **AI visibility outpaces delivered value.** The local MCP server provides service
   queries, Proxmox inventory queries, and card proposal submissions. Decisions are
   made by humans. There is no embedded conversational assistant or automatic
   service-to-Proxmox-guest mapping. This is sound security architecture, but does not
   justify "AI-assisted management" as the primary value proposition.

## Why It Can Feel Generic

This assessment is a design critique, not a measurable metric. The screen employs
common administrative dashboard patterns—tabs, generic subheadings, global search,
dark cards, and accent colors—without expressing an identity unique to homelabs.
Content does not support an operational homelab routine: "unknown status" appears
repeatedly on cards without context, while infrastructure metrics live elsewhere.
Tweaking colors or icons does not solve this disconnect.

## Recommended Validation Roadmap

### Release 1 — Useful and Honest Information

- On the homepage, display a compact availability summary and Proxmox metrics when
  configured; if unconfigured, keep the homepage clean and lightweight.
- Make monitor status semantically honest: "reachable", "requires login", "not found",
  "unreachable", and "unverified", capturing HTTP status code and latency without following
  redirects.
- Eliminate the silent 25-item check limit or expose coverage and queue progress so no
  card appears monitored when it has not been checked.
- Cards must serve first as quick-launch shortcuts; place administrative controls in an
  explicit edit mode. Display reliable icon, host address, and concise status badge.
- Only designate something a "widget" when it features real configuration, dedicated
  card rendering, empty/error states, and clear binding to the backing connection.

### Release 2 — Topology and Impact

- Allow manually associating a card with a Proxmox node and guest; provide reviewable
  suggestions when strong heuristics exist. Never infer associations from names alone.
- Show where each application runs and which cards are affected when a node or guest stops.
- Treat MCP as an optional interface to read and propose the same operations available
  in the web UI. Keep decisions and audit logging visible in the product; do not rely
  on "AI" to replace a clear value proposition.

### Visual Direction

Before choosing new palettes, structure the screen around **service → status → machine**.
Use group names, hostnames, VM/CT names, latency, and last response as primary content.
Status must combine text, icon, and shape, never color alone. Test prototypes using
fictitious homelab datasets and compare time-to-answer for "what went down and where does
it run?" against the current dashboard. Avoid adding shallow adapters or AI novelty to
artificially increase visual density.

## Decisions Requiring Validation

- This operational hypothesis must be validated with homelab practitioners; external
  surveys cannot replace user interviews and real-world usage.
- Card↔guest associations require a live Proxmox environment, least-privilege service
  accounts, multi-container applications, and inventory privacy controls.
- The MVP must remain useful without Proxmox and without AI agents, per product vision.
- Do not make unsupported product claims before validating the operational homepage,
  multi-device LAN behavior, and real integrations.
