# Agent capability inventory (R4, stage 1)

What an agent can read, what it can only propose, and what only a signed-in
administrator can do. Derived from the code (`agent-scopes.ts`, `mcp.ts` and `mcp-*-tools.ts`,
`managed-proposals.ts`, `proposals.ts`, `routes/agent-proposals.ts`) on 2026-11-12;
page coverage was revisited on 2026-11-13.
This is an audit of the implementation, not a validation: see the R4 section of
[evolution.md](evolution.md) for what has evidence.

## Boundary (all tools)

- An agent never receives integration credentials and never writes to external
  infrastructure. Every write tool creates a **proposal**; nothing is applied
  until an authenticated human approves it in the web UI.
- Proposals expire (default 15 minutes, 1–120 configurable), are limited to 100
  unexpired pending per identity, and are rejected at approval if the relevant
  configuration changed (stale check repeated inside the approval transaction).
- Tokens are scoped, revocable and shown once. Revocation and rotation apply at
  the next authentication, on stdio and Streamable HTTP alike.
- Names, labels and external data returned by tools are untrusted data.

## Read tools

| Scope                  | Tools                                                                                                                                                                                            | Returns                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| none (any valid token) | `get_homora_capabilities`                                                                                                                                                                        | Granted scopes, tool availability, discovery status, `publicStatusEnabled`                                                      |
| `services:read`        | `list_services`, `get_service`, `list_pages`, `list_groups`, `get_group`, `list_group_services`, `list_service_status`, `get_service_status`, `list_status_history`, `list_service_dependencies` | Cards, pages (including empty pages), groups, observed status (URL query/fragment omitted), 30-day history, manual dependencies |
| `agents:read`          | `list_agents`, `get_agent`                                                                                                                                                                       | Identities without tokens or hashes                                                                                             |
| `audit:read`           | `list_audit_history`                                                                                                                                                                             | Paginated events; no IP addresses or event details                                                                              |
| `proxmox:read`         | `list_proxmox_resources`                                                                                                                                                                         | Aggregate data, single Proxmox connection only                                                                                  |
| `widgets:read`         | `list_widgets`                                                                                                                                                                                   | Widget definitions                                                                                                              |
| `integrations:read`    | `list_integrations`, `get_integration_status`                                                                                                                                                    | Connection metadata and status (read-only network request under destination policy)                                             |
| `discovery:read`       | `list_discovery_suggestions`, `list_docker_push_sources`, `list_docker_push_suggestions`                                                                                                         | Docker label suggestions; local scan needs `HOMORA_DOCKER_HOST`                                                                 |
| `hosts:read`           | `list_host_suggestions`                                                                                                                                                                          | Evidence-based service-to-guest suggestions (guest names are sensitive)                                                         |
| `maintenance:propose`  | `list_maintenance`                                                                                                                                                                               | Active and upcoming windows for one card, including notes                                                                       |
| any proposal scope     | `list_proposals`, `get_proposal`                                                                                                                                                                 | Only the caller's own proposals                                                                                                 |

## Proposal tools and exact apply semantics

| Tool                                                           | Scope                                 | Proposal kind and operations                                                   | What approval does                                                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propose_service_card`                                         | `proposals:create`                    | service: `create`, `update`, `delete`                                          | Writes the card; `allowPrivate` is not implied. Monitoring of private destinations stays an explicit human choice                                                                                           |
| `propose_card_order`                                           | `proposals:create`                    | card-order: `reorder` (within a group), `move` (between groups)                | Sets positions/category; the member lists must match current state exactly                                                                                                                                  |
| `propose_group_change`                                         | `groups:propose`                      | group: `create`, `rename`, `delete` (empty only), `reorder`                    | Applies to groups; rename also updates card categories                                                                                                                                                      |
| `propose_maintenance`                                          | `maintenance:propose`                 | maintenance: `create`, `cancel`                                                | Schedules or cancels the exact window after human approval                                                                                                                                                  |
| `propose_widget_change`                                        | `widgets:propose`                     | widget: `create`, `link`, `delete`                                             | Creates/links/removes a widget on an existing connection; never creates a connection                                                                                                                        |
| `propose_host_link`                                            | `hosts:propose`                       | host-link: `link`                                                              | Sets only Homora's own link columns on a card. Strength and evidence are computed by the server, not the agent                                                                                              |
| `propose_connection_setup`                                     | `connections:propose`                 | connection-setup                                                               | **Creates nothing.** Approval only unlocks a pre-filled form; the human enters credentials, private-network permission and CA                                                                               |
| `propose_discovered_card`, `propose_docker_push_card`          | `discovery:read` + `proposals:create` | service: `create`                                                              | Same as a service proposal; independent of the source after creation                                                                                                                                        |
| `propose_agent_create`, `_update_scopes`, `_revoke`, `_rotate` | `agents:propose`                      | agent identity                                                                 | Human reviews target and scopes; requested scopes must be a subset of the author's. New/rotated token appears only in the no-store review response ([ADR 0002](decisions/0002-governed-agent-proposals.md)) |
| `propose_batch`                                                | the scope of each item                | up to 20 of: service, group, card-order, widget, connection-setup, maintenance | One atomic review; one stale item invalidates the rest                                                                                                                                                      |
| `withdraw_proposal`                                            | any proposal scope                    | the caller's own unexpired pending proposal                                    | Audited withdrawal                                                                                                                                                                                          |

Not batchable: host-link, discovered/Docker-push cards, agent identity changes.

Maintenance times are epoch milliseconds. A creation requires a nonblank note, a duration
between one minute and 30 days, and an end in the future at approval. The start can already
have passed, permitting immediate maintenance without shifting the approved end; past time
is not retroactively rewritten. For cancellation, pass the exact window returned by
`list_maintenance` with `op: "cancel"`. Future windows are removed; active windows end at
approval. Both are revalidated in the approval transaction, and audit events identify the
reviewer and proposal. An existing incident remains open until a later successful check.

## Administrator-only (no MCP equivalent)

Reviewing proposals (`POST /api/proposals/:id/review`), recreating an expired
proposal, changing the review period, creating/revoking/rotating agents directly
(`/api/agents`), creating or editing integration connections and their
credentials, public status page settings, service defaults, import/export, and
monitoring settings other than proposed maintenance. Agents cannot change what is public.

Pages and their widgets can be managed in the UI but cannot be created, edited or
reordered through MCP proposals. Incident summaries, alert
channels, uptime aggregates and appearance settings also lack dedicated MCP tools.
Existing status and history tools provide observations, not full parity with the
monitoring UI. These are capability gaps, not an authorization to expose sensitive
configuration or add unreviewed writes; prioritize new tools based on concrete user
needs and define their data and scope boundaries first.

## Out of scope (by decision)

- Credential submission by agents.
- Any tool that writes to Proxmox, Docker, Coolify or other external systems.
- Auto-approval policies.
- New integration proposal types. Decision for now: **none added**. Existing
  proposals cover cards, groups, order, widgets, host links and connection
  setup suggestions. A new type needs demonstrated user demand and must ship with
  a bounded diff, its own scope, stale-state handling, an audit event and human
  confirmation.

## Documentation gaps found and fixed

The README scope table omitted the Docker push tools, and the README said only card,
group, order and widget proposals expire after 15 minutes. Both were corrected on
2026-11-12. `docs/evolution.md` gained the R4 section the issue links to.
