# Agent capability inventory (R4, stage 1)

What an agent can read, what it can only propose, and what only a signed-in
administrator can do. Derived from the code (`agents/agent-scopes.ts`, `mcp/index.ts` and `mcp/*-tools.ts`,
`proposals/managed-proposals.ts`, `proposals/index.ts`, `routes/agent-proposals.ts`) on 2026-11-12;
route coverage was expanded in issue #195.
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

| Scope                  | Tools                                                                                                                                                                                                                                                                                                        | Returns                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| none (any valid token) | `get_homora_capabilities`                                                                                                                                                                                                                                                                                    | Granted scopes, tool availability, discovery status, `publicStatusEnabled`                                     |
| `services:read`        | `list_services`, `get_service`, `list_pages`, `list_groups`, `get_group`, `list_group_services`, `list_service_status`, `get_service_status`, `list_status_history`, `list_service_dependencies`, `list_trusted_ca`, `get_status_overview`, `list_tags`, `list_pins`, `list_link_types`, `get_public_status` | Cards, pages, groups, observed status, history, dependencies and monitoring CA metadata; never certificate PEM |
| `probes:read`          | `list_probes`                                                                                                                                                                                                                                                                                                | Standalone monitors, with address query and fragment removed and no check match text                           |
| `incidents:read`       | `list_incidents`, `get_incident`                                                                                                                                                                                                                                                                             | Incident history and durations                                                                                 |
| `notifications:read`   | `list_notification_channels`                                                                                                                                                                                                                                                                                 | Channel metadata without destinations or credentials                                                           |
| `agents:read`          | `list_agents`, `get_agent`                                                                                                                                                                                                                                                                                   | Identities without tokens or hashes                                                                            |
| `audit:read`           | `list_audit_history`                                                                                                                                                                                                                                                                                         | Paginated events; no IP addresses or event details                                                             |
| `proxmox:read`         | `list_proxmox_resources`                                                                                                                                                                                                                                                                                     | Aggregate data, single Proxmox connection only                                                                 |
| `widgets:read`         | `list_widgets`, `list_page_widgets`                                                                                                                                                                                                                                                                          | Legacy widgets and page widget positions                                                                       |
| `integrations:read`    | `list_integrations`, `get_integration_status`, `test_connection`                                                                                                                                                                                                                                             | Connection metadata and read-only tests under the destination policy; no connection URL                        |
| `discovery:read`       | `list_discovery_suggestions`, `list_docker_push_sources`, `list_docker_push_suggestions`                                                                                                                                                                                                                     | Docker label suggestions; local scan needs `HOMORA_DOCKER_HOST`                                                |
| `hosts:read`           | `list_host_suggestions`                                                                                                                                                                                                                                                                                      | Evidence-based service-to-guest suggestions (guest names are sensitive)                                        |
| `maintenance:propose`  | `list_maintenance`                                                                                                                                                                                                                                                                                           | Active and upcoming windows for one monitor, without notes                                                     |
| any proposal scope     | `list_proposals`, `get_proposal`                                                                                                                                                                                                                                                                             | Only the caller's own proposals                                                                                |

## Proposal tools and exact apply semantics

| Tool                                                           | Scope                                 | Proposal kind and operations                                                                                                 | What approval does                                                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propose_service_card`                                         | `proposals:create`                    | service: `create`, `update`, `delete`                                                                                        | Writes the card; `allowPrivate` is not implied. Monitoring of private destinations stays an explicit human choice                                                                                           |
| `propose_card_order`                                           | `proposals:create`                    | card-order: `reorder` (within a group), `move` (between groups)                                                              | Sets positions/category; the member lists must match current state exactly                                                                                                                                  |
| `propose_page_change`                                          | `organization:propose`                | page: create, rename, delete, reorder, assign-group                                                                          | Applies after human review; deleting a populated page requires a destination                                                                                                                                |
| `propose_probe`                                                | `probes:propose`                      | probe: `create`, `update`, `delete`                                                                                          | Changes a standalone monitor after approval; no Home card is created                                                                                                                                        |
| `propose_acknowledgement`                                      | `incidents:propose`                   | acknowledgement: `ack`, `clear`                                                                                              | Acknowledges or temporarily mutes after review                                                                                                                                                              |
| `propose_service_tags`                                         | `organization:propose`                | tag: replace a card's tags                                                                                                   | Saves normalized tags after approval                                                                                                                                                                        |
| `propose_pin`                                                  | `organization:propose`                | pin: `pin`, `unpin`, `reorder`                                                                                               | Sets favorites and their Home row order                                                                                                                                                                     |
| `propose_resource_link`                                        | `organization:propose`                | link: `link`, `unlink`                                                                                                       | Changes only Homora's card-to-resource link                                                                                                                                                                 |
| `propose_group_change`                                         | `groups:propose`                      | group: `create`, `rename`, `delete` (empty only), `reorder`                                                                  | Applies to groups; rename also updates card categories                                                                                                                                                      |
| `propose_maintenance`                                          | `maintenance:propose`                 | maintenance: `create`, `cancel`                                                                                              | Schedules or cancels the exact window after human approval                                                                                                                                                  |
| `propose_widget_change`                                        | `widgets:propose`                     | widget: `create`, `link`, `delete`, `move`                                                                                   | Creates/links/removes integration widgets or moves a page widget; never creates a connection                                                                                                                |
| `propose_host_link`                                            | `hosts:propose`                       | host-link: `link`                                                                                                            | Sets only Homora's own link columns on a card. Strength and evidence are computed by the server, not the agent                                                                                              |
| `propose_connection_setup`                                     | `connections:propose`                 | connection-setup                                                                                                             | **Creates nothing.** Approval only unlocks a pre-filled form; the human enters credentials, private-network permission and CA                                                                               |
| `propose_discovered_card`, `propose_docker_push_card`          | `discovery:read` + `proposals:create` | service: `create`                                                                                                            | Same as a service proposal; independent of the source after creation                                                                                                                                        |
| `propose_agent_create`, `_update_scopes`, `_revoke`, `_rotate` | `agents:propose`                      | agent identity                                                                                                               | Human reviews target and scopes; requested scopes must be a subset of the author's. New/rotated token appears only in the no-store review response ([ADR 0002](decisions/0002-governed-agent-proposals.md)) |
| `propose_batch`                                                | the scope of each item                | up to 20 of: service, group, page, probe, tag, pin, link, acknowledgement, card-order, widget, connection-setup, maintenance | One atomic review; one stale item invalidates the rest                                                                                                                                                      |
| `withdraw_proposal`                                            | any proposal scope                    | the caller's own unexpired pending proposal                                                                                  | Audited withdrawal                                                                                                                                                                                          |

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

The page widget tool moves existing page widgets; creation and editing of page-widget configuration remain human operations. Appearance settings remain outside MCP. Host links use the separate evidence-based `propose_host_link` workflow.

## Out of scope (by decision)

- Credential submission by agents.
- Any tool that writes to Proxmox, Docker, Coolify or other external systems.
- Auto-approval policies.
- New integration capabilities or direct writes to external systems. Resource link proposals only change Homora's local link.

## Documentation gaps found and fixed

The README scope table omitted the Docker push tools, and the README said only card,
group, order and widget proposals expire after 15 minutes. Both were corrected on
2026-11-12. `docs/evolution.md` gained the R4 section the issue links to.
